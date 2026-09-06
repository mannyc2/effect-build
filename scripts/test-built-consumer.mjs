// Install built packages, exact candidate tarballs, or published versions in a
// fresh npm project. Typecheck every public module and exercise the same artifact
// composition program with the runtime that invoked this script (Node or Bun).
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { readCandidate } from "./release/candidate.mjs";

const execute = promisify(execFile);
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicSurface = JSON.parse(await readFile(join(root, "tooling/public-api.json"), "utf8"));
const workspaceManifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const packages = [];
for (const entry of await readdir(join(root, "packages"), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const directory = join(root, "packages", entry.name);
  const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  if (manifest.private !== true) packages.push({ ...manifest, directory });
}
packages.sort((left, right) => left.name.localeCompare(right.name));
const packageNames = packages.map(({ name }) => name);
assert.deepEqual(
  packageNames,
  Object.keys(publicSurface.packages).sort(),
  "public surface must describe every public package",
);

const publicModules = Object.entries(publicSurface.packages)
  .sort(([left], [right]) => left.localeCompare(right))
  .flatMap(([name, surface]) => [
    { specifier: name, exports: surface.namespaces },
    ...Object.entries(surface.subpaths).sort(([left], [right]) => left.localeCompare(right))
      .map(([subpath, entry]) => ({ specifier: `${name}/${subpath.slice(2)}`, exports: entry.runtime })),
  ]);
const publicModuleSpecifiers = publicModules.map(({ specifier }) => specifier);
const publicModuleExports = publicModules.map(({ exports }) => [...exports].sort());
const publicModuleImports = publicModuleSpecifiers
  .map((specifier, index) => `import * as PublicModule${index} from ${JSON.stringify(specifier)};`)
  .join("\n");
const publicModuleBindings = publicModuleSpecifiers.map((_, index) => `PublicModule${index}`).join(",\n  ");

const consumerArguments = (args) => {
  if (args.length === 0) return { mode: "workspace" };
  if (args.length === 2 && args[0] === "--candidate" && args[1] !== "") {
    return { mode: "candidate", directory: resolve(args[1]) };
  }
  if (args.length === 2 && args[0] === "--registry" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(args[1])) {
    return { mode: "registry", version: args[1] };
  }
  throw new Error("usage: test-built-consumer.mjs [--candidate <directory> | --registry <version>]");
};

const runtimeConsumerSource = `import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, FileSystem, Schema } from "effect";
import * as Artifact from "effect-build/Artifact";
import * as Executable from "effect-build/Author/Executable";
import * as FinalizedFile from "effect-build/Author/File";
import * as NativeExecutable from "effect-build/Author/NativeExecutable";
import * as SystemTarget from "effect-build/SystemTarget";
import * as Archive from "effect-build-archives/Archive";
import * as EsbuildApi from "effect-build-esbuild/Api";
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
${publicModuleImports}

const publicModules = [
  ${publicModuleBindings},
];
assert.deepEqual(publicModules.map((module) => Object.keys(module).sort()), ${JSON.stringify(publicModuleExports)});
const bundle = await Effect.runPromise(
  EsbuildApi.Build.build({
    stdin: { contents: "export const consumer = 1;", loader: "ts", resolveDir: process.cwd() },
    bundle: true,
    format: "esm",
    write: false,
    logLevel: "silent",
  }),
);
assert.equal(bundle.outputFiles.length, 1);
const bundleOutput = bundle.outputFiles[0];
const artifact = await Effect.runPromise(
  FinalizedFile.publish(
    {
      destination: "dist/bundle.mjs",
      observation: "hashed",
      provenance: Artifact.intrinsicProvenance("consumer"),
    },
    (candidate) => FileSystem.FileSystem.use((fileSystem) =>
      fileSystem.writeFile(candidate, bundleOutput.contents)
    ),
  ).pipe(Effect.provide(NodeServices.layer)),
);
const adoption = Artifact.adoptFile("consumer/bundle.mjs", artifact);
const verified = await Effect.runPromise(
  FinalizedFile.withVerifiedBytes(artifact, (value) => Effect.succeed(new TextDecoder().decode(value)))
    .pipe(Effect.provide(NodeServices.layer)),
);
const consumerValue = (await import(pathToFileURL(artifact.path).href)).consumer;

// Header-only fixture: proves public observation and artifact handoff, not OS execution.
const interpreter = new TextEncoder().encode("/lib64/ld-linux-x86-64.so.2\\0");
const nativeBytes = new Uint8Array(120 + interpreter.byteLength);
nativeBytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]);
const header = new DataView(nativeBytes.buffer);
header.setUint16(18, 62, true);
header.setBigUint64(32, 64n, true);
header.setUint16(54, 56, true);
header.setUint16(56, 1, true);
header.setUint32(64, 3, true);
header.setBigUint64(72, 120n, true);
header.setBigUint64(96, BigInt(interpreter.byteLength), true);
nativeBytes.set(interpreter, 120);
const executable = await Effect.runPromise(
  Executable.publish(
    {
      destination: "dist/header-fixture",
      observation: "hashed",
      provenance: Artifact.intrinsicProvenance("packed-consumer-header-fixture"),
    },
    (candidate) => Effect.gen(function*() {
      const fileSystem = yield* FileSystem.FileSystem;
      yield* fileSystem.writeFile(candidate, nativeBytes);
      yield* fileSystem.chmod(candidate, 0o755);
    }),
    (candidate) => Effect.map(NativeExecutable.observe(candidate.path), (observed) => {
      assert.deepEqual(observed, { nativeFormat: "elf", os: "linux", architecture: "x64", abi: "gnu" });
      return {
        nativeFormat: observed.nativeFormat,
        runtime: { name: "packed-consumer-header-fixture", version: "1" },
        target: Schema.decodeUnknownSync(SystemTarget.SystemTarget)("linux-x64-gnu"),
      };
    }),
  ).pipe(Effect.provide(NodeServices.layer)),
);
const archived = await Effect.runPromise(
  Archive.archive(new Archive.ArchiveInput({
    format: "zip",
    entries: [new Archive.ArchiveEntry({ artifact: executable, path: "bin/header-fixture", executable: true })],
    outfile: "dist/header-fixture.zip",
  })).pipe(Effect.provide(Archive.layer), Effect.provide(NodeServices.layer)),
);
const zip = await Effect.runPromise(
  FinalizedFile.withVerifiedBytes(archived, (bytes) => Effect.succeed(Buffer.from(bytes)))
    .pipe(Effect.provide(NodeServices.layer)),
);
// Independent reader for this single stored ZIP entry; no package-private decoder.
const end = zip.length - 22;
assert.equal(zip.readUInt32LE(end), 0x06054b50);
assert.equal(zip.readUInt16LE(end + 10), 1);
const central = zip.readUInt32LE(end + 16);
assert.equal(zip.readUInt32LE(central), 0x02014b50);
assert.equal(zip.readUInt16LE(central + 10), 0);
const entryName = zip.subarray(central + 46, central + 46 + zip.readUInt16LE(central + 28)).toString("utf8");
assert.equal(entryName, "bin/header-fixture");
const local = zip.readUInt32LE(central + 42);
assert.equal(zip.readUInt32LE(local), 0x04034b50);
assert.equal(zip.readUInt16LE(local + 8), 0);
const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
const entryBytes = zip.subarray(dataStart, dataStart + zip.readUInt32LE(central + 20));
assert.deepEqual(entryBytes, Buffer.from(nativeBytes));
const executableArchiveMode = (zip.readUInt32LE(central + 38) >>> 16) & 0o777;
assert.equal(executableArchiveMode, 0o755);
assert.equal(createHash("sha256").update(entryBytes).digest("hex"), executable.digest.value);
const mutationExit = await Effect.runPromise(
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    yield* fileSystem.writeFileString(artifact.path, "mutated\\n");
    return yield* Effect.exit(FinalizedFile.withVerifiedBytes(artifact, () => Effect.void));
  }).pipe(Effect.provide(NodeServices.layer)),
);
const mutationError = mutationExit._tag === "Failure" ? Cause.findErrorOption(mutationExit.cause) : undefined;
const mutationErrorTag = mutationError?._tag === "Some" ? mutationError.value._tag : null;
assert.equal(adoption.protocol, "effect-build/artifact-adoption@1");
assert.equal(adoption.logicalName, "consumer/bundle.mjs");
assert.equal("path" in adoption, false);
assert.equal(adoption.bytes, artifact.bytes);
assert.equal(adoption.digest.value, artifact.digest.value);
assert.notEqual(adoption.digest, artifact.digest);
assert(Object.isFrozen(adoption));
assert(Object.isFrozen(adoption.digest));
assert.equal(artifact.bytes, String(bundleOutput.contents.byteLength));
assert.equal(artifact.digest.value, createHash("sha256").update(bundleOutput.contents).digest("hex"));
assert.equal(verified, bundleOutput.text);
assert.equal(consumerValue, 1);
assert.equal(mutationErrorTag, "FileVerificationFailed");
`;

const runConsumer = async (input) => {
  const consumerRoot = await mkdtemp(join(tmpdir(), "effect-build-consumer-"));
  try {
    const dependencies = {};
    const expectedVersions = {};
    if (input.mode === "registry") {
      for (const name of packageNames) {
        dependencies[name] = input.version;
        expectedVersions[name] = input.version;
      }
    } else if (input.mode === "candidate") {
      const candidate = readCandidate(input.directory);
      assert.deepEqual(
        candidate.packages.map(({ name }) => name).sort(),
        packageNames,
        "candidate must contain every public package",
      );
      for (const entry of candidate.packages) {
        dependencies[entry.name] = `file:${join(input.directory, entry.file).replaceAll("\\", "/")}`;
        expectedVersions[entry.name] = candidate.version;
      }
    } else {
      const packDirectory = join(consumerRoot, "tarballs");
      await mkdir(packDirectory);
      const bun = process.versions.bun === undefined ? "bun" : process.execPath;
      for (const { name, version, directory } of packages) {
        await execute(bun, ["pm", "pack", "--destination", packDirectory], { cwd: directory });
        const file = `${name.replace(/^@/u, "").replaceAll("/", "-")}-${version}.tgz`;
        dependencies[name] = `file:${join(packDirectory, file).replaceAll("\\", "/")}`;
        expectedVersions[name] = version;
      }
    }

    await writeFile(
      join(consumerRoot, "package.json"),
      JSON.stringify(
        {
          name: "effect-build-consumer",
          private: true,
          type: "module",
          dependencies: {
            "@effect/platform-node": workspaceManifest.devDependencies["@effect/platform-node"],
            effect: workspaceManifest.devDependencies.effect,
            ...dependencies,
          },
          devDependencies: { typescript: workspaceManifest.devDependencies.typescript },
        },
        null,
        2,
      ),
    );
    await writeFile(
      join(consumerRoot, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            module: "nodenext",
            moduleResolution: "nodenext",
            target: "es2022",
            strict: true,
            exactOptionalPropertyTypes: true,
            outDir: "dist-consumer",
            skipLibCheck: true,
          },
          include: ["main.ts"],
        },
        null,
        2,
      ),
    );
    await writeFile(join(consumerRoot, "main.ts"), runtimeConsumerSource);

    // npm.cmd needs a shell on Windows. Disable lifecycle scripts for all inputs;
    // npm still installs esbuild's platform binary through its optional dependency.
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    await execute(npm, [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--registry=https://registry.npmjs.org",
    ], {
      cwd: consumerRoot,
      shell: process.platform === "win32",
    });
    for (const name of packageNames) {
      const installed = JSON.parse(await readFile(join(consumerRoot, "node_modules", name, "package.json"), "utf8"));
      assert.equal(installed.name, name);
      assert.equal(installed.version, expectedVersions[name]);
      for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
        for (const [dependency, specifier] of Object.entries(installed[field] ?? {})) {
          assert.doesNotMatch(
            specifier,
            /^(?:workspace:|catalog:|file:|link:|portal:)/u,
            `${name} has an unresolved ${dependency} dependency`,
          );
        }
      }
    }
    await execute(process.execPath, [
      join(consumerRoot, "node_modules", "typescript", "bin", "tsc"),
      "-p",
      "tsconfig.json",
    ], {
      cwd: consumerRoot,
    });
    await execute(process.execPath, [join(consumerRoot, "dist-consumer", "main.js")], { cwd: consumerRoot });
    const runtime = process.versions.bun === undefined ? "Node" : "Bun";
    console.log(`${runtime} consumer install, public exports, typecheck, and runtime checks passed (${input.mode})`);
  } finally {
    await rm(consumerRoot, { recursive: true, force: true });
  }
};

await runConsumer(consumerArguments(process.argv.slice(2)));
