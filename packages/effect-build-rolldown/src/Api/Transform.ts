import { Effect } from "effect";
import {
  transform as nativeTransform,
  type TransformOptions,
  type TransformResult,
  type TsconfigCache,
} from "rolldown/utils";
import { RolldownFailed } from "../internal/error.js";

export type { TransformOptions, TransformResult, TsconfigCache } from "rolldown/utils";
export { RolldownFailed } from "../internal/error.js";

export const transform = (
  filename: string,
  sourceText: string,
  options?: TransformOptions | null,
  cache?: TsconfigCache | null,
): Effect.Effect<TransformResult, RolldownFailed> =>
  Effect.tryPromise({
    try: () => nativeTransform(filename, sourceText, options, cache),
    catch: (cause) => new RolldownFailed({ operation: "transform", cause }),
  });
