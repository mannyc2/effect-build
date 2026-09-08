import { Cause, Effect, Queue, Stream } from "effect";
import * as rolldown from "rolldown";
import { Failed } from "./Error.js";

export type WatchEvent =
  | { readonly code: "BUNDLE_END"; readonly duration: number; readonly output: readonly string[]; readonly superseded: number }
  | { readonly code: "ERROR"; readonly error: Error; readonly superseded: number };

/** Close each native result before delivery; retain the latest pending completion for slow consumers. */
export const watch = (options: rolldown.WatchOptions | rolldown.WatchOptions[]): Stream.Stream<WatchEvent, Failed> =>
  Stream.callback<WatchEvent, Failed>((queue) => Effect.acquireRelease(
    Effect.try({
      try: () => {
        const watcher = rolldown.watch(options);
        let superseded = 0;
        let listenerResult: Effect.Effect<void> = Effect.void;
        let chain = Promise.resolve();
        const listener = (event: rolldown.RolldownWatcherEvent): Promise<void> => {
          if (event.code !== "BUNDLE_END" && event.code !== "ERROR") return chain;
          chain = chain.then(async () => {
            try {
              await event.result.close();
              superseded = Queue.sizeUnsafe(queue) === 0 ? 0 : superseded + 1;
              Queue.offerUnsafe(queue, event.code === "BUNDLE_END"
                ? { code: "BUNDLE_END", duration: event.duration, output: event.output, superseded }
                : { code: "ERROR", error: event.error, superseded });
            } catch (cause) {
              listenerResult = Effect.die(cause);
              Queue.failCauseUnsafe(queue, Cause.die(cause));
            }
          });
          return chain;
        };
        watcher.on("event", listener);
        return { watcher, listener, wait: () => chain, result: () => listenerResult };
      },
      catch: (cause) => new Failed({ operation: "watch", cause }),
    }),
    ({ watcher, listener, wait, result }) => Effect.promise(async () => {
      watcher.off("event", listener);
      await wait();
    }).pipe(
      Effect.andThen(result),
      Effect.ensuring(Effect.promise(() => watcher.close())),
    ),
  ).pipe(Effect.catchCause((cause) => Queue.failCause(queue, cause))), { bufferSize: 1, strategy: "sliding" });
