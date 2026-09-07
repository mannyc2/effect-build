import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber } from "effect";
import { Artifact } from "effect-build";
import * as Esbuild from "effect-build-esbuild";
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => { resolve = complete; });
  return { promise, resolve };
};
const waitForFile = async (path: string, text: string) => {
  for (let attempt = 0; attempt < 300; attempt++) {
    const contents = await readFile(path, "utf8").catch(() => "");
    if (contents.includes(text)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`esbuild did not write ${text}`);
};
let root: string;
let source: string;
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "effect-build-esbuild-")));
  source = join(root, "hello.ts");
  await writeFile(source, "export const answer: number = 42;\n");
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("esbuild native operations", () => {
  it("builds a real TypeScript file in memory and analyzes its native metafile", async () => {
    const result = await run(Esbuild.build({
      entryPoints: [source], bundle: true, format: "esm", write: false, metafile: true, logLevel: "silent",
    }));
    expect(result.outputFiles[0]!.text).toContain("42");
    expect(result.outputFiles[0]!.text).not.toContain(": number");
    expect(await run(Esbuild.analyzeMetafile(result.metafile))).toContain("hello.ts");
    expect(await readdir(root)).toEqual(["hello.ts"]);
  });

  it("preserves native write options and structured diagnostics", async () => {
    const outfile = join(root, "native.js");
    await run(Esbuild.build({ entryPoints: [source], outfile, write: true, logLevel: "silent" }));
    expect(await readFile(outfile, "utf8")).toContain("42");
    await writeFile(source, "const = ;\n");
    const failure = await run(Esbuild.build({ entryPoints: [source], write: false, logLevel: "silent" }).pipe(Effect.flip));
    expect(failure).toBeInstanceOf(Esbuild.EsbuildFailed);
    expect(failure.errors[0]?.location?.file).toContain("hello.ts");
    expect(failure.errors[0]?.text).toMatch(/Expected/);
  });

  it("commits a verified directory relative to absWorkingDir and keeps it on build failure", async () => {
    const input = { absWorkingDir: root, entryPoints: ["hello.ts"], outdir: "dist", bundle: true, logLevel: "silent" } as const;
    const artifact = await run(Esbuild.buildToDirectory({ ...input, entryPoints: [...input.entryPoints] }));
    expect(artifact.path).toBe(join(root, "dist"));
    expect(await run(Artifact.verify(artifact))).toEqual(artifact);
    const previous = await readFile(join(artifact.path, "hello.js"), "utf8");
    await writeFile(source, "const = ;\n");
    const failure = await run(Esbuild.buildToDirectory({ ...input, entryPoints: [...input.entryPoints] }).pipe(Effect.flip));
    expect(failure).toBeInstanceOf(Esbuild.EsbuildFailed);
    expect(await readFile(join(artifact.path, "hello.js"), "utf8")).toBe(previous);
    expect((await readdir(root)).sort()).toEqual(["dist", "hello.ts"]);
  });

  it("transforms TypeScript and preserves native transform errors", async () => {
    const result = await run(Esbuild.transform(await readFile(source, "utf8"), { loader: "ts", minify: true }));
    expect(result.code).toContain("42");
    expect(result.code).not.toContain(": number");
    const failure = await run(Esbuild.transform("const =", { loader: "ts", logLevel: "silent" }).pipe(Effect.flip));
    expect(failure).toMatchObject({ _tag: "EsbuildFailed", operation: "transform" });
    expect(failure.errors[0]?.text).toMatch(/Expected/);
  });
});

describe("esbuild scoped contexts", () => {
  it("cancels an active rebuild and reuses the context for changed source", async () => {
    const entered = deferred();
    const gate = deferred();
    let pause = true;
    const output = await run(Effect.scoped(Effect.gen(function*() {
      const context = yield* Esbuild.context({
        entryPoints: [source], bundle: true, write: false, logLevel: "silent",
        plugins: [{ name: "pause-first-load", setup(build) {
          build.onLoad({ filter: /hello\.ts$/ }, async () => {
            if (pause) { entered.resolve(); await gate.promise; }
          });
        } }],
      });
      const active = yield* Effect.forkChild(Effect.exit(context.rebuild));
      yield* Effect.promise(() => entered.promise);
      const cancel = yield* Effect.forkChild(context.cancel);
      yield* Effect.yieldNow;
      gate.resolve();
      yield* Fiber.join(cancel);
      const canceled = yield* Fiber.join(active);
      expect(Exit.isFailure(canceled)).toBe(true);
      if (Exit.isFailure(canceled)) {
        expect(Cause.findErrorOption(canceled.cause)).toMatchObject({
          value: { _tag: "EsbuildFailed", operation: "rebuild" },
        });
      }
      pause = false;
      yield* Effect.promise(() => writeFile(source, "export const answer = 43;\n"));
      return (yield* context.rebuild).outputFiles[0]!.text;
    }).pipe(Effect.ensuring(Effect.sync(gate.resolve)))));
    expect(output).toContain("43");
  });

  it("rebuilds watched files and disposes the context when its scope closes", async () => {
    const outfile = join(root, "watched.js");
    const disposed = deferred();
    const context = await run(Effect.scoped(Effect.gen(function*() {
      const context = yield* Esbuild.context({
        entryPoints: [source], outfile, write: true, logLevel: "silent",
        plugins: [{ name: "watch-cleanup", setup(build) { build.onDispose(disposed.resolve); } }],
      });
      yield* context.watch();
      yield* Effect.promise(() => waitForFile(outfile, "42"));
      yield* Effect.promise(() => writeFile(source, "export const answer = 43;\n"));
      yield* Effect.promise(() => waitForFile(outfile, "43"));
      return context;
    })));
    await disposed.promise;
    const failure = await run(context.rebuild.pipe(Effect.flip));
    expect(failure).toMatchObject({ _tag: "EsbuildFailed", operation: "rebuild" });
  });

  it("serves a real bundle and closes the HTTP listener with its scope", async () => {
    const address = await run(Effect.scoped(Effect.gen(function*() {
      const context = yield* Esbuild.context({
        entryPoints: [source], outfile: join(root, "served.js"), bundle: true, logLevel: "silent",
      });
      const server = yield* context.serve({ host: "127.0.0.1", port: 0, servedir: root });
      const address = `http://127.0.0.1:${server.port}/served.js`;
      const response = yield* Effect.promise(() => fetch(address));
      expect(response.status).toBe(200);
      expect(yield* Effect.promise(() => response.text())).toContain("42");
      return address;
    })));
    await expect(fetch(address)).rejects.toThrow();
  });
});
