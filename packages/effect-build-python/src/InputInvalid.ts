import { Schema } from "effect";

export class InputInvalid extends Schema.TaggedError<InputInvalid>()("PythonInputInvalid", {
  reason: Schema.String,
  path: Schema.optionalKey(Schema.String),
}) {
  override get message(): string {
    return `${this.reason}${this.path === undefined ? "" : `: ${this.path}`}`;
  }
}
