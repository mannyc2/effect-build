import { Effect } from "effect";
import * as esbuild from "esbuild";
import { EsbuildFailed } from "../internal/error.js";

export { EsbuildFailed } from "../internal/error.js";

/** Native provider-direct build. Partial output and remnants remain esbuild semantics. */
export type Options = esbuild.BuildOptions & { readonly write: true };
export type Result<Input extends Options = Options> = esbuild.BuildResult<Input>;

export const buildToDirectory = <const Input extends Options>(
  input: Input,
): Effect.Effect<Result<Input>, EsbuildFailed> =>
  Effect.tryPromise({
    try: () => esbuild.build(input as Options) as Promise<Result<Input>>,
    catch: (cause) => new EsbuildFailed({ operation: "build", cause }),
  });
