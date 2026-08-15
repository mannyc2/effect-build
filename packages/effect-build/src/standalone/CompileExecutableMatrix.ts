import { Cause, Effect, Result } from "effect";
import type { StageObservation } from "./Artifact.js";
import type { BuildError } from "./BuildError.js";
import type { CellExecutionError, ProviderArtifact, ProviderStages } from "./internal/CompilerAdapter.js";
import { type CellFailure, type InvalidMatrixInput, MatrixFailed } from "./MatrixError.js";
import type { SystemTarget } from "./Target.js";

export interface CompileExecutableMatrixInput<SupportedTarget extends SystemTarget, Options> {
  readonly entrypoint: string;
  readonly outdir: string;
  readonly name: string;
  readonly targets: readonly [SupportedTarget, ...SupportedTarget[]];
  readonly cwd?: string;
  readonly digest?: boolean;
  readonly options?: Options;
  readonly concurrency?: number;
}

type NarrowBuildError<Error, Name extends string> = Error extends { readonly tool: string }
  ? Error & { readonly tool: Name }
  : Error;

type BuildErrorFor<Name extends string> = NarrowBuildError<BuildError, Name>;

export type CellFailureFor<Name extends string, SupportedTarget extends SystemTarget> =
  & Omit<CellFailure, "provider" | "target" | "error">
  & {
    readonly provider: Name;
    readonly target: SupportedTarget;
    readonly error: BuildErrorFor<Name>;
  };

export type MatrixFailedFor<
  Name extends string,
  SupportedTarget extends SystemTarget,
  Stages extends ProviderStages<Name>,
> =
  & Omit<MatrixFailed, "artifacts" | "failures">
  & {
    readonly artifacts: readonly ProviderArtifact<Name, SupportedTarget, Stages>[];
    readonly failures: readonly [
      CellFailureFor<Name, SupportedTarget>,
      ...CellFailureFor<Name, SupportedTarget>[],
    ];
  };

export type MatrixErrorFor<
  Name extends string,
  SupportedTarget extends SystemTarget,
  Stages extends ProviderStages<Name>,
> =
  | InvalidMatrixInput
  | MatrixFailedFor<Name, SupportedTarget, Stages>;

export const makeMatrixFailedFor = <
  Name extends string,
  SupportedTarget extends SystemTarget,
  Stages extends readonly [StageObservation & { readonly tool: { readonly name: Name } }],
>(input: {
  readonly artifacts: readonly ProviderArtifact<Name, SupportedTarget, Stages>[];
  readonly failures: readonly [
    {
      readonly provider: Name;
      readonly target: SupportedTarget;
      readonly path: string;
      readonly error: CellExecutionError;
    },
    ...Array<{
      readonly provider: Name;
      readonly target: SupportedTarget;
      readonly path: string;
      readonly error: CellExecutionError;
    }>,
  ];
}): MatrixFailedFor<Name, SupportedTarget, Stages> =>
  // MatrixFailed performs the runtime provider, target, path, and nested-tool
  // checks. This is the sole assertion that projects that checked root value
  // back to the private provider-correlated type.
  new MatrixFailed(input as ConstructorParameters<typeof MatrixFailed>[0]) as MatrixFailedFor<
    Name,
    SupportedTarget,
    Stages
  >;

export const captureCellResult = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<Result.Result<A, E>, never, R> =>
  Effect.matchCauseEffect(effect, {
    onSuccess: (value) => Effect.succeed(Result.succeed(value)),
    onFailure: (cause) => {
      if (cause.reasons.length === 1) {
        const reason = cause.reasons[0];
        if (reason !== undefined && Cause.isFailReason(reason)) {
          return Effect.succeed(Result.fail(reason.error));
        }
      }
      if (cause.reasons.some((reason) => !Cause.isFailReason(reason))) {
        // The error type is erased only after proving this is not a pure typed
        // failure. The exact Cause object is re-failed unchanged.
        return Effect.failCause(cause as Cause.Cause<never>);
      }
      return Effect.die(cause);
    },
  });
