import { Schema } from "effect";
import { bunTargetTable } from "./internal/BunTarget.js";
import { denoTargetTable } from "./internal/DenoTarget.js";

const isAbsolutePath = (value: string): boolean =>
  (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) && value.length > 1;

export const AbsolutePath = Schema.String.pipe(
  Schema.check(Schema.makeFilter((value: string) =>
    isAbsolutePath(value)
      ? true
      : "path must be an absolute file path"
  )),
);
export type AbsolutePath = typeof AbsolutePath.Type;

export const Digest = Schema.TemplateLiteral(["sha256:", Schema.String]).pipe(
  Schema.check(Schema.makeFilter((value: string) =>
    /^sha256:[0-9a-f]{64}$/.test(value)
      ? true
      : "digest must be sha256: followed by 64 lowercase hexadecimal digits"
  )),
);
export type Digest = typeof Digest.Type;

export const ByteCount = Schema.Number.pipe(
  Schema.check(
    Schema.makeFilter((value: number) =>
      Number.isSafeInteger(value) && value >= 0 && Object.is(value, -0) === false
        ? true
        : "bytes must be a non-negative safe integer"
    ),
  ),
);
export type ByteCount = typeof ByteCount.Type;

export const ToolName = Schema.Literals(["bun", "deno"] as const);
export type ToolName = typeof ToolName.Type;

const ToolFields = {
  version: Schema.String.pipe(
    Schema.check(Schema.makeFilter((value: string) => value.length > 0 ? true : "tool version must be non-empty")),
  ),
  path: AbsolutePath,
} as const;

export const Tool = Schema.Struct({
  name: ToolName,
  ...ToolFields,
});
export type Tool = typeof Tool.Type;

const ArtifactFields = {
  path: AbsolutePath,
  bytes: ByteCount,
  digest: Schema.optionalKey(Digest),
} as const;

const BunArtifact = Schema.Struct({
  ...ArtifactFields,
  target: bunTargetTable.Target,
  tool: Schema.Struct({ name: Schema.Literal("bun"), ...ToolFields }),
});

const DenoArtifact = Schema.Struct({
  ...ArtifactFields,
  target: denoTargetTable.Target,
  tool: Schema.Struct({ name: Schema.Literal("deno"), ...ToolFields }),
});

export const Artifact = Schema.Union([BunArtifact, DenoArtifact]);
export type Artifact = typeof Artifact.Type;
