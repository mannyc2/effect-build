import { Schema } from "effect";
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

const ProviderArtifact = Schema.Struct({
  ...Artifact.ExecutableArtifact.fields,
  provider: Schema.NonEmptyString,
});

export const CellFailure = Schema.Struct({
  provider: Schema.NonEmptyString,
  target: Artifact.ExecutableArtifact.fields.target,
  path: Artifact.AbsolutePath,
  error: BuildError.BuildError,
}).pipe(
  Schema.check(
    Schema.makeFilter((value) =>
      !("tool" in value.error) || value.error.tool === value.provider
        ? true
        : "nested error tool must match cell provider"
    ),
  ),
);
export type CellFailure = typeof CellFailure.Type;

const MatrixFailedFields = Schema.Struct({
  artifacts: Schema.Array(ProviderArtifact),
  failures: Schema.NonEmptyArray(CellFailure),
}).pipe(
  Schema.check(
    Schema.makeFilter((value) => {
      const provider = value.failures[0].provider;
      if (value.artifacts.some((artifact) => artifact.provider !== provider)) {
        return "matrix artifacts and failures must use one provider";
      }
      if (value.failures.some((failure) => failure.provider !== provider)) {
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
