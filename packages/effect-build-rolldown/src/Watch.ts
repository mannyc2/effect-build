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
        let listenerFailure: unknown;
        let chain = Promise.resolve();
        const listener = (event: rolldown.RolldownWatcherEvent): Promise<void> => {
          if (event.code !== "BUNDLE_END" && event.code !== "ERROR") return chain;
          chain = chain.then(async () => {
            try {
              await event.result.close();
              const next = Queue.sizeUnsafe(queue) === 0 ? 0 : superseded + 1;
              superseded = next;
              Queue.offerUnsafe(queue, event.code === "BUNDLE_END"
                ? { code: "BUNDLE_END", duration: event.duration, output: event.output, superseded: next }
                : { code: "ERROR", error: event.error, superseded: next });
            } catch (cause) {
              listenerFailure = cause;
              Queue.failCauseUnsafe(queue, Cause.die(cause));
            }
          });
          return chain;
        };
        watcher.on("event", listener);
        return { watcher, listener, wait: () => chain, failure: () => listenerFailure };
      },
      catch: (cause) => new Failed({ operation: "watch", cause }),
    }),
    ({ watcher, listener, wait, failure }) => Effect.promise(async () => {
      watcher.off("event", listener);
      await wait();
      let closeFailure: unknown;
      try { await watcher.close(); } catch (cause) { closeFailure = cause; }
      const callbackFailure = failure();
      if (callbackFailure !== undefined && closeFailure !== undefined) {
        throw new AggregateError([callbackFailure, closeFailure], "rolldown watch cleanup failed");
      }
      if (callbackFailure !== undefined) throw callbackFailure;
      if (closeFailure !== undefined) throw closeFailure;
    }),
  ).pipe(Effect.catchCause((cause) => Queue.failCause(queue, cause))), { bufferSize: 1, strategy: "sliding" });
