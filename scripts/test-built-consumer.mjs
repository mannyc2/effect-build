// Packs the seven built packages and proves a fresh npm consumer can install,
// typecheck, and run them: a real fake-bun compile plus in-memory esbuild and
// rolldown builds, with type-level use of every public module.
import { execFile } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";

const execute = promisify(execFile);
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageNames = [
  "effect-build",
  "effect-build-apple",
  "effect-build-bun",
  "effect-build-deno",
  "effect-build-esbuild",
  "effect-build-node-sea",
  "effect-build-rolldown",
];

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
    const { stdout } = await execute("bun", ["pm", "pack", "--destination", packDirectory], {
      cwd: join(root, "packages", name),
    });
    const line = stdout.split("\n").find((candidate) => candidate.trim().endsWith(".tgz"));
    if (line === undefined) throw new Error(`bun pm pack produced no tarball for ${name}:\n${stdout}`);
    const tarball = join(packDirectory, line.trim().split("/").at(-1));
    const manifest = await packedManifest(tarball);
    for (const [dependency, specifier] of Object.entries(manifest.dependencies ?? {})) {
      if (disallowedSpecifier.test(specifier)) {
        throw new Error(`${name} packed with unresolved specifier ${dependency}: ${specifier}`);
      }
    }
    tarballs[name] = tarball;
  }

  // Pack a real out-of-tree author adapter. Its exact core tarball dependency,
  // combined with npm's nested install strategy below, intentionally creates a
  // second effect-build runtime graph. The adapter and consumer must still
  // interoperate through public Context service identifiers alone.
  const adapterRoot = join(consumerRoot, "external-author");
  await mkdir(adapterRoot, { recursive: true });
  await copyFile(join(root, "test/fixtures/external-author-v05/index.js"), join(adapterRoot, "index.js"));
  await copyFile(join(root, "test/fixtures/external-author-v05/index.d.ts"), join(adapterRoot, "index.d.ts"));
  await writeFile(
    join(adapterRoot, "package.json"),
    JSON.stringify(
      {
        name: "@fixture/effect-build-author",
        version: "1.0.0",
        type: "module",
        files: ["index.js", "index.d.ts"],
        exports: { ".": { types: "./index.d.ts", default: "./index.js" } },
        dependencies: { "effect-build": tarballs["effect-build"] },
        peerDependencies: { effect: effectVersion },
      },
      null,
      2,
    ),
  );
  const packDirectory = join(consumerRoot, "tarballs");
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const pack = await execute(npm, ["pack", adapterRoot, "--pack-destination", packDirectory], {
    cwd: consumerRoot,
    shell: process.platform === "win32",
  });
  const adapterFilename = pack.stdout.split("\n").find((candidate) => candidate.trim().endsWith(".tgz"));
  if (adapterFilename === undefined) throw new Error(`npm pack produced no external author tarball:\n${pack.stdout}`);
  const adapterTarball = join(packDirectory, adapterFilename.trim().split(/[\\/]/u).at(-1));

  await writeFile(
    join(consumerRoot, "package.json"),
    JSON.stringify(
      {
        name: "effect-build-consumer",
        private: true,
        type: "module",
        dependencies: {
          "@fixture/effect-build-author": adapterTarball,
          "@effect/platform-node": platformNodeVersion,
          effect: effectVersion,
          ...Object.fromEntries(packageNames.map((name) => [name, tarballs[name]])),
        },
        devDependencies: { typescript: typescriptVersion },
        overrides: { "@effect/platform-node-shared": platformNodeVersion },
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
  await writeFile(join(consumerRoot, "rolldown-entry.js"), "export const consumed = 1;\n");
  await writeFile(join(consumerRoot, "external-entry.js"), "export const external = 1;\n");
  await writeFile(
    join(consumerRoot, "main.ts"),
    `import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { adapterProducerTag, getCalls, layer as externalAuthorLayer } from "@fixture/effect-build-author";
import * as Apple from "effect-build-apple";
import * as AppleAppBundle from "effect-build-apple/AppBundle";
import * as AppleArtifact from "effect-build-apple/Artifact";
import * as AppleAssess from "effect-build-apple/Assess";
import * as AppleCodeSign from "effect-build-apple/CodeSign";
import * as AppleDiskImage from "effect-build-apple/DiskImage";
import * as AppleInstallerPackage from "effect-build-apple/InstallerPackage";
import * as AppleNotary from "effect-build-apple/Notary";
import * as AppleStaple from "effect-build-apple/Staple";
import * as AppleZip from "effect-build-apple/Zip";
import * as BunBundle from "effect-build-bun/Bundle";
import * as BunCompile from "effect-build-bun/CompileExecutable";
import * as DenoBundle from "effect-build-deno/Bundle";
import * as DenoCompile from "effect-build-deno/CompileExecutable";
import * as Build from "effect-build-esbuild/Build";
import * as Watch from "effect-build-esbuild/Watch";
import * as AssembleExecutable from "effect-build-node-sea/AssembleExecutable";
import * as Rolldown from "effect-build-rolldown/Build";
import type * as RolldownWatch from "effect-build-rolldown/Watch";
import type * as Artifact from "effect-build/Artifact";
import type * as BuildError from "effect-build/BuildError";
import * as NodeMain from "effect-build/Author/NodeMain";
import * as Target from "effect-build/Target";

const marker: DenoCompile.Permissions = { read: true };
const main: AssembleExecutable.Main = { _tag: "Bytes", contents: new Uint8Array(), format: "commonjs" };
const assembler: typeof AssembleExecutable.assembleExecutable = AssembleExecutable.assembleExecutable;
const bunBundleInput: BunBundle.DirectWriteInput = { entrypoints: ["main.ts"], outdir: "dist" };
const explicitTarget: BunCompile.Target = process.platform === "darwin"
  ? (process.arch === "arm64" ? "macos-aarch64" : "macos-x64")
  : process.platform === "win32"
  ? "windows-x64"
  : process.arch === "arm64"
  ? "linux-aarch64-gnu"
  : "linux-x64-gnu";
const denoPlatform: DenoBundle.Platform = "browser";
const watching: typeof Watch.changes = Watch.changes;
const watcherEvent: RolldownWatch.Event = { code: "BUNDLE_END", duration: 0, output: [], superseded: 0 };
const appleNamespaces = [
  Apple.Artifact,
  Apple.CodeSign,
  Apple.AppBundle,
  Apple.Zip,
  Apple.DiskImage,
  Apple.InstallerPackage,
  Apple.Notary,
  Apple.Staple,
  Apple.Assess,
] as const;
const appleOperations = [
  AppleArtifact.observeExecutable,
  AppleCodeSign.sign,
  AppleAppBundle.create,
  AppleZip.create,
  AppleDiskImage.create,
  AppleInstallerPackage.create,
  AppleNotary.submit,
  AppleNotary.reconcile,
  AppleStaple.staple,
  AppleAssess.assess,
] as const;
void marker;
void main;
void assembler;
void bunBundleInput;
void denoPlatform;
void watching;
void watcherEvent;
void appleNamespaces;
void appleOperations;

if (adapterProducerTag === NodeMain.Producer) {
  throw new Error("external author did not exercise a duplicate effect-build runtime graph");
}

const callsBeforeRejectedRequest = getCalls();
const rejected = await Effect.runPromiseExit(
  Effect.scoped(NodeMain.seal({
    protocol: "effect-build/profile/node-main@2" as typeof NodeMain.profile,
    entrypoint: "external-entry.js",
    format: "module",
  })).pipe(Effect.provide(externalAuthorLayer), Effect.provide(NodeServices.layer)),
);
if (rejected._tag !== "Failure" || getCalls() !== callsBeforeRejectedRequest) {
  throw new Error("unknown portable protocol reached the external provider");
}

const externalMain = await Effect.runPromise(
  Effect.scoped(NodeMain.seal({
    protocol: NodeMain.profile,
    entrypoint: "external-entry.js",
    format: "module",
  })).pipe(Effect.provide(externalAuthorLayer), Effect.provide(NodeServices.layer)),
);
if (getCalls() !== callsBeforeRejectedRequest + 1) {
  throw new Error("external portable provider call count mismatch");
}

const rolled = await Effect.runPromise(
  Rolldown.generate({ input: "rolldown-entry.js", cwd: process.cwd() }, { format: "esm" }).pipe(
    Effect.provide(Rolldown.layer),
  ),
);

const bundle = await Effect.runPromise(
  Build.build({
    stdin: { contents: "export const consumer = 1;", loader: "ts", resolveDir: process.cwd() },
    bundle: true,
    write: false,
    logLevel: "silent",
  }).pipe(Effect.provide(Build.layer), Effect.provide(NodeServices.layer)),
);

let artifact: Artifact.Executable | undefined;
const fakeBun = process.argv[2];
if (fakeBun !== undefined) {
  artifact = await Effect.runPromise(
    BunCompile.compileExecutable({ entrypoint: "main.ts", outfile: "dist/consumer-app", target: explicitTarget }).pipe(
      Effect.provide(BunCompile.layer({ executable: fakeBun })),
      Effect.provide(NodeServices.layer),
    ),
  );
  const error: BuildError.ToolFailed | undefined = undefined;
  void error;
}

console.log(JSON.stringify({
  outputs: bundle.outputFiles.length,
  rolldownChunks: rolled.output.length,
  externalDigestLength: externalMain.digest.value.length,
  externalProducer: externalMain.producer.package,
  target: artifact?.target ?? null,
  digestLength: artifact?.sha256?.length ?? null,
  nativeFormat: artifact === undefined ? null : Target.info(artifact.target).nativeFormat,
}));
`,
  );

  // Windows ships npm as npm.cmd, which node can only spawn through a shell.
  const npmEnvironment = { ...process.env, npm_config_audit: "false", npm_config_fund: "false" };
  const npmOptions = { cwd: consumerRoot, env: npmEnvironment, shell: process.platform === "win32" };
  await execute(
    npm,
    ["install", "--no-audit", "--no-fund", "--strict-peer-deps", "--install-strategy=nested"],
    npmOptions,
  );

  for (const name of packageNames) {
    const installed = JSON.parse(await readFile(join(consumerRoot, "node_modules", name, "package.json"), "utf8"));
    if (installed.name !== name) throw new Error(`consumer resolved ${name} to ${installed.name}`);
  }
  const installedAdapterRoot = join(consumerRoot, "node_modules", "@fixture", "effect-build-author");
  await execute(
    npm,
    ["install", tarballs["effect-build"], "--no-save", "--no-audit", "--no-fund", "--strict-peer-deps"],
    { ...npmOptions, cwd: installedAdapterRoot },
  );
  const nestedCore = join(
    installedAdapterRoot,
    "node_modules",
    "effect-build",
    "package.json",
  );
  const nestedManifest = JSON.parse(await readFile(nestedCore, "utf8"));
  if (nestedManifest.name !== "effect-build") throw new Error("external author nested core graph was not installed");

  await execute(npm, ["exec", "--no", "tsc", "--", "-p", "tsconfig.json"], npmOptions);

  const runArguments = [join(consumerRoot, "dist-consumer", "main.js")];
  if (process.platform !== "win32") {
    const fakeBun = join(consumerRoot, "bun");
    await copyFile(join(root, "test/fixtures/tools/fake-bun.mjs"), fakeBun);
    await chmod(fakeBun, 0o755);
    runArguments.push(fakeBun);
  }
  const { stdout } = await execute("node", runArguments, { cwd: consumerRoot });
  const report = JSON.parse(stdout.trim());
  if (report.outputs !== 1) throw new Error(`consumer esbuild build produced ${report.outputs} outputs`);
  if (report.rolldownChunks !== 1) throw new Error(`consumer rolldown build produced ${report.rolldownChunks} chunks`);
  if (report.externalDigestLength !== 64 || report.externalProducer !== "@fixture/effect-build-author") {
    throw new Error(`external author boundary failed: ${stdout}`);
  }
  if (process.platform !== "win32") {
    if (report.digestLength !== 64) throw new Error(`consumer artifact digest length ${report.digestLength}`);
    if (typeof report.target !== "string" || report.nativeFormat === null) {
      throw new Error(`consumer artifact target/format missing: ${stdout}`);
    }
  }
  console.log("consumer install, typecheck, and runtime checks passed");
} finally {
  await cleanup();
}
