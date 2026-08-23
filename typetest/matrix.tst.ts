import type * as Matrix from "../packages/effect-build/src/Matrix.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

export type _CellIdentity = Assert<
  Same<
    Matrix.CellIdentity<"bun">,
    { readonly provider: "bun"; readonly operation: "compileExecutable"; readonly index: number }
  >
>;
export type _Success = Assert<
  Same<
    Matrix.Success<"artifact", "bun">,
    {
      readonly _tag: "Success";
      readonly identity: Matrix.CellIdentity<"bun">;
      readonly artifact: "artifact";
    }
  >
>;
export type _Failure = Assert<
  Same<
    Matrix.Failure<"failure", "bun">,
    {
      readonly _tag: "Failure";
      readonly identity: Matrix.CellIdentity<"bun">;
      readonly error: "failure";
    }
  >
>;
export type _CellResult = Assert<
  Same<
    Matrix.CellResult<"artifact", "failure", "bun">,
    Matrix.Success<"artifact", "bun"> | Matrix.Failure<"failure", "bun">
  >
>;
export type _Input = Assert<
  Same<
    Matrix.Input<"scalar">,
    { readonly inputs: readonly ["scalar", ..."scalar"[]]; readonly concurrency: number }
  >
>;
export type _Report = Assert<
  Same<
    Matrix.Report<"artifact", "failure", "bun">,
    {
      readonly provider: "bun";
      readonly operation: "compileExecutable";
      readonly cells: readonly Matrix.CellResult<"artifact", "failure", "bun">[];
      readonly rollback: "none";
    }
  >
>;
export type _InvalidInputTag = Assert<Same<Matrix.InvalidInput["_tag"], "InvalidInput">>;

declare const invalidInput: Matrix.InvalidInput;
// @ts-expect-error! The freeze defines no public diagnostic payload.
invalidInput.issue;

const _input: Matrix.Input<string> = { inputs: ["entry"], concurrency: 1 };
void _input;

// @ts-expect-error!
const _empty: Matrix.Input<string> = { inputs: [], concurrency: 1 };
void _empty;

// @ts-expect-error!
const _extra: Matrix.Input<string> = { inputs: ["entry"], concurrency: 1, extra: true };
void _extra;
