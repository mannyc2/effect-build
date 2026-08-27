import { Schema } from "effect";

export type Operation = "probe-version" | "probe-capability" | "probe-target" | "check-main" | "assemble-direct";

export class NodeSeaInputInvalid extends Schema.TaggedError<NodeSeaInputInvalid>()("NodeSeaInputInvalid", {
  operation: Schema.String,
  reason: Schema.String,
}) {}

export class NodeSeaUnsupported extends Schema.TaggedError<NodeSeaUnsupported>()("NodeSeaUnsupported", {
  operation: Schema.String,
  version: Schema.String,
  reason: Schema.String,
}) {}

export class NodeSeaRelationRejected extends Schema.TaggedError<NodeSeaRelationRejected>()("NodeSeaRelationRejected", {
  relation: Schema.String,
  reason: Schema.String,
}) {}

export class NodeSeaTransportFailed extends Schema.TaggedError<NodeSeaTransportFailed>()("NodeSeaTransportFailed", {
  operation: Schema.String,
  cause: Schema.Unknown,
}) {}

export class NodeSeaCommandFailed extends Schema.TaggedError<NodeSeaCommandFailed>()("NodeSeaCommandFailed", {
  operation: Schema.String,
  exitCode: Schema.Number,
  stdout: Schema.Uint8Array,
  stderr: Schema.Uint8Array,
  stdoutTruncated: Schema.Boolean,
  stderrTruncated: Schema.Boolean,
}) {}

export class NodeSeaCandidateInvalid extends Schema.TaggedError<NodeSeaCandidateInvalid>()("NodeSeaCandidateInvalid", {
  path: Schema.String,
  reason: Schema.String,
}) {}
