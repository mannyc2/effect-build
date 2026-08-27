import { Cause, Deferred, Effect, Exit, Fiber, Result, Scope, Stream } from "effect";
import { describe, expect, it } from "vitest";
import * as TypedWatch from "../../packages/effect-build/src/Profile/internal/TypedWatch.js";

const limits: TypedWatch.Limits = {
  maxWatchEntries: 16,
  maxPendingChanges: 16,
  maxPendingTriggers: 8,
  eventBuffer: 8,
};

const watchSet = (
  inputs: readonly TypedWatch.WatchEntry[],
  outputs: readonly TypedWatch.WatchEntry[] = [{ path: "dist", mode: "subtree" }],
): TypedWatch.WatchSet => ({ inputs, outputs });

const configuration = (initialWatchSet: TypedWatch.WatchSet): TypedWatch.Configuration => ({
  sourceId: "fixture-host-events",
  initialWatchSet,
  limits,
});

const take = <Result, Failure>(
  handle: TypedWatch.Handle<Result, Failure>,
  count: number,
): Effect.Effect<readonly TypedWatch.Event<Result, Failure>[]> =>
  handle.events.pipe(Stream.take(count), Stream.runCollect);

const failureOf = <A, E>(exit: Exit.Exit<A, E>): E => {
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isSuccess(exit)) throw new Error("expected failure");
  const failure = Cause.findErrorOption(exit.cause);
  expect(failure._tag).toBe("Some");
  if (failure._tag === "None") throw new Error("expected typed failure");
  return failure.value;
};

describe("package-private product-owned TypedWatch candidate", () => {
  it("filters output self-triggers and coalesces dirty-during-build changes into one bounded batch", async () => {
    const events = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const releaseInitial = yield* Deferred.make<void>();
          const handle = yield* TypedWatch.make(
            configuration(watchSet([{ path: "src", mode: "subtree" }])),
            (request) =>
              (request.cycle === 1 ? Deferred.await(releaseInitial) : Effect.void).pipe(
                Effect.as({ result: `cycle-${request.cycle}`, watchSet: request.watchSet }),
              ),
          );
          const started = yield* take(handle, 1);
          const output = yield* handle.submit({
            sourceId: "fixture-host-events",
            sequence: 1,
            changes: [{ _tag: "Modified", path: "dist/app.js" }],
          });
          const first = yield* handle.submit({
            sourceId: "fixture-host-events",
            sequence: 2,
            changes: [{ _tag: "Modified", path: "src/a.ts" }],
          });
          const second = yield* handle.submit({
            sourceId: "fixture-host-events",
            sequence: 3,
            changes: [
              { _tag: "Removed", path: "src/old.ts" },
              { _tag: "Modified", path: "src/a.ts" },
            ],
          });
          yield* Deferred.succeed(releaseInitial, undefined);
          const remaining = yield* take(handle, 3);
          return { events: [...started, ...remaining], output, first, second };
        }),
      ),
    );

    expect(events.output).toEqual({ _tag: "Ignored", sequence: 1, reason: "output" });
    expect(events.first._tag).toBe("Queued");
    expect(events.second._tag).toBe("Queued");
    expect(events.events.map(({ _tag }) => _tag)).toEqual([
      "BuildStarted",
      "BuildSucceeded",
      "BuildStarted",
      "BuildSucceeded",
    ]);
    const rebuilt = events.events[2];
    expect(rebuilt?._tag).toBe("BuildStarted");
    if (rebuilt?._tag === "BuildStarted") {
      expect(rebuilt.batch._tag).toBe("Changes");
      if (rebuilt.batch._tag === "Changes") {
        expect(rebuilt.batch.coalescedTriggers).toBe(2);
        expect(rebuilt.batch.changes).toEqual([
          { _tag: "Modified", path: "src/a.ts" },
          { _tag: "Removed", path: "src/old.ts" },
        ]);
      }
    }
  });

  it("reprojects bounded in-flight changes after a successful dependency update", async () => {
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const releaseInitial = yield* Deferred.make<void>();
          const handle = yield* TypedWatch.make(
            {
              sourceId: "fixture-host-events",
              initialWatchSet: watchSet([{ path: "src/entry.ts", mode: "exact" }]),
              limits: { ...limits, maxPendingChanges: 1, maxPendingTriggers: 2 },
            },
            (request) =>
              (request.cycle === 1 ? Deferred.await(releaseInitial) : Effect.void).pipe(
                Effect.as({
                  result: request.cycle,
                  watchSet: request.cycle === 1
                    ? watchSet([
                      { path: "src/entry.ts", mode: "exact" },
                      { path: "src/new-dependency.ts", mode: "exact" },
                    ])
                    : request.watchSet,
                }),
              ),
          );
          const started = yield* take(handle, 1);
          const retained = yield* handle.submit({
            sourceId: "fixture-host-events",
            sequence: 1,
            changes: [{ _tag: "Modified", path: "src/new-dependency.ts" }],
          });
          const overflow = yield* Effect.exit(handle.submit({
            sourceId: "fixture-host-events",
            sequence: 2,
            changes: [{ _tag: "Modified", path: "src/another-dependency.ts" }],
          }));
          yield* Deferred.succeed(releaseInitial, undefined);
          const trailing = yield* take(handle, 3);
          return { started, retained, overflow, trailing };
        }),
      ),
    );

    expect(result.started.map(({ _tag }) => _tag)).toEqual(["BuildStarted"]);
    expect(result.retained).toEqual({ _tag: "Ignored", sequence: 1, reason: "unwatched" });
    const overflow = failureOf(result.overflow);
    expect(overflow).toBeInstanceOf(TypedWatch.WatchTriggerRejected);
    if (overflow instanceof TypedWatch.WatchTriggerRejected) {
      expect(overflow.reason).toBe("pending change bound exceeded");
    }
    expect(result.trailing.map(({ _tag }) => _tag)).toEqual([
      "BuildSucceeded",
      "BuildStarted",
      "BuildSucceeded",
    ]);
    const rebuilt = result.trailing[1];
    expect(rebuilt?._tag).toBe("BuildStarted");
    if (rebuilt?._tag === "BuildStarted") {
      expect(rebuilt.watchSetRevision).toBe(2);
      expect(rebuilt.batch).toEqual({
        _tag: "Changes",
        coalescedTriggers: 1,
        changes: [{ _tag: "Modified", path: "src/new-dependency.ts" }],
      });
    }
  });

  it("reprojects an in-flight old output when the successful watch set makes it an input", async () => {
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const releaseInitial = yield* Deferred.make<void>();
          const handle = yield* TypedWatch.make(
            configuration(
              watchSet(
                [{ path: "src/entry.ts", mode: "exact" }],
                [{ path: "generated", mode: "subtree" }],
              ),
            ),
            (request) =>
              (request.cycle === 1 ? Deferred.await(releaseInitial) : Effect.void).pipe(
                Effect.as({
                  result: request.cycle,
                  watchSet: request.cycle === 1
                    ? watchSet(
                      [
                        { path: "generated/data.json", mode: "exact" },
                        { path: "src/entry.ts", mode: "exact" },
                      ],
                      [{ path: "dist", mode: "subtree" }],
                    )
                    : request.watchSet,
                }),
              ),
          );
          yield* take(handle, 1);
          const disposition = yield* handle.submit({
            sourceId: "fixture-host-events",
            sequence: 1,
            changes: [{ _tag: "Modified", path: "generated/data.json" }],
          });
          yield* Deferred.succeed(releaseInitial, undefined);
          const trailing = yield* take(handle, 3);
          return { disposition, trailing };
        }),
      ),
    );

    expect(result.disposition).toEqual({ _tag: "Ignored", sequence: 1, reason: "output" });
    expect(result.trailing.map(({ _tag }) => _tag)).toEqual([
      "BuildSucceeded",
      "BuildStarted",
      "BuildSucceeded",
    ]);
    const rebuilt = result.trailing[1];
    expect(rebuilt?._tag).toBe("BuildStarted");
    if (rebuilt?._tag === "BuildStarted") {
      expect(rebuilt.batch).toEqual({
        _tag: "Changes",
        coalescedTriggers: 1,
        changes: [{ _tag: "Modified", path: "generated/data.json" }],
      });
    }
  });

  it("normalizes rename boundaries before applying input relevance", async () => {
    const batches = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const handle = yield* TypedWatch.make(
            configuration(watchSet([{ path: "src", mode: "subtree" }])),
            (request) => Effect.succeed({ result: request.cycle, watchSet: request.watchSet }),
          );
          yield* take(handle, 2);

          const drive = (sequence: number, change: TypedWatch.Change) =>
            Effect.gen(function*() {
              const disposition = yield* handle.submit({
                sourceId: "fixture-host-events",
                sequence,
                changes: [change],
              });
              if (disposition._tag === "Ignored") return { disposition, batch: undefined } as const;
              const events = yield* take(handle, 2);
              const started = events[0];
              if (started?._tag !== "BuildStarted" || started.batch._tag !== "Changes") {
                return yield* Effect.die("expected a change-driven build");
              }
              return { disposition, batch: started.batch } as const;
            });

          const intoOutput = yield* drive(1, { _tag: "Renamed", from: "src/a.ts", to: "dist/a.js" });
          const fromOutput = yield* drive(2, { _tag: "Renamed", from: "dist/b.js", to: "src/b.ts" });
          const insideOutput = yield* drive(3, { _tag: "Renamed", from: "dist/b.js", to: "dist/c.js" });
          const insideInput = yield* drive(4, { _tag: "Renamed", from: "src/b.ts", to: "src/c.ts" });
          return { intoOutput, fromOutput, insideOutput, insideInput };
        }),
      ),
    );

    expect(batches.intoOutput.batch?.changes).toEqual([{ _tag: "Removed", path: "src/a.ts" }]);
    expect(batches.fromOutput.batch?.changes).toEqual([{ _tag: "Created", path: "src/b.ts" }]);
    expect(batches.insideOutput).toEqual({
      disposition: { _tag: "Ignored", sequence: 3, reason: "output" },
      batch: undefined,
    });
    expect(batches.insideInput.batch?.changes).toEqual([
      { _tag: "Renamed", from: "src/b.ts", to: "src/c.ts" },
    ]);
  });

  it("recovers after typed build failure and changes dependency authority only after success", async () => {
    const buildFailure = { _tag: "FixtureBuildFailed" as const, cycle: 2 };
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const handle = yield* TypedWatch.make(
            configuration(watchSet([{ path: "src/a.ts", mode: "exact" }])),
            (request) => {
              if (request.cycle === 2) return Effect.fail(buildFailure);
              return Effect.succeed({
                result: request.cycle,
                watchSet: request.cycle >= 3
                  ? watchSet([{ path: "src/b.ts", mode: "exact" }])
                  : request.watchSet,
              });
            },
          );
          const initial = yield* take(handle, 2);
          yield* handle.submit({
            sourceId: "fixture-host-events",
            sequence: 1,
            changes: [{ _tag: "Modified", path: "src/a.ts" }],
          });
          const failed = yield* take(handle, 2);
          yield* handle.submit({
            sourceId: "fixture-host-events",
            sequence: 2,
            changes: [{ _tag: "Renamed", from: "src/a.ts", to: "src/a-next.ts" }],
          });
          const recovered = yield* take(handle, 2);
          const stale = yield* handle.submit({
            sourceId: "fixture-host-events",
            sequence: 3,
            changes: [{ _tag: "Removed", path: "src/a.ts" }],
          });
          const current = yield* handle.submit({
            sourceId: "fixture-host-events",
            sequence: 4,
            changes: [{ _tag: "Created", path: "src/b.ts" }],
          });
          const afterUpdate = yield* take(handle, 2);
          return { initial, failed, recovered, stale, current, afterUpdate };
        }),
      ),
    );

    expect(result.initial.map(({ _tag }) => _tag)).toEqual(["BuildStarted", "BuildSucceeded"]);
    expect(result.failed.map(({ _tag }) => _tag)).toEqual(["BuildStarted", "BuildFailed"]);
    const failure = result.failed[1];
    expect(failure?._tag).toBe("BuildFailed");
    if (failure?._tag === "BuildFailed") expect(failure.error).toBe(buildFailure);
    expect(result.recovered.map(({ _tag }) => _tag)).toEqual(["BuildStarted", "BuildSucceeded"]);
    expect(result.stale).toEqual({ _tag: "Ignored", sequence: 3, reason: "unwatched" });
    expect(result.current._tag).toBe("Queued");
    expect(result.afterUpdate.map(({ _tag }) => _tag)).toEqual(["BuildStarted", "BuildSucceeded"]);
  });

  it("rejects oversized trigger and pending state without consuming trigger authority", async () => {
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const releaseInitial = yield* Deferred.make<void>();
          const handle = yield* TypedWatch.make(
            {
              sourceId: "bounded-source",
              initialWatchSet: watchSet([{ path: "src", mode: "subtree" }]),
              limits: { ...limits, maxPendingChanges: 1, maxPendingTriggers: 1 },
            },
            (request) =>
              (request.cycle === 1 ? Deferred.await(releaseInitial) : Effect.void).pipe(
                Effect.as({ result: request.cycle, watchSet: request.watchSet }),
              ),
          );
          yield* take(handle, 1);
          const oversized = yield* Effect.exit(handle.submit({
            sourceId: "bounded-source",
            sequence: 1,
            changes: [
              { _tag: "Modified", path: "src/a.ts" },
              { _tag: "Modified", path: "src/b.ts" },
            ],
          }));
          const acceptedRetry = yield* handle.submit({
            sourceId: "bounded-source",
            sequence: 1,
            changes: [{ _tag: "Modified", path: "src/a.ts" }],
          });
          const pendingOverflow = yield* Effect.exit(handle.submit({
            sourceId: "bounded-source",
            sequence: 2,
            changes: [{ _tag: "Modified", path: "src/b.ts" }],
          }));
          yield* Deferred.succeed(releaseInitial, undefined);
          yield* take(handle, 3);
          return { oversized, acceptedRetry, pendingOverflow };
        }),
      ),
    );

    expect(failureOf(result.oversized)).toBeInstanceOf(TypedWatch.WatchTriggerRejected);
    expect(result.acceptedRetry).toEqual({
      _tag: "Queued",
      sequence: 1,
      relevantChanges: 1,
      ignoredChanges: 0,
    });
    expect(failureOf(result.pendingOverflow)).toBeInstanceOf(TypedWatch.WatchTriggerRejected);
  });

  it("interrupts active one-shot work on Scope close without fabricating a typed failure event", async () => {
    let interrupted = false;
    let leaked: TypedWatch.Handle<never, never> | undefined;
    const result = await Effect.runPromise(
      Effect.gen(function*() {
        const owner = yield* Scope.make();
        const handle = yield* TypedWatch.make<never, never, never>(
          configuration(watchSet([{ path: "src", mode: "subtree" }])),
          () =>
            Effect.never.pipe(Effect.ensuring(Effect.sync(() => {
              interrupted = true;
            }))),
        ).pipe(Scope.provide(owner));
        leaked = handle;
        const started = yield* take(handle, 1);
        yield* Scope.close(owner, Exit.void);
        const trailing = yield* Stream.runCollect(handle.events);
        const afterClose = yield* Effect.exit(handle.submit({
          sourceId: "fixture-host-events",
          sequence: 1,
          changes: [{ _tag: "Modified", path: "src/a.ts" }],
        }));
        return { started, trailing, afterClose };
      }),
    );

    expect(result.started.map(({ _tag }) => _tag)).toEqual(["BuildStarted"]);
    expect(result.trailing).toEqual([]);
    expect(failureOf(result.afterClose)).toBeInstanceOf(TypedWatch.TypedWatchClosed);
    expect(interrupted).toBe(true);
    expect(leaked).toBeDefined();
  });

  it("preserves a finalizer defect combined with Scope-close interruption in the event Cause", async () => {
    const defect = new Error("fixture finalizer defect");
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const owner = yield* Scope.make();
          const releaseBuild = yield* Deferred.make<void>();
          const mixedCause = Cause.combine(Cause.interrupt(123), Cause.die(defect));
          const handle = yield* TypedWatch.make<never, never, never>(
            configuration(watchSet([{ path: "src", mode: "subtree" }])),
            () =>
              Effect.uninterruptible(
                Deferred.await(releaseBuild).pipe(Effect.andThen(Effect.failCause(mixedCause))),
              ),
          ).pipe(Scope.provide(owner));
          const started = yield* take(handle, 1);
          const closeFiber = yield* Scope.close(owner, Exit.void).pipe(
            Effect.forkScoped({ startImmediately: true }),
          );
          const afterClose = yield* Effect.exit(handle.submit({
            sourceId: "fixture-host-events",
            sequence: 1,
            changes: [{ _tag: "Modified", path: "src/a.ts" }],
          }));
          yield* Deferred.succeed(releaseBuild, undefined);
          const closeExit = yield* Fiber.await(closeFiber);
          const eventsExit = yield* Effect.exit(Stream.runCollect(handle.events));
          return { started, closeExit, eventsExit, afterClose };
        }),
      ),
    );

    expect(result.started.map(({ _tag }) => _tag)).toEqual(["BuildStarted"]);
    expect(Exit.isSuccess(result.closeExit)).toBe(true);
    expect(Exit.isFailure(result.eventsExit)).toBe(true);
    if (Exit.isFailure(result.eventsExit)) {
      expect(Cause.hasInterrupts(result.eventsExit.cause)).toBe(true);
      expect(Cause.hasInterruptsOnly(result.eventsExit.cause)).toBe(false);
      const observed = Cause.findDefect(result.eventsExit.cause);
      expect(Result.isSuccess(observed)).toBe(true);
      if (Result.isSuccess(observed)) expect(observed.success).toBe(defect);
    }
    expect(failureOf(result.afterClose)).toBeInstanceOf(TypedWatch.TypedWatchClosed);
  });

  it("preserves build defects in the event Cause and permanently closes trigger admission", async () => {
    const defect = new Error("fixture build defect");
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const handle = yield* TypedWatch.make(
            configuration(watchSet([{ path: "src", mode: "subtree" }])),
            () => Effect.die(defect),
          );
          const eventsExit = yield* Effect.exit(Stream.runCollect(handle.events));
          const afterDefect = yield* Effect.exit(handle.submit({
            sourceId: "fixture-host-events",
            sequence: 1,
            changes: [{ _tag: "Modified", path: "src/a.ts" }],
          }));
          return { eventsExit, afterDefect };
        }),
      ),
    );

    expect(Exit.isFailure(result.eventsExit)).toBe(true);
    if (Exit.isFailure(result.eventsExit)) {
      const observed = Cause.findDefect(result.eventsExit.cause);
      expect(Result.isSuccess(observed)).toBe(true);
      if (Result.isSuccess(observed)) expect(observed.success).toBe(defect);
      expect(Cause.findErrorOption(result.eventsExit.cause)._tag).toBe("None");
    }
    expect(failureOf(result.afterDefect)).toBeInstanceOf(TypedWatch.TypedWatchClosed);
  });
});
