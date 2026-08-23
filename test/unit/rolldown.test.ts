import { Cause, Effect, Exit, Stream } from "effect";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Build from "../../packages/effect-build-rolldown/src/Build.js";
import * as Watch from "../../packages/effect-build-rolldown/src/Watch.js";

let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-rolldown-"));
  await writeFile(join(root, "lib.js"), "export const shared = () => 40 + 2;\n");
  await writeFile(join(root, "main.js"), 'import { shared } from "./lib.js";\nexport const answer = shared();\n');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const runWith = <A, E>(effect: Effect.Effect<A, E, Build.Rolldown>): Promise<Exit.Exit<A, E>> =>
  Effect.runPromiseExit(
    effect.pipe(Effect.provide(Build.layer)) as Effect.Effect<A, E>,
  );

describe("rolldown Build", () => {
  it("bundles the import graph in memory through the scoped owner", async () => {
    const exit = await runWith(Build.generate({ input: join(root, "main.js") }, { format: "esm" }));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      const [chunk] = exit.value.output;
      expect(chunk.type).toBe("chunk");
      expect(chunk.code).toContain("shared()");
    }
  });

  it("writes bundles onto disk with rolldown's own file naming", async () => {
    const outdir = join(root, "dist");
    const exit = await runWith(Build.write({ input: join(root, "main.js") }, { dir: outdir, format: "esm" }));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(await readdir(outdir)).toContain("main.js");
      expect(await readFile(join(outdir, "main.js"), "utf8")).toContain("shared()");
    }
  });

  it("reuses one graph for several outputs inside a single scope", async () => {
    const exit = await runWith(
      Effect.scoped(
        Effect.gen(function*() {
          const build = yield* Build.make({ input: join(root, "main.js") });
          const esm = yield* build.generate({ format: "esm" });
          const cjs = yield* build.generate({ format: "cjs" });
          return { cjs, esm };
        }),
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.esm.output[0].code).toContain("export");
      expect(exit.value.cjs.output[0].code).toContain("exports");
    }
  });

  it("surfaces native diagnostics as RolldownFailed by reference", async () => {
    const exit = await runWith(Build.generate({ input: join(root, "absent.js"), logLevel: "silent" }));
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
  it("emits a full build cycle and a rebuild cycle, closing results itself", async () => {
    const project = join(root, "watched");
    await mkdir(project, { recursive: true });
    const entry = join(project, "entry.js");
    await writeFile(entry, 'export const generation = "gen-one";\n');
    const events = await Effect.runPromise(
      Watch.events({ input: entry, cwd: project, output: { dir: join(project, "dist") } }).pipe(
        Stream.tap((event) =>
          event.code === "END"
            ? Effect.promise(() => writeFile(entry, 'export const generation = "gen-two";\n'))
            : Effect.void
        ),
        Stream.takeUntil((event) => event.code === "ERROR"),
        Stream.take(8),
        Stream.runCollect,
      ) as Effect.Effect<Watch.Event[]>,
    );
    const codes = events.map((event) => event.code);
    expect(codes.filter((code) => code === "BUNDLE_END").length).toBeGreaterThanOrEqual(2);
    expect(codes).not.toContain("ERROR");
    const bundleEnd = events.find((event) => event.code === "BUNDLE_END");
    if (bundleEnd !== undefined && bundleEnd.code === "BUNDLE_END") {
      expect(bundleEnd.output.length).toBeGreaterThan(0);
    }
  }, 60_000);
});
