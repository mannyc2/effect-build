import type { Crypto, Effect, FileSystem, Path } from "effect";
import * as Compile from "../packages/effect-build-bun/src/Command/CompileExecutable.js";
import * as Bun from "../packages/effect-build-bun/src/index.js";
import * as Runtime from "../packages/effect-build-bun/src/internal/Runtime.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

export type _RootNamespaces = Assert<Same<keyof typeof Bun, "Api" | "Command">>;
export type _TargetIncludesMuslAndArm64 = Assert<
  Same<
    Extract<Compile.Target, "bun-linux-arm64-musl" | "bun-windows-arm64">,
    "bun-linux-arm64-musl" | "bun-windows-arm64"
  >
>;

const scalar = Compile.compileExecutable({
  entrypoints: ["main.ts"],
  outfile: "app",
  target: "bun-linux-x64-musl",
  observation: "hashed",
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
  inputs: [{
    entrypoints: ["main.ts"],
    outfile: "app",
    observation: "unhashed",
  }],
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
Compile.compileExecutable({ entrypoints: [], outfile: "app", observation: "hashed" });
// @ts-expect-error!
Compile.compileExecutable({ entrypoints: ["main.ts"], outfile: "app", observation: "hash" });
