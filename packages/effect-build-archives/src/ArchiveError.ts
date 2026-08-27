import { Schema } from "effect";

/** A caller-supplied archive path would make the resulting layout ambiguous or unsafe. */
export class UnsafeArchiveLayout extends Schema.TaggedError<UnsafeArchiveLayout>()("UnsafeArchiveLayout", {
  path: Schema.String,
  reason: Schema.String,
}) {
  override get message(): string {
    return `unsafe archive layout at ${JSON.stringify(this.path)}: ${this.reason}`;
  }
}

/** Archive bytes could not be read, encoded, or written. */
export class ArchiveFailed extends Schema.TaggedError<ArchiveFailed>()("ArchiveFailed", {
  operation: Schema.String,
  reason: Schema.String,
}) {
  override get message(): string {
    return `archive ${this.operation} failed: ${this.reason}`;
  }
}

/** An exact Git tree could not be projected into a source archive. */
export class SourceArchiveFailed extends Schema.TaggedError<SourceArchiveFailed>()("SourceArchiveFailed", {
  repository: Schema.String,
  tree: Schema.String,
  reason: Schema.String,
}) {
  override get message(): string {
    return `source archive for tree ${this.tree} in ${this.repository} failed: ${this.reason}`;
  }
}
