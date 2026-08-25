import { Cause, Effect, Exit, Stream } from "effect";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Build from "../../packages/effect-build-rolldown/src/Api/Build.js";
import * as Watch from "../../packages/effect-build-rolldown/src/Api/Watch.js";
import { observeProviderNativeEvidence } from "../evidence/provider-native.js";

let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-rolldown-"));
  await writeFile(join(root, "lib.js"), "export const shared = () => 40 + 2;\n");
  await writeFile(join(root, "main.js"), 'import { shared } from "./lib.js";\nexport const answer = shared();\n');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("rolldown Build", () => {
  it("bundles the import graph in memory through the scoped owner", async () => {
    const exit = await Effect.runPromiseExit(Build.generate({ input: join(root, "main.js") }, { format: "esm" }));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      const [chunk] = exit.value.output;
      expect(chunk.type).toBe("chunk");
      expect(chunk.code).toContain("shared()");
    }
    await observeProviderNativeEvidence("CAN-ROL-005");
  });

  it("writes bundles onto disk with rolldown's own file naming", async () => {
    const outdir = join(root, "dist");
    const exit = await Effect.runPromiseExit(
      Build.write({ input: join(root, "main.js") }, { dir: outdir, format: "esm" }),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(await readdir(outdir)).toContain("main.js");
      expect(await readFile(join(outdir, "main.js"), "utf8")).toContain("shared()");
    }
    await observeProviderNativeEvidence("CAN-ROL-006");
  });

  it("reuses one graph for several outputs inside a single scope", async () => {
    let closes = 0;
    const exit = await Effect.runPromiseExit(
      Effect.scoped(
        Effect.gen(function*() {
          const build = yield* Build.make({
            input: join(root, "main.js"),
            plugins: [{
              name: "build-close-observer",
              closeBundle() {
                closes += 1;
              },
            }],
          });
          const esm = yield* Build.generateScoped(build, { format: "esm" });
          const cjs = yield* Build.generateScoped(build, { format: "cjs" });
          const written = yield* Build.writeScoped(build, {
            dir: join(root, "scoped-dist"),
            format: "esm",
          });
          return { cjs, esm, written };
        }),
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.esm.output[0].code).toContain("export");
      expect(exit.value.cjs.output[0].code).toContain("exports");
      expect(exit.value.written.output[0].type).toBe("chunk");
      expect(await readFile(join(root, "scoped-dist", "main.js"), "utf8")).toContain("shared()");
    }
    expect(closes).toBe(1);
    await observeProviderNativeEvidence(
      "CAN-ROL-001",
      "CAN-ROL-002",
      "CAN-ROL-003",
      "OP-ROL-004.release",
    );
  });

  it("preserves scoped build cleanup failure in Cause", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.scoped(
        Effect.gen(function*() {
          const build = yield* Build.make({
            input: join(root, "main.js"),
            plugins: [{
              name: "build-cleanup-failure",
              closeBundle() {
                throw new Error("deliberate build cleanup failure");
              },
            }],
          });
          yield* build.generate({ format: "esm" });
        }),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).toContain("deliberate build cleanup failure");
  });

  it("closes admission and drains an admitted generate before native close", async () => {
    let started = false;
    let finished = false;
    let closes = 0;
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const build = yield* Build.make({
            input: join(root, "main.js"),
            plugins: [{
              name: "drain-before-close",
              async generateBundle() {
                started = true;
                await new Promise((resolve) => setTimeout(resolve, 40));
                finished = true;
              },
              closeBundle() {
                closes += 1;
              },
            }],
          });
          yield* Effect.forkChild(build.generate({ format: "esm" }));
          while (!started) yield* Effect.sleep("1 millis");
        }),
      ),
    );
    expect(finished).toBe(true);
    expect(closes).toBe(1);
  });

  it("surfaces native diagnostics as RolldownFailed by reference", async () => {
    const exit = await Effect.runPromiseExit(
      Build.generate({ input: join(root, "absent.js"), logLevel: "silent" }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.findErrorOption(exit.cause);
      expect(failure._tag).toBe("Some");
      if (failure._tag === "Some") {
        expect(failure.value._tag).toBe("RolldownFailed");
        expect(["make", "generate"]).toContain(failure.value.operation);
        expect(failure.value.message).toContain("rolldown");
      }
    }
  });
});

describe("rolldown Watch", () => {
  it("emits completed builds and rebuilds after closing their native results", async () => {
    const project = join(root, "watched");
    await mkdir(project, { recursive: true });
    const entry = join(project, "entry.js");
    await writeFile(entry, 'export const generation = "gen-one";\n');
    let resultCloses = 0;
    let watcherCloses = 0;
    let rebuildRequested = false;
    const events = await Effect.runPromise(
      Watch.direct({
        input: entry,
        cwd: project,
        output: { dir: join(project, "dist") },
        plugins: [{
          name: "watch-close-observer",
          closeBundle() {
            resultCloses += 1;
          },
          closeWatcher() {
            watcherCloses += 1;
          },
        }],
      }).pipe(
        Stream.tap((event) =>
          Effect.suspend(() => {
            if (event.code !== "BUNDLE_END" || rebuildRequested) return Effect.void;
            rebuildRequested = true;
            return Effect.promise(() => writeFile(entry, 'export const generation = "gen-two";\n'));
          })
        ),
        Stream.take(2),
        Stream.runCollect,
      ) as Effect.Effect<Watch.DirectEvent[]>,
    );
    const codes = events.map((event) => event.code);
    expect(codes.filter((code) => code === "BUNDLE_END")).toHaveLength(2);
    expect(codes).not.toContain("ERROR");
    const bundleEnd = events.find((event) => event.code === "BUNDLE_END");
    if (bundleEnd !== undefined && bundleEnd.code === "BUNDLE_END") {
      expect(bundleEnd.output.length).toBeGreaterThan(0);
    }
    for (const event of events) expect(event.superseded).toBeGreaterThanOrEqual(0);
    expect(resultCloses).toBe(2);
    expect(watcherCloses).toBe(1);
    await observeProviderNativeEvidence("CAN-ROL-007", "OP-ROL-009.release");
  }, 60_000);

  it("keeps only the latest pending completion and reports superseded completions", async () => {
    const project = join(root, "coalesced-watch");
    await mkdir(project, { recursive: true });
    const entry = join(project, "entry.js");
    await writeFile(entry, 'export const generation = "gen-0";\n');
    let closes = 0;
    let firstDelivery = true;
    const events = await Effect.runPromise(
      Watch.direct({
        input: entry,
        cwd: project,
        output: { dir: join(project, "dist") },
        plugins: [{
          name: "drive-coalesced-watch",
          async closeBundle() {
            closes += 1;
            if (closes < 5) {
              await writeFile(entry, `export const generation = "gen-${closes}";\n`);
            }
          },
        }],
      }).pipe(
        Stream.mapEffect((event) =>
          Effect.promise(async () => {
            if (!firstDelivery) return event;
            firstDelivery = false;
            const deadline = Date.now() + 10_000;
            while (closes < 5) {
              if (Date.now() > deadline) throw new Error("timed out establishing a pending watch completion");
              await new Promise((resolveTick) => setTimeout(resolveTick, 10));
            }
            return event;
          })
        ),
        Stream.take(2),
        Stream.runCollect,
      ) as Effect.Effect<Watch.DirectEvent[]>,
    );
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.code === "BUNDLE_END")).toBe(true);
    expect(events[1]!.superseded).toBeGreaterThan(0);
  }, 60_000);

  it("preserves result cleanup failure in Cause and still closes the watcher", async () => {
    const project = join(root, "cleanup-failure-watch");
    await mkdir(project, { recursive: true });
    const entry = join(project, "entry.js");
    await writeFile(entry, 'export const cleanup = "failure";\n');
    let watcherCloses = 0;
    const cleanupFailure = new Error("deliberate result cleanup failure");
    const exit = await Effect.runPromiseExit(
      Watch.direct({
        input: entry,
        cwd: project,
        output: { dir: join(project, "dist") },
        plugins: [{
          name: "watch-cleanup-failure",
          closeBundle() {
            throw cleanupFailure;
          },
          closeWatcher() {
            watcherCloses += 1;
          },
        }],
      }).pipe(Stream.runCollect),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).toContain("watch-cleanup-failure");
    expect(watcherCloses).toBe(1);
  }, 60_000);
});
