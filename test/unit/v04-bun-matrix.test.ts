import { Cause, Effect, Exit, Fiber, Result } from "effect";
import { describe, expect, it } from "vitest";
import { runMatrix } from "../../packages/effect-build-bun/src/internal/v04/matrix.js";
import * as CoreMatrix from "../../packages/effect-build/src/Matrix.js";

describe("staged 0.4 Bun matrix laws", () => {
  it("rejects invalid outer inputs with only Core Matrix.InvalidInput", async () => {
    for (
      const value of [
        null,
        {},
        { inputs: [], concurrency: 1 },
        { inputs: [1], concurrency: 0 },
        { inputs: [1], concurrency: 1, extra: true },
      ]
    ) {
      const exit = await Effect.runPromiseExit(
        runMatrix(value as unknown as CoreMatrix.Input<number>, Effect.succeed),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const failure = Cause.findErrorOption(exit.cause);
        expect(failure._tag).toBe("Some");
        if (failure._tag === "Some") expect(failure.value._tag).toBe("InvalidInput");
      }
    }
  });

  it("invokes scalar exactly once per cell, bounds concurrency, and reports in input order", async () => {
    const counts = new Map<number, number>();
    let active = 0;
    let maximum = 0;
    const report = await Effect.runPromise(
      runMatrix(
        { inputs: [0, 1, 2, 3] as const, concurrency: 2 },
        (value) =>
          Effect.promise(async () => {
            counts.set(value, (counts.get(value) ?? 0) + 1);
            active += 1;
            maximum = Math.max(maximum, active);
            await new Promise((resolveDelay) => setTimeout(resolveDelay, (3 - value) * 10));
            active -= 1;
            return `artifact-${value}`;
          }),
      ),
    );
    expect(maximum).toBe(2);
    expect([...counts.values()]).toEqual([1, 1, 1, 1]);
    expect(report).toMatchObject({ provider: "bun", operation: "compileExecutable", rollback: "none" });
    expect(report.cells.map(({ identity }) => identity.index)).toEqual([0, 1, 2, 3]);
    expect(report.cells.map(({ _tag }) => _tag)).toEqual(["Success", "Success", "Success", "Success"]);
  });

  it("captures pure typed failures as cells and keeps earlier commits durable", async () => {
    const commits: number[] = [];
    const failure = { _tag: "ToolFailed" as const, exitCode: 9 };
    const report = await Effect.runPromise(
      runMatrix(
        { inputs: [0, 1, 2] as const, concurrency: 1 },
        (value) =>
          value === 1
            ? Effect.fail(failure)
            : Effect.sync(() => {
              commits.push(value);
              return `artifact-${value}`;
            }),
      ),
    );
    expect(report.cells.map(({ _tag }) => _tag)).toEqual(["Success", "Failure", "Success"]);
    expect(report.cells[1]).toEqual({
      _tag: "Failure",
      identity: { provider: "bun", operation: "compileExecutable", index: 1 },
      error: failure,
    });
    expect(commits).toEqual([0, 2]);
  });

  it("re-fails defects as Cause instead of converting them to typed cells", async () => {
    const defect = new Error("matrix-defect");
    const exit = await Effect.runPromiseExit(
      runMatrix(
        { inputs: [0, 1] as const, concurrency: 1 },
        (value) => value === 0 ? Effect.succeed("ok") : Effect.die(defect),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = Cause.findDefect(exit.cause);
      expect(Result.isSuccess(found)).toBe(true);
      if (Result.isSuccess(found)) expect(found.success).toBe(defect);
    }
  });

  it("preserves interruption and suppresses queued starts", async () => {
    const started: number[] = [];
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolveGate) => {
      release = resolveGate;
    });
    const firstStarted = new Promise<void>((resolveStarted) => {
      entered = resolveStarted;
    });
    const effect = runMatrix(
      { inputs: [0, 1, 2, 3] as const, concurrency: 1 },
      (value) =>
        Effect.promise(async () => {
          started.push(value);
          if (value === 0) {
            entered();
            await gate;
          }
          return value;
        }),
    );
    const fiber = Effect.runFork(effect);
    await firstStarted;
    await Effect.runPromise(Fiber.interrupt(fiber));
    const exit = await Effect.runPromise(Fiber.await(fiber));
    release();
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) expect(Cause.hasInterrupts(exit.cause)).toBe(true);
    expect(started).toEqual([0]);
  });
});
