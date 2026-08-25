import { Effect, Stream } from "effect";
import * as Context from "effect-build-esbuild/Context";
import * as Watch from "effect-build-esbuild/Watch";

// Serve every rebuild from memory until interrupted; broken intermediate
// states arrive as values on `change.result.errors` and never end the loop.
await Effect.runPromise(
  Watch.changes({ entryPoints: ["src/main.ts"], bundle: true, outdir: "dist", write: false }).pipe(
    Stream.runForEach((change) =>
      Effect.log(
        change.result.errors.length > 0
          ? `rebuild failed: ${change.result.errors[0]?.text}`
          : `rebuilt ${change.result.outputFiles.length} files, ${
            change.result.outputFiles[0]?.contents.byteLength
          } bytes (${change.superseded} superseded)`,
      )
    ),
    Effect.provide(Context.layer),
  ),
);
