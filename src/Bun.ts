import { Context, Effect, Layer } from "effect";
import type { Crypto, FileSystem, Path } from "effect";
import type { ToolNotFound, ToolProbeFailed } from "./standalone/BuildError.js";
import { makeCompileExecutable } from "./standalone/CompileExecutable.js";
import type { CompileExecutableInput as CommonInput, CompilerService } from "./standalone/Driver.js";
import { bunAdapter } from "./standalone/internal/BunAdapter.js";
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

export type CompileExecutableInput = CommonInput<Options>;

export class Compiler extends Context.Service<Compiler, CompilerService<Options>>()("effect-build/bun/Compiler") {}

export const compileExecutable = makeCompileExecutable(Compiler);

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
