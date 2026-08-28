import { Schema } from "effect";
import * as Artifact from "effect-build/Artifact";

/** The two deterministic archive encodings selected by the release contract. */
export const Format = Schema.Literals(["zip", "tar.gz"] as const);
export type Format = typeof Format.Type;

/** One exact finalized regular file projected to one portable archive path. */
export class ArchiveEntry extends Schema.Class<ArchiveEntry>(
  "effect-build-archives/ArchiveEntry",
)({
  artifact: Artifact.HashedFileSchema,
  path: Schema.NonEmptyString,
  executable: Schema.optionalKey(Schema.Boolean),
}) {}

/** Durable deterministic binary-archive input. */
export class ArchiveInput extends Schema.Class<ArchiveInput>(
  "effect-build-archives/ArchiveInput",
)({
  format: Format,
  entries: Schema.NonEmptyArray(ArchiveEntry),
  outfile: Schema.NonEmptyString,
  cwd: Schema.optionalKey(Schema.NonEmptyString),
}) {}

export const GitObjectId = Schema.String.check(
  Schema.isPattern(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/, {
    expected: "a canonical lowercase SHA-1 or SHA-256 Git object ID",
  }),
);
export type GitObjectId = typeof GitObjectId.Type;

const RootPart = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._+-]*$/, {
    expected: "a portable non-empty source-archive root component",
  }),
);

/** Durable exact-Git-tree source-archive input. */
export class SourceArchiveInput extends Schema.Class<SourceArchiveInput>(
  "effect-build-archives/SourceArchiveInput",
)({
  repository: Schema.NonEmptyString,
  tree: GitObjectId,
  project: RootPart,
  version: RootPart,
  format: Format,
  outfile: Schema.NonEmptyString,
  cwd: Schema.optionalKey(Schema.NonEmptyString),
  additionalExcludes: Schema.optionalKey(Schema.Array(Schema.NonEmptyString)),
}) {}
