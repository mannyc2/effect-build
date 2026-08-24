import { Schema } from "effect";
import type * as rolldown from "rolldown";

const diagnostics = (value: unknown): readonly rolldown.RolldownError[] => {
  if (typeof value !== "object" || value === null) return [];
  const errors = (value as Readonly<Record<string, unknown>>).errors;
  return Array.isArray(errors) ? (errors as readonly rolldown.RolldownError[]) : [];
};

/** Wraps the native rolldown rejection; `errors` exposes its diagnostics by reference. */
export class RolldownFailed extends Schema.TaggedError<RolldownFailed>()("RolldownFailed", {
  operation: Schema.Literals(["make", "generate", "write", "watch"] as const),
  cause: Schema.Unknown,
}) {
  get errors(): readonly rolldown.RolldownError[] {
    return diagnostics(this.cause);
  }
  override get message(): string {
    const first = this.cause instanceof Error ? this.cause.message.split("\n")[0] : undefined;
    return `rolldown ${this.operation} failed${first === undefined || first.length === 0 ? "" : `: ${first}`}`;
  }
}

export class WatchOverflow extends Schema.TaggedError<WatchOverflow>()("WatchOverflow", {
  resource: Schema.Literals(["result", "event"] as const),
  limit: Schema.Number,
}) {
  override get message(): string {
    return `rolldown watch exceeded the ${this.resource} ownership limit of ${this.limit}`;
  }
}
