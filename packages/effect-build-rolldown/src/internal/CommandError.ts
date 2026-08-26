import { Schema } from "effect";

export type CommandOperation = "probe" | "bundleStdout" | "bundleDirect" | "bundleWatch";

export class RolldownCommandInputInvalid extends Schema.TaggedError<RolldownCommandInputInvalid>()(
  "RolldownCommandInputInvalid",
  { operation: Schema.String, reason: Schema.String },
) {}

export class RolldownCommandUnsupported extends Schema.TaggedError<RolldownCommandUnsupported>()(
  "RolldownCommandUnsupported",
  { operation: Schema.String, version: Schema.String, reason: Schema.String },
) {}

export class RolldownCommandTransportFailed extends Schema.TaggedError<RolldownCommandTransportFailed>()(
  "RolldownCommandTransportFailed",
  { operation: Schema.String, cause: Schema.Unknown },
) {}

export class RolldownCommandFailed extends Schema.TaggedError<RolldownCommandFailed>()("RolldownCommandFailed", {
  operation: Schema.String,
  publication: Schema.Literals(["none", "provider-direct-durable"] as const),
  exitCode: Schema.Number,
  stdout: Schema.Uint8Array,
  stderr: Schema.Uint8Array,
  stdoutTruncated: Schema.Boolean,
  stderrTruncated: Schema.Boolean,
}) {}

/** A successful stdout-producing command exceeded the configured capture bound. */
export class RolldownCommandOutputTruncated extends Schema.TaggedError<RolldownCommandOutputTruncated>()(
  "RolldownCommandOutputTruncated",
  {
    operation: Schema.String,
    publication: Schema.Literal("none"),
    exitCode: Schema.Number,
    stdout: Schema.Uint8Array,
    stderr: Schema.Uint8Array,
    stdoutTruncated: Schema.Literal(true),
    stderrTruncated: Schema.Boolean,
    outputLimitBytes: Schema.Number,
  },
) {}
