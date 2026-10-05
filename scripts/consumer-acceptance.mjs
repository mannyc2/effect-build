import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { npm, pack, readCandidate } from "./release-packages.mjs";

const temporary = await mkdtemp(join(tmpdir(), "effect-build-consumer-"));
const supplied = process.argv.slice(2);
if (supplied[0] === "--candidate") supplied.shift();
if (supplied.length > 1) throw new Error("usage: node scripts/consumer-acceptance.mjs [candidate-directory]");
const packed = supplied[0] === undefined ? join(temporary, "packed") : resolve(supplied[0]);
const candidate = supplied[0] === undefined ? await pack(packed) : await readCandidate(packed);
const directory = join(temporary, "installed");
const effect = process.env.CONSUMER_EFFECT ?? "4.0.0";
const typescript = process.env.CONSUMER_TYPESCRIPT ?? "5.9.3";
const nodeTypes = process.env.CONSUMER_NODE_TYPES ?? "24.3.0";
const bunPlatform = process.env.CONSUMER_BUN_PLATFORM === "true";
const skipLibCheck = process.env.CONSUMER_SKIP_LIB_CHECK === "true";
const imports = (names) =>
  names.map((name, index) => `import * as entry${index} from ${JSON.stringify(name)};\nvoid entry${index};`).join("\n");

try {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(directory);
  await writeFile(join(directory, "package.json"), JSON.stringify({ private: true, type: "module" }));
  const extras = bunPlatform
    ? [`@effect/platform-bun@${effect}`, `bun-types@${process.env.CONSUMER_BUN_TYPES ?? "1.4.2"}`]
    : [];
  await npm([
    "install",
    "--strict-peer-deps",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    ...candidate.packages.map((item) => join(packed, item.filename)),
    `typescript@${typescript}`,
    `@types/node@${nodeTypes}`,
    `effect@${effect}`,
    `@effect/platform-node@${effect}`,
    `@effect/platform-node-shared@${effect}`,
    ...extras,
  ], { cwd: directory });
  const exports = [];
  for (const item of candidate.packages) {
    const packageRoot = join(directory, "node_modules", item.name);
    const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
    assert.ok(manifest.peerDependencies?.effect, `${item.name} needs an Effect peer`);
    for (const name of Object.keys(manifest.exports)) {
      exports.push(name === "." ? item.name : `${item.name}${name.slice(1)}`);
    }
    for (const entry of await readdir(join(packageRoot, "dist"), { recursive: true })) {
      if (!entry.endsWith(".map")) continue;
      const map = JSON.parse(await readFile(join(packageRoot, "dist", entry), "utf8"));
      for (const [index, source] of map.sources.entries()) {
        if (map.sourcesContent?.[index] !== undefined) continue;
        await assert.doesNotReject(readFile(resolve(packageRoot, "dist", entry, "..", map.sourceRoot ?? "", source)));
      }
    }
  }
  const source = `${imports(exports)}
import { Effect, Scope, Sink } from "effect";
import { ChildProcess } from "effect/process";
import { Tool } from "effect-build";
import { Bun } from "effect-build-bun";
import { Deno } from "effect-build-deno";
import { NodeSea } from "effect-build-node-sea";
declare const bun: Bun["Service"];
declare const deno: Deno["Service"];
declare const sea: NodeSea["Service"];
declare const tool: Tool.Tool;
const withoutServices = <A, E>(effect: Effect.Effect<A, E>) => effect;
withoutServices(bun.build({ entrypoints: ["main.ts"], outdir: "out", target: "bun" }));
withoutServices(bun.compile({ entrypoints: ["main.ts"], outfile: "app", target: "bun-linux-x64", atomic: true }));
withoutServices(sea.assemble({ main: "main.cjs", outfile: "app", atomic: true }));
withoutServices(tool.run(ChildProcess.make(tool.executable, ["--version"]), Sink.drain));
const session: Effect.Effect<unknown, Tool.ToolError, Scope.Scope> = tool.session(ChildProcess.make(tool.executable));
withoutServices(Effect.scoped(session));
void deno;
`;
  await writeFile(join(directory, "consumer.ts"), source);
  await writeFile(
    join(directory, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        exactOptionalPropertyTypes: true,
        noUncheckedIndexedAccess: true,
        skipLibCheck,
        noEmit: true,
        types: ["node"],
        lib: ["ES2022", "DOM", "DOM.Iterable"],
      },
      files: ["consumer.ts"],
    }),
  );
  execFileSync(process.execPath, [join(directory, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], {
    cwd: directory,
    stdio: "inherit",
  });
  await writeFile(
    join(directory, "consumer.mjs"),
    `${imports(exports)}
import assert from "node:assert/strict";
import { Effect, FileSystem, Redacted, Schema } from "effect";
import { ChildProcess } from "effect/process";
${
      bunPlatform
        ? 'import { BunServices as Services } from "@effect/platform-bun";'
        : 'import { NodeServices as Services } from "@effect/platform-node";'
    }
import { resolve } from "node:path";
import { Atomic, Digest, Environment, Tool } from "effect-build";
const program = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  const node = yield* Tool.make("node", { executable: process.execPath });
  const version = yield* node.run(ChildProcess.make(node.executable, ["--version"], { stdin: "ignore" }), node.text({ maxBytes: 4096 }));
  assert.match(version.trim(), /^v?\\d+\\.\\d+\\.\\d+/);
  const failure = yield* node.run(ChildProcess.make(node.executable, ["-e", "process.stderr.write(process.argv[1]);process.exitCode=7", "consumer-secret"], { stdin: "ignore" }), node.text({ maxBytes: 4096 }), { redact: [Redacted.make("consumer-secret")] }).pipe(Effect.flip);
  assert.equal(failure.reason._tag, "Exit");
  assert.equal(failure.reason.stderr, "<redacted>");
  const file = yield* Atomic.file("published.txt", (staged) => fs.writeFileString(staged, "installed consumer\\n"));
  assert.equal(file, resolve("published.txt"));
  const hash = yield* Digest.sha256(file);
  assert.match(hash, /^[a-f0-9]{64}$/);
  const safe = ChildProcess.make(node.executable, [], { env: { SECRET: "remove" } }).pipe(Environment.scrub({ ONLY: "kept" }));
  assert.equal(safe.options.extendEnv, false);
  assert.deepEqual(safe.options.env, { ONLY: "kept" });
  const decoded = yield* node.decode(Schema.Int)(12);
  assert.equal(decoded, 12);
});
await Effect.runPromise(program.pipe(Effect.provide(Services.layer)));
`,
  );
  const runner = bunPlatform ? process.env.EFFECT_BUILD_BUN ?? "bun" : process.execPath;
  execFileSync(runner, ["consumer.mjs"], { cwd: directory, stdio: "inherit" });
  console.log(
    `Installed consumer passed: ${candidate.packages.length} packages / ${exports.length} entrypoints, TypeScript ${typescript}, Effect ${effect}, skipLibCheck=${skipLibCheck}`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
