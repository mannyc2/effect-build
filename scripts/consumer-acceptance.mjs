import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { npm, pack, readCandidate } from "./release-packages.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = async (path) => JSON.parse(await readFile(path, "utf8"));
const workspace = await manifest(join(root, "package.json"));
const bunPackage = await manifest(join(root, "packages/effect-build-bun/package.json"));
const esbuildPackage = await manifest(join(root, "packages/effect-build-esbuild/package.json"));
const directory = await mkdtemp(join(tmpdir(), "effect-build-consumer-"));
const packed = process.argv[2] ? resolve(process.argv[2]) : join(directory, "packages");
const installArgs = ["install", "--strict-peer-deps", "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact"];
try {
  if (!process.argv[2]) await pack(packed);
  const candidate = await readCandidate(packed);
  const typescript = process.env.CONSUMER_TYPESCRIPT ?? "5.9.3";
  const nodeTypes = process.env.CONSUMER_NODE_TYPES ?? "24.3.0";
  // Show uses skipLibCheck with rc.113's incomplete upstream declarations.
  // Other required consumers check dependency declarations with the corrected RC.
  const skipLibCheck = process.env.CONSUMER_SKIP_LIB_CHECK === "true";
  // The workspace pins the tested release candidate; `CONSUMER_EFFECT=rc` observes the newest one.
  const effect = process.env.CONSUMER_EFFECT ?? workspace.devDependencies.effect;
  const bunTypes = process.env.CONSUMER_BUN_TYPES ?? bunPackage.devDependencies["bun-types"];
  // esbuild is a peer; the tested version is installed explicitly so the gate does not float with the registry.
  const esbuild = process.env.CONSUMER_ESBUILD ?? esbuildPackage.devDependencies.esbuild;
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({ name: "installed-consumer", private: true, type: "module" }),
  );
  // Strict peers make npm enforce every package's Effect range against the installed version.
  await npm([
    ...installArgs,
    ...candidate.packages.map((item) => join(packed, item.filename)),
    `typescript@${typescript}`,
    `@types/node@${nodeTypes}`,
    `effect@${effect}`,
    `@effect/platform-node@${effect}`,
    `@effect/platform-node-shared@${effect}`,
    `esbuild@${esbuild}`,
  ], { cwd: directory });
  const installed = (name) => manifest(join(directory, "node_modules", name, "package.json"));
  const exports = [];
  for (const item of candidate.packages) {
    const packageRoot = join(directory, "node_modules", item.name);
    const installedManifest = await installed(item.name);
    assert.ok(installedManifest.peerDependencies?.effect, `${item.name} must declare its Effect peer range`);
    for (const name of Object.keys(installedManifest.exports)) {
      exports.push(name === "." ? item.name : `${item.name}${name.slice(1)}`);
    }
    // Published source maps must not point at sources missing from the tarball.
    for (const entry of await readdir(join(packageRoot, "dist"), { recursive: true })) {
      if (!entry.endsWith(".map")) continue;
      const mapPath = join(packageRoot, "dist", entry);
      const map = JSON.parse(await readFile(mapPath, "utf8"));
      for (const [index, source] of map.sources.entries()) {
        if (map.sourcesContent?.[index] != null) continue;
        await assert.doesNotReject(readFile(resolve(mapPath, "..", map.sourceRoot ?? "", source)), `${entry} references missing source ${source}`);
      }
    }
  }
  const importAll = (names) =>
    names.map((name, index) => `import * as module${index} from ${JSON.stringify(name)};\nvoid module${index};`).join(
      "\n",
    );
  const typecheck = async (name, source) => {
    await writeFile(join(directory, `${name}.ts`), source);
    await writeFile(
      join(directory, `tsconfig.${name}.json`),
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          skipLibCheck,
          noEmit: true,
          types: ["node"],
          lib: ["ES2022", "DOM", "DOM.Iterable"],
        },
        files: [`${name}.ts`],
      }),
    );
    execFileSync(process.execPath, [
      join(directory, "node_modules/typescript/bin/tsc"),
      "-p",
      join(directory, `tsconfig.${name}.json`),
    ], { cwd: directory, stdio: "inherit" });
  };
  const bunApi = "effect-build-bun/api";
  // A Node consumer never installs bun-types, so no other export may depend on them.
  await typecheck("consumer-node", `${importAll(exports.filter((name) => name !== bunApi))}
import { Artifact, Directory } from "effect-build";
import * as Archive from "effect-build-archives";
declare const file: Artifact.File;
declare const directory: Artifact.Directory;
Directory.assemble({ entries: [{ artifact: directory }, { artifact: file, path: "assets/input.txt" }], outdir: "runtime" });
Archive.tarGz({ directory, outfile: "runtime.tar.gz" });
`);
  await npm([...installArgs, `bun-types@${bunTypes}`], { cwd: directory });
  await typecheck(
    "consumer-bun",
    `${importAll([bunApi])}
import { Build, Transpiler } from "effect-build-bun/api";
Build.build({ entrypoints: ["input.ts"], minify: true });
Transpiler.make({ loader: "ts" });
`,
  );
  if (process.env.CONSUMER_BUN_PLATFORM === "true") {
    await npm([...installArgs, `@effect/platform-bun@${effect}`], { cwd: directory });
  }
  await writeFile(
    join(directory, "consumer.mjs"),
    String.raw`${importAll(exports)}
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { Effect } from "effect";
import { NodeServices } from "@effect/platform-node";
import { Artifact, Cache, Directory, Layout, Tool } from "effect-build";
import * as Archive from "effect-build-archives";
import { TestCache, TestArtifact } from "effect-build/testing";

const text = "installed consumer\n";
await writeFile("input.txt", text);
const artifact = await Effect.runPromise(
  Artifact.file("input.txt", { name: "consumer", version: "1.0.0" }).pipe(
    Effect.provide(NodeServices.layer),
  ),
);
assert.equal(artifact.bytes, new TextEncoder().encode(text).byteLength);
const [restored] = Artifact.decode(Artifact.encode([artifact]));
assert.equal(restored.sha256, artifact.sha256);
await Effect.runPromise(Effect.gen(function*() {
  const first = yield* Directory.assemble({ entries: [{ artifact, path: "assets/input.txt" }], outdir: "first" });
  const merged = yield* Directory.assemble({ entries: [{ artifact: first }], outdir: "merged" });
  assert.equal(merged.sha256, first.sha256);
  const archive = yield* Archive.tarGz({ directory: merged, outfile: "runtime.tar.gz" });
  yield* Artifact.verify(archive);
}).pipe(Effect.provide(NodeServices.layer)));
assert.match(Layout.validate([
  { path: "Docs/a", kind: "file" },
  { path: "docs/b", kind: "file" },
]).reason, /collision/);
assert.equal(Artifact.ioError("out", "write")(new Error("denied")).reason, "unwritable");
const failed = await Effect.runPromise(Effect.gen(function*() {
  const tool = yield* Tool.resolve({ name: "node", executable: process.execPath });
  return yield* Tool.run(tool, ["-e", "process.stderr.write(process.argv[1]);process.exitCode=7", "consumer-secret"], { redact: ["consumer-secret"] }).pipe(Effect.flip);
}).pipe(Effect.provide(NodeServices.layer)));
assert.equal(failed.stderr, "<redacted>");
assert.equal(failed.exitCode, 7);
await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
  const cache = yield* TestCache.layer;
  const original = yield* TestArtifact.file("packed cache consumer");
  const key = { operation: "Consumer.file", tool: original.producedBy, inputs: [] };
  yield* Effect.gen(function*() {
    yield* Effect.succeed(original).pipe(Cache.cached({ key, outfile: original.path, schema: Artifact.File }));
    const hit = yield* Effect.die("installed cache producer unexpectedly ran").pipe(
      Cache.cached({ key, outfile: "restored.txt", schema: Artifact.File }),
    );
    yield* Artifact.verify(hit);
    assert.equal(hit.sha256, original.sha256);
  }).pipe(Effect.provide(cache));
})).pipe(Effect.provide(NodeServices.layer)));
`,
  );
  execFileSync(process.execPath, [join(directory, "consumer.mjs")], { cwd: directory, stdio: "inherit" });
  const executable = join(directory, process.platform === "win32" ? "cli.exe" : "cli");
  await writeFile(join(directory, "cli.ts"), 'console.log("Hello!");\n');
  const bunOptions = process.env.BUN_EXECUTABLE || process.env.EFFECT_BUILD_BUN
    ? { executable: process.env.BUN_EXECUTABLE ?? process.env.EFFECT_BUILD_BUN }
    : {};
  await writeFile(
    join(directory, "build.mjs"),
    `
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Bun from "effect-build-bun";

NodeRuntime.runMain(
  Bun.compile({ entrypoints: ["cli.ts"], outfile: ${JSON.stringify(executable)} }).pipe(
    Effect.provide(Bun.layer(${JSON.stringify(bunOptions)})),
    Effect.provide(NodeServices.layer),
  ),
);
`,
  );
  execFileSync(process.execPath, [join(directory, "build.mjs")], { cwd: directory, stdio: "inherit" });
  assert.equal(execFileSync(executable, { cwd: directory, encoding: "utf8" }).trim(), "Hello!");
  if (process.env.CONSUMER_BUN_PLATFORM === "true") {
    const runtime = bunOptions.executable ?? "bun";
    await typecheck("consumer-bun-platform", `
import assert from "node:assert/strict";
import { BunServices } from "@effect/platform-bun";
import { ConfigProvider, Effect } from "effect";
import { Artifact, Tool } from "effect-build";
import { dirname } from "node:path";
await Effect.runPromise(Effect.gen(function*() {
  const tool = yield* Tool.resolve({ name: "bun" });
  assert.equal(tool.version, ${JSON.stringify(bunTypes)});
  const completion = yield* Tool.run(tool, ["--version"]);
  assert.equal(new TextDecoder().decode(completion.stdout).trim(), tool.version);
  const artifact = yield* Artifact.file(tool.path, tool);
  assert.equal(artifact.sha256, tool.sha256);
}).pipe(
  Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown({ PATH: dirname(process.execPath) })),
  Effect.provide(BunServices.layer),
));
`);
    execFileSync(runtime, ["--no-env-file", join(directory, "consumer-bun-platform.ts")], { cwd: directory, stdio: "inherit" });
  }
  console.log(
    `Installed consumer passed: ${candidate.packages.length} packages, ${exports.length} exports; Node ${process.version}, TypeScript ${typescript}, Node types ${nodeTypes}, Effect ${
      (await installed("effect")).version
    }, bun-types ${(await installed("bun-types")).version}, esbuild ${(await installed("esbuild")).version}; skipLibCheck=${skipLibCheck}`,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
