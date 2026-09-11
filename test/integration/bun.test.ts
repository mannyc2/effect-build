import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Artifact, Executable, Target } from "effect-build";
import * as Bun from "effect-build-bun";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const executable = process.env.EFFECT_BUILD_BUN;
if (executable === undefined) throw new Error("Set EFFECT_BUILD_BUN to the exact Bun executable under test");
const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices | Bun.Bun>) =>
  Effect.runPromise(effect.pipe(Effect.provide(Bun.layer({ executable })), Effect.provide(NodeServices.layer)));
let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-bun-"));
  await writeFile(join(root, "hello.ts"), 'console.log("hello from effect-build");\n');
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("real Bun executables", () => {
  it.each(["linux-x64", "linux-x64-musl", "linux-arm64", "windows-x64"] as const)(
    "compiles a %s executable and verifies its bytes and header",
    async (target) => {
      const outfile = join(root, `hello-${target}${Target.parts(target).executableSuffix}`);
      const artifact = await run(Bun.compile({ entrypoints: ["hello.ts"], outfile, target, cwd: root }));
      expect(artifact.path).toBe(outfile);
      expect(artifact.target).toBe(target);
      expect(artifact.bytes).toBeGreaterThan(0);
      expect(await run(Artifact.verify(artifact))).toEqual(artifact);
      const facts = await run(Executable.inspect(outfile));
      expect(Executable.matches(facts, target)).toBe(true);
    },
    300_000,
  );

  it("preserves CommonJS variable bindings in a compiled program that prints 42", async () => {
    const target = Target.host();
    if (target === undefined) throw new Error("The Bun fixture needs a supported native host target");
    const entrypoint = fileURLToPath(new URL("./fixtures/bun-variable-collision.cjs", import.meta.url));
    const artifact = await run(Bun.compile({
      entrypoints: [entrypoint],
      outfile: join(root, `collision${Target.parts(target).executableSuffix}`),
      target,
    }));
    expect(execFileSync(artifact.path, [], { encoding: "utf8", timeout: 30_000 }).trim()).toBe("42");
    await run(Artifact.verify(artifact));
  }, 300_000);
});
