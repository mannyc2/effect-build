import { Cause, Clock, Effect, Exit, Fiber, Queue, Schema, type Scope, Semaphore, Stream } from "effect";

export const protocol = "effect-build/profile/typed-watch@1" as const;

export type MatchMode = "exact" | "subtree";

export interface WatchEntry {
  readonly path: string;
  readonly mode: MatchMode;
}

export interface WatchSet {
  /** Product/adapter-owned dependencies. The loop never guesses a provider graph. */
  readonly inputs: readonly WatchEntry[];
  /** Product/adapter-owned output boundaries, filtered before input matching. */
  readonly outputs: readonly WatchEntry[];
}

export interface Created {
  readonly _tag: "Created";
  readonly path: string;
}

export interface Modified {
  readonly _tag: "Modified";
  readonly path: string;
}

export interface Removed {
  readonly _tag: "Removed";
  readonly path: string;
}

export interface Renamed {
  readonly _tag: "Renamed";
  readonly from: string;
  readonly to: string;
}

export type Change = Created | Modified | Removed | Renamed;

export interface Trigger {
  readonly sourceId: string;
  /** Contiguous sequence owned by the selected host-event adapter. */
  readonly sequence: number;
  readonly changes: readonly Change[];
}

export interface Limits {
  readonly maxWatchEntries: number;
  readonly maxPendingChanges: number;
  readonly maxPendingTriggers: number;
  readonly eventBuffer: number;
}

export interface Configuration {
  readonly sourceId: string;
  readonly initialWatchSet: WatchSet;
  readonly limits: Limits;
}

export type BuildBatch =
  | {
    readonly _tag: "Initial";
    readonly coalescedTriggers: 0;
    readonly changes: readonly [];
  }
  | {
    readonly _tag: "Changes";
    readonly coalescedTriggers: number;
    readonly changes: readonly Change[];
  };

export interface BuildRequest {
  readonly protocol: typeof protocol;
  readonly cycle: number;
  readonly watchSetRevision: number;
  readonly watchSet: WatchSet;
  readonly batch: BuildBatch;
}

export interface BuildSuccess<Result> {
  readonly result: Result;
  /** Explicit dependency/output authority for subsequent triggers. */
  readonly watchSet: WatchSet;
}

export type Build<Result, Failure, Requirements = never> = (
  request: BuildRequest,
) => Effect.Effect<BuildSuccess<Result>, Failure, Requirements>;

export class TypedWatchClosed extends Schema.TaggedError<TypedWatchClosed>()("TypedWatchClosed", {}) {}

export class WatchConfigurationRejected extends Schema.TaggedError<WatchConfigurationRejected>()(
  "WatchConfigurationRejected",
  { reason: Schema.String },
) {}

export class WatchTriggerRejected extends Schema.TaggedError<WatchTriggerRejected>()(
  "WatchTriggerRejected",
  { sequence: Schema.Number, reason: Schema.String },
) {}

export type SubmitDisposition =
  | {
    readonly _tag: "Queued";
    readonly sequence: number;
    readonly relevantChanges: number;
    readonly ignoredChanges: number;
  }
  | {
    readonly _tag: "Ignored";
    readonly sequence: number;
    readonly reason: "output" | "unwatched";
  };

export interface BuildStarted {
  readonly _tag: "BuildStarted";
  readonly cycle: number;
  readonly watchSetRevision: number;
  readonly batch: BuildBatch;
  readonly startedAtMillis: number;
}

export interface BuildSucceeded<Result> {
  readonly _tag: "BuildSucceeded";
  readonly cycle: number;
  readonly watchSetRevision: number;
  readonly result: Result;
  readonly watchSet: WatchSet;
  readonly durationMillis: number;
}

export interface BuildFailed<Failure> {
  readonly _tag: "BuildFailed";
  readonly cycle: number;
  readonly watchSetRevision: number;
  readonly error: Failure | WatchConfigurationRejected;
  readonly durationMillis: number;
}

export type Event<Result, Failure> = BuildStarted | BuildSucceeded<Result> | BuildFailed<Failure>;

export interface Handle<Result, Failure> {
  /** A single-consumer, bounded stream. Defects remain defects in its Cause. */
  readonly events: Stream.Stream<Event<Result, Failure>>;
  readonly submit: (
    trigger: Trigger,
  ) => Effect.Effect<SubmitDisposition, TypedWatchClosed | WatchTriggerRejected>;
}

interface Pending {
  readonly triggerCount: number;
  readonly changes: ReadonlyMap<string, Change>;
}

interface State {
  closed: boolean;
  lastSequence: number;
  nextCycle: number;
  watchSetRevision: number;
  watchSet: WatchSet;
  pending: Pending | undefined;
}

const portablePath = (path: string): boolean => {
  if (path.length === 0 || path.startsWith("/") || path.endsWith("/") || path.includes("\\") || path.includes("\0")) {
    return false;
  }
  const segments = path.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
};

const positiveSafeInteger = (value: number): boolean => Number.isSafeInteger(value) && value > 0;

const validateLimits = (limits: Limits): Effect.Effect<void, WatchConfigurationRejected> => {
  for (const [name, value] of Object.entries(limits)) {
    if (!positiveSafeInteger(value)) {
      return Effect.fail(new WatchConfigurationRejected({ reason: `${name} must be a positive safe integer` }));
    }
  }
  return Effect.void;
};

const entryKey = (entry: WatchEntry): string => `${entry.path}\0${entry.mode}`;

const normalizeEntries = (
  label: "input" | "output",
  entries: readonly WatchEntry[],
  maximum: number,
): Effect.Effect<readonly WatchEntry[], WatchConfigurationRejected> => {
  if (label === "input" && entries.length === 0) {
    return Effect.fail(new WatchConfigurationRejected({ reason: "the explicit input watch set must not be empty" }));
  }
  if (entries.length > maximum) {
    return Effect.fail(new WatchConfigurationRejected({ reason: `${label} watch set exceeds its configured bound` }));
  }
  const normalized: WatchEntry[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!portablePath(entry.path) || (entry.mode !== "exact" && entry.mode !== "subtree")) {
      return Effect.fail(new WatchConfigurationRejected({ reason: `invalid ${label} watch entry` }));
    }
    const copied = Object.freeze({ path: entry.path, mode: entry.mode });
    const key = entryKey(copied);
    if (seen.has(key)) {
      return Effect.fail(new WatchConfigurationRejected({ reason: `duplicate ${label} watch entry` }));
    }
    seen.add(key);
    normalized.push(copied);
  }
  normalized.sort((left, right) => entryKey(left).localeCompare(entryKey(right)));
  return Effect.succeed(Object.freeze(normalized));
};

const normalizeWatchSet = (
  set: WatchSet,
  limits: Limits,
): Effect.Effect<WatchSet, WatchConfigurationRejected> =>
  Effect.gen(function*() {
    const inputs = yield* normalizeEntries("input", set.inputs, limits.maxWatchEntries);
    const outputs = yield* normalizeEntries("output", set.outputs, limits.maxWatchEntries);
    return Object.freeze({ inputs, outputs });
  });

const normalizeChange = (change: Change): Effect.Effect<Change, WatchTriggerRejected> => {
  if (change._tag === "Renamed") {
    if (!portablePath(change.from) || !portablePath(change.to) || change.from === change.to) {
      return Effect.fail(new WatchTriggerRejected({ sequence: 0, reason: "invalid rename paths" }));
    }
    return Effect.succeed(Object.freeze({ _tag: "Renamed" as const, from: change.from, to: change.to }));
  }
  if (change._tag !== "Created" && change._tag !== "Modified" && change._tag !== "Removed") {
    return Effect.fail(new WatchTriggerRejected({ sequence: 0, reason: "unknown change kind" }));
  }
  if (!portablePath(change.path)) {
    return Effect.fail(new WatchTriggerRejected({ sequence: 0, reason: "invalid change path" }));
  }
  return Effect.succeed(Object.freeze({ _tag: change._tag, path: change.path }));
};

const changeKey = (change: Change): string =>
  change._tag === "Renamed"
    ? `${change._tag}\0${change.from}\0${change.to}`
    : `${change._tag}\0${change.path}`;

const pathsOf = (change: Change): readonly string[] =>
  change._tag === "Renamed" ? [change.from, change.to] : [change.path];

const matches = (entry: WatchEntry, path: string): boolean =>
  entry.mode === "exact" ? entry.path === path : path === entry.path || path.startsWith(`${entry.path}/`);

const touches = (entries: readonly WatchEntry[], change: Change): boolean =>
  pathsOf(change).some((path) => entries.some((entry) => matches(entry, path)));

const touchesPath = (entries: readonly WatchEntry[], path: string): boolean =>
  entries.some((entry) => matches(entry, path));

/** Removes only the output-owned side of a rename before input relevance is decided. */
const withoutOutputSide = (outputs: readonly WatchEntry[], change: Change): Change | undefined => {
  if (change._tag !== "Renamed") return touches(outputs, change) ? undefined : change;
  const fromOutput = touchesPath(outputs, change.from);
  const toOutput = touchesPath(outputs, change.to);
  if (fromOutput && toOutput) return undefined;
  if (fromOutput) return Object.freeze({ _tag: "Created" as const, path: change.to });
  if (toOutput) return Object.freeze({ _tag: "Removed" as const, path: change.from });
  return change;
};

const sameWatchSet = (left: WatchSet, right: WatchSet): boolean =>
  left.inputs.length === right.inputs.length
  && left.outputs.length === right.outputs.length
  && left.inputs.every((entry, index) => entryKey(entry) === entryKey(right.inputs[index]!))
  && left.outputs.every((entry, index) => entryKey(entry) === entryKey(right.outputs[index]!));

const toBatch = (pending: Pending): BuildBatch => {
  const changes = [...pending.changes.values()].sort((left, right) => changeKey(left).localeCompare(changeKey(right)));
  return Object.freeze({
    _tag: "Changes",
    coalescedTriggers: pending.triggerCount,
    changes: Object.freeze(changes),
  });
};

/**
 * Runs a product-owned one-shot build loop. Host adapters submit already-typed
 * filesystem observations; provider stdout and stderr are never inputs. The
 * current dependency set is changed only by a successful one-shot result.
 */
export const make = <Result, Failure, Requirements>(
  configuration: Configuration,
  build: Build<Result, Failure, Requirements>,
): Effect.Effect<Handle<Result, Failure>, WatchConfigurationRejected, Requirements | Scope.Scope> =>
  Effect.gen(function*() {
    yield* validateLimits(configuration.limits);
    if (configuration.sourceId.length === 0 || configuration.sourceId.includes("\0")) {
      return yield* new WatchConfigurationRejected({ reason: "trigger source identity must be non-empty" });
    }
    const sourceId = configuration.sourceId;
    const limits: Limits = Object.freeze({ ...configuration.limits });
    const initialWatchSet = yield* normalizeWatchSet(configuration.initialWatchSet, limits);
    const mutex = yield* Semaphore.make(1);
    const wake = yield* Queue.bounded<void>(1);
    const eventQueue = yield* Queue.bounded<Event<Result, Failure>, Cause.Done>(limits.eventBuffer);
    const state: State = {
      closed: false,
      lastSequence: 0,
      nextCycle: 2,
      watchSetRevision: 1,
      watchSet: initialWatchSet,
      pending: undefined,
    };
    const initialRequest: BuildRequest = Object.freeze({
      protocol,
      cycle: 1,
      watchSetRevision: 1,
      watchSet: initialWatchSet,
      batch: Object.freeze({ _tag: "Initial", coalescedTriggers: 0, changes: [] as const }),
    });

    const takePending = mutex.withPermit(
      Effect.sync(() => {
        const pending = state.pending;
        if (pending === undefined) return undefined;
        const request = Object.freeze({
          protocol,
          cycle: state.nextCycle,
          watchSetRevision: state.watchSetRevision,
          watchSet: state.watchSet,
          batch: toBatch(pending),
        });
        state.pending = undefined;
        state.nextCycle += 1;
        return request;
      }),
    );

    const runCycle = (request: BuildRequest): Effect.Effect<void, never, Requirements> =>
      Effect.gen(function*() {
        const startedAtMillis = yield* Clock.currentTimeMillis;
        yield* Queue.offer(
          eventQueue,
          Object.freeze({
            _tag: "BuildStarted" as const,
            cycle: request.cycle,
            watchSetRevision: request.watchSetRevision,
            batch: request.batch,
            startedAtMillis,
          }),
        );
        yield* build(request).pipe(
          Effect.flatMap((success) =>
            normalizeWatchSet(success.watchSet, limits).pipe(
              Effect.map((watchSet) => ({ success, watchSet })),
            )
          ),
          Effect.matchEffect({
            onFailure: (error) =>
              Clock.currentTimeMillis.pipe(
                Effect.flatMap((finishedAtMillis) =>
                  Queue.offer(
                    eventQueue,
                    Object.freeze({
                      _tag: "BuildFailed" as const,
                      cycle: request.cycle,
                      watchSetRevision: request.watchSetRevision,
                      error,
                      durationMillis: Math.max(0, finishedAtMillis - startedAtMillis),
                    }),
                  )
                ),
                Effect.asVoid,
              ),
            onSuccess: ({ success, watchSet }) =>
              Effect.gen(function*() {
                const watchSetRevision = yield* mutex.withPermit(
                  Effect.sync(() => {
                    if (!sameWatchSet(state.watchSet, watchSet)) state.watchSetRevision += 1;
                    state.watchSet = watchSet;
                    return state.watchSetRevision;
                  }),
                );
                const finishedAtMillis = yield* Clock.currentTimeMillis;
                yield* Queue.offer(
                  eventQueue,
                  Object.freeze({
                    _tag: "BuildSucceeded" as const,
                    cycle: request.cycle,
                    watchSetRevision,
                    result: success.result,
                    watchSet,
                    durationMillis: Math.max(0, finishedAtMillis - startedAtMillis),
                  }),
                );
              }),
          }),
        );
      });

    const loop: Effect.Effect<never, never, Requirements> = Effect.suspend(() =>
      Queue.take(wake).pipe(
        Effect.andThen(takePending),
        Effect.flatMap((request) => request === undefined ? Effect.void : runCycle(request)),
        Effect.andThen(loop),
      )
    );

    const worker = yield* runCycle(initialRequest).pipe(
      Effect.andThen(loop),
      Effect.onExit((exit) => {
        if (Exit.isSuccess(exit)) return Effect.void;
        if (state.closed && Cause.hasInterrupts(exit.cause)) return Effect.void;
        return mutex.withPermit(
          Effect.sync(() => {
            state.closed = true;
            state.pending = undefined;
          }),
        ).pipe(
          Effect.andThen(Queue.failCause(eventQueue, exit.cause)),
          Effect.ensuring(Queue.shutdown(wake)),
          Effect.asVoid,
        );
      }),
      Effect.forkScoped({ startImmediately: true }),
    );

    yield* Effect.addFinalizer(() =>
      mutex.withPermit(Effect.sync(() => {
        state.closed = true;
        state.pending = undefined;
      })).pipe(
        Effect.andThen(Fiber.interrupt(worker)),
        Effect.andThen(Queue.end(eventQueue)),
        Effect.andThen(Queue.shutdown(wake)),
        Effect.asVoid,
      )
    );

    const submit = (trigger: Trigger): Effect.Effect<SubmitDisposition, TypedWatchClosed | WatchTriggerRejected> =>
      mutex.withPermit(
        Effect.gen(function*() {
          if (state.closed) return yield* new TypedWatchClosed();
          if (trigger.sourceId !== sourceId) {
            return yield* new WatchTriggerRejected({
              sequence: trigger.sequence,
              reason: "trigger source does not own this watch loop",
            });
          }
          if (!Number.isSafeInteger(trigger.sequence) || trigger.sequence !== state.lastSequence + 1) {
            return yield* new WatchTriggerRejected({
              sequence: trigger.sequence,
              reason: "trigger sequence must be contiguous",
            });
          }
          if (trigger.changes.length === 0) {
            return yield* new WatchTriggerRejected({ sequence: trigger.sequence, reason: "trigger batch is empty" });
          }
          if (trigger.changes.length > limits.maxPendingChanges) {
            return yield* new WatchTriggerRejected({
              sequence: trigger.sequence,
              reason: "trigger change bound exceeded",
            });
          }
          const unique = new Map<string, Change>();
          for (const candidate of trigger.changes) {
            const change = yield* normalizeChange(candidate).pipe(
              Effect.mapError((error) =>
                new WatchTriggerRejected({ sequence: trigger.sequence, reason: error.reason })
              ),
            );
            unique.set(changeKey(change), change);
          }
          const relevant = new Map<string, Change>();
          let outputChanges = 0;
          for (const change of unique.values()) {
            const projected = withoutOutputSide(state.watchSet.outputs, change);
            if (projected === undefined) {
              outputChanges += 1;
            } else if (touches(state.watchSet.inputs, projected)) {
              relevant.set(changeKey(projected), projected);
            }
          }
          if (relevant.size === 0) {
            state.lastSequence = trigger.sequence;
            return Object.freeze({
              _tag: "Ignored" as const,
              sequence: trigger.sequence,
              reason: outputChanges > 0 ? "output" as const : "unwatched" as const,
            });
          }
          const pending = state.pending ?? { triggerCount: 0, changes: new Map<string, Change>() };
          if (pending.triggerCount + 1 > limits.maxPendingTriggers) {
            return yield* new WatchTriggerRejected({
              sequence: trigger.sequence,
              reason: "pending trigger bound exceeded",
            });
          }
          const merged = new Map(pending.changes);
          for (const change of relevant.values()) merged.set(changeKey(change), change);
          if (merged.size > limits.maxPendingChanges) {
            return yield* new WatchTriggerRejected({
              sequence: trigger.sequence,
              reason: "pending change bound exceeded",
            });
          }
          const wasEmpty = state.pending === undefined;
          state.pending = Object.freeze({
            triggerCount: pending.triggerCount + 1,
            changes: merged,
          });
          state.lastSequence = trigger.sequence;
          if (wasEmpty) Queue.offerUnsafe(wake, undefined);
          return Object.freeze({
            _tag: "Queued" as const,
            sequence: trigger.sequence,
            relevantChanges: relevant.size,
            ignoredChanges: unique.size - relevant.size,
          });
        }),
      );

    return Object.freeze({ events: Stream.fromQueue(eventQueue), submit });
  });
