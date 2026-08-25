import { Schema } from "effect";

export type CommandOperation =
  | "probe"
  | "bundleStdout"
  | "bundleDirect"
  | "bundleWatch"
  | "bundleDeclarations"
  | "transpileStdout"
  | "transpileDirect"
  | "transpileDeclarations"
  | "compileExecutable"
  | "compileWatch";

export class DenoCommandInputInvalid extends Schema.TaggedError<DenoCommandInputInvalid>()(
  "DenoCommandInputInvalid",
  { operation: Schema.String, reason: Schema.String },
) {}

export class DenoCommandUnsupported extends Schema.TaggedError<DenoCommandUnsupported>()(
  "DenoCommandUnsupported",
  { operation: Schema.String, version: Schema.String, reason: Schema.String },
) {}

export class DenoCommandTransportFailed extends Schema.TaggedError<DenoCommandTransportFailed>()(
  "DenoCommandTransportFailed",
  { operation: Schema.String, cause: Schema.Unknown },
) {}

export class DenoCommandFailed extends Schema.TaggedError<DenoCommandFailed>()("DenoCommandFailed", {
  operation: Schema.String,
  publication: Schema.Literals(["none", "provider-direct-durable"] as const),
  exitCode: Schema.Number,
  stdout: Schema.Uint8Array,
  stderr: Schema.Uint8Array,
  stdoutTruncated: Schema.Boolean,
  stderrTruncated: Schema.Boolean,
}) {}
