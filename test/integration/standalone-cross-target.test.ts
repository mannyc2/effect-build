import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import * as Bun from "../../src/Bun.js";
import * as Deno from "../../src/Deno.js";
import { inspectNativeExecutable } from "../../src/standalone/internal/NativeExecutable.js";
import type { Target } from "../../src/standalone/Target.js";

const root = mkdtempSync(join(tmpdir(), "effect-build-cross-target-"));
const entrypoint = fileURLToPath(new URL("../fixtures/standalone/hello.ts", import.meta.url));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const expected = (target: Target) => ({
  os: target.startsWith("macos-") ? "macos" : "windows",
  architecture: target.endsWith("aarch64") ? "aarch64" : "x64",
});

const bunLayer = () =>
  Bun.layer(
    process.env.EFFECT_BUILD_BUN_BIN === undefined ? {} : { executable: process.env.EFFECT_BUILD_BUN_BIN },
  );
const denoLayer = () =>
  Deno.layer(
    process.env.EFFECT_BUILD_DENO_BIN === undefined ? {} : { executable: process.env.EFFECT_BUILD_DENO_BIN },
  );

const cells = [
  { tool: "bun", target: "macos-aarch64", outfile: "bun-macos" },
  { tool: "bun", target: "windows-x64", outfile: "bun-windows" },
  { tool: "deno", target: "macos-aarch64", outfile: "deno-macos" },
  { tool: "deno", target: "windows-x64", outfile: "deno-windows" },
] as const;

describe("optional non-advertised cross-target cells", () => {
  for (const cell of cells) {
    it(`${cell.tool} -> ${cell.target}`, async () => {
      const input = { entrypoint, outfile: join(root, cell.outfile), target: cell.target };
      const effect = cell.tool === "bun"
        ? Bun.compileExecutable(input).pipe(Effect.provide(bunLayer()))
        : Deno.compileExecutable(input).pipe(Effect.provide(denoLayer()));
      const artifact = await Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));
      expect(artifact.path).toBe(input.outfile);
      expect(artifact.target).toBe(cell.target);
      expect(inspectNativeExecutable(readFileSync(artifact.path))).toMatchObject(expected(cell.target));
    }, 180_000);
  }
});
