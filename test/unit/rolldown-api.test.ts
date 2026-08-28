import { Effect, Stream } from "effect";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Config from "../../packages/effect-build-rolldown/src/Api/Config.js";
import * as Declaration from "../../packages/effect-build-rolldown/src/Api/Declaration.js";
import * as DevEngine from "../../packages/effect-build-rolldown/src/Api/DevEngine.js";
import * as Minify from "../../packages/effect-build-rolldown/src/Api/Minify.js";
import * as Parse from "../../packages/effect-build-rolldown/src/Api/Parse.js";
import * as Resolve from "../../packages/effect-build-rolldown/src/Api/Resolve.js";
import * as Scan from "../../packages/effect-build-rolldown/src/Api/Scan.js";
import * as Transform from "../../packages/effect-build-rolldown/src/Api/Transform.js";
import * as Watch from "../../packages/effect-build-rolldown/src/Api/Watch.js";
import { observeProviderNativeEvidence } from "../evidence/provider-native.js";

let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-rolldown-api-"));
  await writeFile(join(root, "entry.ts"), "export const answer: number = 40 + 2;\n");
  await writeFile(join(root, "rolldown.config.mjs"), "export default { input: 'entry.ts' };\n");
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("rolldown Api utilities", () => {
  it("preserves native transform, parse, and minify results", async () => {
    const transformed = await Effect.runPromise(
      Transform.transform("entry.ts", "export const answer: number = 40 + 2;", { lang: "ts" }),
    );
    expect(transformed.code).not.toContain(": number");

    const parsed = await Effect.runPromise(Parse.parse("entry.js", transformed.code));
    expect(parsed.program.type).toBe("Program");

    const minified = await Effect.runPromise(Minify.minify("entry.js", transformed.code));
    expect(minified.code.length).toBeLessThan(transformed.code.length);
    await observeProviderNativeEvidence("CAN-ROL-013", "CAN-ROL-014", "CAN-ROL-015");
  });

  it("emits isolated declarations through the exact async host utility", async () => {
    const result = await Effect.runPromise(
      Declaration.emit("entry.ts", "export const answer: number = 42;"),
    );
    expect(result.errors).toEqual([]);
    expect(result.code).toContain("answer: number");
    await observeProviderNativeEvidence("CAN-ROL-020");
  });

  it("keeps ResolverFactory caller-owned because upstream has no release protocol", async () => {
    const resolved = await Effect.runPromise(
      Effect.flatMap(Resolve.make(), (resolver) => resolver.resolve(root, "./entry.ts")),
    );
    expect(resolved.path).toBeDefined();
    expect(await realpath(resolved.path!)).toBe(await realpath(join(root, "entry.ts")));
    await observeProviderNativeEvidence("CAN-ROL-016");
  });

  it("awaits scan cleanup through the assimilated native promise", async () => {
    await Effect.runPromise(Scan.scan({ input: join(root, "entry.ts") }));
    await observeProviderNativeEvidence("CAN-ROL-017");
  });

  it("marks configuration loading as an explicit code-execution boundary", async () => {
    const loaded = await Effect.runPromise(
      Config.load(join(root, "rolldown.config.mjs"), { configLoader: "native" }),
    );
    expect(loaded).toMatchObject({ input: "entry.ts" });
    await observeProviderNativeEvidence("CAN-ROL-022");
  });

  it("executes skip-write watch, closes each result before its watcher, and publishes no files", async () => {
    const entry = join(root, "skip-write-entry.js");
    const outdir = join(root, "skip-write-dist");
    await writeFile(entry, 'export const skipped = "provider-memory";\n');
    const lifecycle: string[] = [];
    const events = await Effect.runPromise(
      Watch.skipWrite({
        input: entry,
        cwd: root,
        output: { dir: outdir },
        watch: { skipWrite: true },
        plugins: [{
          name: "skip-write-close-observer",
          closeBundle() {
            lifecycle.push("result-close");
          },
          closeWatcher() {
            lifecycle.push("watcher-close");
          },
        }],
      }).pipe(Stream.take(1), Stream.runCollect) as Effect.Effect<Watch.SkipWriteEvent[]>,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.code).toBe("BUNDLE_END");
    expect(lifecycle).toEqual(["result-close", "watcher-close"]);
    await expect(readFile(join(outdir, "skip-write-entry.js"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await observeProviderNativeEvidence("CAN-ROL-008");
  });

  it("owns the experimental callback/memory DevEngine through Scope", async () => {
    let outputs = 0;
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const engine = yield* DevEngine.makeMemory(
            { input: join(root, "entry.ts") },
            { format: "esm" },
            {
              onOutput(result) {
                if (!(result instanceof Error)) outputs += 1;
              },
              watch: { enabled: false, skipWrite: true },
            },
          );
          yield* engine.run;
          yield* engine.ensureCurrentBuildFinish;
        }),
      ),
    );
    expect(outputs).toBeGreaterThan(0);
    await observeProviderNativeEvidence("CAN-ROL-018A", "OP-ROL-019.release");
  });

  it("executes the provider-direct DevEngine and owns it through Scope", async () => {
    const outdir = join(root, "dev-engine-direct");
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const engine = yield* DevEngine.makeToDirectory(
            { input: join(root, "entry.ts") },
            { dir: outdir, format: "esm", entryFileNames: "entry.js" },
            { watch: { enabled: false, skipWrite: false } },
          );
          yield* engine.run;
          yield* engine.ensureCurrentBuildFinish;
        }),
      ),
    );
    expect(await readFile(join(outdir, "entry.js"), "utf8")).toContain("answer = 42");
    await observeProviderNativeEvidence("CAN-ROL-018B", "OP-ROL-019.release");
  });
});
