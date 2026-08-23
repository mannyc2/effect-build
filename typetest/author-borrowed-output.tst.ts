import type { Effect, Scope } from "effect";
import type * as Artifact from "../packages/effect-build/src/Artifact.js";
import * as BorrowedOutputRuntime from "../packages/effect-build/src/Author/BorrowedOutput.js";
import type * as BorrowedOutput from "../packages/effect-build/src/Author/BorrowedOutput.js";
import type * as Tool from "../packages/effect-build/src/Author/Tool.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type SuccessOf<T> = T extends Effect.Effect<infer A, unknown, unknown> ? A : never;
type ErrorOf<T> = T extends Effect.Effect<unknown, infer E, unknown> ? E : never;
type RequirementsOf<T> = T extends Effect.Effect<unknown, unknown, infer R> ? R : never;

export type _NoRuntimeExports = Assert<Same<keyof typeof BorrowedOutputRuntime, never>>;
export type _DecimalBytesAlias = Assert<Same<BorrowedOutput.DecimalBytes, Tool.DecimalBytes>>;
export type _DigestAlias = Assert<Same<BorrowedOutput.Digest, Tool.Digest>>;
export type _ObservationModeAlias = Assert<Same<BorrowedOutput.ObservationMode, Artifact.ObservationMode>>;

export type _UnhashedFileObservationTag = Assert<
  Same<BorrowedOutput.UnhashedFileObservation["_tag"], "UnhashedFileObservation">
>;
export type _HashedFileObservationTag = Assert<
  Same<BorrowedOutput.HashedFileObservation["_tag"], "HashedFileObservation">
>;
export type _FileObservationKind = Assert<Same<BorrowedOutput.FileObservation<"hashed">["kind"], "file">>;
export type _FileObservationPath = Assert<
  Same<BorrowedOutput.FileObservation<"unhashed">["path"], Artifact.AbsolutePath>
>;
export type _UnhashedFileObservationHasNoDigest = Assert<
  Same<Extract<keyof BorrowedOutput.UnhashedFileObservation, "digest">, never>
>;
export type _HashedFileObservationDigest = Assert<
  Same<BorrowedOutput.HashedFileObservation["digest"], Tool.Digest>
>;

export type _UnhashedTreeObservationTag = Assert<
  Same<BorrowedOutput.UnhashedTreeObservation["_tag"], "UnhashedTreeObservation">
>;
export type _HashedTreeObservationTag = Assert<
  Same<BorrowedOutput.HashedTreeObservation["_tag"], "HashedTreeObservation">
>;
export type _TreeRoot = Assert<
  Same<BorrowedOutput.TreeObservation<"hashed">["root"], Artifact.AbsolutePath>
>;
export type _DirectoryEntryHasNoDigest = Assert<
  Same<Extract<keyof BorrowedOutput.TreeDirectoryEntry, "digest">, never>
>;
export type _UnhashedTreeFileHasNoDigest = Assert<
  Same<Extract<keyof BorrowedOutput.UnhashedTreeFileEntry, "digest">, never>
>;
export type _HashedTreeFileDigest = Assert<Same<BorrowedOutput.HashedTreeFileEntry["digest"], Tool.Digest>>;
export type _HashedManifestDigest = Assert<
  Same<BorrowedOutput.HashedTreeObservation["manifestDigest"], Tool.Digest>
>;
export type _UnhashedTreeHasNoManifestDigest = Assert<
  Same<Extract<keyof BorrowedOutput.UnhashedTreeObservation, "manifestDigest">, never>
>;

export type _BorrowedFileLocator = Assert<
  Same<BorrowedOutput.File<"hashed">["path"], Artifact.AbsolutePath>
>;
export type _BorrowedTreeLocator = Assert<
  Same<BorrowedOutput.Tree<"unhashed">["root"], Artifact.AbsolutePath>
>;
export type _FailureTags = Assert<
  Same<
    BorrowedOutput.Failure["_tag"],
    | "BorrowedOutputExpired"
    | "BorrowedOutputChanged"
    | "BorrowedOutputEscaped"
    | "BorrowedOutputMissing"
    | "BorrowedOutputObservationFailed"
  >
>;

declare const author: BorrowedOutput.Author<"produce-failure", "author-requirement">;
declare const useHashedFile: (
  file: BorrowedOutput.File<"hashed">,
) => Effect.Effect<Tool.Digest, "file-callback-failure", "file-callback-requirement" | Scope.Scope>;
declare const useUnhashedTree: (
  tree: BorrowedOutput.Tree<"unhashed">,
) => Effect.Effect<Tool.DecimalBytes, "tree-callback-failure", "tree-callback-requirement" | Scope.Scope>;

const hashedFileResult = author.withFile("hashed", useHashedFile);
const unhashedTreeResult = author.withTree("unhashed", useUnhashedTree);

export type _WithHashedFileSuccess = Assert<Same<SuccessOf<typeof hashedFileResult>, Tool.Digest>>;
export type _WithHashedFileError = Assert<
  Same<
    ErrorOf<typeof hashedFileResult>,
    "produce-failure" | BorrowedOutput.Failure | "file-callback-failure"
  >
>;
export type _WithHashedFileRequirements = Assert<
  Same<RequirementsOf<typeof hashedFileResult>, "author-requirement" | "file-callback-requirement">
>;
export type _WithUnhashedTreeSuccess = Assert<Same<SuccessOf<typeof unhashedTreeResult>, Tool.DecimalBytes>>;
export type _WithUnhashedTreeError = Assert<
  Same<
    ErrorOf<typeof unhashedTreeResult>,
    "produce-failure" | BorrowedOutput.Failure | "tree-callback-failure"
  >
>;
export type _WithUnhashedTreeRequirements = Assert<
  Same<RequirementsOf<typeof unhashedTreeResult>, "author-requirement" | "tree-callback-requirement">
>;

declare const unhashedFile: BorrowedOutput.UnhashedFileObservation;
// @ts-expect-error!
unhashedFile.digest;

declare const unhashedTreeFile: BorrowedOutput.UnhashedTreeFileEntry;
// @ts-expect-error!
unhashedTreeFile.digest;
