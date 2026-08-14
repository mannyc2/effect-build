import { type Crypto, Effect, type FileSystem, type Path, type Scope } from "effect";
import type * as Integration from "../packages/effect-build/src/Integration.js";
import * as JavaScriptBundle from "../packages/effect-build/src/JavaScriptBundle.js";
import type * as Artifact from "../packages/effect-build/src/standalone/Artifact.js";
import type * as Target from "../packages/effect-build/src/standalone/Target.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

export type _SystemTargets = Assert<
  Same<
    Target.SystemTarget,
    | "macos-x64"
    | "macos-aarch64"
    | "linux-x64-gnu"
    | "linux-x64-musl"
    | "linux-aarch64-gnu"
    | "linux-aarch64-musl"
    | "windows-x64"
    | "windows-aarch64"
  >
>;
export type _ResolutionTarget = Assert<Same<Target.ResolutionTarget, "node">>;
export type _TemporaryTargetAlias = Assert<Same<Target.Target, Target.SystemTarget>>;
export type _FilePath = Assert<Same<Artifact.FileArtifact["path"], Artifact.AbsolutePath>>;
export type _FileBytes = Assert<Same<Artifact.FileArtifact["bytes"], Artifact.ByteCount>>;
export type _FileDigest = Assert<Same<Artifact.FileArtifact["digest"], Artifact.Digest | undefined>>;
export type _ExecutableTarget = Assert<Same<Artifact.ExecutableArtifact["target"], Target.SystemTarget>>;
export type _ExecutableStages = Assert<
  Artifact.ExecutableArtifact["stages"] extends readonly [Artifact.StageObservation, ...Artifact.StageObservation[]]
    ? true
    : false
>;

type ContextOf<T> = T extends Effect.Effect<unknown, unknown, infer R> ? R : never;
type ErrorOf<T> = T extends Effect.Effect<unknown, infer E, unknown> ? E : never;

declare const bundleInput: JavaScriptBundle.Input<readonly []>;
const borrowed = JavaScriptBundle.withFile(
  bundleInput,
  (): Effect.Effect<"used", "callback-failure", Scope.Scope> =>
    Effect.succeed("used") as Effect.Effect<"used", "callback-failure", Scope.Scope>,
);
export type _BorrowedExcludesScope = Assert<
  Same<
    ContextOf<typeof borrowed>,
    FileSystem.FileSystem | Path.Path | Crypto.Crypto
  >
>;
export type _BorrowedErrors = Assert<
  Same<
    ErrorOf<typeof borrowed>,
    JavaScriptBundle.InvalidJavaScriptBundle | JavaScriptBundle.JavaScriptBundleAccessFailed | "callback-failure"
  >
>;
export type _InspectReturnsSameCapability = Assert<
  ReturnType<typeof Integration.inspectLiveJavaScriptBundle<readonly []>> extends Effect.Effect<
    JavaScriptBundle.Artifact<readonly []>,
    JavaScriptBundle.InvalidJavaScriptBundle | JavaScriptBundle.JavaScriptBundleAccessFailed,
    unknown
  > ? true
    : false
>;

declare const plain: {
  readonly path: string;
  readonly bytes: number;
  readonly digest: `sha256:${string}`;
  readonly format: "esm";
  readonly resolutionTarget: "node";
  readonly observedExternalImports: readonly string[];
  readonly stages: readonly [];
};
// @ts-expect-error Property '[ArtifactTypeId]' is missing
const _nominal: JavaScriptBundle.Artifact<readonly []> = plain;
