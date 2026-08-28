import { Cause, Effect, Exit, Fiber } from "effect";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as AnalyzeMetafile from "../../packages/effect-build-esbuild/src/Api/AnalyzeMetafile.js";
import * as Build from "../../packages/effect-build-esbuild/src/Api/Build.js";
import * as BuildToDirectory from "../../packages/effect-build-esbuild/src/Api/BuildToDirectory.js";
import * as FormatMessages from "../../packages/effect-build-esbuild/src/Api/FormatMessages.js";
import * as Transform from "../../packages/effect-build-esbuild/src/Api/Transform.js";
import { observeProviderNativeEvidence } from "../evidence/provider-native.js";

let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-esbuild-build-"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const run = <A, E>(effect: Effect.Effect<A, E>): Promise<Exit.Exit<A, E>> => Effect.runPromiseExit(effect);

const failureOf = <A, E>(exit: Exit.Exit<A, E>): E => {
  expect(Exit.isFailure(exit)).toBe(true);
  const failure = Exit.isFailure(exit) ? Cause.findErrorOption(exit.cause) : undefined;
  expect(failure !== undefined && failure._tag === "Some").toBe(true);
  return (failure as { readonly value: E }).value;
};

const memoryInput = (contents: string) => ({
  stdin: { contents, loader: "ts" as const, resolveDir: root },
  bundle: true,
  format: "esm" as const,
  platform: "node" as const,
  logLevel: "silent" as const,
  write: false as const,
});

describe("esbuild Build", () => {
  it("returns the native in-memory result", async () => {
    const exit = await run(Build.build(memoryInput('export const bundled = "in-memory";')));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.outputFiles).toHaveLength(1);
      expect(new TextDecoder().decode(exit.value.outputFiles[0]!.contents)).toContain("in-memory");
      expect(exit.value.errors).toEqual([]);
    }
    await observeProviderNativeEvidence("CAN-ESB-001");
  });

  it("keeps provider-direct publication distinct from the in-memory operation", async () => {
    const outfile = join(root, "direct-build.js");
    const result = await Effect.runPromise(
      BuildToDirectory.buildToDirectory({
        ...memoryInput('export const direct = "provider-write";'),
        outfile,
        write: true,
      }),
    );
    expect(result.outputFiles).toBeUndefined();
    expect(await readFile(outfile, "utf8")).toContain("provider-write");
    await observeProviderNativeEvidence("CAN-ESB-002");
  });

  it("rejects erased write-mode mismatches before invoking esbuild", async () => {
    let providerStarts = 0;
    const plugin: import("esbuild").Plugin = {
      name: "write-mode-observer",
      setup(build) {
        build.onStart(() => {
          providerStarts += 1;
        });
      },
    };

    const memory = await run(Build.build({
      ...memoryInput('export const invalid = "memory";'),
      write: true,
      outfile: join(root, "invalid-memory-mode.js"),
      plugins: [plugin],
    } as never));
    expect(failureOf(memory)).toMatchObject({
      _tag: "EsbuildModeInvalid",
      operation: "build",
      mode: "memory",
      reason: "write must be exactly false for caller-owned in-memory output",
    });

    const direct = await run(BuildToDirectory.buildToDirectory({
      ...memoryInput('export const invalid = "direct";'),
      write: false,
      outfile: join(root, "invalid-direct-mode.js"),
      plugins: [plugin],
    } as never));
    expect(failureOf(direct)).toMatchObject({
      _tag: "EsbuildModeInvalid",
      operation: "build",
      mode: "direct",
      reason: "write must be exactly true for provider-direct durable output",
    });

    const missing = await run(Build.build({
      stdin: { contents: "export {};", loader: "ts" },
      plugins: [plugin],
    } as never));
    expect(failureOf(missing)).toMatchObject({ _tag: "EsbuildModeInvalid", mode: "memory" });
    expect(providerStarts).toBe(0);
  });

  it("preserves native diagnostics by reference on failure", async () => {
    const exit = await run(
      Build.build({
        entryPoints: [join(root, "missing-entry.ts")],
        bundle: true,
        logLevel: "silent",
        write: false,
      }),
    );
    const failure = failureOf(exit) as Build.EsbuildFailed;
    expect(failure._tag).toBe("EsbuildFailed");
    expect(failure.operation).toBe("build");
    expect(failure.errors.length).toBeGreaterThan(0);
    expect(failure.errors).toBe((failure.cause as { readonly errors: unknown }).errors);
    expect(failure.warnings).toBe((failure.cause as { readonly warnings: unknown }).warnings);
    expect(failure.message).toContain("esbuild build failed");
  });

  it("transforms one file in memory and keeps typed access to the native result", async () => {
    const exit = await run(
      Transform.transform("const answer: number = 42; export { answer };", { loader: "ts", minify: true }),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.code).toContain("42");
      expect(exit.value.code).not.toContain(": number");
      expect(exit.value.warnings).toEqual([]);
    }
    const failed = await run(Transform.transform("const const =", { loader: "ts", logLevel: "silent" }));
    const failure = failureOf(failed) as Build.EsbuildFailed;
    expect(failure._tag).toBe("EsbuildFailed");
    expect(failure.operation).toBe("transform");
    expect(failure.errors.length).toBeGreaterThan(0);
    await observeProviderNativeEvidence("CAN-ESB-003");
  });

  it("renders a metafile report through esbuild's own analyzer", async () => {
    const exit = await run(
      Effect.gen(function*() {
        const result = yield* Build.build({ ...memoryInput("export const analyzed = 1;"), metafile: true });
        return yield* AnalyzeMetafile.analyzeMetafile(result.metafile, { verbose: false });
      }),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) expect(exit.value).toContain("stdin");
    await observeProviderNativeEvidence("CAN-ESB-004", "E10.1");
  });

  it("formats native diagnostics without normalizing their structure", async () => {
    const failed = await run(Transform.transform("const const =", { loader: "ts", logLevel: "silent" }));
    const failure = failureOf(failed) as Transform.EsbuildFailed;
    const formatted = await Effect.runPromise(
      FormatMessages.formatMessages(failure.errors, { kind: "error", color: false }),
    );
    expect(formatted[0]).toContain("ERROR");
    await observeProviderNativeEvidence("CAN-ESB-005");
  });

  it("stops only the Effect waiter on interruption while the provider and delayed plugin complete", async () => {
    const entry = join(root, "one-shot-interruption-entry.ts");
    await writeFile(entry, 'export const oneShot = "continued";\n');
    let entered!: () => void;
    let release!: () => void;
    let onEndObserved = false;
    const enteredPromise = new Promise<void>((resolveEntered) => {
      entered = resolveEntered;
    });
    const gate = new Promise<void>((resolveRelease) => {
      release = resolveRelease;
    });
    const program = Build.build({
      entryPoints: [entry],
      bundle: true,
      format: "esm",
      platform: "node",
      logLevel: "silent",
      write: false,
      plugins: [{
        name: "one-shot-interruption",
        setup(build) {
          build.onLoad({ filter: /one-shot-interruption-entry\.ts$/ }, async () => {
            entered();
            await gate;
            return { contents: 'export const oneShot = "continued";', loader: "ts" };
          });
          build.onEnd(() => {
            onEndObserved = true;
          });
        },
      }],
    });
    const fiber = Effect.runFork(program as Effect.Effect<unknown>);
    await enteredPromise;
    await Effect.runPromise(Fiber.interrupt(fiber));
    const exit = await Effect.runPromise(Fiber.await(fiber));
    expect(Exit.isSuccess(exit)).toBe(false);
    expect(onEndObserved).toBe(false);
    release();
    const deadline = Date.now() + 5_000;
    while (!onEndObserved && Date.now() < deadline) {
      await new Promise((resolveTick) => setTimeout(resolveTick, 10));
    }
    expect(onEndObserved).toBe(true);
    await observeProviderNativeEvidence("E09.1");
  });
});
