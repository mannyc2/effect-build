import { Cause, Effect, Exit, Stream } from "effect";
import type * as esbuild from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Context from "../../packages/effect-build-esbuild/src/Context.js";
import * as Watch from "../../packages/effect-build-esbuild/src/Watch.js";

let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-esbuild-watch-"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const decode = (result: esbuild.BuildResult<{ write: false }>): string =>
  new TextDecoder().decode(result.outputFiles[0]?.contents ?? new Uint8Array());

describe("esbuild Watch", () => {
  it("emits the initial build, then one element per rebuild, and stops with the stream", async () => {
    const entry = join(root, "watched.ts");
    await writeFile(entry, 'export const generation = "gen-one";\n');
    const collected = await Effect.runPromise(
      Watch.changes({ entryPoints: [entry], bundle: true, format: "esm", logLevel: "silent", write: false }).pipe(
        Stream.tap((result) =>
          decode(result).includes("gen-one")
            ? Effect.promise(() => writeFile(entry, 'export const generation = "gen-two";\n'))
            : Effect.void
        ),
        Stream.take(2),
        Stream.runCollect,
        Effect.provide(Context.layer),
      ) as Effect.Effect<esbuild.BuildResult<{ write: false }>[]>,
    );
    expect(collected).toHaveLength(2);
    expect(decode(collected[0]!)).toContain("gen-one");
    expect(decode(collected[1]!)).toContain("gen-two");
    for (const result of collected) expect(result.errors).toEqual([]);
  }, 60_000);

  it("emits broken rebuilds as values instead of failing the dev loop", async () => {
    const entry = join(root, "breaking.ts");
    await writeFile(entry, 'export const fine = "compiles";\n');
    const results = await Effect.runPromise(
      Watch.changes({ entryPoints: [entry], bundle: true, logLevel: "silent", write: false }).pipe(
        Stream.tap((result) =>
          result.errors.length === 0 && decode(result).includes("compiles")
            ? Effect.promise(() => writeFile(entry, "export const broken = ;\n"))
            : Effect.void
        ),
        Stream.take(2),
        Stream.runCollect,
        Effect.provide(Context.layer),
      ) as Effect.Effect<esbuild.BuildResult<{ write: false }>[]>,
    );
    expect(results[0]?.errors).toEqual([]);
    expect(results[1]?.errors.length).toBeGreaterThan(0);
  }, 60_000);

  it("fails the stream when the watcher cannot start", async () => {
    const exit = await Effect.runPromiseExit(
      Watch.changes({
        entryPoints: [join(root, "irrelevant.ts")],
        format: "bogus" as esbuild.Format,
        logLevel: "silent",
        write: false,
      }).pipe(
        Stream.runCollect,
        Effect.provide(Context.layer),
      ) as Effect.Effect<unknown, Watch.EsbuildFailed>,
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.findErrorOption(exit.cause);
      expect(failure._tag).toBe("Some");
      if (failure._tag === "Some") expect(failure.value.operation).toBe("make");
    }
  }, 30_000);
});
