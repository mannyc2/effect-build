import { Schema } from "effect";

export type CommandOperation = "probe" | "buildStdout" | "buildDirect" | "buildWatch" | "serve";

export class EsbuildCommandInputInvalid extends Schema.TaggedError<EsbuildCommandInputInvalid>()(
  "EsbuildCommandInputInvalid",
  { operation: Schema.String, reason: Schema.String },
) {}

export class EsbuildCommandUnsupported extends Schema.TaggedError<EsbuildCommandUnsupported>()(
  "EsbuildCommandUnsupported",
  { operation: Schema.String, version: Schema.String, reason: Schema.String },
) {}

export class EsbuildCommandTransportFailed extends Schema.TaggedError<EsbuildCommandTransportFailed>()(
  "EsbuildCommandTransportFailed",
  { operation: Schema.String, cause: Schema.Unknown },
) {}

export class EsbuildCommandFailed extends Schema.TaggedError<EsbuildCommandFailed>()("EsbuildCommandFailed", {
  operation: Schema.String,
  publication: Schema.Literals(["none", "provider-direct-durable"] as const),
  exitCode: Schema.Number,
  stdout: Schema.Uint8Array,
  stderr: Schema.Uint8Array,
  stdoutTruncated: Schema.Boolean,
  stderrTruncated: Schema.Boolean,
}) {}

/** A successful stdout-producing command exceeded the configured capture bound. */
export class EsbuildCommandOutputTruncated extends Schema.TaggedError<EsbuildCommandOutputTruncated>()(
  "EsbuildCommandOutputTruncated",
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
