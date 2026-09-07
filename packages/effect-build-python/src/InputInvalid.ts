import { Schema } from "effect";

export class InputInvalid extends Schema.TaggedError<InputInvalid>()("PythonInputInvalid", {
  reason: Schema.String,
}) {}
