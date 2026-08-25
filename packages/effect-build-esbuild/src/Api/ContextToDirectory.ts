import { Effect, type Scope } from "effect";
import * as esbuild from "esbuild";
import * as ContextOwner from "../internal/ContextOwner.js";
import type { EsbuildFailed } from "../internal/error.js";

export { EsbuildFailed } from "../internal/error.js";

export type Options = esbuild.BuildOptions & { readonly write: true };
export type Context<Input extends Options = Options> = ContextOwner.Owner<Input>;

export const make = <const Input extends Options>(
  input: Input,
): Effect.Effect<Context<Input>, EsbuildFailed, Scope.Scope> => ContextOwner.make(input);
