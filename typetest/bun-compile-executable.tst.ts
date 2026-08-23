import type { Crypto, Effect, FileSystem, Layer, Path } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import * as CompileExecutable from "../packages/effect-build-bun/src/CompileExecutable.js";
import type * as Artifact from "../packages/effect-build/src/Artifact.js";
import type * as BuildError from "../packages/effect-build/src/BuildError.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type LayerError<L> = L extends Layer.Layer<infer _A, infer E, infer _R> ? E : never;
type LayerServices<L> = L extends Layer.Layer<infer _A, infer _E, infer R> ? R : never;

export type _Target = Assert<
  Same<
    CompileExecutable.Target,
    | "macos-x64"
    | "macos-aarch64"
    | "linux-x64-gnu"
    | "linux-x64-musl"
    | "linux-aarch64-gnu"
    | "windows-x64"
  >
>;

export type _Error = Assert<
  Same<
    CompileExecutable.CompileExecutableError,
    BuildError.ToolFailed | BuildError.UnsupportedTarget | BuildError.PublishFailed
  >
>;

declare const input: CompileExecutable.CompileExecutableInput;
const compiled = CompileExecutable.compileExecutable(input);

export type _Compile = Assert<
  Same<
    typeof compiled,
    Effect.Effect<Artifact.Executable, CompileExecutable.CompileExecutableError, CompileExecutable.Compiler>
  >
>;

const built = CompileExecutable.layer({ executable: "/usr/local/bin/bun" });

export type _LayerError = Assert<Same<LayerError<typeof built>, BuildError.ToolNotFound | BuildError.ToolFailed>>;
export type _LayerServices = Assert<
  Same<
    LayerServices<typeof built>,
    Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner
  >
>;

// The input is closed and flat: no nested options bag, no observation mode.
export type _Input = Assert<
  Same<
    CompileExecutable.CompileExecutableInput,
    {
      readonly entrypoint: string;
      readonly outfile: string;
      readonly cwd?: string;
      readonly target?: CompileExecutable.Target;
      readonly hash?: boolean;
      readonly minify?: boolean;
      readonly sourcemap?: "linked" | "inline";
      readonly bytecode?: boolean;
    }
  >
>;
