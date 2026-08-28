import { Schema } from "effect";

/** The uv frontend completed without the exact wheel-and-sdist result family. */
export class PythonBuildFailed extends Schema.TaggedError<PythonBuildFailed>()("PythonBuildFailed", {
  source: Schema.String,
  reason: Schema.String,
}) {
  override get message(): string {
    return `Python build for ${this.source} failed: ${this.reason}`;
  }
}

export class UvToolUnavailable extends Schema.TaggedError<UvToolUnavailable>()("UvToolUnavailable", {
  reason: Schema.String,
}) {
  override get message(): string {
    return `uv tool unavailable: ${this.reason}`;
  }
}

export class UvToolChanged extends Schema.TaggedError<UvToolChanged>()("UvToolChanged", {
  path: Schema.String,
  reason: Schema.String,
}) {
  override get message(): string {
    return `selected uv tool changed at ${this.path}: ${this.reason}`;
  }
}

export class UvTransportFailed extends Schema.TaggedError<UvTransportFailed>()("UvTransportFailed", {
  operation: Schema.String,
  cause: Schema.Unknown,
}) {
  override get message(): string {
    return `uv ${this.operation} transport failed: ${String(this.cause)}`;
  }
}

export class UvCommandFailed extends Schema.TaggedError<UvCommandFailed>()("UvCommandFailed", {
  operation: Schema.String,
  exitCode: Schema.Number,
  stdout: Schema.String,
  stderr: Schema.String,
  stdoutTruncated: Schema.Boolean,
  stderrTruncated: Schema.Boolean,
}) {
  override get message(): string {
    return `uv ${this.operation} exited ${this.exitCode}: ${this.stderr || this.stdout}`;
  }
}

export class UvOutputTruncated extends Schema.TaggedError<UvOutputTruncated>()("UvOutputTruncated", {
  operation: Schema.String,
  outputLimitBytes: Schema.Number,
}) {
  override get message(): string {
    return `uv ${this.operation} exceeded the ${this.outputLimitBytes}-byte diagnostic limit`;
  }
}
