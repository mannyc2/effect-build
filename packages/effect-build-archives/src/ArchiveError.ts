import { Schema } from "effect";

/** A caller-supplied archive path would make the resulting layout ambiguous or unsafe. */
export class UnsafeArchiveLayout extends Schema.TaggedError<UnsafeArchiveLayout>()("UnsafeArchiveLayout", {
  path: Schema.String,
  reason: Schema.String,
}) {
  override get message(): string {
    return `unsafe archive layout at ${JSON.stringify(this.path)}: ${this.reason}`;
  }
}

/** Archive bytes could not be read, encoded, or written. */
export class ArchiveFailed extends Schema.TaggedError<ArchiveFailed>()("ArchiveFailed", {
  operation: Schema.String,
  reason: Schema.String,
}) {
  override get message(): string {
    return `archive ${this.operation} failed: ${this.reason}`;
  }
}

/** An exact Git tree could not be projected into a source archive. */
export class SourceArchiveFailed extends Schema.TaggedError<SourceArchiveFailed>()("SourceArchiveFailed", {
  repository: Schema.String,
  tree: Schema.String,
  reason: Schema.String,
}) {
  override get message(): string {
    return `source archive for tree ${this.tree} in ${this.repository} failed: ${this.reason}`;
  }
}

export class GitToolUnavailable extends Schema.TaggedError<GitToolUnavailable>()("GitToolUnavailable", {
  reason: Schema.String,
}) {
  override get message(): string {
    return `Git tool unavailable: ${this.reason}`;
  }
}

export class GitToolChanged extends Schema.TaggedError<GitToolChanged>()("GitToolChanged", {
  path: Schema.String,
  reason: Schema.String,
}) {
  override get message(): string {
    return `selected Git tool changed at ${this.path}: ${this.reason}`;
  }
}

export class GitTransportFailed extends Schema.TaggedError<GitTransportFailed>()("GitTransportFailed", {
  operation: Schema.String,
  cause: Schema.Unknown,
}) {
  override get message(): string {
    return `Git ${this.operation} transport failed: ${String(this.cause)}`;
  }
}

export class GitCommandFailed extends Schema.TaggedError<GitCommandFailed>()("GitCommandFailed", {
  operation: Schema.String,
  exitCode: Schema.Number,
  stdout: Schema.Uint8Array,
  stderr: Schema.Uint8Array,
  stdoutTruncated: Schema.Boolean,
  stderrTruncated: Schema.Boolean,
}) {
  override get message(): string {
    const decoder = new TextDecoder();
    return `Git ${this.operation} exited ${this.exitCode}: ${decoder.decode(this.stderr).trim()}`;
  }
}

export class GitOutputTruncated extends Schema.TaggedError<GitOutputTruncated>()("GitOutputTruncated", {
  operation: Schema.String,
  outputLimitBytes: Schema.Number,
}) {
  override get message(): string {
    return `Git ${this.operation} exceeded the ${this.outputLimitBytes}-byte output limit`;
  }
}
