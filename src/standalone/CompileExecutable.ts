import type { Context, Effect } from "effect";
import type { ToolName } from "./Artifact.js";
import type { BuildError } from "./BuildError.js";
import type { CompileExecutableMatrixInput, MatrixErrorFor } from "./CompileExecutableMatrix.js";
import type { CompileExecutableInput, CompilerService } from "./Driver.js";
import type { ProviderArtifact } from "./internal/CompilerAdapter.js";
import type { Target } from "./Target.js";

export const makeCompileExecutable = <Self, const Name extends ToolName, SupportedTarget extends Target, Options>(
  tag: Context.Service<Self, CompilerService<Name, SupportedTarget, Options>>,
) =>
(
  input: CompileExecutableInput<Options, SupportedTarget>,
): Effect.Effect<ProviderArtifact<Name, SupportedTarget>, BuildError, Self> =>
  tag.use((service) => service.compileExecutable(input));

export const makeCompileExecutableMatrix = <Self, const Name extends ToolName, SupportedTarget extends Target, Options>(
  tag: Context.Service<Self, CompilerService<Name, SupportedTarget, Options>>,
) =>
(
  input: CompileExecutableMatrixInput<SupportedTarget, Options>,
): Effect.Effect<
  readonly ProviderArtifact<Name, SupportedTarget>[],
  MatrixErrorFor<Name, SupportedTarget>,
  Self
> => tag.use((service) => service.compileExecutableMatrix(input));
