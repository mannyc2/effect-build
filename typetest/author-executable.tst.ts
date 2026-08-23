import type { Effect } from "effect";
import type * as Artifact from "../packages/effect-build/src/Artifact.js";
import * as AuthorExecutableRuntime from "../packages/effect-build/src/Author/Executable.js";
import type * as AuthorExecutable from "../packages/effect-build/src/Author/Executable.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type SuccessOf<T> = T extends Effect.Effect<infer A, unknown, unknown> ? A : never;
type ErrorOf<T> = T extends Effect.Effect<unknown, infer E, unknown> ? E : never;
type RequirementsOf<T> = T extends Effect.Effect<unknown, unknown, infer R> ? R : never;

type ExactSystemTargetObservation =
  | { readonly os: "macos"; readonly architecture: "x64"; readonly abi?: never }
  | { readonly os: "macos"; readonly architecture: "arm64"; readonly abi?: never }
  | { readonly os: "linux"; readonly architecture: "x64"; readonly abi: "gnu" }
  | { readonly os: "linux"; readonly architecture: "x64"; readonly abi: "musl" }
  | { readonly os: "linux"; readonly architecture: "arm64"; readonly abi: "gnu" }
  | { readonly os: "linux"; readonly architecture: "arm64"; readonly abi: "musl" }
  | { readonly os: "windows"; readonly architecture: "x64"; readonly abi?: never }
  | { readonly os: "windows"; readonly architecture: "arm64"; readonly abi?: never };

export type _NoRuntimeExports = Assert<Same<keyof typeof AuthorExecutableRuntime, never>>;
export type _ArtifactAlias = Assert<
  Same<AuthorExecutable.Artifact<Artifact.ObservationMode>, Artifact.Executable<Artifact.ObservationMode>>
>;
export type _HashedArtifactAlias = Assert<Same<AuthorExecutable.HashedArtifact, Artifact.HashedExecutable>>;
export type _UnhashedArtifactAlias = Assert<Same<AuthorExecutable.UnhashedArtifact, Artifact.UnhashedExecutable>>;
export type _SystemTargetIngress = Assert<
  Same<AuthorExecutable.SystemTargetObservation, ExactSystemTargetObservation>
>;
export type _RequestDestination = Assert<Same<AuthorExecutable.Request<"hashed">["destination"], string>>;
export type _RequestObservation = Assert<Same<AuthorExecutable.Request<"hashed">["observation"], "hashed">>;
export type _RequestRuntime = Assert<
  Same<AuthorExecutable.Request<"hashed">["runtime"], AuthorExecutable.RuntimeObservation>
>;
export type _RequestTarget = Assert<
  Same<AuthorExecutable.Request<"hashed">["target"], AuthorExecutable.SystemTargetObservation>
>;

export type _FailureTags = Assert<
  Same<
    AuthorExecutable.Failure<never>["_tag"],
    | "ExecutableCandidateMissing"
    | "ExecutableCandidateChanged"
    | "ExecutableInspectionFailed"
    | "ExecutableDestinationLocked"
    | "ExecutableCommitFailed"
  >
>;
export type _StagedFailurePath = Assert<
  Same<
    Extract<AuthorExecutable.Failure<never>, { readonly _tag: "ExecutableCandidateMissing" }>["stagedPath"],
    Artifact.AbsolutePath
  >
>;
export type _DestinationFailurePath = Assert<
  Same<
    Extract<AuthorExecutable.Failure<never>, { readonly _tag: "ExecutableCommitFailed" }>["destination"],
    Artifact.AbsolutePath
  >
>;

type Publish = AuthorExecutable.Author<"provider-failure", "provider-requirement">["publish"];
type PublishProduce = Parameters<Publish>[1];

export type _PrivateCandidateIsAbsolute = Assert<Same<Parameters<PublishProduce>[0], Artifact.AbsolutePath>>;

declare const author: AuthorExecutable.Author<"provider-failure", "provider-requirement">;
declare const hashedRequest: AuthorExecutable.Request<"hashed">;
declare const unhashedRequest: AuthorExecutable.Request<"unhashed">;
declare const produce: (
  privateSameParentCandidate: Artifact.AbsolutePath,
) => Effect.Effect<void, "provider-failure", "provider-requirement">;

const hashedPublication = author.publish(hashedRequest, produce);
const unhashedPublication = author.publish(unhashedRequest, produce);

export type _HashedPublishSuccess = Assert<
  Same<SuccessOf<typeof hashedPublication>, AuthorExecutable.HashedArtifact>
>;
export type _UnhashedPublishSuccess = Assert<
  Same<SuccessOf<typeof unhashedPublication>, AuthorExecutable.UnhashedArtifact>
>;
export type _HashedPublishError = Assert<
  Same<ErrorOf<typeof hashedPublication>, AuthorExecutable.Failure<"provider-failure">>
>;
export type _UnhashedPublishError = Assert<
  Same<ErrorOf<typeof unhashedPublication>, AuthorExecutable.Failure<"provider-failure">>
>;
export type _HashedPublishRequirements = Assert<
  Same<RequirementsOf<typeof hashedPublication>, "provider-requirement">
>;
export type _UnhashedPublishRequirements = Assert<
  Same<RequirementsOf<typeof unhashedPublication>, "provider-requirement">
>;

export const _linuxGnu: AuthorExecutable.SystemTargetObservation = {
  os: "linux",
  architecture: "arm64",
  abi: "gnu",
};
export const _macos: AuthorExecutable.SystemTargetObservation = {
  os: "macos",
  architecture: "x64",
};

// @ts-expect-error!
export const _linuxWithoutAbi: AuthorExecutable.SystemTargetObservation = { os: "linux", architecture: "x64" };
export const _macosWithAbi: AuthorExecutable.SystemTargetObservation = {
  os: "macos",
  architecture: "arm64",
  // @ts-expect-error!
  abi: "gnu",
};
// @ts-expect-error!
export const _aarch64Ingress: AuthorExecutable.SystemTargetObservation = { os: "windows", architecture: "aarch64" };
