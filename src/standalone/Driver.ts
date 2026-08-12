import type { Effect } from "effect";
import type { Artifact } from "./Artifact.js";
import type { BuildError } from "./BuildError.js";
import type { Target } from "./Target.js";

export interface CompileExecutableInput<Options> {
  readonly entrypoint: string;
  readonly outfile: string;
  readonly cwd?: string;
  readonly target?: Target;
  readonly digest?: boolean;
  readonly options?: Options;
}

export interface CompilerService<Options> {
  readonly compileExecutable: (
    input: CompileExecutableInput<Options>,
  ) => Effect.Effect<Artifact, BuildError, never>;
}
