import { Cause, Deferred, Effect, Exit, Fiber } from "effect";
import { access, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as Matrix from "../../packages/effect-build/src/Matrix.js";

const exists = (path: string): Promise<boolean> => access(path).then(() => true, () => false);

describe("M2/R7 independently committing matrix laws", () => {
  it("returns input-ordered Success/Failure cells with bounded exactly-once scalar calls", async () => {
    let active = 0;
    let maximum = 0;
    const calls = new Map<number, number>();
    const report = await Effect.runPromise(
      Matrix.run(
        { provider: "fixture", inputs: [0, 1, 2, 3, 4, 5], concurrency: 2 },
        (input) =>
          Effect.acquireUseRelease(
            Effect.sync(() => {
              active += 1;
              maximum = Math.max(maximum, active);
              calls.set(input, (calls.get(input) ?? 0) + 1);
            }),
            () =>
              Effect.sleep("5 millis").pipe(
                Effect.andThen(input === 3 ? Effect.fail(`typed-${input}`) : Effect.succeed(input * 10)),
              ),
            () => Effect.sync(() => void (active -= 1)),
          ),
      ),
    );

    expect(maximum).toBe(2);
    expect([...calls.values()]).toEqual([1, 1, 1, 1, 1, 1]);
    expect(report.cells.map(({ identity }) => identity.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(report.cells.map(({ _tag }) => _tag)).toEqual([
      "Success",
      "Success",
      "Success",
      "Failure",
      "Success",
      "Success",
    ]);
    expect(report.rollback).toBe("none");
  });

  it("fails preflight before any scalar invocation for invalid concurrency", async () => {
    let calls = 0;
    const exit = await Effect.runPromiseExit(
      Matrix.run(
        { provider: "fixture", inputs: [1], concurrency: 0 },
        () => Effect.sync(() => ++calls),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(calls).toBe(0);
  });

  it("preserves defects as Cause and never fabricates a complete report", async () => {
    const exit = await Effect.runPromiseExit(
      Matrix.run(
        { provider: "fixture", inputs: [0, 1, 2], concurrency: 2 },
        (input) => input === 1 ? Effect.die("matrix-defect") : Effect.succeed(input),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) expect(Cause.hasDies(exit.cause)).toBe(true);
  });

  it("starts no queued cells after interruption and does not roll back committed siblings", async () => {
    const marker = join(tmpdir(), `effect-build-matrix-${process.pid}-${Date.now()}`);
    const started: number[] = [];
    const result = await Effect.runPromise(
      Effect.gen(function*() {
        const blocked = yield* Deferred.make<void>();
        const fiber = yield* Matrix.run(
          { provider: "fixture", inputs: [0, 1, 2], concurrency: 1 },
          (input) =>
            Effect.sync(() => started.push(input)).pipe(
              Effect.andThen(
                input === 0
                  ? Effect.promise(() => writeFile(marker, "committed")).pipe(Effect.as(input))
                  : input === 1
                  ? Deferred.succeed(blocked, undefined).pipe(Effect.andThen(Effect.never))
                  : Effect.succeed(input),
              ),
            ),
        ).pipe(Effect.forkChild({ startImmediately: true }));
        yield* Deferred.await(blocked);
        yield* Fiber.interrupt(fiber);
        return yield* Fiber.await(fiber);
      }),
    );

    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) expect(Cause.hasInterrupts(result.cause)).toBe(true);
    expect(started).toEqual([0, 1]);
    expect(await exists(marker)).toBe(true);
    expect(await readFile(marker, "utf8")).toBe("committed");
    await rm(marker, { force: true });
  });
});
