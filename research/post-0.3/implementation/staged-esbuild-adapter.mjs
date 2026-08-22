import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, "../../..");
const providerSource = join(repository, "packages", "effect-build-esbuild", "src");
const scratch = await mkdtemp(join(tmpdir(), "effect-build-plan040-esbuild-"));

const stagedFiles = [
  "Build.ts",
  "Context.ts",
  "internal/v04/compatibility.ts",
  "internal/v04/installed.ts",
];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const run = (executable, argv, options = {}) =>
  execFileAsync(executable, argv, {
    cwd: options.cwd ?? repository,
    env: { ...process.env, LC_ALL: "C", ...options.env },
    maxBuffer: 16 * 1024 * 1024,
    timeout: options.timeout ?? 240_000,
  });

const writeJson = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);

const consumerProgram = `import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit } from "effect";
import * as Build from "effect-build-esbuild/Build";
import * as EsbuildContext from "effect-build-esbuild/Context";

const failureTag = (exit) => {
  if (!Exit.isFailure(exit)) return undefined;
  const failure = Cause.findErrorOption(exit.cause);
  return failure._tag === "Some" ? failure.value._tag : undefined;
};

const memoryInput = {
  stdin: { contents: 'export const staged = "esbuild";', loader: "ts", resolveDir: "/" },
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "silent",
  write: false,
};

const defaultRefusal = await Effect.runPromiseExit(
  Build.build(memoryInput).pipe(
    Effect.provide(Build.layer()),
    Effect.provide(NodeServices.layer),
  ),
);
if (failureTag(defaultRefusal) !== "SupportUnknown") {
  throw new Error("staged Build.build did not fail SupportUnknown by default");
}

const overridden = await Effect.runPromise(
  Build.build(memoryInput).pipe(
    Effect.provide(Build.layer({ allowUntestedVersion: true })),
    Effect.provide(NodeServices.layer),
  ),
);
if (overridden.outputFiles.length !== 1 || overridden.errors.length !== 0) {
  throw new Error("staged Build.build did not return the native in-memory result");
}

let leaked;
const scopedRebuilds = await Effect.runPromise(
  Effect.scoped(Effect.gen(function*() {
    const context = yield* EsbuildContext.make(memoryInput);
    leaked = context;
    const first = yield* context.rebuild;
    const second = yield* context.rebuild;
    return [first.outputFiles.length, second.outputFiles.length];
  })).pipe(
    Effect.provide(EsbuildContext.layer({ allowUntestedVersion: true })),
    Effect.provide(NodeServices.layer),
  ),
);
if (scopedRebuilds[0] !== 1 || scopedRebuilds[1] !== 1) {
  throw new Error("staged Context rebuild did not produce in-memory output");
}
if ("dispose" in leaked) throw new Error("staged Context leaked a public dispose member");

const postScope = await Effect.runPromiseExit(leaked.rebuild);
if (failureTag(postScope) !== "ProviderBuildFailure") {
  throw new Error("staged Context accepted rebuild after Scope-owned dispose");
}

console.log(JSON.stringify({
  defaultRefusal: "SupportUnknown",
  overriddenOutputFiles: overridden.outputFiles.length,
  scopedRebuilds,
  postScope: "ProviderBuildFailure",
}));
`;

try {
  const packageDirectory = join(scratch, "package");
  const distDirectory = join(packageDirectory, "dist");
  await mkdir(distDirectory, { recursive: true });
  const tsc = join(repository, "node_modules", "typescript", "bin", "tsc");
  await run(process.execPath, [
    tsc,
    "--ignoreConfig",
    "--declaration",
    "--skipLibCheck",
    "--strict",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--target",
    "ESNext",
    "--lib",
    "ESNext,DOM",
    "--rootDir",
    providerSource,
    "--outDir",
    distDirectory,
    ...stagedFiles.map((file) => join(providerSource, file)),
  ]);

  const coreManifest = JSON.parse(
    await readFile(join(repository, "packages", "effect-build", "package.json"), "utf8"),
  );
  await writeJson(join(packageDirectory, "package.json"), {
    name: "effect-build-esbuild",
    version: coreManifest.version,
    type: "module",
    exports: {
      "./Build": { types: "./dist/Build.d.ts", import: "./dist/Build.js" },
      "./Context": { types: "./dist/Context.d.ts", import: "./dist/Context.js" },
    },
  });
  await symlink(join(repository, "node_modules"), join(packageDirectory, "node_modules"), "dir");

  const consumerDirectory = join(scratch, "consumer");
  const consumerModules = join(consumerDirectory, "node_modules");
  await mkdir(consumerModules, { recursive: true });
  await symlink(packageDirectory, join(consumerModules, "effect-build-esbuild"), "dir");
  await symlink(join(repository, "node_modules", "effect"), join(consumerModules, "effect"), "dir");
  await symlink(join(repository, "node_modules", "@effect"), join(consumerModules, "@effect"), "dir");
  await writeFile(join(consumerDirectory, "main.mjs"), consumerProgram);

  const result = await run(process.execPath, [join(consumerDirectory, "main.mjs")], { cwd: consumerDirectory });
  const lines = result.stdout.split(/\r?\n/).filter((line) => line.length > 0);
  const conclusion = JSON.parse(lines.at(-1));
  assert(conclusion.defaultRefusal === "SupportUnknown", "consumer default admission drifted");
  assert(conclusion.overriddenOutputFiles === 1, "consumer override result drifted");
  assert(conclusion.postScope === "ProviderBuildFailure", "consumer post-scope law drifted");
  process.stdout.write(`EFFECT_BUILD_PLAN040_ESBUILD_ADAPTER=${JSON.stringify(conclusion)}\n`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
