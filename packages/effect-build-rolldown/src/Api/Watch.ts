import { Cause, Effect, Queue, Stream } from "effect";
import type * as rolldown from "rolldown";
import { watch as nativeWatch } from "rolldown";
import { RolldownFailed } from "../internal/error.js";

export { RolldownFailed } from "../internal/error.js";

type Completed = Extract<rolldown.RolldownWatcherEvent, { code: "BUNDLE_END" | "ERROR" }>;

export type DirectOptions = Omit<rolldown.WatchOptions, "watch"> & {
  readonly watch?: NonNullable<rolldown.WatchOptions["watch"]> & { readonly skipWrite?: false };
};

export type MemoryOptions = Omit<rolldown.WatchOptions, "watch"> & {
  readonly watch: NonNullable<rolldown.WatchOptions["watch"]> & { readonly skipWrite: true };
};

export type DirectEvent =
  | {
    readonly code: "BUNDLE_END";
    readonly duration: number;
    readonly output: readonly string[];
    readonly superseded: number;
  }
  | { readonly code: "ERROR"; readonly error: Error; readonly superseded: number };

export type SkipWriteEvent = DirectEvent;

type UncountedEvent =
  | { readonly code: "BUNDLE_END"; readonly duration: number; readonly output: readonly string[] }
  | { readonly code: "ERROR"; readonly error: Error };

const events = (
  options: rolldown.WatchOptions,
  consume: (event: Completed) => Promise<UncountedEvent>,
): Stream.Stream<DirectEvent, RolldownFailed> =>
  Stream.callback<DirectEvent, RolldownFailed>(
    (queue) =>
      Effect.acquireRelease(
        Effect.try({
          try: () => {
            const watcher = nativeWatch(options);
            let superseded = 0;
            let listenerFailure: unknown;
            let listenerChain = Promise.resolve();
            const listener = (event: rolldown.RolldownWatcherEvent): Promise<void> => {
              if (event.code !== "BUNDLE_END" && event.code !== "ERROR") return listenerChain;
              listenerChain = listenerChain.then(async () => {
                try {
                  const value = await consume(event);
                  const next = Queue.sizeUnsafe(queue) === 0 ? 0 : superseded + 1;
                  superseded = next;
                  Queue.offerUnsafe(queue, { ...value, superseded: next });
                } catch (cause) {
                  listenerFailure = cause;
                  Queue.failCauseUnsafe(queue, Cause.die(cause));
                }
              });
              return listenerChain;
            };
            watcher.on("event", listener);
            return { watcher, listener, listenerChain: () => listenerChain, listenerFailure: () => listenerFailure };
          },
          catch: (cause) => new RolldownFailed({ operation: "watch", cause }),
        }),
        ({ watcher, listener, listenerChain, listenerFailure }) =>
          Effect.uninterruptible(
            Effect.promise(async () => {
              watcher.off("event", listener);
              await listenerChain();
              let closeFailure: unknown;
              try {
                await watcher.close();
              } catch (cause) {
                closeFailure = cause;
              }
              const callbackFailure = listenerFailure();
              if (callbackFailure !== undefined && closeFailure !== undefined) {
                throw new AggregateError([callbackFailure, closeFailure], "rolldown watch cleanup failed");
              }
              if (callbackFailure !== undefined) throw callbackFailure;
              if (closeFailure !== undefined) throw closeFailure;
            }),
          ),
      ).pipe(Effect.catchCause((cause) => Queue.failCause(queue, cause))),
    { bufferSize: 1, strategy: "sliding" },
  );

const closeResult = async (event: Completed): Promise<void> => event.result.close();

/** Repeated provider-direct writes; result handles are closed before metadata delivery. */
export const direct = (options: DirectOptions): Stream.Stream<DirectEvent, RolldownFailed> =>
  events(options, async (event) => {
    await closeResult(event);
    return event.code === "BUNDLE_END"
      ? { code: "BUNDLE_END", duration: event.duration, output: event.output }
      : { code: "ERROR", error: event.error };
  });

/**
 * Repeated builds with native writes disabled. Rolldown 1.2.5 exposes only
 * `close` on watcher result handles, so this operation truthfully delivers
 * completion metadata rather than inventing unavailable in-memory output.
 */
export const skipWrite = (options: MemoryOptions): Stream.Stream<SkipWriteEvent, RolldownFailed> =>
  events(options, async (event) => {
    await closeResult(event);
    return event.code === "BUNDLE_END"
      ? { code: "BUNDLE_END", duration: event.duration, output: event.output }
      : { code: "ERROR", error: event.error };
  });
