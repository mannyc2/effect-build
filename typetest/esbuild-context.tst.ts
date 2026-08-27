import type { Effect, Scope } from "effect";
import type * as esbuild from "esbuild";
import * as Context from "../packages/effect-build-esbuild/src/Api/Context.js";
import * as ContextToDirectory from "../packages/effect-build-esbuild/src/Api/ContextToDirectory.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

declare const memoryOptions: esbuild.BuildOptions & { readonly write: false };
const made = Context.make(memoryOptions);
export type _Make = Assert<
  Same<
    typeof made,
    Effect.Effect<
      Context.Context<typeof memoryOptions>,
      Context.EsbuildFailed | Context.EsbuildModeInvalid,
      Scope.Scope
    >
  >
>;

declare const context: Context.Context;
export type _Rebuild = Assert<
  Same<typeof context.rebuild, Effect.Effect<esbuild.BuildResult<Context.Options>, Context.EsbuildFailed>>
>;
export type _Watch = Assert<
  Same<ReturnType<typeof context.watch>, Effect.Effect<void, Context.EsbuildFailed>>
>;
export type _Serve = Assert<
  Same<ReturnType<typeof context.serve>, Effect.Effect<esbuild.ServeResult, Context.EsbuildFailed>>
>;
export type _Cancel = Assert<Same<typeof context.cancel, Effect.Effect<void, Context.EsbuildFailed>>>;

// Scope owns native dispose; callers cannot invoke it through the projected owner.
export type _NoDispose = Assert<Same<"dispose" extends keyof Context.Context ? true : false, false>>;

// @ts-expect-error!
Context.make({ bundle: true });
// @ts-expect-error!
Context.make({ bundle: true, write: true });

declare const directOptions: esbuild.BuildOptions & { readonly write: true };
const direct = ContextToDirectory.make(directOptions);
export type _DirectContext = Assert<
  Same<
    typeof direct,
    Effect.Effect<
      ContextToDirectory.Context<typeof directOptions>,
      ContextToDirectory.EsbuildFailed | ContextToDirectory.EsbuildModeInvalid,
      Scope.Scope
    >
  >
>;
// @ts-expect-error!
ContextToDirectory.make({ bundle: true, write: false });
