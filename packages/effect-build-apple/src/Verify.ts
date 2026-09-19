import { Effect } from "effect";
import { Artifact, Tool } from "effect-build";
import { Apple, type Env } from "./Apple.js";
import { runNative } from "./internal.js";
import type { Product } from "./Model.js";

export interface VerifySignatureInput<A extends Product | Artifact.Executable> extends Tool.EnvironmentOptions { readonly artifact: A }
/** Ask codesign or pkgutil to verify the current signature. */
export const verifySignature = <A extends Product | Artifact.Executable>(input: VerifySignatureInput<A>): Effect.Effect<A, Tool.Failed | Tool.SpawnFailed, Apple | Env> =>
  ("product" in input.artifact && input.artifact.product === "pkg"
    ? runNative("pkgutil", ["--check-signature", input.artifact.path], input)
    : runNative("codesign", ["--verify", ...("product" in input.artifact && input.artifact.product === "app" ? ["--deep"] : []), "--strict", input.artifact.path], input))
    .pipe(Effect.as(input.artifact));

export interface ValidateTicketInput<A extends Product> extends Tool.EnvironmentOptions { readonly artifact: A }
/** Ask stapler to validate the current product's ticket. */
export const validateTicket = <A extends Product>(input: ValidateTicketInput<A>): Effect.Effect<A, Tool.Failed | Tool.SpawnFailed, Apple | Env> =>
  runNative("stapler", ["validate", input.artifact.path], input).pipe(Effect.as(input.artifact));
