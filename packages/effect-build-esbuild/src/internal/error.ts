import { Schema } from "effect";
import type * as esbuild from "esbuild";

export class EsbuildModeInvalid extends Schema.TaggedError<EsbuildModeInvalid>()("EsbuildModeInvalid", {
  operation: Schema.Literals(["build", "make"] as const),
  mode: Schema.Literals(["memory", "direct"] as const),
  reason: Schema.String,
}) {}

const messageArray = (value: unknown, key: "errors" | "warnings"): readonly esbuild.Message[] => {
  if (typeof value !== "object" || value === null) return [];
  const messages = (value as Readonly<Record<string, unknown>>)[key];
  return Array.isArray(messages) ? (messages as readonly esbuild.Message[]) : [];
};

/** Wraps the native esbuild rejection; `errors`/`warnings` expose its diagnostics by reference. */
export class EsbuildFailed extends Schema.TaggedError<EsbuildFailed>()("EsbuildFailed", {
  operation: Schema.Literals(
    [
      "build",
      "transform",
      "analyzeMetafile",
      "formatMessages",
      "make",
      "rebuild",
      "watch",
      "serve",
      "cancel",
    ] as const,
  ),
  cause: Schema.Unknown,
}) {
  get errors(): readonly esbuild.Message[] {
    return messageArray(this.cause, "errors");
  }
  get warnings(): readonly esbuild.Message[] {
    return messageArray(this.cause, "warnings");
  }
  override get message(): string {
    const first = this.errors[0]?.text;
    return `esbuild ${this.operation} failed${first === undefined ? "" : `: ${first}`}`;
  }
}
