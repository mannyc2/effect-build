import { Console, Effect } from "effect";
import { Build } from "effect-build-bun/Api";

await Effect.runPromise(
  Effect.gen(function*() {
    const result = yield* Build.build({
      entrypoints: ["src/main.ts", "src/worker.ts"],
      target: "browser",
      minify: true,
      sourcemap: "linked",
      splitting: true,
    });

    for (const output of result.outputs) {
      yield* Console.log(`${output.path} ${output.size} bytes`);
    }
  }).pipe(Effect.provide(Build.layer)),
);
