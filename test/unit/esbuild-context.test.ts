import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber, type Scope } from "effect";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as EsbuildContext from "../../packages/effect-build-esbuild/src/Context.js";

let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-esbuild-context-"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const runScoped = <A, E>(
  effect: Effect.Effect<A, E, EsbuildContext.Esbuild | Scope.Scope>,
): Promise<Exit.Exit<A, E>> =>
  Effect.runPromiseExit(
    Effect.scoped(effect).pipe(
      Effect.provide(EsbuildContext.layer),
      Effect.provide(NodeServices.layer),
    ) as Effect.Effect<A, E>,
  );

const failureOf = <A, E>(exit: Exit.Exit<A, E>): E => {
  expect(Exit.isFailure(exit)).toBe(true);
  const failure = Exit.isFailure(exit) ? Cause.findErrorOption(exit.cause) : undefined;
  expect(failure !== undefined && failure._tag === "Some").toBe(true);
  return (failure as { readonly value: E }).value;
};

const waitFor = async (predicate: () => boolean, message: string): Promise<void> => {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(message);
    await new Promise((resolveTick) => setTimeout(resolveTick, 10));
  }
};

const memoryInput = (entry: string, plugins: readonly import("esbuild").Plugin[] = []) => ({
  entryPoints: [entry],
  bundle: true,
  format: "esm" as const,
  platform: "node" as const,
  logLevel: "silent" as const,
  write: false as const,
  plugins: [...plugins],
});

describe("esbuild Context", () => {
  it("coalesces concurrent rebuilds exactly as esbuild 0.28.2", async () => {
    const entry = join(root, "coalesce-entry.ts");
    await writeFile(entry, 'export const race = "v1";\n');
    let starts = 0;
    let releaseGate!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolveRelease) => {
      releaseGate = resolveRelease;
    });
    const startedPromise = new Promise<void>((resolveStarted) => {
      started = resolveStarted;
    });
    const exit = await runScoped(
      Effect.gen(function*() {
        const context = yield* EsbuildContext.make(memoryInput(entry, [{
          name: "coalesced-rebuild",
          setup(build) {
            build.onStart(async () => {
              starts += 1;
              started();
              await gate;
            });
          },
        }]));
        const first = yield* Effect.forkChild(context.rebuild);
        yield* Effect.promise(() => startedPromise);
        const second = yield* Effect.forkChild(context.rebuild);
        yield* Effect.promise(() => new Promise((resolveTick) => setTimeout(resolveTick, 25)));
        expect(starts).toBe(1);
        releaseGate();
        const results = [yield* Fiber.join(first), yield* Fiber.join(second)];
        return results.map((result) => result.outputFiles.length);
      }),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) expect(exit.value).toEqual([1, 1]);
    expect(starts).toBe(1);
  });

  it("cancel rejects the active rebuild without disposing the context", async () => {
    const entry = join(root, "cancel-entry.ts");
    await writeFile(entry, 'export const before = "cancel";\n');
    let delay = true;
    let entered!: () => void;
    let releaseGate!: () => void;
    const enteredPromise = new Promise<void>((resolveEntered) => {
      entered = resolveEntered;
    });
    const gate = new Promise<void>((resolveRelease) => {
      releaseGate = resolveRelease;
    });
    const exit = await runScoped(
      Effect.gen(function*() {
        const context = yield* EsbuildContext.make(memoryInput(entry, [{
          name: "cancel-gate",
          setup(build) {
            build.onLoad({ filter: /cancel-entry\.ts$/ }, async () => {
              if (delay) {
                entered();
                await gate;
              }
              return { contents: 'export const after = "cancel";', loader: "ts" };
            });
          },
        }]));
        const active = yield* Effect.forkChild(Effect.exit(context.rebuild));
        yield* Effect.promise(() => enteredPromise);
        const cancelFiber = yield* Effect.forkChild(context.cancel);
        yield* Effect.promise(() => new Promise((resolveTick) => setTimeout(resolveTick, 25)));
        releaseGate();
        yield* Fiber.join(cancelFiber);
        const canceled = yield* Fiber.join(active);
        expect(Exit.isFailure(canceled)).toBe(true);
        const failure = failureOf(canceled) as EsbuildContext.ContextError;
        expect(failure._tag).toBe("EsbuildFailed");
        expect(failure.operation).toBe("rebuild");
        delay = false;
        const recovered = yield* context.rebuild;
        return recovered.outputFiles.length;
      }),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) expect(exit.value).toBe(1);
  });

  it("hides dispose, releases exactly once at Scope close, and rejects post-dispose methods", async () => {
    const entry = join(root, "dispose-entry.ts");
    await writeFile(entry, 'export const scoped = "owner";\n');
    let disposeObserved = 0;
    let leaked: EsbuildContext.Context | undefined;
    const exit = await runScoped(
      Effect.gen(function*() {
        const context = yield* EsbuildContext.make(memoryInput(entry, [{
          name: "dispose-observer",
          setup(build) {
            build.onDispose(() => {
              disposeObserved += 1;
            });
          },
        }]));
        leaked = context as EsbuildContext.Context;
        expect("dispose" in context).toBe(false);
        const result = yield* context.rebuild;
        return result.outputFiles.length;
      }),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    await waitFor(() => disposeObserved === 1, "Scope close did not dispose the native context exactly once");
    const postDispose = await Effect.runPromiseExit(Effect.exit(leaked!.rebuild));
    expect(Exit.isSuccess(postDispose)).toBe(true);
    if (Exit.isSuccess(postDispose)) {
      const failure = failureOf(postDispose.value) as EsbuildContext.ContextError;
      expect(failure._tag).toBe("EsbuildFailed");
      expect(failure.operation).toBe("rebuild");
    }
    const postWatch = await Effect.runPromiseExit(leaked!.watch());
    const postServe = await Effect.runPromiseExit(leaked!.serve({ port: 0 }));
    expect(Exit.isFailure(postWatch)).toBe(true);
    expect(Exit.isFailure(postServe)).toBe(true);
    expect((failureOf(postWatch) as EsbuildContext.ContextError)._tag).toBe("EsbuildFailed");
    expect((failureOf(postServe) as EsbuildContext.ContextError)._tag).toBe("EsbuildFailed");
  });

  it("finalization does not await delayed async onDispose work, which still completes later", async () => {
    const entry = join(root, "delayed-cleanup-entry.ts");
    await writeFile(entry, 'export const cleanup = "delayed";\n');
    let cleanupStarted = false;
    let cleanupFinished = false;
    let releaseCleanup!: () => void;
    const cleanupGate = new Promise<void>((resolveRelease) => {
      releaseCleanup = resolveRelease;
    });
    const exit = await runScoped(
      Effect.gen(function*() {
        const context = yield* EsbuildContext.make(memoryInput(entry, [{
          name: "delayed-cleanup",
          setup(build) {
            build.onDispose(async () => {
              cleanupStarted = true;
              await cleanupGate;
              cleanupFinished = true;
            });
          },
        }]));
        const result = yield* context.rebuild;
        return result.outputFiles.length;
      }),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    await waitFor(() => cleanupStarted, "native dispose did not schedule the delayed plugin cleanup");
    expect(cleanupFinished).toBe(false);
    releaseCleanup();
    await waitFor(() => cleanupFinished, "delayed plugin cleanup never finished");
  });
});
