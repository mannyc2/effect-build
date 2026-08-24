import { Cause, Effect, Queue, Stream } from "effect";
import * as Toolchain from "effect-build/Author/Tool";
import * as rolldown from "rolldown";
import { RolldownFailed } from "./internal/error.js";

export { RolldownFailed } from "./internal/error.js";

/**
 * A completed Rolldown watch result without the native `result` handle. The
 * adapter closes that handle before delivery. `superseded` counts older
 * completed results replaced by this result while the consumer was behind.
 */
export type Event =
  | {
    readonly code: "BUNDLE_END";
    readonly duration: number;
    readonly output: readonly string[];
    readonly superseded: number;
  }
  | { readonly code: "ERROR"; readonly error: Error; readonly superseded: number };

/** Rolldown releases exercised by this repository's CI; others proceed with a warning. */
const tested: Toolchain.TestedRange = { minimum: "1.0.0", before: "2.0.0" };

const sanitize = (
  event: Extract<rolldown.RolldownWatcherEvent, { code: "BUNDLE_END" | "ERROR" }>,
  superseded: number,
): Event =>
  event.code === "BUNDLE_END"
    ? { code: "BUNDLE_END", duration: event.duration, output: event.output, superseded }
    : { code: "ERROR", error: event.error, superseded };

/**
 * Runs Rolldown in watch mode and emits completed build results. Delivery holds
 * one pending result and coalesces to the newest completion. Build failures
 * arrive as `ERROR` values, never as stream failure — a dev loop must survive
 * broken intermediate states. Each native result is closed exactly once before
 * delivery. Ending or interrupting the stream awaits any active result close,
 * then closes the watcher exactly once. Cleanup failures remain defects in the
 * stream Cause and are not translated or swallowed.
 */
export const events = (options: rolldown.WatchOptions): Stream.Stream<Event, RolldownFailed> =>
  Stream.callback<Event, RolldownFailed>(
    (queue) =>
      Effect.gen(function*() {
        yield* Toolchain.warnIfUntested({ tool: "rolldown", version: rolldown.VERSION, tested });
        yield* Effect.acquireRelease(
          Effect.try({
            try: () => {
              const watcher = rolldown.watch(options);
              let pendingSuperseded = 0;
              let listenerFailure: unknown;
              let listenerChain = Promise.resolve();
              let watcherClose: Promise<void> | undefined;

              const handleCompleted = async (
                event: Extract<rolldown.RolldownWatcherEvent, { code: "BUNDLE_END" | "ERROR" }>,
              ): Promise<void> => {
                try {
                  await event.result.close();
                } catch (error) {
                  listenerFailure = error;
                  Queue.failCauseUnsafe(queue, Cause.die(error));
                  return;
                }
                if (listenerFailure !== undefined) return;
                pendingSuperseded = Queue.sizeUnsafe(queue) === 0 ? 0 : pendingSuperseded + 1;
                Queue.offerUnsafe(queue, sanitize(event, pendingSuperseded));
              };

              const listener = (event: rolldown.RolldownWatcherEvent): Promise<void> => {
                if (event.code !== "BUNDLE_END" && event.code !== "ERROR") return listenerChain;
                listenerChain = listenerChain.then(() => handleCompleted(event));
                return listenerChain;
              };

              watcher.on("event", listener);
              return {
                release: async () => {
                  watcher.off("event", listener);
                  await listenerChain;
                  watcherClose ??= watcher.close();
                  let watcherFailure: unknown;
                  try {
                    await watcherClose;
                  } catch (error) {
                    watcherFailure = error;
                  }
                  if (listenerFailure !== undefined && watcherFailure !== undefined) {
                    throw new AggregateError([listenerFailure, watcherFailure], "rolldown watch cleanup failed");
                  }
                  if (listenerFailure !== undefined) throw listenerFailure;
                  if (watcherFailure !== undefined) throw watcherFailure;
                },
              };
            },
            catch: (error) => new RolldownFailed({ operation: "watch", cause: error }),
          }),
          ({ release }) => Effect.uninterruptible(Effect.promise(release)),
        );
      }).pipe(
        Effect.catchCause((cause) => Queue.failCause(queue, cause)),
      ),
    { bufferSize: 1, strategy: "sliding" },
  );
