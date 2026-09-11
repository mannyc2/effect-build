import { Schema } from "effect";

/** The tar that `git archive` exported could not be decoded; `offset` is where the bad record starts. */
export class TarInvalid extends Schema.TaggedError<TarInvalid>()("ArchiveTarInvalid", {
  path: Schema.String,
  offset: Schema.Number,
  detail: Schema.String,
}) {
  override get message(): string {
    return `${this.detail} at byte ${this.offset}: ${this.path}`;
  }
}
