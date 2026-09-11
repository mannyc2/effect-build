import { Schema } from "effect";

export class DenoBundleUnavailable extends Schema.TaggedError<DenoBundleUnavailable>()("DenoBundleUnavailable", {
  expectedVersion: Schema.String,
  observedVersion: Schema.optionalKey(Schema.String),
  requiredFlag: Schema.Literal("--unstable-bundle"),
  reason: Schema.String,
}) {
  override get message(): string {
    return this.reason;
  }
}

/** Keep Deno's original exception available to callers. */
export class DenoBundleFailed extends Schema.TaggedError<DenoBundleFailed>()("DenoBundleFailed", {
  mode: Schema.Literals(["memory", "direct"] as const),
  cause: Schema.Unknown,
}) {
  override get message(): string {
    return `Deno.bundle (${this.mode}) failed: ${this.cause instanceof Error ? this.cause.message : String(this.cause)}`;
  }
}

export class DenoBundleModeInvalid extends Schema.TaggedError<DenoBundleModeInvalid>()("DenoBundleModeInvalid", {
  mode: Schema.Literals(["memory", "direct"] as const),
  reason: Schema.String,
}) {
  override get message(): string {
    return `Deno.bundle (${this.mode}): ${this.reason}`;
  }
}
