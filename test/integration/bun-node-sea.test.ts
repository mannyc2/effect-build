import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { execFile } from "node:child_process";
import {
  accessSync,
  constants,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import * as Bun from "../../packages/effect-build-bun/src/index.js";
import * as NodeSea from "../../packages/effect-build-node-sea/src/index.js";
import { inspectNativeExecutable } from "../../packages/effect-build/src/standalone/internal/NativeExecutable.js";

const execFileAsync = promisify(execFile);
const root = mkdtempSync(join(tmpdir(), "effect-build-bun-node-sea-real-"));

afterAll(() => rmSync(root, { recursive: true, force: true }));

const requiredTool = (name: "EFFECT_BUILD_BUN_BIN" | "EFFECT_BUILD_NODE_SEA_BIN"): string => {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`);
  if (!isAbsolute(value)) throw new Error(`${name} must be absolute`);
  accessSync(value, constants.X_OK);
  return realpathSync(value);
};

const run = (executable: string, argv: readonly string[] = []) =>
  execFileAsync(executable, [...argv], {
    env: { ...process.env, LC_ALL: "C" },
    maxBuffer: 8 * 1024 * 1024,
  });

const writeIdioms = (): string => {
  const dependency = join(root, "legacy.cjs");
  const entrypoint = join(root, "entry.mjs");
  writeFileSync(
    dependency,
    'const classicMain = require.main === module; module.exports = { dependency: "commonjs-ok", classicMain };\n',
  );
  writeFileSync(
    entrypoint,
    'import legacy from "./legacy.cjs"; console.log(JSON.stringify({ metaMain: import.meta.main, dependency: legacy.dependency, classicMain: legacy.classicMain }));\n',
  );
  return entrypoint;
};

describe("exact Bun 1.3.9 to Node 26.7 SEA composition", () => {
  it("builds and runs idiom-heavy ESM and CJS executables through the public Effects", async () => {
    const bun = requiredTool("EFFECT_BUILD_BUN_BIN");
    const node = requiredTool("EFFECT_BUILD_NODE_SEA_BIN");
    expect((await run(bun, ["--version"])).stdout.trim()).toBe("1.3.9");
    expect((await run(node, ["--version"])).stdout.trim()).toBe("v26.7.0");
    const entrypoint = writeIdioms();

    for (const format of ["esm", "cjs"] as const) {
      const outfile = join(root, `app-${format}`);
      let bundlePath = "";
      const artifact = await Effect.runPromise(
        Bun.withJavaScriptBundle(
          { entrypoint, format, cwd: root },
          (main) => {
            bundlePath = main.path;
            return NodeSea.createExecutable({ main, outfile, digest: true });
          },
        ).pipe(
          Effect.provide(NodeSea.layer({ executable: node })),
          Effect.provide(Bun.layer({ executable: bun })),
          Effect.provide(NodeServices.layer),
        ),
      );

      expect(artifact).toMatchObject({ path: outfile, provider: "node-sea", target: "linux-x64-gnu" });
      expect(artifact.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(artifact.stages).toEqual([
        { operation: "bundle-javascript", tool: { name: "bun", version: "1.3.9", path: bun } },
        { operation: "assemble-node-sea", tool: { name: "node", version: "26.7.0", path: node } },
      ]);
      expect(existsSync(bundlePath)).toBe(false);
      expect(inspectNativeExecutable(readFileSync(outfile))).toEqual({
        format: "elf",
        os: "linux",
        architecture: "x64",
        abi: "gnu",
      });
      expect(JSON.parse((await run(outfile)).stdout.trim())).toEqual({
        metaMain: true,
        dependency: "commonjs-ok",
        classicMain: false,
      });
    }
  }, 240_000);
});
