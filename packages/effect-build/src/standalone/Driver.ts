import type { Effect } from "effect";
import type { ProviderArtifact, ProviderName } from "../Provider.js";
import type { BuildError } from "./BuildError.js";
import type { CompileExecutableMatrixInput, MatrixErrorFor } from "./CompileExecutableMatrix.js";

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
  Name extends ProviderName,
  SupportedTarget extends import("./Target.js").Target,
  Options,
> {
  readonly compileExecutable: (
    input: CompileExecutableInput<Options, SupportedTarget>,
  ) => Effect.Effect<
    ProviderArtifact<Name, SupportedTarget>,
    BuildError,
    never
  >;
  readonly compileExecutableMatrix: (
    input: CompileExecutableMatrixInput<SupportedTarget, Options>,
  ) => Effect.Effect<
    readonly ProviderArtifact<Name, SupportedTarget>[],
    MatrixErrorFor<Name, SupportedTarget>,
    never
  >;
}
