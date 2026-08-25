import { Schema } from "effect";

export type CommandOperation = "probe" | "buildStdout" | "buildDirect" | "buildWatch" | "compileExecutable";

export class BunCommandInputInvalid extends Schema.TaggedError<BunCommandInputInvalid>()(
  "BunCommandInputInvalid",
  {
    operation: Schema.String,
    reason: Schema.String,
  },
) {}

export class BunCommandUnsupported extends Schema.TaggedError<BunCommandUnsupported>()(
  "BunCommandUnsupported",
  {
    operation: Schema.String,
    version: Schema.String,
    reason: Schema.String,
  },
) {}

export class BunCommandTransportFailed extends Schema.TaggedError<BunCommandTransportFailed>()(
  "BunCommandTransportFailed",
  {
    operation: Schema.String,
    cause: Schema.Unknown,
  },
) {}

/** Non-zero provider exit with the exact bounded raw stream prefixes. */
export class BunCommandFailed extends Schema.TaggedError<BunCommandFailed>()("BunCommandFailed", {
  operation: Schema.String,
  publication: Schema.Literals(["none", "provider-direct-durable"] as const),
  exitCode: Schema.Number,
  stdout: Schema.Uint8Array,
  stderr: Schema.Uint8Array,
  stdoutTruncated: Schema.Boolean,
  stderrTruncated: Schema.Boolean,
}) {}
