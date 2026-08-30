import { Effect } from "effect";
import * as esbuild from "esbuild";
import { EsbuildFailed, EsbuildModeInvalid } from "../internal/error.js";

export { EsbuildFailed, EsbuildModeInvalid } from "../internal/error.js";

/** Native in-memory build. The caller owns the returned esbuild values. */
export type Options = esbuild.BuildOptions & { readonly write: false };
export type Result<Input extends Options = Options> = esbuild.BuildResult<Input>;

export const build = <const Input extends Options>(
  input: Input,
): Effect.Effect<Result<Input>, EsbuildFailed | EsbuildModeInvalid> =>
  input.write === false
    ? Effect.tryPromise({
      try: () => esbuild.build(input as Options) as Promise<Result<Input>>,
      catch: (cause) => new EsbuildFailed({ operation: "build", cause }),
    })
    : Effect.fail(
      new EsbuildModeInvalid({
        operation: "build",
        mode: "memory",
        reason: "write must be exactly false for caller-owned in-memory output",
      }),
    );
