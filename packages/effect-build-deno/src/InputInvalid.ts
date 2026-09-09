import { Schema } from "effect";

export class InputInvalid extends Schema.TaggedError<InputInvalid>()("DenoInputInvalid", {
  reason: Schema.String,
  operation: Schema.optionalKey(Schema.String),
}) {
  override get message(): string {
    return this.operation === undefined ? this.reason : `${this.operation}: ${this.reason}`;
  }
}
