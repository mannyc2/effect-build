import { Effect } from "effect";
import { Build } from "effect-build-bun/Api";

const result = await Effect.runPromise(
  Build.build({
    entrypoints: ["src/main.ts", "src/worker.ts"],
    target: "browser",
    minify: true,
    sourcemap: "linked",
    splitting: true,
  }).pipe(Effect.provide(Build.layer)),
);

for (const output of result.outputs) {
  console.log(`${output.path} ${output.size} bytes`);
}
