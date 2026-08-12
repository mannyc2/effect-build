import { Context } from "effect";
import type { Effect } from "effect";
import * as Bun from "../src/Bun.js";
import * as Deno from "../src/Deno.js";
import type { Artifact } from "../src/standalone/Artifact.js";
import type { BuildError, TargetUnsupported } from "../src/standalone/BuildError.js";
import { makeCompileExecutable } from "../src/standalone/CompileExecutable.js";
import type { CompileExecutableInput, CompilerService } from "../src/standalone/Driver.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

interface BunLikeOptions {
  readonly minify?: boolean;
}

interface DenoLikeOptions {
  readonly permissions?: { readonly all: true };
}

class BunLikeCompiler extends Context.Service<BunLikeCompiler, CompilerService<BunLikeOptions>>()(
  "typetest/standalone/BunLikeCompiler",
) {}

class DenoLikeCompiler extends Context.Service<DenoLikeCompiler, CompilerService<DenoLikeOptions>>()(
  "typetest/standalone/DenoLikeCompiler",
) {}

const bunLikeCompile = makeCompileExecutable(BunLikeCompiler);
const denoLikeCompile = makeCompileExecutable(DenoLikeCompiler);

type SuccessOf<T> = T extends Effect.Effect<infer A, infer _E, infer _R> ? A : never;
type ErrorOf<T> = T extends Effect.Effect<infer _A, infer E, infer _R> ? E : never;
type ContextOf<T> = T extends Effect.Effect<infer _A, infer _E, infer R> ? R : never;

type BunLikeEffect = ReturnType<typeof bunLikeCompile>;
type DenoLikeEffect = ReturnType<typeof denoLikeCompile>;

// The operation returns exactly Artifact, fails exactly with BuildError, and
// requires exactly its own module's compiler service.
export type _BunSuccess = Assert<Same<SuccessOf<BunLikeEffect>, Artifact>>;
export type _BunError = Assert<Same<ErrorOf<BunLikeEffect>, BuildError>>;
export type _BunContext = Assert<Same<ContextOf<BunLikeEffect>, BunLikeCompiler>>;
export type _DenoContext = Assert<Same<ContextOf<DenoLikeEffect>, DenoLikeCompiler>>;
export type _DistinctContexts = Assert<
  Same<ContextOf<BunLikeEffect> extends ContextOf<DenoLikeEffect> ? true : false, false>
>;

// Each module's options are exactly its own concrete Options instantiation.
type BunLikeInput = Parameters<typeof bunLikeCompile>[0];
export type _BunOptions = Assert<Same<BunLikeInput["options"], BunLikeOptions | undefined>>;
export type _InputFields = Assert<
  Same<keyof BunLikeInput, "entrypoint" | "outfile" | "cwd" | "target" | "digest" | "options">
>;

// The two-string call is valid.
export const _minimalCall = bunLikeCompile({ entrypoint: "src/main.ts", outfile: "dist/app" });

export const _mixedOptions = bunLikeCompile({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  // @ts-expect-error Object literal may only specify known properties, and 'permissions' does not exist in type 'BunLikeOptions'.
  options: { permissions: { all: true } },
});

export const _mixedOptionsReverse = denoLikeCompile({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  // @ts-expect-error Object literal may only specify known properties, and 'minify' does not exist in type 'DenoLikeOptions'.
  options: { minify: true },
});

export const _unknownField = bunLikeCompile({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  // @ts-expect-error Object literal may only specify known properties, and 'rawArgs' does not exist in type 'CompileExecutableInput<BunLikeOptions>'.
  rawArgs: ["--minify"],
});

export const _policyField = bunLikeCompile({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  // @ts-expect-error Object literal may only specify known properties, and 'recordRoot' does not exist in type 'CompileExecutableInput<BunLikeOptions>'.
  recordRoot: "/tmp/records",
});

// Interruption is not a member of the closed error union.
export type _NoInterrupted = Assert<Same<Extract<BuildError, { readonly _tag: "Interrupted" }>, never>>;
export type _TargetUnsupportedRequested = Assert<Same<TargetUnsupported["requested"], string>>;

// The artifact is plain final-destination data with no store identity.
export type _NoStoreFields = Assert<
  Same<Extract<keyof Artifact, "id" | "ref" | "store" | "contentAddress">, never>
>;
export type _ArtifactFields = Assert<Same<keyof Artifact, "path" | "bytes" | "digest" | "target" | "tool">>;
export type _DigestOptIn = Assert<Same<Artifact["digest"], `sha256:${string}` | undefined>>;

// The input type is exactly the frozen field set for any Options.
export type _InputShape = Assert<
  Same<
    CompileExecutableInput<BunLikeOptions>,
    {
      readonly entrypoint: string;
      readonly outfile: string;
      readonly cwd?: string;
      readonly target?: import("../src/standalone/Target.js").Target;
      readonly digest?: boolean;
      readonly options?: BunLikeOptions;
    }
  >
>;

export const _bunOptions = Bun.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  options: { minify: true, bytecode: true },
});

export const _denoOptions = Deno.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  options: { bundle: true, minify: true, permissions: { read: true } },
});

export const _denoRejectsBunOptions = Deno.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  // @ts-expect-error Object literal may only specify known properties, and 'bytecode' does not exist in type 'Options'.
  options: { bytecode: true },
});

export const _bunRejectsDenoOptions = Bun.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  // @ts-expect-error Object literal may only specify known properties, and 'permissions' does not exist in type 'Options'.
  options: { permissions: { all: true } },
});
