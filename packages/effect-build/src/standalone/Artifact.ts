import { Schema } from "effect";
import { SystemTarget } from "./Target.js";

const isAbsolutePath = (value: string): boolean =>
  (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) && value.length > 1;

export const AbsolutePath = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value: string) => isAbsolutePath(value) ? true : "path must be an absolute file path"),
  ),
);
export type AbsolutePath = typeof AbsolutePath.Type;

export const Digest = Schema.TemplateLiteral([
  "sha256:",
  Schema.String,
]).pipe(
  Schema.check(
    Schema.makeFilter((value: string) =>
      /^sha256:[0-9a-f]{64}$/.test(value)
        ? true
        : "digest must be sha256: followed by 64 lowercase hexadecimal digits"
    ),
  ),
);
export type Digest = typeof Digest.Type;

export const ByteCount = Schema.Number.pipe(
  Schema.check(
    Schema.makeFilter((value: number) =>
      Number.isSafeInteger(value)
        && value >= 0
        && Object.is(value, -0) === false
        ? true
        : "bytes must be a non-negative safe integer"
    ),
  ),
);
export type ByteCount = typeof ByteCount.Type;

export const FileArtifact = Schema.Struct({
  path: AbsolutePath,
  bytes: ByteCount,
  digest: Schema.optionalKey(Digest),
});
export type FileArtifact = typeof FileArtifact.Type;

export const ToolObservation = Schema.Struct({
  name: Schema.NonEmptyString,
  version: Schema.NonEmptyString,
  path: Schema.optionalKey(AbsolutePath),
});
export type ToolObservation = typeof ToolObservation.Type;

export const StageObservation = Schema.Struct({
  operation: Schema.NonEmptyString,
  tool: ToolObservation,
});
export type StageObservation = typeof StageObservation.Type;

export const ExecutableArtifact = Schema.Struct({
  ...FileArtifact.fields,
  target: SystemTarget,
  stages: Schema.NonEmptyArray(StageObservation),
});
export type ExecutableArtifact = typeof ExecutableArtifact.Type;
