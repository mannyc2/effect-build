import { Schema } from "effect";

/** The input is valid, but a fixed-width field of the selected archive format cannot hold it. */
export class FormatLimit extends Schema.TaggedError<FormatLimit>()("ArchiveFormatLimit", {
  format: Schema.Literals(["zip", "tar"] as const),
  limit: Schema.Literals(["entries", "entry-bytes", "archive-bytes", "name-bytes"] as const),
  maximum: Schema.Number,
  path: Schema.optionalKey(Schema.String),
}) {
  override get message(): string {
    return `${this.format} ${this.limit} exceed the format maximum of ${this.maximum}${this.path === undefined ? "" : `: ${this.path}`}`;
  }
}
