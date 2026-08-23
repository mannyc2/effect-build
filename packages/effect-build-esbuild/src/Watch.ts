import { Effect, Queue, type Scope, Stream } from "effect";
import type * as esbuild from "esbuild";
import * as Context from "./Context.js";
import type { EsbuildFailed } from "./internal/error.js";

export { EsbuildFailed } from "./internal/error.js";

/** Native esbuild options with the in-memory refinement; `write` must be the literal `false`. */
export type Options = Context.Options;

/**
 * Runs an esbuild context in watch mode and emits every completed build: the
 * initial one, then one per rebuild. Rebuild diagnostics arrive as values on
 * `result.errors`, never as stream failure — a dev loop must survive broken
 * intermediate states. Only starting the watcher can fail the stream. Ending
 * or interrupting the stream stops the watcher via cancel-then-dispose.
 */
export const changes = <const Input extends Options>(
  input: Input,
  options?: esbuild.WatchOptions,
): Stream.Stream<esbuild.BuildResult<Input>, EsbuildFailed, Context.Esbuild> =>
  Stream.callback<esbuild.BuildResult<Input>, EsbuildFailed, Context.Esbuild | Scope.Scope>((queue) =>
    Effect.gen(function*() {
      const emit: esbuild.Plugin = {
        name: "effect-build-watch",
        setup(build) {
          build.onEnd((result) => {
            Queue.offerUnsafe(queue, result as esbuild.BuildResult<Input>);
          });
        },
      };
      const context = yield* Context.make(
        { ...input, plugins: [...(input.plugins ?? []), emit] } as Input,
      );
      yield* context.watch(options);
    }).pipe(
      // Stream.callback ignores its effect's failure channel; route it into the queue.
      Effect.catchCause((cause) => Queue.failCause(queue, cause)),
    )
  );
