import { Effect, Queue, Stream } from "effect";
import * as Toolchain from "effect-build/Toolchain";
import * as rolldown from "rolldown";
import { RolldownFailed } from "./internal/error.js";

export { RolldownFailed } from "./internal/error.js";

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
export const events = (options: rolldown.WatchOptions): Stream.Stream<Event, RolldownFailed> =>
  Stream.callback<Event, RolldownFailed>((queue) =>
    Effect.gen(function*() {
      yield* Toolchain.warnIfUntested({ tool: "rolldown", version: rolldown.VERSION, tested });
      yield* Effect.acquireRelease(
        Effect.try({
          try: () => {
            const watcher = rolldown.watch(options);
            watcher.on("event", (event) => {
              Queue.offerUnsafe(queue, sanitize(event));
              if (event.code === "BUNDLE_END" || event.code === "ERROR") {
                return event.result.close().catch(() => undefined);
              }
              return undefined;
            });
            return watcher;
          },
          catch: (error) => new RolldownFailed({ operation: "watch", cause: error }),
        }),
        (watcher) => Effect.uninterruptible(Effect.promise(() => watcher.close().catch(() => undefined))),
      );
    }).pipe(
      // Stream.callback ignores its effect's failure channel; route it into the queue.
      Effect.catchCause((cause) => Queue.failCause(queue, cause)),
    )
  );
