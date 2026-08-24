import { Cause, Effect, Queue, Stream } from "effect";
import * as Toolchain from "effect-build/Author/Tool";
import * as rolldown from "rolldown";
import { RolldownFailed, WatchOverflow } from "./internal/error.js";

export { RolldownFailed, WatchOverflow } from "./internal/error.js";

/**
 * Rolldown's watcher events without the native `result` handle — it is closed
 * here as rollup convention demands, so the stream imposes no resource duty on
 * its consumer.
 */
export type Event =
  | { readonly code: "START" }
  | { readonly code: "BUNDLE_START" }
  | { readonly code: "BUNDLE_END"; readonly duration: number; readonly output: readonly string[] }
  | { readonly code: "END" }
  | { readonly code: "ERROR"; readonly error: Error };

/** Rolldown releases exercised by this repository's CI; others proceed with a warning. */
const tested: Toolchain.TestedRange = { minimum: "1.0.0", before: "2.0.0" };

const sanitize = (event: rolldown.RolldownWatcherEvent): Event =>
  event.code === "BUNDLE_END"
    ? { code: "BUNDLE_END", duration: event.duration, output: event.output }
    : event.code === "ERROR"
    ? { code: "ERROR", error: event.error }
    : { code: event.code };

/**
 * Runs rolldown in watch mode and emits every watcher event; build failures
 * arrive as `ERROR` values, never as stream failure — a dev loop must survive
 * broken intermediate states. Only starting the watcher can fail the stream.
 * Ending or interrupting the stream closes the watcher.
 */
export const events = (options: rolldown.WatchOptions): Stream.Stream<Event, RolldownFailed | WatchOverflow> =>
  Stream.callback<Event, RolldownFailed | WatchOverflow>((queue) =>
    Effect.gen(function*() {
      yield* Toolchain.warnIfUntested({ tool: "rolldown", version: rolldown.VERSION, tested });
      yield* Effect.acquireRelease(
        Effect.try({
          try: () => {
            const watcher = rolldown.watch(options);
            let resultClose: Promise<void> | undefined;
            let stopping: Promise<void> | undefined;
            const listener = (event: rolldown.RolldownWatcherEvent): void => {
              Queue.offerUnsafe(queue, sanitize(event));
              if (event.code === "BUNDLE_END" || event.code === "ERROR") {
                const triggerClose = event.result.close();
                if (resultClose !== undefined) {
                  watcher.off("event", listener);
                  stopping ??= Promise.allSettled([resultClose, triggerClose])
                    .then(() => watcher.close())
                    .then(
                      () => {
                        Queue.failCauseUnsafe(queue, Cause.fail(new WatchOverflow({ resource: "result", limit: 1 })));
                      },
                      (error) => {
                        Queue.failCauseUnsafe(queue, Cause.die(error));
                      },
                    );
                  return;
                }
                resultClose = triggerClose;
                triggerClose.then(
                  () => {
                    if (resultClose === triggerClose) resultClose = undefined;
                  },
                  (error) => Queue.failCauseUnsafe(queue, Cause.die(error)),
                );
              }
            };
            watcher.on("event", listener);
            return {
              release: async () => {
                watcher.off("event", listener);
                if (stopping !== undefined) await stopping;
                else {
                  await resultClose;
                  await watcher.close();
                }
              },
            };
          },
          catch: (error) => new RolldownFailed({ operation: "watch", cause: error }),
        }),
        ({ release }) => Effect.uninterruptible(Effect.promise(release)),
      );
    }).pipe(
      // Stream.callback ignores its effect's failure channel; route it into the queue.
      Effect.catchCause((cause) => Queue.failCause(queue, cause)),
    )
  );
