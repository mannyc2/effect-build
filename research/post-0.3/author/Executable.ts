import type { Effect } from "effect";
import type { ObservationMode } from "./BorrowedOutput.js";
import type { DecimalBytes, Digest } from "./Tool.js";

/** Proposed public contract: effect-build/Author/Executable. Research-only here. */
export interface RuntimeObservation {
  readonly name: string;
  readonly version: string;
}

export interface SystemTargetObservation {
  readonly os: "linux" | "macos" | "windows";
  readonly architecture: "x64" | "arm64";
  readonly abi?: string;
}

interface ArtifactBase {
  readonly path: string;
  readonly bytes: DecimalBytes;
  readonly nativeFormat: "elf" | "mach-o" | "pe";
  readonly runtime: RuntimeObservation;
  readonly target: SystemTargetObservation;
  readonly publication: {
    readonly commit: "same-parent-rename";
    readonly committed: true;
  };
}

export interface UnhashedArtifact extends ArtifactBase {
  readonly _tag: "UnhashedExecutableArtifact";
}

export interface HashedArtifact extends ArtifactBase {
  readonly _tag: "HashedExecutableArtifact";
  readonly digest: Digest;
}

export type Artifact<Mode extends ObservationMode> = Mode extends "hashed" ? HashedArtifact : UnhashedArtifact;

export type Failure<ProviderFailure> =
  | ProviderFailure
  | { readonly _tag: "ExecutableCandidateMissing"; readonly stagedPath: string }
  | { readonly _tag: "ExecutableCandidateChanged"; readonly stagedPath: string }
  | { readonly _tag: "ExecutableInspectionFailed"; readonly stagedPath: string; readonly reason: string }
  | { readonly _tag: "ExecutableDestinationLocked"; readonly destination: string }
  | { readonly _tag: "ExecutableCommitFailed"; readonly destination: string; readonly reason: string };

export interface Request<Mode extends ObservationMode> {
  readonly destination: string;
  readonly observation: Mode;
  readonly runtime: RuntimeObservation;
  readonly target: SystemTargetObservation;
}

export interface Author<ProviderFailure, Requirements = never> {
  readonly publish: <Mode extends ObservationMode>(
    request: Request<Mode>,
    produce: (privateSameParentCandidate: string) => Effect.Effect<void, ProviderFailure, Requirements>,
  ) => Effect.Effect<Artifact<Mode>, Failure<ProviderFailure>, Requirements>;
}
