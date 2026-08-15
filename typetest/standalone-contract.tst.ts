import type { Effect } from "effect";
import * as Bun from "effect-build-bun";
import * as Deno from "effect-build-deno";
import * as NodeSea from "effect-build-node-sea";
import type * as Provider from "effect-build/Provider";
import type { ExecutableArtifact } from "../packages/effect-build/src/standalone/Artifact.js";
import type { BuildError, TargetUnsupported } from "../packages/effect-build/src/standalone/BuildError.js";
import type { CompileExecutableMatrixInput } from "../packages/effect-build/src/standalone/CompileExecutableMatrix.js";
import type { CompileExecutableInput } from "../packages/effect-build/src/standalone/Driver.js";
import type {
  MatrixError as RootMatrixError,
  MatrixFailed,
} from "../packages/effect-build/src/standalone/MatrixError.js";
import type { SystemTarget } from "../packages/effect-build/src/standalone/Target.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type SuccessOf<T> = T extends Effect.Effect<infer A, unknown, unknown> ? A : never;
type ErrorOf<T> = T extends Effect.Effect<unknown, infer E, unknown> ? E : never;
type ContextOf<T> = T extends Effect.Effect<unknown, unknown, infer R> ? R : never;

export type _BunTargets = Assert<
  Same<
    Bun.Target,
    "macos-x64" | "macos-aarch64" | "linux-x64-gnu" | "linux-x64-musl" | "linux-aarch64-gnu" | "windows-x64"
  >
>;
export type _DenoTargets = Assert<
  Same<
    Deno.Target,
    "macos-x64" | "macos-aarch64" | "linux-x64-gnu" | "linux-aarch64-gnu" | "windows-x64" | "windows-aarch64"
  >
>;

type BunScalar = ReturnType<typeof Bun.compileExecutable>;
type DenoScalar = ReturnType<typeof Deno.compileExecutable>;
type BunMatrix = ReturnType<typeof Bun.compileExecutableMatrix>;
type DenoMatrix = ReturnType<typeof Deno.compileExecutableMatrix>;

export type _BunScalarSuccess = Assert<Same<SuccessOf<BunScalar>, Bun.Artifact>>;
export type _DenoScalarSuccess = Assert<Same<SuccessOf<DenoScalar>, Deno.Artifact>>;
export type _BunScalarError = Assert<Same<ErrorOf<BunScalar>, Provider.BuildError>>;
export type _DenoScalarError = Assert<Same<ErrorOf<DenoScalar>, Provider.BuildError>>;
export type _BunScalarContext = Assert<Same<ContextOf<BunScalar>, Bun.Compiler>>;
export type _DenoScalarContext = Assert<Same<ContextOf<DenoScalar>, Deno.Compiler>>;
export type _BunProvider = Assert<Same<Bun.Artifact["provider"], "bun">>;
export type _DenoProvider = Assert<Same<Deno.Artifact["provider"], "deno">>;
export type _BunTool = Assert<Same<Bun.Artifact["stages"][0]["tool"]["name"], "bun">>;
export type _DenoTool = Assert<Same<Deno.Artifact["stages"][0]["tool"]["name"], "deno">>;
export type _BunTarget = Assert<Same<Bun.Artifact["target"], Bun.Target>>;
export type _DenoTarget = Assert<Same<Deno.Artifact["target"], Deno.Target>>;
export type _ArtifactsAreNeutralExecutables = Assert<
  Bun.Artifact | Deno.Artifact extends ExecutableArtifact ? true : false
>;
export type _NeutralCoreHasNoProvider = Assert<Same<Extract<keyof ExecutableArtifact, "provider">, never>>;

export type _BunMatrixSuccess = Assert<Same<SuccessOf<BunMatrix>, readonly Bun.Artifact[]>>;
export type _DenoMatrixSuccess = Assert<Same<SuccessOf<DenoMatrix>, readonly Deno.Artifact[]>>;
export type _BunMatrixError = Assert<Same<ErrorOf<BunMatrix>, Bun.MatrixError>>;
export type _DenoMatrixError = Assert<Same<ErrorOf<DenoMatrix>, Deno.MatrixError>>;
export type _BunMatrixContext = Assert<Same<ContextOf<BunMatrix>, Bun.Compiler>>;
export type _DenoMatrixContext = Assert<Same<ContextOf<DenoMatrix>, Deno.Compiler>>;
export type _MatrixErrorsAreNeutral = Assert<
  Bun.MatrixError | Deno.MatrixError extends RootMatrixError ? true : false
>;

type BunFailed = Extract<Bun.MatrixError, { readonly _tag: "MatrixFailed" }>;
type DenoFailed = Extract<Deno.MatrixError, { readonly _tag: "MatrixFailed" }>;
export type _BunFailureClass = Assert<BunFailed extends MatrixFailed ? true : false>;
export type _DenoFailureClass = Assert<DenoFailed extends MatrixFailed ? true : false>;
export type _BunFailureProvider = Assert<Same<BunFailed["failures"][number]["provider"], "bun">>;
export type _DenoFailureProvider = Assert<Same<DenoFailed["failures"][number]["provider"], "deno">>;
export type _BunFailureTarget = Assert<Same<BunFailed["failures"][number]["target"], Bun.Target>>;
export type _DenoFailureTarget = Assert<Same<DenoFailed["failures"][number]["target"], Deno.Target>>;
export type _BunFailureTool = Assert<
  Same<Extract<BunFailed["failures"][number]["error"], { readonly _tag: "ToolFailed" }>["tool"], "bun">
>;
export type _BunFailureYieldable = Assert<BunFailed extends Iterable<unknown> ? true : false>;
export type _BunFailurePipe = Assert<"pipe" extends keyof BunFailed ? true : false>;
export type _BunFailureJson = Assert<"toJSON" extends keyof BunFailed ? true : false>;

export type _BunScalarInput = Assert<
  Same<Parameters<typeof Bun.compileExecutable>[0], Bun.CompileExecutableInput>
>;
export type _DenoScalarInput = Assert<
  Same<Parameters<typeof Deno.compileExecutable>[0], Deno.CompileExecutableInput>
>;
export type _BunMatrixInput = Assert<
  Same<Parameters<typeof Bun.compileExecutableMatrix>[0], Bun.CompileExecutableMatrixInput>
>;
export type _DenoMatrixInput = Assert<
  Same<Parameters<typeof Deno.compileExecutableMatrix>[0], Deno.CompileExecutableMatrixInput>
>;
export type _ScalarFields = Assert<
  Same<
    keyof Bun.CompileExecutableInput,
    "entrypoint" | "outfile" | "cwd" | "target" | "digest" | "options"
  >
>;
export type _MatrixFields = Assert<
  Same<
    keyof Bun.CompileExecutableMatrixInput,
    "entrypoint" | "outdir" | "name" | "targets" | "cwd" | "digest" | "options" | "concurrency"
  >
>;
export type _PrivateScalarInput = Assert<
  Same<CompileExecutableInput<Bun.Options, SystemTarget>["target"], SystemTarget | undefined>
>;
export type _PrivateMatrixInput = Assert<
  Same<CompileExecutableMatrixInput<Bun.Target, Bun.Options>, Bun.CompileExecutableMatrixInput>
>;

export const _bun = Bun.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  target: "linux-x64-musl",
  options: { minify: true, bytecode: true },
});
export const _deno = Deno.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  target: "windows-aarch64",
  options: { bundle: true, minify: true, permissions: { read: true } },
});
export const _bunMatrix = Bun.compileExecutableMatrix({
  entrypoint: "src/main.ts",
  outdir: "dist",
  name: "app",
  targets: ["macos-x64", "windows-x64"],
});
export const _denoMatrix = Deno.compileExecutableMatrix({
  entrypoint: "src/main.ts",
  outdir: "dist",
  name: "app",
  targets: ["macos-aarch64", "windows-aarch64"],
});

export const _bunRejectsDenoOptions = Bun.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  // @ts-expect-error!
  options: { permissions: { all: true } },
});
export const _denoRejectsBunOptions = Deno.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  // @ts-expect-error!
  options: { bytecode: true },
});
export const _bunRejectsWindowsArm64 = Bun.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  // @ts-expect-error!
  target: "windows-aarch64",
});
export const _denoRejectsMusl = Deno.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  // @ts-expect-error!
  target: "linux-x64-musl",
});
export const _matrixRejectsEmpty = Bun.compileExecutableMatrix({
  entrypoint: "src/main.ts",
  outdir: "dist",
  name: "app",
  // @ts-expect-error!
  targets: [],
});

// @ts-expect-error!
NodeSea.compileExecutable;
// @ts-expect-error!
NodeSea.compileExecutableMatrix;
// @ts-expect-error!
type _NoNodeCompiler = NodeSea.Compiler;

export type _NoInterruptedBuildError = Assert<
  Same<Extract<BuildError, { readonly _tag: "Interrupted" }>, never>
>;
export type _TargetUnsupportedRequested = Assert<Same<TargetUnsupported["requested"], string>>;
