import { Effect, Schema } from "effect";

export interface CellIdentity<Provider extends string = string> {
  readonly provider: Provider;
  readonly operation: "compileExecutable";
  readonly index: number;
}

export interface Success<Artifact, Provider extends string = string> {
  readonly _tag: "Success";
  readonly identity: CellIdentity<Provider>;
  readonly artifact: Artifact;
}

export interface Failure<Error, Provider extends string = string> {
  readonly _tag: "Failure";
  readonly identity: CellIdentity<Provider>;
  readonly error: Error;
}

export type CellResult<Artifact, Error, Provider extends string = string> =
  | Success<Artifact, Provider>
  | Failure<Error, Provider>;

export interface Input<ScalarInput> {
  readonly inputs: readonly [ScalarInput, ...ScalarInput[]];
  readonly concurrency: number;
}

export interface RunInput<ScalarInput, Provider extends string> extends Input<ScalarInput> {
  readonly provider: Provider;
}

export interface Report<Artifact, Error, Provider extends string = string> {
  readonly provider: Provider;
  readonly operation: "compileExecutable";
  readonly cells: readonly CellResult<Artifact, Error, Provider>[];
  readonly rollback: "none";
}

/** Provider-private diagnostics stay private; invalidity is established before any cell starts. */
export class InvalidInput extends Schema.TaggedError<InvalidInput>()("InvalidInput", {}) {}

/**
 * Executes exactly one scalar call for each started cell. Typed failures become
 * ordered cells; defects and interruption remain in Cause and produce no report.
 */
export const run = <ScalarInput, Artifact, Error, Requirements, const Provider extends string>(
  input: RunInput<ScalarInput, Provider>,
  scalar: (input: ScalarInput, identity: CellIdentity<Provider>) => Effect.Effect<Artifact, Error, Requirements>,
): Effect.Effect<Report<Artifact, Error, Provider>, InvalidInput, Requirements> => {
  if (input.inputs.length === 0 || !Number.isSafeInteger(input.concurrency) || input.concurrency <= 0) {
    return Effect.fail(new InvalidInput());
  }

  return Effect.forEach(
    input.inputs,
    (scalarInput, index) => {
      const identity: CellIdentity<Provider> = Object.freeze({
        provider: input.provider,
        operation: "compileExecutable",
        index,
      });
      return Effect.matchEffect(scalar(scalarInput, identity), {
        onFailure: (error): Effect.Effect<CellResult<Artifact, Error, Provider>> =>
          Effect.succeed(Object.freeze({ _tag: "Failure" as const, identity, error })),
        onSuccess: (artifact): Effect.Effect<CellResult<Artifact, Error, Provider>> =>
          Effect.succeed(Object.freeze({ _tag: "Success" as const, identity, artifact })),
      });
    },
    { concurrency: input.concurrency },
  ).pipe(
    Effect.map((cells) =>
      Object.freeze({
        provider: input.provider,
        operation: "compileExecutable" as const,
        cells: Object.freeze(cells),
        rollback: "none" as const,
      })
    ),
  );
};
