import type { Effect } from "effect";
import * as CompileExecutable from "../packages/effect-build-deno/src/CompileExecutable.js";
import type * as Artifact from "../packages/effect-build/src/Artifact.js";
import type * as BuildError from "../packages/effect-build/src/BuildError.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

export type _Target = Assert<
  Same<
    CompileExecutable.Target,
    | "macos-x64"
    | "macos-aarch64"
    | "linux-x64-gnu"
    | "linux-aarch64-gnu"
    | "windows-x64"
    | "windows-aarch64"
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

// minify requires bundle: true.
CompileExecutable.compileExecutable({ entrypoint: "main.ts", outfile: "app", bundle: true, minify: true });
// @ts-expect-error!
CompileExecutable.compileExecutable({
  entrypoint: "main.ts",
  outfile: "app",
  minify: true,
});

// Permissions: all is exclusive with scoped values.
CompileExecutable.compileExecutable({
  entrypoint: "main.ts",
  outfile: "app",
  permissions: { read: true, net: ["example.com:443"] },
});
CompileExecutable.compileExecutable({
  entrypoint: "main.ts",
  outfile: "app",
  // @ts-expect-error!
  permissions: { all: true, read: true },
});
