import { Cause, Effect, Result } from "effect";
import type { ToolName } from "./Artifact.js";
import type { BuildError } from "./BuildError.js";
import type { CompileExecutableInput } from "./Driver.js";
import type { ProviderArtifact } from "./internal/CompilerAdapter.js";
import { type CellFailure, type InvalidMatrixInput, MatrixFailed } from "./MatrixError.js";
import type { Target } from "./Target.js";

export interface CompileExecutableMatrixInput<SupportedTarget extends Target, Options> {
  readonly entrypoint: string;
  readonly outdir: string;
  readonly name: string;
  readonly targets: readonly [SupportedTarget, ...SupportedTarget[]];
  readonly cwd?: string;
  readonly digest?: boolean;
  readonly options?: Options;
  readonly concurrency?: number;
}

type NarrowBuildError<Error, Name extends ToolName> = Error extends { readonly tool: ToolName }
  ? Omit<Error, "tool"> & { readonly tool: Name }
  : Error;

type BuildErrorFor<Name extends ToolName> = NarrowBuildError<BuildError, Name>;

export type CellFailureFor<Name extends ToolName, SupportedTarget extends Target> =
  & Omit<CellFailure, "tool" | "target" | "error">
  & {
    readonly tool: Name;
    readonly target: SupportedTarget;
    readonly error: BuildErrorFor<Name>;
  };

export type MatrixFailedFor<Name extends ToolName, SupportedTarget extends Target> =
  & Omit<MatrixFailed, "artifacts" | "failures">
  & {
    readonly artifacts: readonly ProviderArtifact<Name, SupportedTarget>[];
    readonly failures: readonly [
      CellFailureFor<Name, SupportedTarget>,
      ...CellFailureFor<Name, SupportedTarget>[],
    ];
  };

export type MatrixErrorFor<Name extends ToolName, SupportedTarget extends Target> =
  | InvalidMatrixInput
  | MatrixFailedFor<Name, SupportedTarget>;

export const makeMatrixFailedFor = <Name extends ToolName, SupportedTarget extends Target>(input: {
  readonly artifacts: readonly ProviderArtifact<Name, SupportedTarget>[];
  readonly failures: readonly [
    {
      readonly tool: Name;
      readonly target: SupportedTarget;
      readonly path: string;
      readonly error: BuildError;
    },
    ...Array<{
      readonly tool: Name;
      readonly target: SupportedTarget;
      readonly path: string;
      readonly error: BuildError;
    }>,
  ];
}): MatrixFailedFor<Name, SupportedTarget> =>
  // MatrixFailed performs the runtime provider, target, path, and nested-tool
  // checks. This is the sole assertion that projects that checked root value
  // back to the private provider-correlated type.
  new MatrixFailed(input as ConstructorParameters<typeof MatrixFailed>[0]) as MatrixFailedFor<Name, SupportedTarget>;

export interface CompilerRunner<
  Options,
  Name extends ToolName,
  SupportedTarget extends Target,
> {
  readonly compileExecutable: (
    input: CompileExecutableInput<Options>,
  ) => Effect.Effect<ProviderArtifact<Name, SupportedTarget>, BuildError>;
  readonly compileExecutableMatrix: (
    input: CompileExecutableMatrixInput<SupportedTarget, Options>,
  ) => Effect.Effect<readonly ProviderArtifact<Name, SupportedTarget>[], MatrixErrorFor<Name, SupportedTarget>>;
}

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
