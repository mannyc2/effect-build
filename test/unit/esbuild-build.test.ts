import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber } from "effect";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Build from "../../packages/effect-build-esbuild/src/Build.js";

let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-esbuild-build-"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const runWith = <A, E>(effect: Effect.Effect<A, E, Build.Esbuild>): Promise<Exit.Exit<A, E>> =>
  Effect.runPromiseExit(
    effect.pipe(
      Effect.provide(Build.layer),
      Effect.provide(NodeServices.layer),
    ) as Effect.Effect<A, E>,
  );

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
    const exit = await runWith(Build.build(memoryInput('export const bundled = "in-memory";')));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.outputFiles).toHaveLength(1);
      expect(new TextDecoder().decode(exit.value.outputFiles[0]!.contents)).toContain("in-memory");
      expect(exit.value.errors).toEqual([]);
    }
  });

  it("preserves native diagnostics by reference on failure", async () => {
    const exit = await runWith(
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
    }).pipe(
      Effect.provide(Build.layer),
      Effect.provide(NodeServices.layer),
    );
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
  });
});
