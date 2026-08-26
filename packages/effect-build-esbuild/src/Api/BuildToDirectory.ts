import { Effect } from "effect";
import * as esbuild from "esbuild";
import { EsbuildFailed, EsbuildModeInvalid } from "../internal/error.js";

export { EsbuildFailed, EsbuildModeInvalid } from "../internal/error.js";

/** Native provider-direct build. Partial output and remnants remain esbuild semantics. */
export type Options = esbuild.BuildOptions & { readonly write: true };
export type Result<Input extends Options = Options> = esbuild.BuildResult<Input>;

export const buildToDirectory = <const Input extends Options>(
  input: Input,
): Effect.Effect<Result<Input>, EsbuildFailed | EsbuildModeInvalid> =>
  input.write === true
    ? Effect.tryPromise({
      try: () => esbuild.build(input as Options) as Promise<Result<Input>>,
      catch: (cause) => new EsbuildFailed({ operation: "build", cause }),
    })
    : Effect.fail(
      new EsbuildModeInvalid({
        operation: "build",
        mode: "direct",
        reason: "write must be exactly true for provider-direct durable output",
      }),
    );
