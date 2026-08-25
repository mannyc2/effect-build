import { Effect, Stream } from "effect";
import * as Build from "effect-build-rolldown/Build";
import * as Watch from "effect-build-rolldown/Watch";

// One-shot in-memory bundle through the scoped owner.
const output = await Effect.runPromise(
  Build.generate({ input: "src/main.ts" }, { format: "esm", minify: true }).pipe(
    Effect.provide(Build.layer),
  ),
);
for (const chunk of output.output) console.log(`${chunk.fileName} (${chunk.type})`);

// Or follow the watcher until interrupted.
await Effect.runPromise(
  Watch.events({ input: "src/main.ts", output: { dir: "dist" } }).pipe(
    Stream.runForEach((event) =>
      Effect.log(event.code === "BUNDLE_END" ? `built ${event.output.join(", ")} in ${event.duration}ms` : event.code)
    ),
  ),
);
