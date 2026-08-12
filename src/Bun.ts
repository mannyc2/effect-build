import { Context, Effect, Layer } from "effect";
import type { Crypto, FileSystem, Path } from "effect";
import type { BuildError, ToolNotFound, ToolProbeFailed } from "./standalone/BuildError.js";
import { makeCompileExecutable, makeCompileExecutableMatrix } from "./standalone/CompileExecutable.js";
import type {
  CompileExecutableMatrixInput as CommonMatrixInput,
  MatrixErrorFor,
} from "./standalone/CompileExecutableMatrix.js";
import type { CompileExecutableInput as CommonInput, CompilerService } from "./standalone/Driver.js";
import { bunAdapter } from "./standalone/internal/BunAdapter.js";
import { bunTargetTable } from "./standalone/internal/BunTarget.js";
import type { ProviderArtifact } from "./standalone/internal/CompilerAdapter.js";
import { makeCompilerService } from "./standalone/internal/CompilerEngine.js";
import type { ChildProcessSpawner } from "./standalone/internal/Process.js";
import { discoverTool } from "./standalone/internal/ToolDiscovery.js";

export interface Options {
  readonly minify?: boolean;
  readonly sourcemap?: "linked" | "inline";
  readonly bytecode?: boolean;
}

export interface LayerOptions {
  readonly executable?: string;
}

export class Compiler extends Context.Service<Compiler, CompilerService<"bun", Target, Options>>()(
  "effect-build/bun/Compiler",
) {}

export const Target = bunTargetTable.Target;
export type Target = typeof Target.Type;

export type Artifact = ProviderArtifact<"bun", Target>;
export type CompileExecutableInput = CommonInput<Options, Target>;
export type CompileExecutableMatrixInput = CommonMatrixInput<Target, Options>;
export type MatrixError = MatrixErrorFor<"bun", Target>;

export const compileExecutable: (
  input: CompileExecutableInput,
) => Effect.Effect<Artifact, BuildError, Compiler> = makeCompileExecutable(Compiler);

export const compileExecutableMatrix: (
  input: CompileExecutableMatrixInput,
) => Effect.Effect<readonly Artifact[], MatrixError, Compiler> = makeCompileExecutableMatrix(Compiler);

export const layer = (
  options: LayerOptions = {},
): Layer.Layer<
  Compiler,
  ToolNotFound | ToolProbeFailed,
  ChildProcessSpawner | FileSystem.FileSystem | Path.Path | Crypto.Crypto
> =>
  Layer.effect(
    Compiler,
    Effect.gen(function*() {
      const tool = yield* discoverTool(bunAdapter, options.executable);
      return yield* makeCompilerService(bunAdapter, tool);
    }),
  );
