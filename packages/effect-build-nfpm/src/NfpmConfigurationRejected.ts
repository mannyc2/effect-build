import { Schema } from "effect";

/** Native nFPM configuration attempted to bypass a canonical effect-build field or trust boundary. */
export class NfpmConfigurationRejected extends Schema.TaggedError<NfpmConfigurationRejected>()(
  "NfpmConfigurationRejected",
  {
    path: Schema.NonEmptyString,
    reason: Schema.NonEmptyString,
  },
) {
  override get message(): string {
    return `nFPM configuration rejected at ${this.path}: ${this.reason}`;
  }
}

export class NfpmToolUnavailable extends Schema.TaggedError<NfpmToolUnavailable>()("NfpmToolUnavailable", {
  reason: Schema.String,
}) {
  override get message(): string {
    return `nFPM tool unavailable: ${this.reason}`;
  }
}

export class NfpmToolChanged extends Schema.TaggedError<NfpmToolChanged>()("NfpmToolChanged", {
  path: Schema.String,
  reason: Schema.String,
}) {
  override get message(): string {
    return `selected nFPM tool changed at ${this.path}: ${this.reason}`;
  }
}

export class NfpmTransportFailed extends Schema.TaggedError<NfpmTransportFailed>()("NfpmTransportFailed", {
  operation: Schema.String,
  cause: Schema.Unknown,
}) {
  override get message(): string {
    return `nFPM ${this.operation} transport failed: ${String(this.cause)}`;
  }
}

export class NfpmCommandFailed extends Schema.TaggedError<NfpmCommandFailed>()("NfpmCommandFailed", {
  operation: Schema.String,
  exitCode: Schema.Number,
  stdout: Schema.String,
  stderr: Schema.String,
  stdoutTruncated: Schema.Boolean,
  stderrTruncated: Schema.Boolean,
}) {
  override get message(): string {
    return `nFPM ${this.operation} exited ${this.exitCode}: ${this.stderr || this.stdout}`;
  }
}

export class NfpmOutputTruncated extends Schema.TaggedError<NfpmOutputTruncated>()("NfpmOutputTruncated", {
  operation: Schema.String,
  outputLimitBytes: Schema.Number,
}) {
  override get message(): string {
    return `nFPM ${this.operation} exceeded the ${this.outputLimitBytes}-byte diagnostic limit`;
  }
}

export class NfpmPackageFailed extends Schema.TaggedError<NfpmPackageFailed>()("NfpmPackageFailed", {
  operation: Schema.String,
  reason: Schema.String,
}) {
  override get message(): string {
    return `nFPM ${this.operation} failed: ${this.reason}`;
  }
}
