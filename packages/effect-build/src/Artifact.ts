import { Schema } from "effect";
import type { Target } from "./Target.js";

export interface Tool {
  readonly name: string;
  readonly version: string;
}

export interface Executable {
  readonly _tag: "Executable";
  /** Absolute path of the committed executable. */
  readonly path: string;
  readonly bytes: number;
  readonly target: Target;
  readonly tool: Tool;
  /** Lowercase hex SHA-256 of the exact committed contents. */
  readonly sha256: string;
}

/** One finalized regular file committed by a concrete build tool. */
export interface FileArtifact {
  readonly _tag: "File";
  /** Absolute path of the committed file. */
  readonly path: string;
  readonly bytes: number;
  readonly tool: Tool;
  /** Lowercase hex SHA-256 of the exact committed contents. */
  readonly sha256: string;
}

export interface BundleFile {
  readonly _tag: "File";
  /** Absolute path of the committed file. */
  readonly path: string;
  readonly bytes: number;
  /** Permission bits captured on the committed file. */
  readonly mode: number;
  /** Lowercase hex SHA-256 of the exact committed contents. */
  readonly sha256: string;
}

export interface BundleDirectory {
  readonly _tag: "Directory";
  /** Absolute path of the committed directory. */
  readonly path: string;
  /** Permission bits captured on the committed directory. */
  readonly mode: number;
}

export interface BundleSymbolicLink {
  readonly _tag: "SymbolicLink";
  /** Absolute path of the committed symbolic link. */
  readonly path: string;
  /** Exact relative link text. Absolute and escaping links are rejected. */
  readonly target: string;
}

export type BundleEntry = BundleFile | BundleDirectory | BundleSymbolicLink;

export const Sha256 = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{64}$/, { expected: "a canonical lowercase SHA-256 digest" }),
);
export type Sha256 = typeof Sha256.Type;

/** Portable permission bits retained by an exact bundle manifest. */
export const Mode = Schema.Natural.check(Schema.isLessThanOrEqualTo(0o7777));
export type Mode = typeof Mode.Type;

/** Exact byte identity shared by every finalized regular-file projection. */
export const FinalizedFile = Schema.Struct({
  path: Schema.NonEmptyString,
  bytes: Schema.Natural,
  sha256: Sha256,
});
export type FinalizedFile = typeof FinalizedFile.Type;

export interface Bundle {
  readonly _tag: "Bundle";
  /** Absolute path of the directory holding the committed files. */
  readonly outdir: string;
  /** Every committed file, directory, and symbolic link, sorted by path. */
  readonly entries: readonly BundleEntry[];
  readonly tool: Tool;
}

export const ToolSchema = Schema.Struct({
  name: Schema.NonEmptyString,
  version: Schema.NonEmptyString,
});

export const BundleFileSchema = Schema.Struct({
  _tag: Schema.Literal("File"),
  path: Schema.NonEmptyString,
  bytes: Schema.Natural,
  mode: Mode,
  sha256: Sha256,
});

export const BundleDirectorySchema = Schema.Struct({
  _tag: Schema.Literal("Directory"),
  path: Schema.NonEmptyString,
  mode: Mode,
});

export const BundleSymbolicLinkSchema = Schema.Struct({
  _tag: Schema.Literal("SymbolicLink"),
  path: Schema.NonEmptyString,
  target: Schema.NonEmptyString,
});

export const BundleEntrySchema = Schema.Union([
  BundleFileSchema,
  BundleDirectorySchema,
  BundleSymbolicLinkSchema,
]);

export const BundleSchema = Schema.Struct({
  _tag: Schema.Literal("Bundle"),
  outdir: Schema.NonEmptyString,
  entries: Schema.Array(BundleEntrySchema),
  tool: ToolSchema,
});

/** Complete cross-provider artifact result family. */
export type FinalizedArtifact = Executable | FileArtifact | Bundle;
