import type { Effect, Scope } from "effect";
import type { DecimalBytes, Digest } from "./Tool.js";

export type { DecimalBytes, Digest } from "./Tool.js";

/** Proposed public contract: effect-build/Author/BorrowedOutput. Research-only here. */
export interface UnhashedFileObservation {
  readonly _tag: "UnhashedFileObservation";
  readonly path: string;
  readonly kind: "file";
  readonly bytes: DecimalBytes;
}

export interface HashedFileObservation {
  readonly _tag: "HashedFileObservation";
  readonly path: string;
  readonly kind: "file";
  readonly bytes: DecimalBytes;
  readonly digest: Digest;
}

export interface UnhashedTreeObservation {
  readonly _tag: "UnhashedTreeObservation";
  readonly root: string;
  readonly entries: readonly UnhashedTreeEntry[];
  readonly totalBytes: DecimalBytes;
}

export interface TreeDirectoryEntry {
  readonly relativePath: string;
  readonly kind: "directory";
}

export interface UnhashedTreeFileEntry {
  readonly relativePath: string;
  readonly kind: "file";
  readonly bytes: DecimalBytes;
}

export interface HashedTreeFileEntry extends UnhashedTreeFileEntry {
  readonly digest: Digest;
}

export type UnhashedTreeEntry = TreeDirectoryEntry | UnhashedTreeFileEntry;
export type HashedTreeEntry = TreeDirectoryEntry | HashedTreeFileEntry;

export interface HashedTreeObservation {
  readonly _tag: "HashedTreeObservation";
  readonly root: string;
  readonly entries: readonly HashedTreeEntry[];
  readonly totalBytes: DecimalBytes;
  readonly manifestDigest: Digest;
}

export type ObservationMode = "hashed" | "unhashed";
export type FileObservation<Mode extends ObservationMode> = Mode extends "hashed" ? HashedFileObservation
  : UnhashedFileObservation;
export type TreeObservation<Mode extends ObservationMode> = Mode extends "hashed" ? HashedTreeObservation
  : UnhashedTreeObservation;

export type Failure =
  | { readonly _tag: "BorrowedOutputExpired"; readonly leaseId: string }
  | { readonly _tag: "BorrowedOutputChanged"; readonly leaseId: string; readonly mismatch: string }
  | { readonly _tag: "BorrowedOutputEscaped"; readonly leaseId: string; readonly candidate: string }
  | { readonly _tag: "BorrowedOutputMissing"; readonly leaseId: string; readonly path: string }
  | { readonly _tag: "BorrowedOutputObservationFailed"; readonly leaseId: string; readonly reason: string };

export interface File<Mode extends ObservationMode> {
  /** Copyable locator, explicitly not continuing authority. */
  readonly path: string;
  readonly initial: FileObservation<Mode>;
  /** Revocable producer-owned authority; new calls fail once close begins. */
  readonly observe: Effect.Effect<FileObservation<Mode>, Failure>;
}

export interface Tree<Mode extends ObservationMode> {
  /** Copyable locator, explicitly not continuing authority. */
  readonly root: string;
  readonly initial: TreeObservation<Mode>;
  readonly observe: Effect.Effect<TreeObservation<Mode>, Failure>;
}

export interface Author<ProduceFailure, Requirements = never> {
  readonly withFile: <Mode extends ObservationMode, A, E, R>(
    mode: Mode,
    use: (file: File<Mode>) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, ProduceFailure | Failure | E, Requirements | Exclude<R, Scope.Scope>>;
  readonly withTree: <Mode extends ObservationMode, A, E, R>(
    mode: Mode,
    use: (tree: Tree<Mode>) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, ProduceFailure | Failure | E, Requirements | Exclude<R, Scope.Scope>>;
}
