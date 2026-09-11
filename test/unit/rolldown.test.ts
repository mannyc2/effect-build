import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Stream } from "effect";
import { Artifact } from "effect-build";
import * as Rolldown from "effect-build-rolldown";
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));
const waitFor = async (predicate: () => boolean) => {
  for (let attempt = 0; attempt < 1000; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Rolldown did not finish the expected build");
};
let root: string;
let source: string;
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "effect-build-rolldown-")));
  source = join(root, "main.ts");
  await writeFile(join(root, "lib.ts"), "export const shared = () => 40 + 2;\n");
  await writeFile(source, 'import { shared } from "./lib.ts"; export const answer: number = shared();\n');
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("Rolldown builds", () => {
  it("bundles a real import graph and preserves native multiple-build results", async () => {
    const result = await run(Rolldown.build({ input: source, write: false, output: { format: "esm" } }));
    expect(result.output[0].code).toContain("shared()");
    const outputs = await run(Rolldown.build([
      { input: source, write: false, output: { format: "esm" } },
      { input: source, write: false, output: { format: "cjs" } },
    ]));
    expect(outputs[0]!.output[0].code).toContain("export");
    expect(outputs[1]!.output[0].code).toContain("exports");
    expect((await readdir(root)).sort()).toEqual(["lib.ts", "main.ts"]);
  });

  it("commits a verified directory relative to cwd and preserves it on build failure", async () => {
    const input = { input: "main.ts", cwd: root, outdir: "dist", output: { format: "esm" }, logLevel: "silent" } as const;
    const artifact = await run(Rolldown.buildToDirectory(input));
    expect(artifact.path).toBe(join(root, "dist"));
    expect(await run(Artifact.verify(artifact))).toEqual(artifact);
    const previous = await readFile(join(artifact.path, "main.js"), "utf8");
    await writeFile(source, "const = ;\n");
    const failure = await run(Rolldown.buildToDirectory(input).pipe(Effect.flip));
    expect(failure).toBeInstanceOf(Rolldown.Failed);
    expect(await readFile(join(artifact.path, "main.js"), "utf8")).toBe(previous);
    expect((await readdir(root)).sort()).toEqual(["dist", "lib.ts", "main.ts"]);
  });

  it("transforms TypeScript and preserves native build diagnostics", async () => {
    const output = await run(Rolldown.transform("main.ts", await readFile(source, "utf8"), { lang: "ts" }));
    expect(output.code).not.toContain(": number");
    const failure = await run(Rolldown.build({ input: join(root, "missing.ts"), write: false, logLevel: "silent" }).pipe(Effect.flip));
    expect(failure).toBeInstanceOf(Rolldown.Failed);
    expect(failure.message).toContain("rolldown");
    expect(String(failure.cause)).toContain("missing.ts");
  });

  it("includes files written by closeBundle in the returned directory", async () => {
    let directory = "";
    const artifact = await run(Rolldown.buildToDirectory({
      input: source, outdir: join(root, "dist"),
      plugins: [{
        name: "license-on-close",
        writeBundle(output) { directory = output.dir!; },
        async closeBundle() { await writeFile(join(directory, "LICENSE"), "license text\n"); },
      }],
    }));
    expect(await readFile(join(artifact.path, "LICENSE"), "utf8")).toBe("license text\n");
    expect(artifact.entries.some((entry) => entry.path === "LICENSE")).toBe(true);
    expect(await run(Artifact.verify(artifact))).toEqual(artifact);
  });

  it("reuses a scoped graph for different formats and a disk write, then closes it once", async () => {
    let closes = 0;
    const owner = await run(Effect.scoped(Effect.gen(function*() {
      const build = yield* Rolldown.make({
        input: source,
        plugins: [{ name: "count-close", closeBundle() { closes += 1; } }],
      });
      expect((yield* build.generate({ format: "esm" })).output[0].code).toContain("export");
      expect((yield* build.generate({ format: "cjs" })).output[0].code).toContain("exports");
      yield* build.write({ dir: join(root, "scoped"), format: "esm" });
      return build;
    })));
    expect(await readFile(join(root, "scoped/main.js"), "utf8")).toContain("shared()");
    expect(closes).toBe(1);
    expect(await run(owner.generate().pipe(Effect.flip))).toBeInstanceOf(Rolldown.Failed);
  });

  it("preserves an error from scoped build cleanup in the Effect cause", async () => {
    const exit = await run(Effect.exit(Effect.scoped(Effect.gen(function*() {
      const build = yield* Rolldown.make({
        input: source, logLevel: "silent",
        plugins: [{ name: "failing-cleanup", closeBundle() { throw new Error("deliberate cleanup failure"); } }],
      });
      yield* build.generate();
    }))));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).toContain("deliberate cleanup failure");
  });

  it("finishes an already running generate before closing the scoped build", async () => {
    let started = false;
    const lifecycle: string[] = [];
    await run(Effect.scoped(Effect.gen(function*() {
      const build = yield* Rolldown.make({
        input: source,
        plugins: [{
          name: "slow-output",
          async generateBundle() {
            started = true;
            await new Promise((resolve) => setTimeout(resolve, 40));
            lifecycle.push("generated");
          },
          closeBundle() { lifecycle.push("closed"); },
        }],
      });
      yield* Effect.forkChild(build.generate());
      yield* Effect.promise(() => waitFor(() => started));
    })));
    expect(lifecycle).toEqual(["generated", "closed"]);
  });
});

describe("Rolldown watches", () => {
  it("rebuilds changed files and closes each result before its watcher", async () => {
    await writeFile(source, 'export const generation = "one";\n');
    const lifecycle: string[] = [];
    let changed = false;
    const events = await run(Rolldown.watch({
      input: source, cwd: root, output: { dir: join(root, "watch") },
      plugins: [{ name: "watch-cleanup", closeBundle() { lifecycle.push("result"); }, closeWatcher() { lifecycle.push("watcher"); } }],
    }).pipe(
      Stream.tap((event) => Effect.suspend(() => {
        if (changed || event.code !== "BUNDLE_END") return Effect.void;
        changed = true;
        return Effect.promise(() => writeFile(source, 'export const generation = "two";\n'));
      })),
      Stream.take(2), Stream.runCollect,
    ));
    expect(events.map((event) => event.code)).toEqual(["BUNDLE_END", "BUNDLE_END"]);
    expect(await readFile(join(root, "watch/main.js"), "utf8")).toContain("two");
    expect(lifecycle).toEqual(["result", "result", "watcher"]);
  }, 30_000);

  it("keeps the latest completed build while a slow consumer is busy", async () => {
    await writeFile(source, 'export const generation = "gen-0";\n');
    let closes = 0;
    let first = true;
    const events = await run(Rolldown.watch({
      input: source, cwd: root, output: { dir: join(root, "watch") },
      plugins: [{ name: "successive-builds", async closeBundle() {
        closes += 1;
        if (closes < 5) await writeFile(source, `export const generation = "gen-${closes}";\n`);
      } }],
    }).pipe(
      Stream.mapEffect((event) => Effect.promise(async () => {
        if (first) { first = false; await waitFor(() => closes >= 5); }
        return event;
      })),
      Stream.take(2), Stream.runCollect,
    ));
    expect(events.map((event) => event.code)).toEqual(["BUNDLE_END", "BUNDLE_END"]);
    expect(events[1]!.superseded).toBeGreaterThan(0);
    expect(await readFile(join(root, "watch/main.js"), "utf8")).toContain("gen-4");
  }, 30_000);

  it("keeps a result cleanup failure and still closes the watcher", async () => {
    let closes = 0;
    const exit = await run(Effect.exit(Rolldown.watch({
      input: source, cwd: root, output: { dir: join(root, "watch") }, logLevel: "silent",
      plugins: [{
        name: "watch-cleanup-failure",
        closeBundle() { throw new Error("deliberate result cleanup failure"); },
        closeWatcher() { closes += 1; },
      }],
    }).pipe(Stream.runCollect)));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).toContain("watch-cleanup-failure");
    expect(closes).toBe(1);
  }, 30_000);
});
