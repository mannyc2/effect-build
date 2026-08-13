import { Schema } from "effect";
import { targetSchemaFor, targetsFor } from "../internal/ProviderContracts.js";
import type { TargetFor } from "../Provider.js";
import * as Artifact from "./Artifact.js";
import * as BuildError from "./BuildError.js";

const MatrixIssueField = Schema.Literals(
  [
    "input",
    "entrypoint",
    "outdir",
    "name",
    "targets",
    "cwd",
    "digest",
    "options",
    "concurrency",
    "output",
  ] as const,
);

const MatrixIssueIndex = Schema.Number.pipe(
  Schema.check(
    Schema.makeFilter((value: number) =>
      Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0)
        ? true
        : "index must be a non-negative safe integer"
    ),
  ),
);

export const MatrixIssue = Schema.Struct({
  field: MatrixIssueField,
  reason: Schema.NonEmptyString,
  index: Schema.optionalKey(MatrixIssueIndex),
  value: Schema.optionalKey(Schema.String),
});
export type MatrixIssue = typeof MatrixIssue.Type;

export class InvalidMatrixInput extends Schema.TaggedError<InvalidMatrixInput>()("InvalidMatrixInput", {
  issues: Schema.NonEmptyArray(MatrixIssue),
}) {}

type BunArtifact = Artifact.Artifact & {
  readonly target: TargetFor<"bun">;
  readonly tool: Artifact.Tool & { readonly name: "bun" };
};
type DenoArtifact = Artifact.Artifact & {
  readonly target: TargetFor<"deno">;
  readonly tool: Artifact.Tool & { readonly name: "deno" };
};

const BunArtifact = Artifact.Artifact.pipe(
  Schema.refine(
    (artifact): artifact is BunArtifact =>
      artifact.tool.name === "bun" && targetsFor("bun").includes(artifact.target as never),
    { message: "artifact target must be supported by Bun" },
  ),
);
const DenoArtifact = Artifact.Artifact.pipe(
  Schema.refine(
    (artifact): artifact is DenoArtifact =>
      artifact.tool.name === "deno" && targetsFor("deno").includes(artifact.target as never),
    { message: "artifact target must be supported by Deno" },
  ),
);
const ProviderArtifact = Schema.Union([BunArtifact, DenoArtifact]);

const failureToolMatches = (value: {
  readonly tool: Artifact.ToolName;
  readonly error: BuildError.BuildError;
}): boolean => {
  const error = value.error;
  return !("tool" in error) || error.tool === value.tool;
};

const BunCellFailure = Schema.Struct({
  tool: Schema.Literal("bun"),
  target: targetSchemaFor("bun"),
  path: Artifact.AbsolutePath,
  error: BuildError.BuildError,
}).pipe(
  Schema.check(
    Schema.makeFilter((value) => failureToolMatches(value) ? true : "nested error tool must match cell tool"),
  ),
);
const DenoCellFailure = Schema.Struct({
  tool: Schema.Literal("deno"),
  target: targetSchemaFor("deno"),
  path: Artifact.AbsolutePath,
  error: BuildError.BuildError,
}).pipe(
  Schema.check(
    Schema.makeFilter((value) => failureToolMatches(value) ? true : "nested error tool must match cell tool"),
  ),
);

export const CellFailure = Schema.Union([BunCellFailure, DenoCellFailure]);
export type CellFailure = typeof CellFailure.Type;

const MatrixFailedFields = Schema.Struct({
  artifacts: Schema.Array(ProviderArtifact),
  failures: Schema.NonEmptyArray(CellFailure),
}).pipe(
  Schema.check(
    Schema.makeFilter((value) => {
      const tool = value.failures[0].tool;
      if (value.artifacts.some((artifact) => artifact.tool.name !== tool)) {
        return "matrix artifacts and failures must use one provider";
      }
      if (value.failures.some((failure) => failure.tool !== tool)) {
        return "matrix failures must use one provider";
      }
      const targets = [
        ...value.artifacts.map((artifact) => artifact.target),
        ...value.failures.map((failure) => failure.target),
      ];
      if (new Set(targets).size !== targets.length) return "matrix targets must be unique";
      const paths = [
        ...value.artifacts.map((artifact) => artifact.path),
        ...value.failures.map((failure) => failure.path),
      ];
      if (new Set(paths).size !== paths.length) return "matrix paths must be unique";
      return true;
    }),
  ),
);

export class MatrixFailed extends Schema.TaggedError<MatrixFailed>()("MatrixFailed", MatrixFailedFields) {}

export const MatrixError = Schema.Union([InvalidMatrixInput, MatrixFailed]);
export type MatrixError = typeof MatrixError.Type;
