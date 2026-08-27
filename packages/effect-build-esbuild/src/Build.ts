import { Context, Effect, Layer } from "effect";
import * as Toolchain from "effect-build/Toolchain";
import * as esbuild from "esbuild";
import { EsbuildFailed } from "./internal/error.js";

export { EsbuildFailed } from "./internal/error.js";

/** Native esbuild options with the in-memory refinement; `write` must be the literal `false`. */
export type Options = esbuild.BuildOptions & { readonly write: false };

/** The native in-memory result; output files stay esbuild-opaque values. */
export type Artifact<Input extends Options = Options> = esbuild.BuildResult<Input>;

export type BuildError = EsbuildFailed;

interface Service {
  readonly build: <const Input extends Options>(
    input: Input,
  ) => Effect.Effect<esbuild.BuildResult<Input>, EsbuildFailed>;
  readonly transform: <const Input extends esbuild.TransformOptions>(
    code: string | Uint8Array,
    options?: Input,
  ) => Effect.Effect<esbuild.TransformResult<Input>, EsbuildFailed>;
  readonly analyzeMetafile: (
    metafile: esbuild.Metafile | string,
    options?: esbuild.AnalyzeMetafileOptions,
  ) => Effect.Effect<string, EsbuildFailed>;
}

export class Esbuild extends Context.Service<Esbuild, Service>()("effect-build-esbuild/Build/Esbuild") {}

/** esbuild releases exercised by this repository's CI; others proceed with a warning. */
const tested: Toolchain.TestedRange = { minimum: "0.25.0", before: "0.30.0" };

const makeService: Effect.Effect<Service> = Effect.gen(function*() {
  yield* Toolchain.warnIfUntested({ tool: "esbuild", version: esbuild.version, tested });
  const build = <const Input extends Options>(input: Input) =>
    Effect.tryPromise({
      try: () => esbuild.build(input as Options) as Promise<esbuild.BuildResult<Input>>,
      catch: (error) => new EsbuildFailed({ operation: "build", cause: error }),
    });
  const transform = <const Input extends esbuild.TransformOptions>(code: string | Uint8Array, options?: Input) =>
    Effect.tryPromise({
      try: () =>
        esbuild.transform(code, options as esbuild.TransformOptions) as Promise<esbuild.TransformResult<Input>>,
      catch: (error) => new EsbuildFailed({ operation: "transform", cause: error }),
    });
  const analyzeMetafile = (metafile: esbuild.Metafile | string, options?: esbuild.AnalyzeMetafileOptions) =>
    Effect.tryPromise({
      try: () => esbuild.analyzeMetafile(metafile, options),
      catch: (error) => new EsbuildFailed({ operation: "analyzeMetafile", cause: error }),
    });
  return { build, transform, analyzeMetafile };
});

export const build = <const Input extends Options>(
  input: Input,
): Effect.Effect<esbuild.BuildResult<Input>, EsbuildFailed, Esbuild> => Esbuild.use((service) => service.build(input));

/** One-file transpile without bundling; esbuild's own `transform`. */
export const transform = <const Input extends esbuild.TransformOptions>(
  code: string | Uint8Array,
  options?: Input,
): Effect.Effect<esbuild.TransformResult<Input>, EsbuildFailed, Esbuild> =>
  Esbuild.use((service) => service.transform(code, options));

/** Renders a build metafile as esbuild's own human-readable size report. */
export const analyzeMetafile = (
  metafile: esbuild.Metafile | string,
  options?: esbuild.AnalyzeMetafileOptions,
): Effect.Effect<string, EsbuildFailed, Esbuild> =>
  Esbuild.use((service) => service.analyzeMetafile(metafile, options));

export const layer: Layer.Layer<Esbuild> = Layer.effect(Esbuild, makeService);
