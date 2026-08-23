import type { Crypto, Effect, FileSystem, Layer, Path } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import * as AssembleExecutable from "../packages/effect-build-node-sea/src/AssembleExecutable.js";
import type * as CoreArtifact from "../packages/effect-build/src/Artifact.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type MutuallyAssignable<A, B> = [A] extends [B] ? [B] extends [A] ? true : false : false;
type LayerError<L> = L extends Layer.Layer<infer _A, infer E, infer _R> ? E : never;
type LayerServices<L> = L extends Layer.Layer<infer _A, infer _E, infer R> ? R : never;

type Main =
  | { readonly _tag: "File"; readonly path: string; readonly format: "commonjs" | "module" }
  | {
    readonly _tag: "Bytes";
    readonly contents: Uint8Array;
    readonly format: "commonjs" | "module";
    readonly sourceName?: string;
  };

export type _LayerOptions = Assert<
  MutuallyAssignable<
    AssembleExecutable.LayerOptions,
    {
      readonly builderExecutable?: CoreArtifact.AbsolutePath;
      readonly baseExecutable?: CoreArtifact.AbsolutePath;
      readonly allowUntestedVersion?: boolean;
    }
  >
>;
export type _Input = Assert<
  MutuallyAssignable<
    AssembleExecutable.AssembleExecutableInput<"hashed">,
    {
      readonly main: Main;
      readonly outfile: string;
      readonly cwd?: string;
      readonly observation: "hashed";
      readonly assets?: readonly { readonly key: string; readonly path: string }[];
      readonly disableExperimentalSEAWarning?: boolean;
    }
  >
>;

declare const hashedInput: AssembleExecutable.AssembleExecutableInput<"hashed">;
declare const unhashedInput: AssembleExecutable.AssembleExecutableInput<"unhashed">;

const hashed = AssembleExecutable.assembleExecutable(hashedInput);
const unhashed = AssembleExecutable.assembleExecutable(unhashedInput);
export type _HashedScalar = Assert<
  Same<
    typeof hashed,
    Effect.Effect<
      AssembleExecutable.Artifact<"hashed">,
      AssembleExecutable.AssembleExecutableError,
      AssembleExecutable.Assembler
    >
  >
>;
export type _UnhashedScalar = Assert<
  Same<
    typeof unhashed,
    Effect.Effect<
      AssembleExecutable.Artifact<"unhashed">,
      AssembleExecutable.AssembleExecutableError,
      AssembleExecutable.Assembler
    >
  >
>;
export type _HashedDigest = Assert<Same<AssembleExecutable.Artifact<"hashed">["digest"], CoreArtifact.Digest>>;
export type _UnhashedDigest = Assert<
  Same<Extract<keyof AssembleExecutable.Artifact<"unhashed">, "digest">, never>
>;
export type _Provider = Assert<Same<AssembleExecutable.Artifact["provider"], "node-sea">>;
export type _Runtime = Assert<
  Same<AssembleExecutable.Artifact["runtime"], { readonly name: "node"; readonly version: "26.7.0" }>
>;
export type _Target = Assert<Same<AssembleExecutable.Artifact["target"], "linux-x64-gnu">>;
export type _NativeFormat = Assert<Same<AssembleExecutable.Artifact["nativeFormat"], "elf">>;

export type _LayerErrors = Assert<
  Same<
    LayerError<ReturnType<typeof AssembleExecutable.layer>>["_tag"],
    "NodeSeaToolNotFound" | "NodeSeaProbeFailed" | "IdentityIncomplete"
  >
>;
export type _LayerRequirements = Assert<
  Same<
    LayerServices<ReturnType<typeof AssembleExecutable.layer>>,
    Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner
  >
>;
export type _OperationErrors = Assert<
  Same<
    AssembleExecutable.AssembleExecutableError["_tag"],
    | "InvalidNodeSeaInput"
    | "NodeSeaPreparationFailed"
    | "NodeSeaSpawnFailed"
    | "NodeSeaSyntaxCheckFailed"
    | "NodeSeaFailed"
    | "ExecutableCandidateMissing"
    | "ExecutableCandidateChanged"
    | "ExecutableInspectionFailed"
    | "ExecutableDestinationLocked"
    | "ExecutableCommitFailed"
    | "KnownDenyHole"
    | "CapabilityMissing"
    | "CapabilityIndeterminate"
    | "RelationUnsatisfied"
    | "RelationIndeterminate"
    | "ContractIncompatible"
    | "ContractIndeterminate"
    | "SupportUnknown"
    | "SelectedCommandChanged"
    | "SelectedCommandIndeterminate"
  >
>;

const _closed: AssembleExecutable.AssembleExecutableInput<"hashed"> = {
  main: { _tag: "Bytes", contents: new Uint8Array(), format: "commonjs" },
  outfile: "app",
  observation: "hashed",
};
void _closed;

// @ts-expect-error!
const _missingObservation: AssembleExecutable.AssembleExecutableInput = {
  main: { _tag: "Bytes", contents: new Uint8Array(), format: "commonjs" },
  outfile: "app",
};
void _missingObservation;

const _deferredTarget: AssembleExecutable.AssembleExecutableInput = {
  main: { _tag: "Bytes", contents: new Uint8Array(), format: "commonjs" },
  outfile: "app",
  observation: "unhashed",
  // @ts-expect-error!
  target: "linux-aarch64-gnu",
};
void _deferredTarget;

// @ts-expect-error!
AssembleExecutable.createExecutable;
