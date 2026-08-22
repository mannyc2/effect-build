import type { Context, Effect } from "effect";
import type { CompilerService, ProviderArtifact, ProviderStages } from "../Provider.js";
import type { BuildError } from "./BuildError.js";
import type { CompileExecutableMatrixInput } from "./CompileExecutableMatrix.js";
import type { CompileExecutableInput } from "./Driver.js";
import type { SystemTarget } from "./Target.js";

export const makeCompileExecutable = <
  Self,
  const Name extends string,
  Target extends SystemTarget,
  Stages extends ProviderStages<Name>,
  Options,
>(
  tag: Context.Service<Self, CompilerService<Name, Options, Target, Stages>>,
) =>
(
  input: CompileExecutableInput<Options, Target>,
): Effect.Effect<
  ProviderArtifact<Name, Target, Stages>,
  BuildError,
  Self
> => tag.use((service) => service.compileExecutable(input));

export const makeCompileExecutableMatrix = <
  Self,
  const Name extends string,
  Target extends SystemTarget,
  Stages extends ProviderStages<Name>,
  Options,
>(
  tag: Context.Service<Self, CompilerService<Name, Options, Target, Stages>>,
) =>
(
  input: CompileExecutableMatrixInput<Target, Options>,
): Effect.Effect<
  readonly ProviderArtifact<Name, Target, Stages>[],
  import("../Provider.js").ProviderMatrixError<Name, Target, Stages>,
  Self
> => tag.use((service) => service.compileExecutableMatrix(input));
