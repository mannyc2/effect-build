import { Effect } from "effect";
import { DevEngine } from "effect-build-rolldown";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-rolldown-dev-"));
  await writeFile(join(root, "entry.ts"), "export const answer: number = 40 + 2;\n");
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

it("delivers compiled code through callbacks and closes the engine when its scope ends", async () => {
  const outputs: string[] = [];
  let closes = 0;
  const outdir = join(root, "memory");
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const engine = yield* DevEngine.make({
      input: join(root, "entry.ts"),
      plugins: [{ name: "close-counter", closeBundle() { closes += 1; } }],
    }, { format: "esm", dir: outdir, entryFileNames: "entry.js" }, {
      watch: { enabled: false, skipWrite: true },
      onOutput(result) {
        if (result instanceof Error) throw result;
        outputs.push(...result.output.flatMap((entry) => entry.type === "chunk" ? [entry.code] : []));
      },
    });
    yield* engine.run;
    yield* engine.ensureCurrentBuildFinish;
    expect(closes).toBe(0);
    expect(yield* engine.getBundleState).toMatchObject({ lastBuildErrored: false, hasStaleOutput: false });
  })));
  expect(outputs).toHaveLength(1);
  expect(outputs[0]).toContain("answer = 42");
  expect(closes).toBe(1);
  await expect(readFile(join(outdir, "entry.js"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("writes the native directory output and closes the engine when subsequent work fails", async () => {
  const outdir = join(root, "dist");
  let closes = 0;
  const failure = await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const engine = yield* DevEngine.make({
      input: join(root, "entry.ts"),
      plugins: [{ name: "close-counter", closeBundle() { closes += 1; } }],
    }, { dir: outdir, format: "esm", entryFileNames: "entry.js" }, { watch: { enabled: false } });
    yield* engine.run;
    yield* engine.ensureCurrentBuildFinish;
    return yield* Effect.fail("next step failed");
  })).pipe(Effect.flip));
  expect(failure).toBe("next step failed");
  expect(await readFile(join(outdir, "entry.js"), "utf8")).toContain("answer = 42");
  expect(closes).toBe(1);
});

it("preserves the native plugin exception when creating an engine fails", async () => {
  const cause = new Error("plugin could not configure the build");
  const failure = await Effect.runPromise(Effect.scoped(DevEngine.make({
    input: join(root, "entry.ts"),
    plugins: [{ name: "options-failure", options() { throw cause; } }],
  })).pipe(Effect.flip));
  expect(failure).toMatchObject({ _tag: "RolldownFailed", operation: "dev.create" });
  expect(failure.cause).toBe(cause);
});
