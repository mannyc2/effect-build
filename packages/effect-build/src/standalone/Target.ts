import { Schema } from "effect";
import { SystemTarget as SystemTargetSchema } from "./internal/TargetCatalog.js";

export const SystemTarget = SystemTargetSchema;
export type SystemTarget = typeof SystemTarget.Type;

export const ResolutionTarget = Schema.Literals(["node"] as const);
export type ResolutionTarget = typeof ResolutionTarget.Type;

// Plan 023 retains this identity alias solely for the existing compile facade.
export const Target = SystemTarget;
export type Target = SystemTarget;
