import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Deno from "effect-build-deno";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runProcess } from "../../packages/effect-build/src/standalone/internal/Process.js";

const fixtures = fileURLToPath(new URL("../fixtures/standalone/", import.meta.url));
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const root = () => {
  const value = mkdtempSync(join(tmpdir(), "effect-build-deno-real-"));
  roots.push(value);
  return value;
};

const compilerLayer = () =>
  Deno.layer(process.env.EFFECT_BUILD_DENO_BIN === undefined ? {} : { executable: process.env.EFFECT_BUILD_DENO_BIN });

const build = (input: Deno.CompileExecutableInput) =>
  Effect.runPromise(
    Deno.compileExecutable(input).pipe(
      Effect.provide(compilerLayer()),
      Effect.provide(NodeServices.layer),
    ),
  );

const execute = (path: string) => Effect.runPromise(runProcess(path, []).pipe(Effect.provide(NodeServices.layer)));

describe("real standalone Deno", () => {
  it("compiles, validates, publishes, hashes, and executes the returned artifact", async () => {
    const artifact = await build({
      entrypoint: join(fixtures, "hello.ts"),
      outfile: join(root(), "app"),
      digest: true,
    });
    const bytes = readFileSync(artifact.path);
    expect(artifact.bytes).toBe(bytes.byteLength);
    expect(artifact.digest).toBe(`sha256:${createHash("sha256").update(bytes).digest("hex")}`);
    expect(artifact.provider).toBe("deno");
    expect(artifact.stages[0].tool).toMatchObject({
      name: "deno",
      version: process.env.EFFECT_BUILD_DENO_VERSION ?? "2.9.3",
    });
    if (process.env.EFFECT_BUILD_EXPECTED_TARGET !== undefined) {
      expect(artifact.target).toBe(process.env.EFFECT_BUILD_EXPECTED_TARGET);
    }
    const completion = await execute(artifact.path);
    expect(completion).toMatchObject({ exitCode: 0, stdout: { text: "effect-build-ok\n" } });
  }, 120_000);

  it("inherits deno.json imports and reports missing imports as ToolFailed", async () => {
    const project = join(fixtures, "deno-config");
    const artifact = await build({ entrypoint: "entry.ts", outfile: join(root(), "app"), cwd: project });
    expect((await execute(artifact.path)).stdout.text).toBe("deno-config-ok\n");
    await expect(build({
      entrypoint: join(fixtures, "deno-missing-import.mts"),
      outfile: join(root(), "bad"),
    })).rejects.toMatchObject({ _tag: "ToolFailed", tool: "deno" });
  }, 120_000);

  it("rejects musl before spawning the compiler operation", async () => {
    await expect(build({
      entrypoint: join(fixtures, "hello.ts"),
      outfile: join(root(), "app"),
      // Runtime-unsafe input still receives the typed TargetUnsupported failure.
      target: "linux-aarch64-musl" as never,
    })).rejects.toMatchObject({ _tag: "TargetUnsupported", tool: "deno" });
  });
});
