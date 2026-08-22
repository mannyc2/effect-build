import type { Effect, Layer, Scope } from "effect";
import type * as esbuild from "esbuild";
import * as EsbuildContext from "../packages/effect-build-esbuild/src/Context.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type LayerError<L> = L extends Layer.Layer<infer _A, infer E, infer _R> ? E : never;

export type _Options = Assert<
  Same<EsbuildContext.Options, esbuild.BuildOptions & { readonly write: false }>
>;
export type _MakeInput = Assert<Same<EsbuildContext.MakeInput, EsbuildContext.Options>>;
export type _LayerOptions = Assert<
  Same<EsbuildContext.LayerOptions, { readonly allowUntestedVersion?: boolean }>
>;

const memoryInput: { entryPoints: string[]; bundle: boolean; write: false } = {
  entryPoints: ["main.ts"],
  bundle: true,
  write: false,
};

const scopedOwner = EsbuildContext.make(memoryInput);
export type _MakeResult = Assert<
  Same<
    typeof scopedOwner,
    Effect.Effect<
      EsbuildContext.Context<typeof memoryInput>,
      EsbuildContext.ContextError,
      EsbuildContext.Esbuild | Scope.Scope
    >
  >
>;

declare const owner: EsbuildContext.Context<typeof memoryInput>;
export type _Rebuild = Assert<
  Same<
    typeof owner.rebuild,
    Effect.Effect<esbuild.BuildResult<typeof memoryInput>, EsbuildContext.ContextError>
  >
>;
export type _Watch = Assert<
  Same<
    typeof owner.watch,
    (options?: esbuild.WatchOptions) => Effect.Effect<void, EsbuildContext.ContextError>
  >
>;
export type _Serve = Assert<
  Same<
    typeof owner.serve,
    (options?: esbuild.ServeOptions) => Effect.Effect<esbuild.ServeResult, EsbuildContext.ContextError>
  >
>;
export type _Cancel = Assert<
  Same<typeof owner.cancel, Effect.Effect<void, EsbuildContext.ContextError>>
>;
export type _DisposeStaysHidden = Assert<
  Same<Extract<keyof EsbuildContext.Context, "dispose">, never>
>;

export type _LayerErrorTags = Assert<
  Same<LayerError<ReturnType<typeof EsbuildContext.layer>>["_tag"], "IdentityIncomplete" | "ToolProbeFailed">
>;

export type _ContextErrorTags = Assert<
  Same<
    EsbuildContext.ContextError["_tag"],
    | "InvalidOptions"
    | "ProviderBuildFailure"
    | "ProviderContextFailure"
    | "KnownDenyHole"
    | "CapabilityMissing"
    | "CapabilityIndeterminate"
    | "RelationUnsatisfied"
    | "RelationIndeterminate"
    | "ContractIncompatible"
    | "ContractIndeterminate"
    | "SupportUnknown"
  >
>;

// @ts-expect-error!
const _missingWrite = EsbuildContext.make({ bundle: true });
void _missingWrite;

// @ts-expect-error!
const _writeTrue = EsbuildContext.make({ bundle: true, write: true });
void _writeTrue;
