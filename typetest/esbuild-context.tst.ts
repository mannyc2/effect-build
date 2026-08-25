import type { Effect, Layer, Scope } from "effect";
import type * as esbuild from "esbuild";
import * as Context from "../packages/effect-build-esbuild/src/Context.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

declare const options: esbuild.BuildOptions & { readonly write: false };
const made = Context.make(options);
export type _Make = Assert<
  Same<
    typeof made,
    Effect.Effect<Context.Context<typeof options>, Context.EsbuildFailed, Context.Esbuild | Scope.Scope>
  >
>;

declare const context: Context.Context;
export type _Rebuild = Assert<
  Same<typeof context.rebuild, Effect.Effect<esbuild.BuildResult<Context.Options>, Context.EsbuildFailed>>
>;
export type _Cancel = Assert<Same<typeof context.cancel, Effect.Effect<void, Context.EsbuildFailed>>>;

// Native dispose is not part of the scoped handle.
export type _NoDispose = Assert<Same<"dispose" extends keyof Context.Context ? true : false, false>>;

// @ts-expect-error!
Context.make({ bundle: true });

export type _Layer = Assert<Same<typeof Context.layer, Layer.Layer<Context.Esbuild>>>;
