import { Effect, Schema } from "effect";
import type * as rolldown from "rolldown";

export class InputInvalid extends Schema.TaggedError<InputInvalid>()("RolldownInputInvalid", {
  reason: Schema.String,
}) {
  override get message(): string {
    return this.reason;
  }
}

/** Preserve native diagnostics and the original rejection object. */
export class Failed extends Schema.TaggedError<Failed>()("RolldownFailed", {
  operation: Schema.String,
  cause: Schema.Unknown,
}) {
  get errors(): readonly rolldown.RolldownError[] {
    const errors: unknown = typeof this.cause === "object" && this.cause !== null ? Reflect.get(this.cause, "errors") : undefined;
    return Array.isArray(errors) ? errors as readonly rolldown.RolldownError[] : [];
  }
  override get message(): string {
    return `rolldown ${this.operation} failed${this.cause instanceof Error ? `: ${this.cause.message.split("\n")[0]}` : ""}`;
  }
}

export const invoke = <A>(operation: string, run: () => Promise<A>): Effect.Effect<A, Failed> =>
  Effect.tryPromise({ try: run, catch: (cause) => new Failed({ operation, cause }) });
