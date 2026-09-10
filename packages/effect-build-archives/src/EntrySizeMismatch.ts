import { Schema } from "effect";

/** An entry's contents delivered a different byte count than its record, so the archive cannot describe it consistently. */
export class EntrySizeMismatch extends Schema.TaggedError<EntrySizeMismatch>()("ArchiveEntrySizeMismatch", {
  path: Schema.String,
  expected: Schema.Number,
  actual: Schema.Number,
}) {
  override get message(): string {
    return `entry streamed ${this.actual} bytes but recorded ${this.expected}: ${this.path}`;
  }
}
