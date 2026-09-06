import { NodeRuntime } from "@effect/platform-node";
import { Console, Effect } from "effect";
import { Context } from "effect-build-esbuild/Api";

const program = Effect.gen(function*() {
  const context = yield* Context.make({
    entryPoints: ["src/main.ts"],
    bundle: true,
    format: "esm",
    write: false,
    logLevel: "info",
  });
  yield* context.watch();
  yield* Console.log("Watching src/main.ts in memory. Edit the file to rebuild; press Ctrl+C to stop.");
  return yield* Effect.never;
}).pipe(Effect.scoped);

// runMain interrupts on Ctrl+C; the scope cancels pending work and disposes esbuild.
NodeRuntime.runMain(program);
