import type { Crypto, Effect, FileSystem, Layer, Path } from "effect";
import type * as esbuild from "esbuild";
import * as Build from "../packages/effect-build-esbuild/src/Build.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type SuccessOf<T> = T extends Effect.Effect<infer A, infer _E, infer _R> ? A : never;
type LayerError<L> = L extends Layer.Layer<infer _A, infer E, infer _R> ? E : never;
type LayerServices<L> = L extends Layer.Layer<infer _A, infer _E, infer R> ? R : never;

export type _Options = Assert<
  Same<Build.Options, esbuild.BuildOptions & { readonly write: false }>
>;
export type _BuildInput = Assert<Same<Build.BuildInput, Build.Options>>;
export type _ArtifactIdentity = Assert<Same<Build.Artifact, esbuild.BuildResult<Build.Options>>>;
export type _LayerOptions = Assert<
  Same<Build.LayerOptions, { readonly allowUntestedVersion?: boolean }>
>;

const memoryInput: { entryPoints: string[]; bundle: boolean; write: false } = {
  entryPoints: ["main.ts"],
  bundle: true,
  write: false,
};

const oneShot = Build.build(memoryInput);
export type _OneShotResult = Assert<
  Same<
    typeof oneShot,
    Effect.Effect<esbuild.BuildResult<typeof memoryInput>, Build.BuildError, Build.Esbuild>
  >
>;
export type _InMemoryOutputFiles = Assert<
  Same<SuccessOf<typeof oneShot>["outputFiles"], esbuild.OutputFile[]>
>;

export type _LayerErrorTags = Assert<
  Same<LayerError<ReturnType<typeof Build.layer>>["_tag"], "IdentityIncomplete" | "ToolProbeFailed">
>;
export type _LayerRequirements = Assert<
  Same<
    LayerServices<ReturnType<typeof Build.layer>>,
    Crypto.Crypto | FileSystem.FileSystem | Path.Path
  >
>;

export type _BuildErrorTags = Assert<
  Same<
    Build.BuildError["_tag"],
    | "InvalidOptions"
    | "ProviderBuildFailure"
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
const _missingWrite = Build.build({ bundle: true });
void _missingWrite;

// @ts-expect-error!
const _writeTrue = Build.build({ bundle: true, write: true });
void _writeTrue;
