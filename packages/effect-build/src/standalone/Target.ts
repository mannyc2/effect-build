import { Target as TargetSchema } from "./internal/TargetCatalog.js";

export const Target = TargetSchema;
export type Target = typeof Target.Type;
