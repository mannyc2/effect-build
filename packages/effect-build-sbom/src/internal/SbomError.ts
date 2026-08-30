import { Schema } from "effect";

export class SyftToolUnavailable extends Schema.TaggedError<SyftToolUnavailable>()("SyftToolUnavailable", {
  reason: Schema.String,
}) {
  override get message(): string {
    return `Syft tool unavailable: ${this.reason}`;
  }
}

export class SyftToolChanged extends Schema.TaggedError<SyftToolChanged>()("SyftToolChanged", {
  path: Schema.String,
  reason: Schema.String,
}) {
  override get message(): string {
    return `selected Syft tool changed at ${this.path}: ${this.reason}`;
  }
}

export class SyftTransportFailed extends Schema.TaggedError<SyftTransportFailed>()("SyftTransportFailed", {
  operation: Schema.String,
  cause: Schema.Unknown,
}) {
  override get message(): string {
    return `Syft ${this.operation} transport failed: ${String(this.cause)}`;
  }
}

export class SyftCommandFailed extends Schema.TaggedError<SyftCommandFailed>()("SyftCommandFailed", {
  operation: Schema.String,
  exitCode: Schema.Number,
  stdout: Schema.String,
  stderr: Schema.String,
  stdoutTruncated: Schema.Boolean,
  stderrTruncated: Schema.Boolean,
}) {
  override get message(): string {
    return `Syft ${this.operation} exited ${this.exitCode}: ${this.stderr || this.stdout}`;
  }
}

export class SyftOutputTruncated extends Schema.TaggedError<SyftOutputTruncated>()("SyftOutputTruncated", {
  operation: Schema.String,
  outputLimitBytes: Schema.Number,
}) {
  override get message(): string {
    return `Syft ${this.operation} exceeded the ${this.outputLimitBytes}-byte diagnostic limit`;
  }
}

export class SbomGenerationFailed extends Schema.TaggedError<SbomGenerationFailed>()("SbomGenerationFailed", {
  operation: Schema.String,
  reason: Schema.String,
}) {
  override get message(): string {
    return `SBOM ${this.operation} failed: ${this.reason}`;
  }
}
