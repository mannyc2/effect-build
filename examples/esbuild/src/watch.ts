import { Effect } from "effect";
import { Context } from "effect-build-esbuild/Api";

// The scoped API owner drains cancellation before disposal on interruption.
await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function*() {
      const context = yield* Context.make({
        entryPoints: ["src/main.ts"],
        bundle: true,
        write: false,
      });
      yield* context.watch();
      return yield* Effect.never;
    }),
  ),
);
