import type { Crypto, Effect, FileSystem, Layer, Path } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import * as CompileExecutable from "../packages/effect-build-deno/src/CompileExecutable.js";
import type * as CoreArtifact from "../packages/effect-build/src/Artifact.js";
import type * as CoreMatrix from "../packages/effect-build/src/Matrix.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type MutuallyAssignable<A, B> = [A] extends [B] ? [B] extends [A] ? true : false : false;
type LayerError<L> = L extends Layer.Layer<infer _A, infer E, infer _R> ? E : never;
type LayerServices<L> = L extends Layer.Layer<infer _A, infer _E, infer R> ? R : never;

export type _Target = Assert<
  Same<
    CompileExecutable.Target,
    | "macos-x64"
    | "macos-aarch64"
    | "linux-x64-gnu"
    | "linux-aarch64-gnu"
    | "windows-x64"
    | "windows-aarch64"
  >
>;

export type _LayerOptions = Assert<
  MutuallyAssignable<
    CompileExecutable.LayerOptions,
    { readonly executable?: CoreArtifact.AbsolutePath; readonly allowUntestedVersion?: boolean }
  >
>;

export type _Options = Assert<
  MutuallyAssignable<
    CompileExecutable.Options,
    | {
      readonly bundle?: false;
      readonly minify?: never;
      readonly permissions?: CompileExecutable.Permissions;
    }
    | {
      readonly bundle: true;
      readonly minify?: boolean;
      readonly permissions?: CompileExecutable.Permissions;
    }
  >
>;

declare const hashedInput: CompileExecutable.CompileExecutableInput<"hashed">;
declare const unhashedInput: CompileExecutable.CompileExecutableInput<"unhashed">;

const hashed = CompileExecutable.compileExecutable(hashedInput);
const unhashed = CompileExecutable.compileExecutable(unhashedInput);
export type _HashedScalar = Assert<
  Same<
    typeof hashed,
    Effect.Effect<
      CompileExecutable.Artifact<"hashed">,
      CompileExecutable.CompileExecutableError,
      CompileExecutable.Compiler
    >
  >
>;
export type _UnhashedScalar = Assert<
  Same<
    typeof unhashed,
    Effect.Effect<
      CompileExecutable.Artifact<"unhashed">,
      CompileExecutable.CompileExecutableError,
      CompileExecutable.Compiler
    >
  >
>;
export type _HashedDigest = Assert<Same<CompileExecutable.Artifact<"hashed">["digest"], CoreArtifact.Digest>>;
export type _UnhashedDigest = Assert<
  Same<Extract<keyof CompileExecutable.Artifact<"unhashed">, "digest">, never>
>;
export type _Provider = Assert<Same<CompileExecutable.Artifact["provider"], "deno">>;
export type _Runtime = Assert<Same<CompileExecutable.Artifact["runtime"]["name"], "deno">>;

declare const matrixInput: CompileExecutable.CompileExecutableMatrixInput<"hashed">;
const matrix = CompileExecutable.compileExecutableMatrix(matrixInput);
export type _Matrix = Assert<
  MutuallyAssignable<
    typeof matrix,
    Effect.Effect<CompileExecutable.MatrixReport<"hashed">, CoreMatrix.InvalidInput, CompileExecutable.Compiler>
  >
>;
export type _MatrixReport = Assert<
  MutuallyAssignable<
    CompileExecutable.MatrixReport<"hashed">,
    CoreMatrix.Report<CompileExecutable.Artifact<"hashed">, CompileExecutable.CompileExecutableError, "deno">
  >
>;

export type _LayerErrors = Assert<
  Same<
    LayerError<ReturnType<typeof CompileExecutable.layer>>["_tag"],
    "ToolNotFound" | "ToolProbeFailed" | "IdentityIncomplete"
  >
>;
export type _LayerRequirements = Assert<
  Same<
    LayerServices<ReturnType<typeof CompileExecutable.layer>>,
    Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner
  >
>;
export type _OperationErrors = Assert<
  Same<
    CompileExecutable.CompileExecutableError["_tag"],
    | "InvalidDriverOptions"
    | "ToolFailed"
    | "TargetUnsupported"
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

const _closedScalar: CompileExecutable.CompileExecutableInput<"hashed"> = {
  entrypoint: "main.ts",
  outfile: "app",
  observation: "hashed",
};
void _closedScalar;

// @ts-expect-error!
const _missingObservation: CompileExecutable.CompileExecutableInput = { entrypoint: "main.ts", outfile: "app" };
void _missingObservation;

const _noPublicRuntimeOption: CompileExecutable.LayerOptions = {
  // @ts-expect-error!
  denort: "/absolute/denort",
};
void _noPublicRuntimeOption;
