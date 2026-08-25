import { Schema } from "effect";

/** The exact experimental Deno 2.9.5 bundle capability is absent. */
export class DenoBundleUnavailable extends Schema.TaggedError<DenoBundleUnavailable>()(
  "DenoBundleUnavailable",
  {
    expectedVersion: Schema.Literal("2.9.5"),
    observedVersion: Schema.optionalKey(Schema.String),
    requiredFlag: Schema.Literal("--unstable-bundle"),
    reason: Schema.String,
  },
) {}

/** Preserves the exact exception/rejection from experimental Deno.bundle. */
export class DenoBundleFailed extends Schema.TaggedError<DenoBundleFailed>()("DenoBundleFailed", {
  mode: Schema.Literals(["memory", "direct"] as const),
  cause: Schema.Unknown,
}) {}

export class DenoBundleModeInvalid extends Schema.TaggedError<DenoBundleModeInvalid>()(
  "DenoBundleModeInvalid",
  {
    mode: Schema.Literals(["memory", "direct"] as const),
    reason: Schema.String,
  },
) {}
