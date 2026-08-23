// Packs the five built packages and proves a fresh npm consumer can install,
// typecheck, and run them: a real fake-bun compile plus an in-memory esbuild
// build, with type-level use of every public module.
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
  "effect-build-bun",
  "effect-build-deno",
  "effect-build-esbuild",
  "effect-build-node-sea",
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
import { Effect } from "effect";
import * as BunCompile from "effect-build-bun/CompileExecutable";
import * as DenoCompile from "effect-build-deno/CompileExecutable";
import * as Build from "effect-build-esbuild/Build";
import * as AssembleExecutable from "effect-build-node-sea/AssembleExecutable";
import type * as Artifact from "effect-build/Artifact";
import type * as BuildError from "effect-build/BuildError";
import * as Target from "effect-build/Target";

const marker: DenoCompile.Permissions = { read: true };
const main: AssembleExecutable.Main = { _tag: "Bytes", contents: new Uint8Array(), format: "commonjs" };
const assembler: typeof AssembleExecutable.assembleExecutable = AssembleExecutable.assembleExecutable;
void marker;
void main;
void assembler;

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
    BunCompile.compileExecutable({ entrypoint: "main.ts", outfile: "dist/consumer-app" }).pipe(
      Effect.provide(BunCompile.layer({ executable: fakeBun })),
      Effect.provide(NodeServices.layer),
    ),
  );
  const error: BuildError.ToolFailed | undefined = undefined;
  void error;
}

console.log(JSON.stringify({
  outputs: bundle.outputFiles.length,
  target: artifact?.target ?? null,
  digestLength: artifact?.sha256?.length ?? null,
  nativeFormat: artifact === undefined ? null : Target.info(artifact.target).nativeFormat,
}));
`,
  );

  const npmEnvironment = { ...process.env, npm_config_audit: "false", npm_config_fund: "false" };
  await execute("npm", ["install", "--no-audit", "--no-fund"], { cwd: consumerRoot, env: npmEnvironment });

  for (const name of packageNames) {
    const installed = JSON.parse(await readFile(join(consumerRoot, "node_modules", name, "package.json"), "utf8"));
    if (installed.name !== name) throw new Error(`consumer resolved ${name} to ${installed.name}`);
  }

  await execute("npm", ["exec", "--no", "tsc", "--", "-p", "tsconfig.json"], {
    cwd: consumerRoot,
    env: npmEnvironment,
  });

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
