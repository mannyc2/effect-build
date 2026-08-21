import { Schema } from "effect";

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

export interface Report<Artifact, Error, Provider extends string = string> {
  readonly provider: Provider;
  readonly operation: "compileExecutable";
  readonly cells: readonly CellResult<Artifact, Error, Provider>[];
  readonly rollback: "none";
}

/** The frozen outer matrix preflight failure; provider modules own private diagnostics. */
export class InvalidInput extends Schema.TaggedError<InvalidInput>()("InvalidInput", {}) {}
