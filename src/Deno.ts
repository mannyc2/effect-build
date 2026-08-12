import { Context, Effect, Layer } from "effect";
import type { Crypto, FileSystem, Path } from "effect";
import type { ToolNotFound, ToolProbeFailed } from "./standalone/BuildError.js";
import { makeCompileExecutable } from "./standalone/CompileExecutable.js";
import type { CompileExecutableInput as CommonInput, CompilerService } from "./standalone/Driver.js";
import { makeCompilerService } from "./standalone/internal/CompilerEngine.js";
import { denoAdapter } from "./standalone/internal/DenoAdapter.js";
import type { ChildProcessSpawner } from "./standalone/internal/Process.js";
import { discoverTool } from "./standalone/internal/ToolDiscovery.js";

export type PermissionValue = true | readonly string[];

export type Permissions =
  | { readonly all: true }
  | {
    readonly all?: false;
    readonly read?: PermissionValue;
    readonly write?: PermissionValue;
    readonly net?: PermissionValue;
    readonly env?: PermissionValue;
    readonly run?: PermissionValue;
    readonly ffi?: PermissionValue;
    readonly sys?: PermissionValue;
    readonly import?: PermissionValue;
  };

export type Options =
  | { readonly bundle?: false; readonly minify?: never; readonly permissions?: Permissions }
  | { readonly bundle: true; readonly minify?: boolean; readonly permissions?: Permissions };

export interface LayerOptions {
  readonly executable?: string;
}

export type CompileExecutableInput = CommonInput<Options>;

export class Compiler extends Context.Service<Compiler, CompilerService<Options>>()("effect-build/deno/Compiler") {}

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
      const tool = yield* discoverTool(denoAdapter, options.executable);
      return yield* makeCompilerService(denoAdapter, tool);
    }),
  );
