import type { Effect } from "effect";
import type { ToolName } from "./Artifact.js";
import type { BuildError } from "./BuildError.js";
import type { CompileExecutableMatrixInput, MatrixErrorFor } from "./CompileExecutableMatrix.js";
import type { ProviderArtifact } from "./internal/CompilerAdapter.js";
import type { Target } from "./Target.js";

export interface CompileExecutableInput<Options, SupportedTarget extends Target = Target> {
  readonly entrypoint: string;
  readonly outfile: string;
  readonly cwd?: string;
  readonly target?: SupportedTarget;
  readonly digest?: boolean;
  readonly options?: Options;
}

export interface CompilerService<
  Name extends ToolName,
  SupportedTarget extends Target,
  Options,
> {
  readonly compileExecutable: (
    input: CompileExecutableInput<Options, SupportedTarget>,
  ) => Effect.Effect<ProviderArtifact<Name, SupportedTarget>, BuildError, never>;
  readonly compileExecutableMatrix: (
    input: CompileExecutableMatrixInput<SupportedTarget, Options>,
  ) => Effect.Effect<
    readonly ProviderArtifact<Name, SupportedTarget>[],
    MatrixErrorFor<Name, SupportedTarget>,
    never
  >;
}
