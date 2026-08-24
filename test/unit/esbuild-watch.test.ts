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

const decode = (change: Watch.Change<{ write: false }>): string =>
  new TextDecoder().decode(change.result.outputFiles[0]?.contents ?? new Uint8Array());

const waitFor = async (predicate: () => boolean, message: string): Promise<void> => {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(message);
    await new Promise((resolveTick) => setTimeout(resolveTick, 10));
  }
};

describe("esbuild Watch", () => {
  it("emits the initial build, then one element per rebuild, and stops with the stream", async () => {
    const entry = join(root, "watched.ts");
    await writeFile(entry, 'export const generation = "gen-one";\n');
    let disposals = 0;
    const collected = await Effect.runPromise(
      Watch.changes({
        entryPoints: [entry],
        bundle: true,
        format: "esm",
        logLevel: "silent",
        write: false,
        plugins: [{
          name: "watch-disposal-observer",
          setup(build) {
            build.onDispose(() => {
              disposals += 1;
            });
          },
        }],
      }).pipe(
        Stream.tap((change) =>
          decode(change).includes("gen-one")
            ? Effect.promise(() => writeFile(entry, 'export const generation = "gen-two";\n'))
            : Effect.void
        ),
        Stream.take(2),
        Stream.runCollect,
        Effect.provide(Context.layer),
      ) as Effect.Effect<Watch.Change<{ write: false }>[]>,
    );
    expect(collected).toHaveLength(2);
    expect(decode(collected[0]!)).toContain("gen-one");
    expect(decode(collected[1]!)).toContain("gen-two");
    for (const change of collected) {
      expect(change.result.errors).toEqual([]);
      expect(change.superseded).toBeGreaterThanOrEqual(0);
    }
    await waitFor(() => disposals === 1, "watch context was not disposed exactly once");
  }, 60_000);

  it("emits broken rebuilds as values instead of failing the dev loop", async () => {
    const entry = join(root, "breaking.ts");
    await writeFile(entry, 'export const fine = "compiles";\n');
    const results = await Effect.runPromise(
      Watch.changes({ entryPoints: [entry], bundle: true, logLevel: "silent", write: false }).pipe(
        Stream.tap((change) =>
          change.result.errors.length === 0 && decode(change).includes("compiles")
            ? Effect.promise(() => writeFile(entry, "export const broken = ;\n"))
            : Effect.void
        ),
        Stream.take(2),
        Stream.runCollect,
        Effect.provide(Context.layer),
      ) as Effect.Effect<Watch.Change<{ write: false }>[]>,
    );
    expect(results[0]?.result.errors).toEqual([]);
    expect(results[1]?.result.errors.length).toBeGreaterThan(0);
  }, 60_000);

  it("keeps only the latest pending completion and reports superseded completions", async () => {
    const entry = join(root, "coalesced-watch.ts");
    await writeFile(entry, 'export const generation = "gen-0";\n');
    let completed = 0;
    const deliveries = await Effect.runPromise(
      Watch.changes({
        entryPoints: [entry],
        bundle: true,
        format: "esm",
        logLevel: "silent",
        write: false,
        plugins: [{
          name: "drive-coalesced-watch",
          setup(build) {
            build.onEnd(async () => {
              completed += 1;
              if (completed < 5) {
                await new Promise((resolveTick) => setTimeout(resolveTick, 75));
                await writeFile(entry, `export const generation = "gen-${completed}";\n`);
              }
            });
          },
        }],
      }).pipe(
        Stream.mapEffect((change) => Effect.sleep("700 millis").pipe(Effect.as(change))),
        Stream.take(2),
        Stream.runCollect,
        Effect.provide(Context.layer),
      ) as Effect.Effect<Watch.Change<{ write: false }>[]>,
    );
    expect(deliveries).toHaveLength(2);
    expect(deliveries[1]!.superseded).toBeGreaterThan(0);
    expect(decode(deliveries[1]!)).toMatch(/gen-[2-4]/);
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
