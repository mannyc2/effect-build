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
  return { build };
});

export const build = <const Input extends Options>(
  input: Input,
): Effect.Effect<esbuild.BuildResult<Input>, EsbuildFailed, Esbuild> => Esbuild.use((service) => service.build(input));

export const layer: Layer.Layer<Esbuild> = Layer.effect(Esbuild, makeService);
