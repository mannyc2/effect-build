import type { Crypto, Effect, FileSystem, Path } from "effect";
import * as Compile from "../packages/effect-build-deno/src/Command/CompileExecutable.js";
import * as CompileWatch from "../packages/effect-build-deno/src/Command/CompileWatch.js";
import * as Deno from "../packages/effect-build-deno/src/index.js";
import * as Runtime from "../packages/effect-build-deno/src/internal/Runtime.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

export type _RootNamespaces = Assert<Same<keyof typeof Deno, "Command">>;
export type _Targets = Assert<
  Same<
    Compile.Target,
    | "x86_64-unknown-linux-gnu"
    | "aarch64-unknown-linux-gnu"
    | "x86_64-pc-windows-msvc"
    | "aarch64-pc-windows-msvc"
    | "x86_64-apple-darwin"
    | "aarch64-apple-darwin"
  >
>;

const scalar = Compile.compileExecutable({
  entrypoint: "main.ts",
  outfile: "app",
  target: "aarch64-apple-darwin",
  observation: "hashed",
  allowRead: true,
  denyNet: ["example.com"],
  cachedOnly: true,
});
export type _Scalar = Assert<
  Same<
    typeof scalar,
    Effect.Effect<
      Compile.Artifact<"hashed">,
      Compile.CompileExecutableError,
      Runtime.Runtime | Crypto.Crypto | FileSystem.FileSystem | Path.Path
    >
  >
>;

const matrix = Compile.compileExecutableMatrix<"unhashed">({
  inputs: [{ entrypoint: "main.ts", outfile: "app", observation: "unhashed" }],
  concurrency: 1,
});
export type _Matrix = Assert<
  Same<Effect.Success<typeof matrix>, Compile.MatrixReport<"unhashed">>
>;
export type _MatrixError = Assert<
  Same<Effect.Error<typeof matrix>["_tag"], "InvalidInput">
>;
export type _MatrixServices = Assert<
  Same<Effect.Services<typeof matrix>, Runtime.Runtime | Crypto.Crypto | FileSystem.FileSystem | Path.Path>
>;

// @ts-expect-error!
Compile.compileExecutable({ entrypoint: "main.ts", outfile: "app", observation: "hash" });
// @ts-expect-error!
Compile.compileExecutable({ entrypoint: "main.ts", outfile: "app", target: "linux-x64", observation: "hashed" });

CompileWatch.watch({
  entrypoint: "main.ts",
  outfile: "app",
  target: "aarch64-apple-darwin",
});
