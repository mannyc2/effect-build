// Consumes built packages or exact release-candidate tarballs in a fresh npm project to
// install and typecheck every public module, finalize actual provider bytes,
// adopt their path-free identity, and archive an authored executable unchanged.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  assertCredentialFreeEffectiveNpmConfig,
  buildCredentialFreeChildEnvironment,
  credentialFreeConsumerPaths,
} from "./release/credential-free-consumer.mjs";
import { validateReleaseCandidate } from "./release/protocol.mjs";
import { extractStrictPackageManifest } from "./release/tar-protocol.mjs";

const execute = promisify(execFile);
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const contractBytes = await readFile(join(root, "tooling/effect-build-contract.json"));
const combinedContract = JSON.parse(contractBytes);
const publicSurface = JSON.parse(await readFile(join(root, "tooling/public-api.json"), "utf8"));
if (combinedContract.schema !== "effect-build/combined-contract@1") {
  throw new Error("unsupported combined contract schema");
}
if (publicSurface.schema !== "effect-build/public-surface@3") {
  throw new Error("unsupported public surface schema");
}

const moduleSpecifiers = (packages) =>
  Object.entries(packages).sort(([left], [right]) => left.localeCompare(right)).flatMap(([name, surface]) => [
    name,
    ...Object.keys(surface.subpaths).sort().map((subpath) => `${name}/${subpath.slice(2)}`),
  ]);

const packageNames = Object.keys(combinedContract.publicApiProjection.packages).sort();
const projectedPackageNames = Object.keys(publicSurface.packages).sort();
const publicModuleSpecifiers = moduleSpecifiers(combinedContract.publicApiProjection.packages);
const projectedModuleSpecifiers = moduleSpecifiers(publicSurface.packages);
const privatePackages = new Set(combinedContract.publicApiProjection.privatePackages);
if (
  JSON.stringify(packageNames) !== JSON.stringify(projectedPackageNames)
  || JSON.stringify(publicModuleSpecifiers) !== JSON.stringify(projectedModuleSpecifiers)
) {
  throw new Error("tooling/public-api.json is not the exact combined-contract topology");
}
if (packageNames.some((name) => privatePackages.has(name))) {
  throw new Error("combined contract projects a private package into the packed consumer");
}
const publicModuleImports = publicModuleSpecifiers
  .map((specifier, index) => `import * as PublicModule${index} from ${JSON.stringify(specifier)};`)
  .join("\n");
const publicModuleBindings = publicModuleSpecifiers.map((_, index) => `PublicModule${index}`).join(",\n  ");

const workspaceManifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const effectVersion = workspaceManifest.devDependencies.effect;
const platformNodeVersion = workspaceManifest.devDependencies["@effect/platform-node"];
const typescriptVersion = workspaceManifest.devDependencies.typescript;

const consumerArguments = (args) => {
  if (args.length === 0) return { mode: "workspace" };
  if (args.length === 2 && args[0] === "--candidate" && args[1] !== "") {
    return { mode: "candidate", directory: resolve(args[1]) };
  }
  if (
    args.length === 5
    && args[0] === "--registry-version"
    && args[2] === "--runtime"
    && (args[3] === "node" || args[3] === "bun")
    && args[4] === "--json"
  ) return { mode: "registry", runtime: args[3], version: args[1] };
  throw new Error("consumer arguments must select built workspace, --candidate <directory>, or exact registry mode");
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
const executableArchiveMatches = createHash("sha256").update(entryBytes).digest("hex") === executable.digest.value;
const mutationExit = await Effect.runPromise(
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    yield* fileSystem.writeFileString(artifact.path, "mutated\\n");
    return yield* Effect.exit(FinalizedFile.withVerifiedBytes(artifact, () => Effect.void));
  }).pipe(Effect.provide(NodeServices.layer)),
);
const mutationError = mutationExit._tag === "Failure" ? Cause.findErrorOption(mutationExit.cause) : undefined;
const mutationErrorTag = mutationError?._tag === "Some" ? mutationError.value._tag : null;
process.stdout.write(JSON.stringify({
  publicModules: publicModules.length,
  outputs: bundle.outputFiles.length,
  protocol: adoption.protocol,
  logicalName: adoption.logicalName,
  digestLength: adoption.digest.value.length,
  bytes: adoption.bytes,
  pathFree: !("path" in adoption),
  adoptionMatchesArtifact:
    adoption.bytes === artifact.bytes
    && adoption.digest.value === artifact.digest.value
    && adoption.digest !== artifact.digest
    && Object.isFrozen(adoption)
    && Object.isFrozen(adoption.digest),
  verified,
  bundleMatchesArtifact:
    artifact.bytes === String(bundleOutput.contents.byteLength)
    && artifact.digest.value === createHash("sha256").update(bundleOutput.contents).digest("hex")
    && verified === bundleOutput.text,
  consumerValue,
  executableArchiveMatches,
  executableArchiveMode,
  mutationErrorTag,
}));
`;

const assertConsumerReport = (observed) => {
  if (
    observed.publicModules !== publicModuleSpecifiers.length
    || observed.outputs !== 1
    || observed.protocol !== "effect-build/artifact-adoption@1"
    || observed.logicalName !== "consumer/bundle.mjs"
    || observed.digestLength !== 64
    || !/^[1-9][0-9]*$/.test(observed.bytes)
    || observed.pathFree !== true
    || observed.adoptionMatchesArtifact !== true
    || typeof observed.verified !== "string"
    || observed.bundleMatchesArtifact !== true
    || observed.consumerValue !== 1
    || observed.executableArchiveMatches !== true
    || observed.executableArchiveMode !== 0o755
    || observed.mutationErrorTag !== "FileVerificationFailed"
  ) throw new Error("installed consumer did not prove provider, artifact adoption, verification, and executable archive composition");
};

const runRegistryConsumer = async ({ runtime, version }) => {
  const policy = combinedContract.releaseCertification.finalPublicVerification;
  const smoke = policy.implementation.consumerSmoke;
  if (version !== policy.version) throw new Error("consumer registry version is not the certified target");
  const expected = smoke[runtime];
  if (
    (runtime === "node" && process.version !== `v${expected.version}`)
    || (runtime === "bun" && process.versions.bun !== expected.version)
  ) throw new Error(`${runtime} runtime does not match the certified toolchain`);
  const consumerRoot = await mkdtemp(join(tmpdir(), `effect-build-${runtime}-registry-consumer-`));
  try {
    const consumerHome = join(consumerRoot, "home");
    const cacheRoot = join(consumerRoot, "cache");
    const paths = credentialFreeConsumerPaths({ consumerRoot, consumerHome, cacheRoot });
    await mkdir(join(consumerHome, ".config"), { recursive: true, mode: 0o700 });
    await mkdir(paths.cacheRoot, { recursive: true, mode: 0o700 });
    await mkdir(paths.prefixRoot, { recursive: true, mode: 0o700 });
    for (const file of [paths.projectConfig, paths.userConfig, paths.globalConfig, paths.bunConfig]) {
      await writeFile(file, "", { mode: 0o600 });
    }
    await writeFile(
      join(consumerRoot, "package.json"),
      `${JSON.stringify({
        name: `effect-build-final-${runtime}-consumer`,
        private: true,
        type: "module",
        dependencies: {
          "@effect/platform-node": platformNodeVersion,
          effect: effectVersion,
          ...Object.fromEntries(packageNames.map((name) => [name, version])),
        },
      }, null, 2)}\n`,
      { mode: 0o600 },
    );
    await writeFile(join(consumerRoot, "main.mjs"), runtimeConsumerSource, { mode: 0o600 });
    const environment = buildCredentialFreeChildEnvironment({
      sourceEnvironment: process.env,
      forbiddenNames: combinedContract.releaseCertification.npmOidcCertification.forbiddenEnvironmentNames,
      consumerHome,
      paths,
      registry: policy.registry,
      runtime,
    });
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const auditNpmConfig = async () => {
      const result = await execute(npm, ["config", "list", "--json"], {
        cwd: consumerRoot,
        env: environment,
        shell: process.platform === "win32",
      });
      let effective;
      try {
        effective = JSON.parse(result.stdout);
      } catch {
        throw new Error("consumer effective npm config is not JSON");
      }
      assertCredentialFreeEffectiveNpmConfig(effective, {
        registry: policy.registry,
        userConfig: paths.userConfig,
        globalConfig: paths.globalConfig,
        cacheRoot: paths.cacheRoot,
        prefixRoot: paths.prefixRoot,
      });
    };
    const npmVersion = (await execute(npm, ["--version"], {
      cwd: consumerRoot,
      env: environment,
      shell: process.platform === "win32",
    })).stdout.trim();
    if (npmVersion !== smoke.node.npm) throw new Error("npm client does not match the certified toolchain");
    await auditNpmConfig();
    if (runtime === "node") {
      await execute(npm, [
        "install",
        "--no-audit",
        "--no-fund",
        "--ignore-scripts",
        "--strict-ssl=true",
        "--registry",
        policy.registry,
        "--userconfig",
        paths.userConfig,
        "--globalconfig",
        paths.globalConfig,
        "--cache",
        paths.cacheRoot,
      ], {
        cwd: consumerRoot,
        env: environment,
        shell: process.platform === "win32",
      });
    } else {
      await execute(process.execPath, [
        "install",
        `--config=${paths.bunConfig}`,
        "--registry",
        policy.registry,
        "--cache-dir",
        paths.cacheRoot,
        "--ignore-scripts",
        "--no-progress",
        "--no-summary",
      ], {
        cwd: consumerRoot,
        env: environment,
      });
    }
    await auditNpmConfig();
    for (const file of [paths.projectConfig, paths.userConfig, paths.globalConfig, paths.bunConfig]) {
      if (await readFile(file, "utf8") !== "") throw new Error("consumer configuration mutated during install");
    }
    const result = await execute(process.execPath, [join(consumerRoot, "main.mjs")], {
      cwd: consumerRoot,
      env: environment,
    });
    const observed = JSON.parse(result.stdout.trim());
    assertConsumerReport(observed);
    const values = {
      executor: runtime,
      version: expected.version,
      npm: expected.npm,
      cache: expected.cache,
      publicModules: publicModuleSpecifiers,
      pipelines: smoke.representativePipelines,
      passed: true,
    };
    const report = Object.fromEntries(expected.reportFields.map((field) => [field, values[field]]));
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    await rm(consumerRoot, { recursive: true, force: true });
  }
};

const runPackedConsumer = async (input) => {
  const bunExecutable = process.versions.bun === undefined ? "bun" : process.execPath;

  const consumerRoot = await mkdtemp(join(tmpdir(), "effect-build-consumer-"));
  const cleanup = async () => rm(consumerRoot, { recursive: true, force: true });

  const disallowedSpecifier = /^(?:workspace:|catalog:|file:|link:|portal:)/;

  const embeddedManifest = (tarballBytes) => {
    const bytes = extractStrictPackageManifest({
      tarballBytes,
      policy: combinedContract.releaseCertification.candidate.tarballInspection,
      label: "consumer tarball",
    });
    const manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      for (const [dependency, specifier] of Object.entries(manifest[field] ?? {})) {
        if (disallowedSpecifier.test(specifier)) {
          throw new Error(`${manifest.name} packed with unresolved specifier ${dependency}: ${specifier}`);
        }
      }
    }
    return { bytes, manifest };
  };

  const candidateTarballs = async (directory, packDirectory) => {
    const candidate = JSON.parse(await readFile(join(directory, combinedContract.releaseCertification.candidate.manifest), "utf8"));
    const version = combinedContract.npmRegistryBoundary.publicationAdmission.target.version;
    const packageBytes = new Map();
    const packageManifests = new Map();
    // Derive filenames from the trusted contract, never from an unvalidated manifest.
    for (const name of packageNames) {
      const bytes = await readFile(join(directory, `${name}-${version}.tgz`));
      packageBytes.set(name, bytes);
      packageManifests.set(name, embeddedManifest(bytes));
    }
    const { stdout } = await execute("git", ["rev-parse", "HEAD"], { cwd: root });
    validateReleaseCandidate({
      candidate,
      contract: combinedContract,
      contractBytes,
      expectedSourceSha: stdout.trim(),
      files: await readdir(directory),
      packageBytes,
      packageManifests,
    });
    const tarballs = {};
    for (const entry of candidate.packages) {
      const file = join(packDirectory, entry.file);
      // npm reads a private copy of the exact bytes validated above.
      await writeFile(file, packageBytes.get(entry.name), { flag: "wx", mode: 0o600 });
      tarballs[entry.name] = file;
    }
    return tarballs;
  };

  try {
    const packDirectory = join(consumerRoot, "tarballs");
    await mkdir(packDirectory);
    const tarballs = input.mode === "candidate" ? await candidateTarballs(input.directory, packDirectory) : {};
    for (const name of input.mode === "workspace" ? packageNames : []) {
      const { stdout } = await execute(bunExecutable, ["pm", "pack", "--destination", packDirectory], {
        cwd: join(root, "packages", name),
      });
      const line = stdout.split("\n").find((candidate) => candidate.trim().endsWith(".tgz"));
      if (line === undefined) throw new Error(`bun pm pack produced no tarball for ${name}:\n${stdout}`);
      const tarball = join(packDirectory, line.trim().split("/").at(-1));
      const { manifest } = embeddedManifest(await readFile(tarball));
      if (manifest.name !== name || manifest.private === true) {
        throw new Error(`${name} packed with invalid public identity`);
      }
      tarballs[name] = tarball;
    }

    await writeFile(
      join(consumerRoot, "package.json"),
      JSON.stringify(
        {
          name: "effect-build-consumer",
          private: true,
          type: "module",
          dependencies: {
            "@effect/platform-node": platformNodeVersion,
            effect: effectVersion,
            ...Object.fromEntries(packageNames.map((name) => [name, tarballs[name]])),
          },
          devDependencies: { typescript: typescriptVersion },
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
            noEmit: false,
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

    // Windows ships npm as npm.cmd, which node can only spawn through a shell.
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const npmEnvironment = { ...process.env, npm_config_audit: "false", npm_config_fund: "false" };
    const npmOptions = { cwd: consumerRoot, env: npmEnvironment, shell: process.platform === "win32" };
    await execute(npm, ["install", "--no-audit", "--no-fund"], npmOptions);

    for (const name of packageNames) {
      const installed = JSON.parse(await readFile(join(consumerRoot, "node_modules", name, "package.json"), "utf8"));
      if (installed.name !== name) throw new Error(`consumer resolved ${name} to ${installed.name}`);
    }

    await execute(
      "node",
      [join(consumerRoot, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"],
      { cwd: consumerRoot, env: npmEnvironment },
    );

    const { stdout } = await execute("node", [join(consumerRoot, "dist-consumer", "main.js")], { cwd: consumerRoot });
    assertConsumerReport(JSON.parse(stdout.trim()));
    console.log("consumer install, typecheck, and runtime checks passed");
  } finally {
    await cleanup();
  }
};

const input = consumerArguments(process.argv.slice(2));
if (input.mode === "registry") {
  await runRegistryConsumer(input);
} else {
  await runPackedConsumer(input);
}
