import { Schema } from "effect";

export class ToolNotFound extends Schema.TaggedError<ToolNotFound>()("ToolNotFound", {
  tool: Schema.String,
  command: Schema.String,
}) {
  override get message(): string {
    return `${this.tool} executable not found: ${this.command}`;
  }
}

export class ToolFailed extends Schema.TaggedError<ToolFailed>()("ToolFailed", {
  tool: Schema.String,
  /** Exit code of the tool process; -1 when the process could not be launched. */
  exitCode: Schema.Number,
  stdout: Schema.String,
  stderr: Schema.String,
}) {
  override get message(): string {
    const detail = this.stderr.trim() || this.stdout.trim();
    return `${this.tool} ${this.exitCode === -1 ? "could not be launched" : `exited with code ${this.exitCode}`}${
      detail === "" ? "" : `\n${detail}`
    }`;
  }
}

export class UnsupportedTarget extends Schema.TaggedError<UnsupportedTarget>()("UnsupportedTarget", {
  tool: Schema.String,
  requested: Schema.String,
  available: Schema.Array(Schema.String),
}) {
  override get message(): string {
    return `${this.tool} does not support target "${this.requested}"; available: ${this.available.join(", ")}`;
  }
}

export class PublishFailed extends Schema.TaggedError<PublishFailed>()("PublishFailed", {
  destination: Schema.String,
  reason: Schema.String,
}) {
  override get message(): string {
    return `failed to publish ${this.destination}: ${this.reason}`;
  }
}

export class ArtifactInvalid extends Schema.TaggedError<ArtifactInvalid>()("ArtifactInvalid", {
  path: Schema.String,
  reason: Schema.String,
}) {
  override get message(): string {
    return `invalid artifact at ${this.path}: ${this.reason}`;
  }
}

export class SelectedToolChanged extends Schema.TaggedError<SelectedToolChanged>()("SelectedToolChanged", {
  tool: Schema.String,
  path: Schema.String,
  expected: Schema.String,
  observed: Schema.String,
}) {
  override get message(): string {
    return `${this.tool} executable changed at ${this.path}: expected ${this.expected}, observed ${this.observed}`;
  }
}

export class GenerationConflict extends Schema.TaggedError<GenerationConflict>()("GenerationConflict", {
  generation: Schema.String,
  reason: Schema.String,
}) {
  override get message(): string {
    return `generation conflict at ${this.generation}: ${this.reason}`;
  }
}

export class CurrentConflict extends Schema.TaggedError<CurrentConflict>()("CurrentConflict", {
  root: Schema.String,
  expected: Schema.String,
  observed: Schema.String,
}) {
  override get message(): string {
    return `current generation conflict at ${this.root}: expected ${this.expected}, observed ${this.observed}`;
  }
}

export class CurrentUnknown extends Schema.TaggedError<CurrentUnknown>()("CurrentUnknown", {
  root: Schema.String,
  reason: Schema.String,
}) {
  override get message(): string {
    return `current generation outcome unknown at ${this.root}: ${this.reason}`;
  }
}
