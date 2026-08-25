import { Effect } from "effect";
import * as esbuild from "esbuild";
import { EsbuildFailed } from "../internal/error.js";

export { EsbuildFailed } from "../internal/error.js";

export const analyzeMetafile = (
  metafile: esbuild.Metafile | string,
  options?: esbuild.AnalyzeMetafileOptions,
): Effect.Effect<string, EsbuildFailed> =>
  Effect.tryPromise({
    try: () => esbuild.analyzeMetafile(metafile, options),
    catch: (cause) => new EsbuildFailed({ operation: "analyzeMetafile", cause }),
  });
