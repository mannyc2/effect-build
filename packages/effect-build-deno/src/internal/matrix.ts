import { Cause, Effect, Schema } from "effect";
import type * as CoreMatrix from "effect-build/Matrix";

class InvalidInput extends Schema.TaggedError<InvalidInput>()("InvalidInput", {}) {}

const decode = <Input>(
  value: unknown,
): { readonly inputs: readonly Input[]; readonly concurrency: number } | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Readonly<Record<string, unknown>>;
  if (Reflect.ownKeys(record).some((key) => key !== "inputs" && key !== "concurrency")) return undefined;
  if (!Array.isArray(record.inputs) || record.inputs.length === 0) return undefined;
  if (!Number.isSafeInteger(record.concurrency) || (record.concurrency as number) <= 0) return undefined;
  return { inputs: record.inputs as readonly Input[], concurrency: record.concurrency as number };
};

const capture = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<
  { readonly _tag: "Success"; readonly value: A } | { readonly _tag: "Failure"; readonly error: E },
  never,
  R
> =>
  Effect.matchCauseEffect(effect, {
    onSuccess: (value) => Effect.succeed({ _tag: "Success" as const, value }),
    onFailure: (cause) => {
      if (cause.reasons.length === 1) {
        const reason = cause.reasons[0];
        if (reason !== undefined && Cause.isFailReason(reason)) {
          return Effect.succeed({ _tag: "Failure" as const, error: reason.error });
        }
      }
      return Effect.failCause(cause as Cause.Cause<never>);
    },
  });

export const runMatrix = <Input, Artifact, Error>(
  rawInput: CoreMatrix.Input<Input>,
  scalar: (input: Input) => Effect.Effect<Artifact, Error>,
): Effect.Effect<CoreMatrix.Report<Artifact, Error, "deno">, CoreMatrix.InvalidInput> =>
  Effect.gen(function*() {
    const input = decode<Input>(rawInput);
    if (input === undefined) return yield* Effect.fail(new InvalidInput({}) as CoreMatrix.InvalidInput);
    const cells = yield* Effect.forEach(
      input.inputs,
      (cell, index) =>
        capture(scalar(cell)).pipe(
          Effect.map((result): CoreMatrix.CellResult<Artifact, Error, "deno"> => {
            const identity = { provider: "deno" as const, operation: "compileExecutable" as const, index };
            return result._tag === "Success"
              ? { _tag: "Success", identity, artifact: result.value }
              : { _tag: "Failure", identity, error: result.error };
          }),
        ),
      { concurrency: input.concurrency },
    );
    return { provider: "deno", operation: "compileExecutable", cells, rollback: "none" };
  });
