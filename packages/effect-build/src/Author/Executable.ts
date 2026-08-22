import type { Effect } from "effect";
import type * as CoreArtifact from "../Artifact.js";
import type { AbsolutePath, ObservationMode } from "../Artifact.js";

export type Artifact<Mode extends ObservationMode> = CoreArtifact.Executable<Mode>;
export type HashedArtifact = CoreArtifact.HashedExecutable;
export type UnhashedArtifact = CoreArtifact.UnhashedExecutable;

export interface RuntimeObservation {
  readonly name: string;
  readonly version: string;
}

export type SystemTargetObservation =
  | { readonly os: "macos"; readonly architecture: "x64"; readonly abi?: never }
  | { readonly os: "macos"; readonly architecture: "arm64"; readonly abi?: never }
  | { readonly os: "linux"; readonly architecture: "x64"; readonly abi: "gnu" }
  | { readonly os: "linux"; readonly architecture: "x64"; readonly abi: "musl" }
  | { readonly os: "linux"; readonly architecture: "arm64"; readonly abi: "gnu" }
  | { readonly os: "linux"; readonly architecture: "arm64"; readonly abi: "musl" }
  | { readonly os: "windows"; readonly architecture: "x64"; readonly abi?: never }
  | { readonly os: "windows"; readonly architecture: "arm64"; readonly abi?: never };

export type Failure<ProviderFailure> =
  | ProviderFailure
  | { readonly _tag: "ExecutableCandidateMissing"; readonly stagedPath: AbsolutePath }
  | { readonly _tag: "ExecutableCandidateChanged"; readonly stagedPath: AbsolutePath }
  | {
    readonly _tag: "ExecutableInspectionFailed";
    readonly stagedPath: AbsolutePath;
    readonly reason: string;
  }
  | { readonly _tag: "ExecutableDestinationLocked"; readonly destination: AbsolutePath }
  | { readonly _tag: "ExecutableCommitFailed"; readonly destination: AbsolutePath; readonly reason: string };

export interface Request<Mode extends ObservationMode> {
  readonly destination: string;
  readonly observation: Mode;
  readonly runtime: RuntimeObservation;
  readonly target: SystemTargetObservation;
}

export interface Author<ProviderFailure, Requirements = never> {
  readonly publish: <Mode extends ObservationMode>(
    request: Request<Mode>,
    produce: (privateSameParentCandidate: AbsolutePath) => Effect.Effect<void, ProviderFailure, Requirements>,
  ) => Effect.Effect<Artifact<Mode>, Failure<ProviderFailure>, Requirements>;
}
