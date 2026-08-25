import { Schema } from "effect";

const describeUnknown = (cause: unknown): string => {
  if (typeof cause === "string") return cause;
  if (cause instanceof Error) return cause.message;
  if ((typeof cause === "object" && cause !== null) || typeof cause === "function") {
    try {
      const message = Reflect.get(cause, "message");
      if (typeof message === "string") return message;
    } catch {
      // Fall through to the remaining bounded descriptions.
    }
    try {
      const tag = Reflect.get(cause, "_tag");
      if (typeof tag === "string") return tag;
    } catch {
      // Fall through to primitive coercion.
    }
  }
  try {
    return String(cause);
  } catch {
    return "unknown cause";
  }
};

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

export class PortableRejected extends Schema.TaggedError<PortableRejected>()("PortableRejected", {
  profile: Schema.String,
  phase: Schema.Literals(["request", "analysis"] as const),
  reason: Schema.String,
}) {
  override get message(): string {
    return `${this.profile} rejected during ${this.phase}: ${this.reason}`;
  }
}

export class PortableUnsupported extends Schema.TaggedError<PortableUnsupported>()("PortableUnsupported", {
  profile: Schema.String,
  provider: Schema.String,
  reason: Schema.String,
}) {
  override get message(): string {
    return `${this.profile} is unsupported by ${this.provider}: ${this.reason}`;
  }
}

export class ProviderFailed extends Schema.TaggedError<ProviderFailed>()("ProviderFailed", {
  provider: Schema.String,
  operation: Schema.String,
  cause: Schema.Unknown,
}) {
  override get message(): string {
    const detail = describeUnknown(this.cause);
    return `${this.provider} ${this.operation} failed${detail.length === 0 ? "" : `: ${detail}`}`;
  }
}
