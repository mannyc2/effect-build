// Packs the six admitted release packages and proves a fresh npm consumer can
// install, typecheck, and run the exact hard-cut public surface. Deferred
// profiles and the private Rolldown package candidate are intentionally absent.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { assertLockstepPackageManifest } from "./lockstep-package.mjs";
import {
  canonicalBytes,
  decodeDistributionDescriptor,
  sha256,
} from "./node-finalizer/common.mjs";
import { publicNodeSeaSuccessOutput } from "./release/candidate.mjs";

const execute = promisify(execFile);
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workspaceManifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const researchContract = JSON.parse(await readFile(join(root, "tooling/research-complete-contract.json"), "utf8"));
const packageNames = researchContract.releaseControl.orderedPackages;
const effectVersion = workspaceManifest.devDependencies.effect;
const platformNodeVersion = workspaceManifest.devDependencies["@effect/platform-node"];
const typescriptVersion = workspaceManifest.devDependencies.typescript;
const consumerRoot = await mkdtemp(join(tmpdir(), "effect-build-consumer-"));
const option = (name) => {
  const indexes = process.argv.flatMap((value, index) => value === name ? [index] : []);
  if (indexes.length > 1) throw new Error(`${name} may be supplied only once`);
  if (indexes.length === 0) return undefined;
  const value = process.argv[indexes[0] + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
};
const suppliedTarballDirectory = option("--tarball-directory");
const nodeSeaDescriptorPath = option("--node-sea-descriptor");
const nodeSeaReceiptPath = option("--node-sea-receipt");
if ((nodeSeaDescriptorPath === undefined) !== (nodeSeaReceiptPath === undefined)) {
  throw new Error("--node-sea-descriptor and --node-sea-receipt must be supplied together");
}
const nodeSeaDescriptor = nodeSeaDescriptorPath === undefined
  ? undefined
  : decodeDistributionDescriptor(await readFile(resolve(nodeSeaDescriptorPath)));
if (nodeSeaDescriptor !== undefined) {
  if (nodeSeaDescriptor.target !== "linux-x64-gnu") {
    throw new Error("the packed public Node SEA gate requires linux-x64-gnu");
  }
  const executable = await readFile(nodeSeaDescriptor.executable);
  if (
    String(executable.length) !== nodeSeaDescriptor.executableBytes
    || sha256(executable) !== nodeSeaDescriptor.executableSha256
  ) throw new Error("authenticated Node descriptor no longer matches its executable bytes");
}
const nodeSeaMain = `process.stdout.write(${JSON.stringify(publicNodeSeaSuccessOutput)});`;

const packedManifest = async (tarball) => {
  const archive = gunzipSync(await readFile(tarball));
  const record = 512;
  for (let offset = 0; offset < archive.byteLength; offset += record) {
    const name = archive.subarray(offset, offset + 100).toString("utf8").split("\0", 1)[0];
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
  const tarballSha256 = {};
  const packDirectory = join(consumerRoot, "tarballs");
  await mkdir(packDirectory, { recursive: true });
  for (const name of packageNames) {
    let tarball;
    if (suppliedTarballDirectory === undefined) {
      const { stdout } = await execute("bun", ["pm", "pack", "--destination", packDirectory], {
        cwd: join(root, "packages", name),
      });
      const line = stdout.split("\n").find((candidate) => candidate.trim().endsWith(".tgz"));
      if (line === undefined) throw new Error(`bun pm pack produced no tarball for ${name}:\n${stdout}`);
      tarball = join(packDirectory, line.trim().split(/[\\/]/u).at(-1));
    } else {
      tarball = resolve(suppliedTarballDirectory, `${name}-0.5.0.tgz`);
    }
    const manifest = await packedManifest(tarball);
    if (manifest.private === true) throw new Error(`${name} packed as a private package`);
    assertLockstepPackageManifest({
      manifest,
      name,
      version: "0.5.0",
      firstPartyPackages: packageNames,
      prerequisites: researchContract.releaseControl.orderedPackagePrerequisites[name],
    });
    tarballs[name] = tarball;
    tarballSha256[name] = sha256(await readFile(tarball));
  }

  await writeFile(
    join(consumerRoot, "package.json"),
    JSON.stringify({
      name: "effect-build-consumer",
      private: true,
      type: "module",
      dependencies: {
        "@effect/platform-node": platformNodeVersion,
        effect: effectVersion,
        ...Object.fromEntries(packageNames.map((name) => [name, tarballs[name]])),
      },
      devDependencies: { typescript: typescriptVersion },
      overrides: { "@effect/platform-node-shared": platformNodeVersion },
    }, null, 2),
  );
  await writeFile(
    join(consumerRoot, "tsconfig.json"),
    JSON.stringify({
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
    }, null, 2),
  );
  await writeFile(
    join(consumerRoot, "main.ts"),
    `import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { join } from "node:path";
import * as Core from "effect-build";
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
import * as Bun from "effect-build-bun";
import * as BunApi from "effect-build-bun/Api";
import * as BunCommand from "effect-build-bun/Command";
import * as Deno from "effect-build-deno";
import * as DenoCommand from "effect-build-deno/Command";
import * as Esbuild from "effect-build-esbuild";
import * as EsbuildApi from "effect-build-esbuild/Api";
import * as EsbuildCommand from "effect-build-esbuild/Command";
import * as NodeSea from "effect-build-node-sea";
import * as NodeSeaCommand from "effect-build-node-sea/Command";
import type * as Artifact from "effect-build/Artifact";
import * as BorrowedOutput from "effect-build/Author/BorrowedOutput";
import * as Executable from "effect-build/Author/Executable";
import * as Tool from "effect-build/Author/Tool";
import * as Matrix from "effect-build/Matrix";
import * as SystemTarget from "effect-build/SystemTarget";

const denoPermissions: DenoCommand.CompileExecutable.Permissions = { allowRead: true };
const nodeMainInput: NodeSeaCommand.AssembleExecutable.Main = {
  _tag: "Bytes",
  contents: new Uint8Array(),
  format: "commonjs",
};
const explicitTarget: BunCommand.CompileExecutable.Target = process.platform === "darwin"
  ? (process.arch === "arm64" ? "bun-darwin-arm64" : "bun-darwin-x64")
  : process.platform === "win32"
  ? (process.arch === "arm64" ? "bun-windows-arm64" : "bun-windows-x64")
  : process.arch === "arm64" ? "bun-linux-arm64" : "bun-linux-x64";
const providerNamespaces = [
  BunApi.Transpiler,
  BunApi.Build,
  BunApi.CompileExecutable,
  BunCommand.Build,
  BunCommand.Watch,
  BunCommand.CompileExecutable,
  DenoCommand.Transpile,
  DenoCommand.CompileExecutable,
  EsbuildApi.Build,
  EsbuildApi.BuildToDirectory,
  EsbuildApi.Transform,
  EsbuildApi.AnalyzeMetafile,
  EsbuildApi.FormatMessages,
  EsbuildApi.Context,
  EsbuildApi.ContextToDirectory,
  EsbuildCommand.Build,
  EsbuildCommand.BuildToDirectory,
  EsbuildCommand.Watch,
  NodeSeaCommand.AssembleExecutable,
] as const;
const packageRoots = [Core, Apple, Bun, Deno, Esbuild, NodeSea] as const;
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
void denoPermissions;
void nodeMainInput;
void providerNamespaces;
void packageRoots;
void appleNamespaces;
void appleOperations;
void Tool.select;
void BorrowedOutput.withFile;
void Executable.publish;
void Matrix.run;

const bundle = await Effect.runPromise(
  EsbuildApi.Build.build({
    stdin: { contents: "export const consumer = 1;", loader: "ts", resolveDir: process.cwd() },
    bundle: true,
    write: false,
    logLevel: "silent",
  }),
);

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
let artifact: Artifact.Executable | undefined;
const fakeBun = argument("--fake-bun");
if (fakeBun !== undefined) {
  artifact = await Effect.runPromise(
    BunCommand.CompileExecutable.compileExecutable({
      entrypoints: ["main.ts"],
      outfile: join(process.cwd(), "dist", "consumer-app"),
      target: explicitTarget,
      observation: "hashed",
    }).pipe(
      Effect.provide(BunCommand.layer({ executable: fakeBun as Artifact.AbsolutePath })),
      Effect.provide(NodeServices.layer),
    ),
  );
}

let nodeSeaArtifact: Artifact.HashedExecutable | undefined;
const nodeSeaExecutable = argument("--node-sea-executable");
if (nodeSeaExecutable !== undefined) {
  nodeSeaArtifact = await Effect.runPromise(
    NodeSeaCommand.AssembleExecutable.assembleDirect({
      main: {
        _tag: "Bytes",
        contents: new TextEncoder().encode(${JSON.stringify(nodeSeaMain)}),
        format: "commonjs",
      },
      outfile: join(process.cwd(), "dist", "node-sea-candidate"),
      observation: "hashed",
      disableExperimentalSEAWarning: true,
    }).pipe(
      Effect.provide(NodeSeaCommand.layer({
        builderExecutable: nodeSeaExecutable as Artifact.AbsolutePath,
        baseExecutable: nodeSeaExecutable as Artifact.AbsolutePath,
      })),
      Effect.provide(NodeServices.layer),
    ),
  );
}

console.log(JSON.stringify({
  outputs: bundle.outputFiles.length,
  target: artifact?.target ?? null,
  digestLength: artifact !== undefined && "digest" in artifact ? artifact.digest.value.length : null,
  nativeFormat: artifact === undefined ? null : SystemTarget.describe(artifact.target).nativeFormat,
  nodeSea: nodeSeaArtifact === undefined ? null : {
    path: nodeSeaArtifact.path,
    bytes: nodeSeaArtifact.bytes,
    sha256: nodeSeaArtifact.digest.value,
    target: nodeSeaArtifact.target,
    nativeFormat: nodeSeaArtifact.nativeFormat,
    runtimeVersion: nodeSeaArtifact.runtime.version,
  },
}));
`,
  );

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
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
  if (await readFile(join(root, "packages/effect-build-rolldown/package.json"), "utf8").then((source) =>
    JSON.parse(source).private !== true
  )) throw new Error("Rolldown conditional package candidate is not private");

  await execute(npm, ["exec", "--no", "tsc", "--", "-p", "tsconfig.json"], npmOptions);
  const runArguments = [join(consumerRoot, "dist-consumer", "main.js")];
  if (process.platform !== "win32") {
    const fakeBun = join(consumerRoot, "bun");
    await copyFile(join(root, "test/fixtures/tools/fake-bun.mjs"), fakeBun);
    await chmod(fakeBun, 0o755);
    runArguments.push("--fake-bun", fakeBun);
  }
  if (nodeSeaDescriptor !== undefined) {
    runArguments.push("--node-sea-executable", nodeSeaDescriptor.executable);
  }
  const { stdout } = await execute("node", runArguments, { cwd: consumerRoot });
  const report = JSON.parse(stdout.trim());
  if (report.outputs !== 1) throw new Error(`consumer esbuild build produced ${report.outputs} outputs`);
  if (process.platform !== "win32") {
    if (report.digestLength !== 64) throw new Error(`consumer artifact digest length ${report.digestLength}`);
    if (typeof report.target !== "string" || report.nativeFormat === null) {
      throw new Error(`consumer artifact target/format missing: ${stdout}`);
    }
  }
  if (nodeSeaDescriptor !== undefined && nodeSeaReceiptPath !== undefined) {
    if (
      report.nodeSea?.target !== "linux-x64-gnu"
      || report.nodeSea.nativeFormat !== "elf"
      || report.nodeSea.runtimeVersion !== "26.7.0"
    ) throw new Error(`packed public Node SEA report mismatch: ${JSON.stringify(report.nodeSea)}`);
    const assembled = await readFile(report.nodeSea.path);
    if (
      String(assembled.length) !== report.nodeSea.bytes
      || sha256(assembled) !== report.nodeSea.sha256
    ) throw new Error("packed public Node SEA artifact report does not match assembled bytes");
    const completion = await execute(report.nodeSea.path, [], { cwd: consumerRoot });
    if (completion.stdout !== publicNodeSeaSuccessOutput || completion.stderr !== "") {
      throw new Error(`packed public Node SEA execution output mismatch: ${JSON.stringify(completion)}`);
    }
    const receipt = {
      protocol: "effect-build/release-candidate-public-node-sea@1",
      packageName: "effect-build-node-sea",
      packageSha256: tarballSha256["effect-build-node-sea"],
      corePackageSha256: tarballSha256["effect-build"],
      nodeVersion: nodeSeaDescriptor.nodeVersion,
      target: nodeSeaDescriptor.target,
      nodeArchiveName: nodeSeaDescriptor.archiveName,
      nodeArchiveSha256: nodeSeaDescriptor.archiveSha256,
      nodeExecutableBytes: nodeSeaDescriptor.executableBytes,
      nodeExecutableSha256: nodeSeaDescriptor.executableSha256,
      assembledExecutableBytes: String(assembled.length),
      assembledExecutableSha256: sha256(assembled),
      executionExitCode: "0",
      executionStdoutSha256: createHash("sha256").update(completion.stdout).digest("hex"),
    };
    const receiptDestination = resolve(nodeSeaReceiptPath);
    await mkdir(dirname(receiptDestination), { recursive: true });
    await writeFile(receiptDestination, canonicalBytes(receipt), { flag: "wx" });
  } else if (report.nodeSea !== null) {
    throw new Error("unexpected public Node SEA execution without an authenticated descriptor");
  }
  console.log("six-package consumer install, typecheck, and runtime checks passed");
} finally {
  await rm(consumerRoot, { recursive: true, force: true });
}
