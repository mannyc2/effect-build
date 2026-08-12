import { Schema } from "effect";
import { ToolName } from "./Artifact.js";
import { Target } from "./Target.js";

export const DiagnosticChannel = Schema.Literals(["stdout", "stderr"] as const);
export type DiagnosticChannel = typeof DiagnosticChannel.Type;

export const Diagnostic = Schema.Struct({
  channel: DiagnosticChannel,
  text: Schema.String,
  truncated: Schema.Boolean,
});
export type Diagnostic = typeof Diagnostic.Type;

export class ToolNotFound extends Schema.TaggedError<ToolNotFound>()("ToolNotFound", {
  tool: ToolName,
  command: Schema.String,
}) {}

export class ToolProbeFailed extends Schema.TaggedError<ToolProbeFailed>()("ToolProbeFailed", {
  tool: ToolName,
  reason: Schema.String,
}) {}

export class ToolFailed extends Schema.TaggedError<ToolFailed>()("ToolFailed", {
  tool: ToolName,
  exitCode: Schema.Number,
  diagnostics: Schema.Array(Diagnostic),
}) {}

export class TargetUnsupported extends Schema.TaggedError<TargetUnsupported>()("TargetUnsupported", {
  tool: ToolName,
  requested: Target,
  available: Schema.Array(Target),
}) {}

export class InvalidDriverOptions extends Schema.TaggedError<InvalidDriverOptions>()("InvalidDriverOptions", {
  tool: ToolName,
  reason: Schema.String,
}) {}

export class OutputMissing extends Schema.TaggedError<OutputMissing>()("OutputMissing", {
  path: Schema.String,
}) {}

export class OutputInvalid extends Schema.TaggedError<OutputInvalid>()("OutputInvalid", {
  path: Schema.String,
  reason: Schema.String,
}) {}

export class OutputLocked extends Schema.TaggedError<OutputLocked>()("OutputLocked", {
  path: Schema.String,
}) {}

export class PublicationFailed extends Schema.TaggedError<PublicationFailed>()("PublicationFailed", {
  path: Schema.String,
  operation: Schema.String,
  reason: Schema.String,
}) {}

export const BuildError = Schema.Union([
  ToolNotFound,
  ToolProbeFailed,
  ToolFailed,
  TargetUnsupported,
  InvalidDriverOptions,
  OutputMissing,
  OutputInvalid,
  OutputLocked,
  PublicationFailed,
]);
export type BuildError = typeof BuildError.Type;
