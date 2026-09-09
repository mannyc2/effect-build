import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { npm, pack, readCandidate } from "./release-packages.mjs";

const directory = await mkdtemp(join(tmpdir(), "effect-build-consumer-"));
const packed = process.argv[2] ? resolve(process.argv[2]) : join(directory, "packages");
try {
  if (!process.argv[2]) await pack(packed);
  const candidate = await readCandidate(packed);
  const typescript = process.env.CONSUMER_TYPESCRIPT ?? "5.9.3";
  const nodeTypes = process.env.CONSUMER_NODE_TYPES ?? "24.3.0";
  const effect = process.env.CONSUMER_EFFECT ?? "4.0.0-rc.108";
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({ name: "installed-consumer", private: true, type: "module" }),
  );
  await npm([
    "install",
    "--strict-peer-deps",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--save-exact",
    ...candidate.packages.map((item) => join(packed, item.filename)),
    `typescript@${typescript}`,
    `@types/node@${nodeTypes}`,
    `effect@${effect}`,
    `@effect/platform-node@${effect}`,
    `@effect/platform-node-shared@${effect}`,
  ], { cwd: directory });
  const exports = [];
  for (const item of candidate.packages) {
    const packageRoot = join(directory, "node_modules", item.name);
    const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
    assert.equal(
      manifest.peerDependencies.effect,
      effect,
      `${item.name} Effect support changed; update the consumer matrix`,
    );
    for (const name of Object.keys(manifest.exports)) {
      exports.push(name === "." ? item.name : `${item.name}${name.slice(1)}`);
    }
    for (const entry of await readdir(join(packageRoot, "dist"), { recursive: true })) {
      if (!entry.endsWith(".map")) continue;
      const mapPath = join(packageRoot, "dist", entry);
      const map = JSON.parse(await readFile(mapPath, "utf8"));
      for (const [index, source] of map.sources.entries()) {
        if (map.sourcesContent?.[index] != null) continue;
        await readFile(resolve(mapPath, "..", map.sourceRoot ?? "", source));
      }
    }
  }
  const imports = exports.map((name, index) =>
    `import * as module${index} from ${JSON.stringify(name)};\nvoid module${index};`
  ).join("\n");
  await writeFile(
    join(directory, "consumer.ts"),
    `${imports}\nimport { Build, Transpiler } from "effect-build-bun/api";\nBuild.build({ entrypoints: ["input.ts"], minify: true });\nTranspiler.make({ loader: "ts" });\n`,
  );
  await writeFile(
    join(directory, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        skipLibCheck: false,
        noEmit: true,
        types: ["node"],
        lib: ["ES2022", "DOM", "DOM.Iterable"],
      },
      files: ["consumer.ts"],
    }),
  );
  execFileSync(process.execPath, [
    join(directory, "node_modules/typescript/bin/tsc"),
    "-p",
    join(directory, "tsconfig.json"),
  ], { cwd: directory, stdio: "inherit" });
  await writeFile(
    join(directory, "consumer.mjs"),
    `${imports}\nimport assert from "node:assert/strict";\nimport { writeFile } from "node:fs/promises";\nimport { Effect } from "effect";\nimport { NodeServices } from "@effect/platform-node";\nimport { Artifact } from "effect-build";\nawait writeFile("input.txt", "installed consumer\\n");\nconst artifact = await Effect.runPromise(Artifact.file("input.txt", { name: "consumer", version: "1.0.0" }).pipe(Effect.provide(NodeServices.layer)));\nassert.equal(artifact.bytes, 19);\nconst [restored] = Artifact.decode(Artifact.encode([artifact]));\nassert.equal(restored.sha256, artifact.sha256);\n`,
  );
  execFileSync(process.execPath, [join(directory, "consumer.mjs")], { cwd: directory, stdio: "inherit" });
  const executable = join(directory, process.platform === "win32" ? "cli.exe" : "cli");
  await writeFile(join(directory, "cli.ts"), 'console.log("Hello!");\n');
  await writeFile(
    join(directory, "build.mjs"),
    `import { NodeRuntime, NodeServices } from "@effect/platform-node";\nimport { Effect } from "effect";\nimport * as Bun from "effect-build-bun";\nNodeRuntime.runMain(Bun.compile({ entrypoints: ["cli.ts"], outfile: ${
      JSON.stringify(executable)
    } }).pipe(Effect.provide(Bun.layer(${
      JSON.stringify(
        process.env.BUN_EXECUTABLE || process.env.EFFECT_BUILD_BUN
          ? { executable: process.env.BUN_EXECUTABLE ?? process.env.EFFECT_BUILD_BUN }
          : {},
      )
    })), Effect.provide(NodeServices.layer)));\n`,
  );
  execFileSync(process.execPath, [join(directory, "build.mjs")], { cwd: directory, stdio: "inherit" });
  assert.equal(execFileSync(executable, { cwd: directory, encoding: "utf8" }).trim(), "Hello!");
  console.log(
    `Installed consumer passed: ${candidate.packages.length} packages, ${exports.length} exports; Node ${process.version}, TypeScript ${typescript}, Node types ${nodeTypes}, Effect ${effect}`,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
