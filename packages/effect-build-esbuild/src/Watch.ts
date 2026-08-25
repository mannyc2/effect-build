import { Effect, Queue, type Scope, Stream } from "effect";
import type * as esbuild from "esbuild";
import * as Context from "./Context.js";
import type { EsbuildFailed } from "./internal/error.js";

export { EsbuildFailed } from "./internal/error.js";

/** Native esbuild options with the in-memory refinement; `write` must be the literal `false`. */
export type Options = Context.Options;

/**
 * One bounded watch delivery. `superseded` counts completed builds that were
 * replaced by this newer result before the consumer could take them.
 */
export interface Change<Input extends Options = Options> {
  readonly result: esbuild.BuildResult<Input>;
  readonly superseded: number;
}

/**
 * Runs an esbuild context in watch mode with one pending completed result. If
 * the consumer falls behind, the newest completion replaces the older pending
 * completion and records how many results it superseded. Rebuild diagnostics
 * arrive as values on `change.result.errors`, never as stream failure — a dev
 * loop must survive broken intermediate states. Only starting the watcher can
 * fail the stream. Ending or interrupting the stream stops the watcher through
 * the context's one cancel-then-dispose finalizer.
 */
export const changes = <const Input extends Options>(
  input: Input,
  options?: esbuild.WatchOptions,
): Stream.Stream<Change<Input>, EsbuildFailed, Context.Esbuild> =>
  Stream.callback<Change<Input>, EsbuildFailed, Context.Esbuild | Scope.Scope>(
    (queue) =>
      Effect.gen(function*() {
        let pendingSuperseded = 0;
        const emit: esbuild.Plugin = {
          name: "effect-build-watch",
          setup(build) {
            build.onEnd((result) => {
              pendingSuperseded = Queue.sizeUnsafe(queue) === 0 ? 0 : pendingSuperseded + 1;
              Queue.offerUnsafe(queue, {
                result: result as esbuild.BuildResult<Input>,
                superseded: pendingSuperseded,
              });
            });
          },
        };
        const context = yield* Context.make(
          { ...input, plugins: [...(input.plugins ?? []), emit] } as Input,
        );
        yield* context.watch(options);
      }).pipe(
        Effect.catchCause((cause) => Queue.failCause(queue, cause)),
      ),
    { bufferSize: 1, strategy: "sliding" },
  );
