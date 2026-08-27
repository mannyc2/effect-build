import { Effect, Stream } from "effect";
import * as Context from "effect-build-esbuild/Context";
import * as Watch from "effect-build-esbuild/Watch";

// Serve every rebuild from memory until interrupted; broken intermediate
// states arrive as values on `result.errors` and never end the loop.
await Effect.runPromise(
  Watch.changes({ entryPoints: ["src/main.ts"], bundle: true, outdir: "dist", write: false }).pipe(
    Stream.runForEach((result) =>
      Effect.log(
        result.errors.length > 0
          ? `rebuild failed: ${result.errors[0]?.text}`
          : `rebuilt ${result.outputFiles.length} files, ${result.outputFiles[0]?.contents.byteLength} bytes`,
      )
    ),
    Effect.provide(Context.layer),
  ),
);
