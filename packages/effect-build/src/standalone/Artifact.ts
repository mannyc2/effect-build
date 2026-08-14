import { Schema } from "effect";
import { targetSchemaFor } from "../internal/ProviderContracts.js";

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

export const ToolName = Schema.Literals(["bun", "deno", "node-sea"] as const);
export type ToolName = typeof ToolName.Type;

const ToolFields = {
  version: Schema.String.pipe(
    Schema.check(
      Schema.makeFilter((value: string) => value.length > 0 ? true : "tool version must be non-empty"),
    ),
  ),
  path: AbsolutePath,
} as const;

const ArtifactFields = {
  path: AbsolutePath,
  bytes: ByteCount,
  digest: Schema.optionalKey(Digest),
} as const;

const BunCompileStage = Schema.Struct({
  operation: Schema.Literal("compile-executable"),
  tool: Schema.Struct({
    name: Schema.Literal("bun"),
    ...ToolFields,
  }),
});

const DenoCompileStage = Schema.Struct({
  operation: Schema.Literal("compile-executable"),
  tool: Schema.Struct({
    name: Schema.Literal("deno"),
    ...ToolFields,
  }),
});

const BundleStage = Schema.Struct({
  operation: Schema.Literal("bundle"),
  tool: Schema.Struct({
    name: Schema.Literal("esbuild"),
    version: Schema.Literal("0.28.2"),
  }),
});

const AssembleNodeSeaStage = Schema.Struct({
  operation: Schema.Literal("assemble-node-sea"),
  tool: Schema.Struct({
    name: Schema.Literal("node"),
    version: Schema.Literal("26.7.0"),
    path: AbsolutePath,
  }),
});

const BunArtifact = Schema.Struct({
  ...ArtifactFields,
  provider: Schema.Literal("bun"),
  target: targetSchemaFor("bun"),
  stages: Schema.Tuple([BunCompileStage]),
});

const DenoArtifact = Schema.Struct({
  ...ArtifactFields,
  provider: Schema.Literal("deno"),
  target: targetSchemaFor("deno"),
  stages: Schema.Tuple([DenoCompileStage]),
});

const NodeSeaArtifact = Schema.Struct({
  ...ArtifactFields,
  provider: Schema.Literal("node-sea"),
  target: targetSchemaFor("node-sea"),
  stages: Schema.Tuple([BundleStage, AssembleNodeSeaStage]),
});

export const Artifact = Schema.Union([BunArtifact, DenoArtifact, NodeSeaArtifact]);
export type Artifact = typeof Artifact.Type;

export type ArtifactFor<Name extends ToolName> = Extract<Artifact, { readonly provider: Name }>;
export type StagesFor<Name extends ToolName> = ArtifactFor<Name>["stages"];
