// Packs every contract-public package and proves a fresh npm consumer can
// install and typecheck every public module, run an in-memory provider API,
// finalize immutable bytes, and adopt their path-free identity by logical name.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";

const execute = promisify(execFile);
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const combinedContract = JSON.parse(await readFile(join(root, "tooling/effect-build-contract.json"), "utf8"));
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
if (packageNames.length !== 11 || publicModuleSpecifiers.length !== 42) {
  throw new Error(
    `combined contract projects ${packageNames.length} public packages and ${publicModuleSpecifiers.length} modules; expected 11 and 42`,
  );
}
if (packageNames.some((name) => privatePackages.has(name))) {
  throw new Error("combined contract projects a private package into the packed consumer");
}
const publicModuleImports = publicModuleSpecifiers
  .map((specifier, index) => `import * as PublicModule${index} from ${JSON.stringify(specifier)};`)
  .join("\n");
const publicModuleBindings = publicModuleSpecifiers.map((_, index) => `PublicModule${index}`).join(",\n  ");
const bunExecutable = process.versions.bun === undefined ? "bun" : process.execPath;

const workspaceManifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const effectVersion = workspaceManifest.devDependencies.effect;
const platformNodeVersion = workspaceManifest.devDependencies["@effect/platform-node"];
const typescriptVersion = workspaceManifest.devDependencies.typescript;

const consumerRoot = await mkdtemp(join(tmpdir(), "effect-build-consumer-"));
const cleanup = async () => rm(consumerRoot, { recursive: true, force: true });

const disallowedSpecifier = /^(?:workspace:|catalog:|file:|link:|portal:)/;

const packedManifest = async (tarball) => {
  const archive = gunzipSync(await readFile(tarball));
  const record = 512;
  for (let offset = 0; offset < archive.byteLength; offset += record) {
    const name = archive.subarray(offset, offset + 100).toString("utf8").replace(/\0.*$/, "");
    const size = Number.parseInt(archive.subarray(offset + 124, offset + 136).toString("utf8").trim() || "0", 8);
    if (name === "package/package.json") {
      return JSON.parse(archive.subarray(offset + record, offset + record + size).toString("utf8"));
    }
    offset += Math.ceil(size / record) * record;
  }
  throw new Error(`package/package.json not found in ${tarball}`);
};

try {
  const tarballs = {};
  for (const name of packageNames) {
    const packDirectory = join(consumerRoot, "tarballs");
    await mkdir(packDirectory, { recursive: true });
    const { stdout } = await execute(bunExecutable, ["pm", "pack", "--destination", packDirectory], {
      cwd: join(root, "packages", name),
    });
    const line = stdout.split("\n").find((candidate) => candidate.trim().endsWith(".tgz"));
    if (line === undefined) throw new Error(`bun pm pack produced no tarball for ${name}:\n${stdout}`);
    const tarball = join(packDirectory, line.trim().split("/").at(-1));
    const manifest = await packedManifest(tarball);
    if (manifest.name !== name || manifest.private === true) {
      throw new Error(`${name} packed with invalid public identity`);
    }
    for (const [dependency, specifier] of Object.entries(manifest.dependencies ?? {})) {
      if (disallowedSpecifier.test(specifier)) {
        throw new Error(`${name} packed with unresolved specifier ${dependency}: ${specifier}`);
      }
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
  await writeFile(
    join(consumerRoot, "main.ts"),
    `import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, FileSystem } from "effect";
import * as Artifact from "effect-build/Artifact";
import * as FinalizedFile from "effect-build/Author/File";
import * as EsbuildApi from "effect-build-esbuild/Api";
${publicModuleImports}

const publicModules = [
  ${publicModuleBindings},
];

const bundle = await Effect.runPromise(
  EsbuildApi.Build.build({
    stdin: { contents: "export const consumer = 1;", loader: "ts", resolveDir: process.cwd() },
    bundle: true,
    write: false,
    logLevel: "silent",
  }),
);

const artifact = await Effect.runPromise(
  FinalizedFile.publish(
    {
      destination: "dist/adopt-me.txt",
      observation: "hashed",
      provenance: Artifact.intrinsicProvenance("packed-consumer"),
    },
    (candidate) => FileSystem.FileSystem.use((fileSystem) => fileSystem.writeFileString(candidate, "immutable bytes\\n")),
  ).pipe(Effect.provide(NodeServices.layer)),
);
const adoption = Artifact.adoptFile("consumer/adopt-me.txt", artifact);
const verified = await Effect.runPromise(
  FinalizedFile.withVerifiedBytes(
    artifact,
    (bytes) => Effect.succeed(new TextDecoder().decode(bytes)),
  ).pipe(Effect.provide(NodeServices.layer)),
);
const mutationExit = await Effect.runPromise(
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    yield* fileSystem.writeFileString(artifact.path, "mutated\\n");
    return yield* Effect.exit(FinalizedFile.withVerifiedBytes(artifact, () => Effect.void));
  }).pipe(Effect.provide(NodeServices.layer)),
);
const mutationError = mutationExit._tag === "Failure" ? Cause.findErrorOption(mutationExit.cause) : undefined;
const mutationErrorTag = mutationError?._tag === "Some" ? mutationError.value._tag : null;

console.log(JSON.stringify({
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
  mutationErrorTag,
}));
`,
  );

  // Windows ships npm as npm.cmd, which node can only spawn through a shell.
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const npmEnvironment = { ...process.env, npm_config_audit: "false", npm_config_fund: "false" };
  const npmOptions = { cwd: consumerRoot, env: npmEnvironment, shell: process.platform === "win32" };
  await execute(npm, ["install", "--no-audit", "--no-fund"], npmOptions);

  for (const name of packageNames) {
    const installed = JSON.parse(await readFile(join(consumerRoot, "node_modules", name, "package.json"), "utf8"));
    if (installed.name !== name) throw new Error(`consumer resolved ${name} to ${installed.name}`);
  }

  await execute(npm, ["exec", "--no", "tsc", "--", "-p", "tsconfig.json"], npmOptions);

  const { stdout } = await execute("node", [join(consumerRoot, "dist-consumer", "main.js")], { cwd: consumerRoot });
  const report = JSON.parse(stdout.trim());
  if (report.publicModules !== 42) throw new Error(`consumer loaded ${report.publicModules} public modules; expected 42`);
  if (report.outputs !== 1) throw new Error(`consumer esbuild build produced ${report.outputs} outputs`);
  if (report.protocol !== "effect-build/artifact-adoption@1") throw new Error(`unexpected adoption protocol`);
  if (
    report.logicalName !== "consumer/adopt-me.txt"
    || report.digestLength !== 64
    || report.bytes !== "16"
    || report.pathFree !== true
    || report.adoptionMatchesArtifact !== true
  ) {
    throw new Error(`consumer adoption identity is invalid: ${stdout}`);
  }
  if (report.verified !== "immutable bytes\n" || report.mutationErrorTag !== "FileVerificationFailed") {
    throw new Error(`consumer immutable-byte verification failed: ${stdout}`);
  }
  console.log("consumer install, typecheck, and runtime checks passed");
} finally {
  await cleanup();
}
