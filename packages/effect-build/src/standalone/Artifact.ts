import { Schema } from "effect";
import { targetSchemaFor } from "../internal/ProviderContracts.js";
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

export const ToolName = Schema.Literals(["bun", "deno", "node-sea"] as const);
export type ToolName = typeof ToolName.Type;

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

const commandToolFields = ToolObservation.fields;
const bundleToolFields = {
  name: ToolObservation.fields.name,
  version: ToolObservation.fields.version,
} as const;

const BunCompileStage = Schema.Struct({
  ...StageObservation.fields,
  operation: Schema.Literal("compile-executable"),
  tool: Schema.Struct({
    ...commandToolFields,
    name: Schema.Literal("bun"),
    path: AbsolutePath,
  }),
});

const DenoCompileStage = Schema.Struct({
  ...StageObservation.fields,
  operation: Schema.Literal("compile-executable"),
  tool: Schema.Struct({
    ...commandToolFields,
    name: Schema.Literal("deno"),
    path: AbsolutePath,
  }),
});

const BundleStage = Schema.Struct({
  ...StageObservation.fields,
  operation: Schema.Literal("bundle"),
  tool: Schema.Struct({
    ...bundleToolFields,
    name: Schema.Literal("esbuild"),
    version: Schema.Literal("0.28.2"),
  }),
});

const AssembleNodeSeaStage = Schema.Struct({
  ...StageObservation.fields,
  operation: Schema.Literal("assemble-node-sea"),
  tool: Schema.Struct({
    ...commandToolFields,
    name: Schema.Literal("node"),
    version: Schema.Literal("26.7.0"),
    path: AbsolutePath,
  }),
});

const BunArtifact = Schema.Struct({
  ...ExecutableArtifact.fields,
  provider: Schema.Literal("bun"),
  target: targetSchemaFor("bun"),
  stages: Schema.Tuple([BunCompileStage]),
});

const DenoArtifact = Schema.Struct({
  ...ExecutableArtifact.fields,
  provider: Schema.Literal("deno"),
  target: targetSchemaFor("deno"),
  stages: Schema.Tuple([DenoCompileStage]),
});

const NodeSeaArtifact = Schema.Struct({
  ...ExecutableArtifact.fields,
  provider: Schema.Literal("node-sea"),
  target: targetSchemaFor("node-sea"),
  stages: Schema.Tuple([BundleStage, AssembleNodeSeaStage]),
});

export const Artifact = Schema.Union([BunArtifact, DenoArtifact, NodeSeaArtifact]);
export type Artifact = typeof Artifact.Type;

export type ArtifactFor<Name extends ToolName> = Extract<Artifact, { readonly provider: Name }>;
export type StagesFor<Name extends ToolName> = ArtifactFor<Name>["stages"];
