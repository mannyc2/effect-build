import type { Context, Effect } from "effect";
import type { Artifact } from "./Artifact.js";
import type { BuildError } from "./BuildError.js";
import type { CompileExecutableInput, CompilerService } from "./Driver.js";

export const makeCompileExecutable =
  <Self, Options>(tag: Context.Service<Self, CompilerService<Options>>) =>
  (input: CompileExecutableInput<Options>): Effect.Effect<Artifact, BuildError, Self> =>
    tag.use((service) => service.compileExecutable(input));
