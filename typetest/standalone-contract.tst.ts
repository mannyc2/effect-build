import { Context } from "effect";
import type { Effect } from "effect";
import * as Bun from "effect-build-bun";
import * as Deno from "effect-build-deno";
import type { BuildError as PublicBuildError } from "effect-build/Provider";
import type { Artifact as RootArtifact } from "../packages/effect-build/src/standalone/Artifact.js";
import type { BuildError, TargetUnsupported } from "../packages/effect-build/src/standalone/BuildError.js";
import { makeCompileExecutable } from "../packages/effect-build/src/standalone/CompileExecutable.js";
import type { CompileExecutableMatrixInput } from "../packages/effect-build/src/standalone/CompileExecutableMatrix.js";
import type { CompileExecutableInput, CompilerService } from "../packages/effect-build/src/standalone/Driver.js";
import type { MatrixError as RootMatrixError } from "../packages/effect-build/src/standalone/MatrixError.js";
import type { Target as RootTarget } from "../packages/effect-build/src/standalone/Target.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type SuccessOf<T> = T extends Effect.Effect<infer A, infer _E, infer _R> ? A : never;
type ErrorOf<T> = T extends Effect.Effect<infer _A, infer E, infer _R> ? E : never;
type ContextOf<T> = T extends Effect.Effect<infer _A, infer _E, infer R> ? R : never;

interface BunLikeOptions {
  readonly minify?: boolean;
}

interface DenoLikeOptions {
  readonly permissions?: { readonly all: true };
}

class BunLikeCompiler extends Context.Service<
  BunLikeCompiler,
  CompilerService<"bun", Bun.Target, BunLikeOptions>
>()("typetest/standalone/BunLikeCompiler") {}

class DenoLikeCompiler extends Context.Service<
  DenoLikeCompiler,
  CompilerService<"deno", Deno.Target, DenoLikeOptions>
>()("typetest/standalone/DenoLikeCompiler") {}

const bunLikeCompile = makeCompileExecutable(BunLikeCompiler);
const denoLikeCompile = makeCompileExecutable(DenoLikeCompiler);

type BunLikeEffect = ReturnType<typeof bunLikeCompile>;
type DenoLikeEffect = ReturnType<typeof denoLikeCompile>;

export type _BunLikeSuccess = Assert<Same<SuccessOf<BunLikeEffect>["tool"]["name"], "bun">>;
export type _BunLikeTarget = Assert<Same<SuccessOf<BunLikeEffect>["target"], Bun.Target>>;
export type _BunLikeError = Assert<Same<ErrorOf<BunLikeEffect>, BuildError>>;
export type _BunLikeContext = Assert<Same<ContextOf<BunLikeEffect>, BunLikeCompiler>>;
export type _DenoLikeContext = Assert<Same<ContextOf<DenoLikeEffect>, DenoLikeCompiler>>;
export type _DistinctPrivateContexts = Assert<
  Same<ContextOf<BunLikeEffect> extends ContextOf<DenoLikeEffect> ? true : false, false>
>;

type BunLikeInput = Parameters<typeof bunLikeCompile>[0];
export type _BunLikeOptions = Assert<Same<BunLikeInput["options"], BunLikeOptions | undefined>>;
export type _ScalarInputFields = Assert<
  Same<keyof BunLikeInput, "entrypoint" | "outfile" | "cwd" | "target" | "digest" | "options">
>;

export const _minimalPrivateCall = bunLikeCompile({ entrypoint: "src/main.ts", outfile: "dist/app" });

export const _privateBunRejectsDenoOptions = bunLikeCompile({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  // @ts-expect-error Object literal may only specify known properties, and 'permissions' does not exist in type 'BunLikeOptions'.
  options: { permissions: { all: true } },
});

export const _privateDenoRejectsBunOptions = denoLikeCompile({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  // @ts-expect-error Object literal may only specify known properties, and 'minify' does not exist in type 'DenoLikeOptions'.
  options: { minify: true },
});

// The public target schemas are exact provider projections of the evidence-backed tables.
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
type BunScalarEffect = ReturnType<typeof Bun.compileExecutable>;
type DenoScalarEffect = ReturnType<typeof Deno.compileExecutable>;
type BunMatrixEffect = ReturnType<typeof Bun.compileExecutableMatrix>;
type DenoMatrixEffect = ReturnType<typeof Deno.compileExecutableMatrix>;

export type _BunScalarSuccess = Assert<Same<SuccessOf<BunScalarEffect>, Bun.Artifact>>;
export type _DenoScalarSuccess = Assert<Same<SuccessOf<DenoScalarEffect>, Deno.Artifact>>;
export type _BunScalarError = Assert<Same<ErrorOf<BunScalarEffect>, PublicBuildError>>;
export type _DenoScalarError = Assert<Same<ErrorOf<DenoScalarEffect>, PublicBuildError>>;
export type _BunScalarContext = Assert<Same<ContextOf<BunScalarEffect>, Bun.Compiler>>;
export type _DenoScalarContext = Assert<Same<ContextOf<DenoScalarEffect>, Deno.Compiler>>;
export type _BunArtifactTool = Assert<Same<Bun.Artifact["tool"]["name"], "bun">>;
export type _DenoArtifactTool = Assert<Same<Deno.Artifact["tool"]["name"], "deno">>;
export type _BunArtifactTarget = Assert<Same<Bun.Artifact["target"], Bun.Target>>;
export type _DenoArtifactTarget = Assert<Same<Deno.Artifact["target"], Deno.Target>>;
export type _ProviderArtifactsAreRootArtifacts = Assert<
  Same<Bun.Artifact | Deno.Artifact extends RootArtifact ? true : false, true>
>;
export type _RootArtifactDoesNotWidenProviderCorrelation = Assert<
  Same<RootArtifact extends Bun.Artifact | Deno.Artifact ? true : false, true>
>;

export type _BunMatrixSuccess = Assert<Same<SuccessOf<BunMatrixEffect>, readonly Bun.Artifact[]>>;
export type _DenoMatrixSuccess = Assert<Same<SuccessOf<DenoMatrixEffect>, readonly Deno.Artifact[]>>;
export type _BunMatrixError = Assert<Same<ErrorOf<BunMatrixEffect>, Bun.MatrixError>>;
export type _DenoMatrixError = Assert<Same<ErrorOf<DenoMatrixEffect>, Deno.MatrixError>>;
export type _BunMatrixContext = Assert<Same<ContextOf<BunMatrixEffect>, Bun.Compiler>>;
export type _DenoMatrixContext = Assert<Same<ContextOf<DenoMatrixEffect>, Deno.Compiler>>;
export type _ProviderMatrixErrorsAreRootErrors = Assert<
  Same<Bun.MatrixError | Deno.MatrixError extends RootMatrixError ? true : false, true>
>;

type BunFailed = Extract<Bun.MatrixError, { readonly _tag: "MatrixFailed" }>;
type DenoFailed = Extract<Deno.MatrixError, { readonly _tag: "MatrixFailed" }>;
export type _BunFailureTool = Assert<Same<BunFailed["failures"][number]["tool"], "bun">>;
export type _DenoFailureTool = Assert<Same<DenoFailed["failures"][number]["tool"], "deno">>;
export type _BunFailureTarget = Assert<Same<BunFailed["failures"][number]["target"], Bun.Target>>;
export type _DenoFailureTarget = Assert<Same<DenoFailed["failures"][number]["target"], Deno.Target>>;
export type _BunPartialArtifacts = Assert<Same<BunFailed["artifacts"], readonly Bun.Artifact[]>>;
export type _DenoPartialArtifacts = Assert<Same<DenoFailed["artifacts"], readonly Deno.Artifact[]>>;

export type _BunScalarInput = Assert<Same<Parameters<typeof Bun.compileExecutable>[0], Bun.CompileExecutableInput>>;
export type _DenoScalarInput = Assert<
  Same<Parameters<typeof Deno.compileExecutable>[0], Deno.CompileExecutableInput>
>;
export type _BunScalarTarget = Assert<
  Same<Bun.CompileExecutableInput["target"], Bun.Target | undefined>
>;
export type _DenoScalarTarget = Assert<
  Same<Deno.CompileExecutableInput["target"], Deno.Target | undefined>
>;
export type _BunMatrixInput = Assert<
  Same<Parameters<typeof Bun.compileExecutableMatrix>[0], Bun.CompileExecutableMatrixInput>
>;
export type _DenoMatrixInput = Assert<
  Same<Parameters<typeof Deno.compileExecutableMatrix>[0], Deno.CompileExecutableMatrixInput>
>;
export type _MatrixInputFields = Assert<
  Same<
    keyof Bun.CompileExecutableMatrixInput,
    "entrypoint" | "outdir" | "name" | "targets" | "cwd" | "digest" | "options" | "concurrency"
  >
>;
export type _BunMatrixTargets = Assert<
  Same<Bun.CompileExecutableMatrixInput["targets"], readonly [Bun.Target, ...Bun.Target[]]>
>;
export type _DenoMatrixTargets = Assert<
  Same<Deno.CompileExecutableMatrixInput["targets"], readonly [Deno.Target, ...Deno.Target[]]>
>;
export type _BunMatrixOptions = Assert<
  Same<Bun.CompileExecutableMatrixInput["options"], Bun.Options | undefined>
>;
export type _DenoMatrixOptions = Assert<
  Same<Deno.CompileExecutableMatrixInput["options"], Deno.Options | undefined>
>;

export const _bunScalar = Bun.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  target: "linux-x64-musl",
  options: { minify: true, bytecode: true },
});

export const _denoScalar = Deno.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  target: "windows-aarch64",
  options: { bundle: true, minify: true, permissions: { read: true } },
});

export const _bunMatrix = Bun.compileExecutableMatrix({
  entrypoint: "src/main.ts",
  outdir: "dist",
  name: "app",
  targets: ["linux-x64-musl", "windows-x64"],
  options: { minify: true, bytecode: true },
  concurrency: 2,
});

export const _denoMatrix = Deno.compileExecutableMatrix({
  entrypoint: "src/main.ts",
  outdir: "dist",
  name: "app",
  targets: ["linux-aarch64-gnu", "windows-aarch64"],
  options: { bundle: true, minify: true, permissions: { read: true } },
});

export const _bunRejectsDenoOptions = Bun.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  // @ts-expect-error Object literal may only specify known properties, and 'permissions' does not exist in type 'Options'.
  options: { permissions: { all: true } },
});

export const _denoRejectsBunOptions = Deno.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  // @ts-expect-error Object literal may only specify known properties, and 'bytecode' does not exist in type 'Options'.
  options: { bytecode: true },
});

export const _bunRejectsArm64Musl = Bun.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  // @ts-expect-error Type '"linux-aarch64-musl"' is not assignable to type '"macos-x64" | "macos-aarch64" | "linux-x64-gnu" | "linux-x64-musl" | "linux-aarch64-gnu" | "windows-x64"'. Did you mean '"linux-aarch64-gnu"'?
  target: "linux-aarch64-musl",
});

export const _bunRejectsWindowsArm64 = Bun.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  // @ts-expect-error Type '"windows-aarch64"' is not assignable to type '"macos-x64" | "macos-aarch64" | "linux-x64-gnu" | "linux-x64-musl" | "linux-aarch64-gnu" | "windows-x64"'. Did you mean '"windows-x64"'?
  target: "windows-aarch64",
});

export const _denoRejectsMusl = Deno.compileExecutableMatrix({
  entrypoint: "src/main.ts",
  outdir: "dist",
  name: "app",
  // @ts-expect-error Type '"linux-x64-musl"' is not assignable to type '"macos-x64" | "macos-aarch64" | "linux-x64-gnu" | "linux-aarch64-gnu" | "windows-x64" | "windows-aarch64"'. Did you mean '"linux-x64-gnu"'?
  targets: ["linux-x64-musl"],
});

export const _denoScalarRejectsMusl = Deno.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  // @ts-expect-error Type '"linux-x64-musl"' is not assignable to type '"macos-x64" | "macos-aarch64" | "linux-x64-gnu" | "linux-aarch64-gnu" | "windows-x64" | "windows-aarch64"'. Did you mean '"linux-x64-gnu"'?
  target: "linux-x64-musl",
});

export const _matrixRejectsEmptyTargets = Bun.compileExecutableMatrix({
  entrypoint: "src/main.ts",
  outdir: "dist",
  name: "app",
  // @ts-expect-error Source has 0 element(s) but target requires 1.
  targets: [],
});

export const _matrixRejectsUnbounded = Bun.compileExecutableMatrix({
  entrypoint: "src/main.ts",
  outdir: "dist",
  name: "app",
  targets: ["macos-x64"],
  // @ts-expect-error Type 'string' is not assignable to type 'number'.
  concurrency: "unbounded",
});

export type _NoInterruptedBuildError = Assert<
  Same<Extract<BuildError, { readonly _tag: "Interrupted" }>, never>
>;
export type _TargetUnsupportedRequested = Assert<Same<TargetUnsupported["requested"], string>>;
export type _NoStoreFields = Assert<
  Same<Extract<keyof RootArtifact, "id" | "ref" | "store" | "contentAddress">, never>
>;
export type _ArtifactFields = Assert<
  Same<keyof RootArtifact, "path" | "bytes" | "digest" | "target" | "tool">
>;
export type _DigestOptIn = Assert<Same<RootArtifact["digest"], `sha256:${string}` | undefined>>;
export type _PrivateMatrixInputMatches = Assert<
  Same<CompileExecutableMatrixInput<Bun.Target, Bun.Options>, Bun.CompileExecutableMatrixInput>
>;
export type _RootScalarInputStillAvailablePrivately = Assert<
  Same<CompileExecutableInput<BunLikeOptions, RootTarget>["target"], RootTarget | undefined>
>;
