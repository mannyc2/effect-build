import type { Effect } from "effect";
import type { ProviderArtifact, ProviderMatrixError, ProviderStages } from "../Provider.js";
import type { BuildError } from "./BuildError.js";
import type { CompileExecutableMatrixInput } from "./CompileExecutableMatrix.js";
import type { SystemTarget } from "./Target.js";

export interface CompileExecutableInput<
  Options,
  SupportedTarget extends string = string,
> {
  readonly entrypoint: string;
  readonly outfile: string;
  readonly cwd?: string;
  readonly target?: SupportedTarget;
  readonly digest?: boolean;
  readonly options?: Options;
}

export interface CompilerService<
  Name extends string,
  SupportedTarget extends SystemTarget,
  Stages extends ProviderStages<Name>,
  Options,
> {
  readonly compileExecutable: (
    input: CompileExecutableInput<Options, SupportedTarget>,
  ) => Effect.Effect<
    ProviderArtifact<Name, SupportedTarget, Stages>,
    BuildError,
    never
  >;
  readonly compileExecutableMatrix: (
    input: CompileExecutableMatrixInput<SupportedTarget, Options>,
  ) => Effect.Effect<
    readonly ProviderArtifact<Name, SupportedTarget, Stages>[],
    ProviderMatrixError<Name, SupportedTarget, Stages>,
    never
  >;
}
