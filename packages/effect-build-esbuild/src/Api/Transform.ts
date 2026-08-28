import { Effect } from "effect";
import * as esbuild from "esbuild";
import { EsbuildFailed } from "../internal/error.js";

export { EsbuildFailed } from "../internal/error.js";

export const transform = <const Input extends esbuild.TransformOptions>(
  code: string | Uint8Array,
  options?: Input,
): Effect.Effect<esbuild.TransformResult<Input>, EsbuildFailed> =>
  Effect.tryPromise({
    try: () => esbuild.transform(code, options as esbuild.TransformOptions) as Promise<esbuild.TransformResult<Input>>,
    catch: (cause) => new EsbuildFailed({ operation: "transform", cause }),
  });
