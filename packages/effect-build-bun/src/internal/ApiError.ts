import { Schema } from "effect";

export type ApiOperation =
  | "makeTranspiler"
  | "transform"
  | "transformSync"
  | "scan"
  | "scanImports"
  | "build"
  | "compileExecutableDirect";

/** The exact Bun 1.3.14 host API is absent from the current JavaScript realm. */
export class BunApiUnavailable extends Schema.TaggedError<BunApiUnavailable>()("BunApiUnavailable", {
  capability: Schema.Literals(["Bun.Transpiler", "Bun.build", "Bun.build compile"] as const),
  expectedVersion: Schema.Literal("1.3.14"),
  observedVersion: Schema.optionalKey(Schema.String),
  reason: Schema.String,
}) {}

/**
 * Wraps a native Bun exception without translating it. `cause` is the exact
 * thrown or rejected provider value, so AggregateError diagnostics remain
 * available by identity.
 */
export class BunApiFailed extends Schema.TaggedError<BunApiFailed>()("BunApiFailed", {
  operation: Schema.Literals(
    [
      "makeTranspiler",
      "transform",
      "transformSync",
      "scan",
      "scanImports",
      "build",
      "compileExecutableDirect",
    ] as const,
  ),
  cause: Schema.Unknown,
}) {}

/** Refuses a request whose durable-output fields contradict the selected mode. */
export class BunBuildModeInvalid extends Schema.TaggedError<BunBuildModeInvalid>()("BunBuildModeInvalid", {
  mode: Schema.Literals(["memory", "direct", "compileExecutableDirect"] as const),
  reason: Schema.String,
}) {}
