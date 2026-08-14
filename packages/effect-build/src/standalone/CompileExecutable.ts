import type { Context, Effect } from "effect";
import type { CompilerService, ProviderArtifact, ProviderName, TargetFor } from "../Provider.js";
import type { BuildError } from "./BuildError.js";
import type { CompileExecutableMatrixInput, MatrixErrorFor } from "./CompileExecutableMatrix.js";
import type { CompileExecutableInput } from "./Driver.js";

export const makeCompileExecutable = <
  Self,
  const Name extends ProviderName,
  Options,
>(
  tag: Context.Service<Self, CompilerService<Name, Options>>,
) =>
(
  input: CompileExecutableInput<Options, TargetFor<Name>>,
): Effect.Effect<
  ProviderArtifact<Name, TargetFor<Name>>,
  BuildError,
  Self
> => tag.use((service) => service.compileExecutable(input));

export const makeCompileExecutableMatrix = <
  Self,
  const Name extends ProviderName,
  Options,
>(
  tag: Context.Service<Self, CompilerService<Name, Options>>,
) =>
(
  input: CompileExecutableMatrixInput<TargetFor<Name>, Options>,
): Effect.Effect<
  readonly ProviderArtifact<Name, TargetFor<Name>>[],
  MatrixErrorFor<Name, TargetFor<Name>>,
  Self
> => tag.use((service) => service.compileExecutableMatrix(input));
