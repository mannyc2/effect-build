import { Effect, type Scope } from "effect";
import * as esbuild from "esbuild";
import * as ContextOwner from "../internal/ContextOwner.js";
import { type EsbuildFailed, EsbuildModeInvalid } from "../internal/error.js";

export { EsbuildFailed, EsbuildModeInvalid } from "../internal/error.js";

export type Options = esbuild.BuildOptions & { readonly write: true };
export type Context<Input extends Options = Options> = ContextOwner.Owner<Input>;

export const make = <const Input extends Options>(
  input: Input,
): Effect.Effect<Context<Input>, EsbuildFailed | EsbuildModeInvalid, Scope.Scope> =>
  input.write === true
    ? ContextOwner.make(input)
    : Effect.fail(
      new EsbuildModeInvalid({
        operation: "make",
        mode: "direct",
        reason: "write must be exactly true for provider-direct durable output",
      }),
    );
