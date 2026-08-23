import type { Effect, Layer } from "effect";
import type * as esbuild from "esbuild";
import * as Build from "../packages/effect-build-esbuild/src/Build.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

// write must be the literal false at the type level.
declare const options: esbuild.BuildOptions & { readonly write: false };
const built = Build.build(options);
export type _Build = Assert<
  Same<typeof built, Effect.Effect<esbuild.BuildResult<typeof options>, Build.EsbuildFailed, Build.Esbuild>>
>;

// @ts-expect-error!
Build.build({ bundle: true, write: true });
// @ts-expect-error!
Build.build({ bundle: true });

const transformed = Build.transform("let a = 1", { loader: "ts" });
export type _Transform = Assert<
  Same<
    typeof transformed,
    Effect.Effect<esbuild.TransformResult<{ readonly loader: "ts" }>, Build.EsbuildFailed, Build.Esbuild>
  >
>;

declare const metafile: esbuild.Metafile;
const analyzed = Build.analyzeMetafile(metafile, { verbose: true });
export type _Analyze = Assert<Same<typeof analyzed, Effect.Effect<string, Build.EsbuildFailed, Build.Esbuild>>>;

// The layer is a constant with no requirements and no failures.
export type _Layer = Assert<Same<typeof Build.layer, Layer.Layer<Build.Esbuild>>>;

declare const failure: Build.EsbuildFailed;
export type _Diagnostics = Assert<
  Same<typeof failure.errors, readonly esbuild.Message[]> extends true
    ? Same<typeof failure.warnings, readonly esbuild.Message[]>
    : false
>;
