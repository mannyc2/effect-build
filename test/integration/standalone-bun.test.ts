import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Bun from "effect-build-bun";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { executeCommand } from "../../packages/effect-build/src/Integration.js";

const fixtures = fileURLToPath(new URL("../fixtures/standalone/", import.meta.url));
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const root = () => {
  const value = mkdtempSync(join(tmpdir(), "effect-build-bun-real-"));
  roots.push(value);
  return value;
};

const compilerLayer = () =>
  Bun.layer(process.env.EFFECT_BUILD_BUN_BIN === undefined ? {} : { executable: process.env.EFFECT_BUILD_BUN_BIN });

const build = (input: Bun.CompileExecutableInput) =>
  Effect.runPromise(
    Bun.compileExecutable(input).pipe(
      Effect.provide(compilerLayer()),
      Effect.provide(NodeServices.layer),
    ),
  );

const execute = (path: string) => Effect.runPromise(executeCommand(path, []).pipe(Effect.provide(NodeServices.layer)));

describe("real standalone Bun", () => {
  it("compiles, validates, publishes, hashes, and executes the returned artifact", async () => {
    const artifact = await build({
      entrypoint: join(fixtures, "hello.ts"),
      outfile: join(root(), "app"),
      digest: true,
    });
    const bytes = readFileSync(artifact.path);
    expect(artifact.bytes).toBe(bytes.byteLength);
    expect(artifact.digest).toBe(`sha256:${createHash("sha256").update(bytes).digest("hex")}`);
    expect(artifact.provider).toBe("bun");
    expect(artifact.stages[0].tool).toMatchObject({ name: "bun", version: "1.3.9" });
    if (process.env.EFFECT_BUILD_EXPECTED_TARGET !== undefined) {
      expect(artifact.target).toBe(process.env.EFFECT_BUILD_EXPECTED_TARGET);
    }
    expect(artifact.stages[0].tool.path.startsWith("/")).toBe(true);
    const completion = await execute(artifact.path);
    expect(completion).toMatchObject({ exitCode: 0, stdout: { text: "effect-build-ok\n" } });
  }, 60_000);

  it("inherits tsconfig resolution and reports missing imports as ToolFailed", async () => {
    const project = join(fixtures, "bun-config");
    const artifact = await build({ entrypoint: "entry.ts", outfile: join(root(), "app"), cwd: project });
    expect((await execute(artifact.path)).stdout.text).toBe("bun-config-ok\n");
    await expect(build({
      entrypoint: join(fixtures, "missing-import.ts"),
      outfile: join(root(), "bad"),
    })).rejects.toMatchObject({ _tag: "ToolFailed", tool: "bun" });
  }, 60_000);

  it("preserves Bun's observed opt-in minify behavior", async () => {
    const output = root();
    const plain = await build({ entrypoint: join(fixtures, "minify-probe.ts"), outfile: join(output, "plain") });
    const minified = await build({
      entrypoint: join(fixtures, "minify-probe.ts"),
      outfile: join(output, "minified"),
      options: { minify: true },
    });
    const marker = "EFFECT_BUILD_DEFAULT_MINIFY_PROBE_IDENTIFIER";
    expect(readFileSync(plain.path).includes(Buffer.from(marker))).toBe(true);
    expect(readFileSync(minified.path).includes(Buffer.from(marker))).toBe(false);
    expect(dirname(plain.path)).toBe(output);
  }, 120_000);
});
