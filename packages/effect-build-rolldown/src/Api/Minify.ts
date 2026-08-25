import { Effect } from "effect";
import { minify as nativeMinify, type MinifyOptions, type MinifyResult } from "rolldown/utils";
import { RolldownFailed } from "../internal/error.js";

export type { MinifyOptions, MinifyResult } from "rolldown/utils";
export { RolldownFailed } from "../internal/error.js";

export const minify = (
  filename: string,
  sourceText: string,
  options?: MinifyOptions | null,
): Effect.Effect<MinifyResult, RolldownFailed> =>
  Effect.tryPromise({
    try: () => nativeMinify(filename, sourceText, options),
    catch: (cause) => new RolldownFailed({ operation: "minify", cause }),
  });
