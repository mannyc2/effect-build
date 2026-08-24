import { Context as EffectContext, Effect, Layer, type Scope } from "effect";
import * as Toolchain from "effect-build/Author/Tool";
import * as esbuild from "esbuild";
import { EsbuildFailed } from "./internal/error.js";

export { EsbuildFailed } from "./internal/error.js";

/** Native esbuild options with the in-memory refinement; `write` must be the literal `false`. */
export type Options = esbuild.BuildOptions & { readonly write: false };

export type ContextError = EsbuildFailed;

/**
 * The scoped native state owner. `rebuild`, `watch`, `serve`, and `cancel` are
 * methods of this one owner; native `dispose` stays hidden and is owned only by
 * the Scope finalizer's cancel-then-dispose sequence.
 */
export interface Context<Input extends Options = Options> {
  readonly rebuild: Effect.Effect<esbuild.BuildResult<Input>, EsbuildFailed>;
  readonly watch: (options?: esbuild.WatchOptions) => Effect.Effect<void, EsbuildFailed>;
  readonly serve: (options?: esbuild.ServeOptions) => Effect.Effect<esbuild.ServeResult, EsbuildFailed>;
  readonly cancel: Effect.Effect<void, EsbuildFailed>;
}

interface Service {
  readonly make: <const Input extends Options>(
    input: Input,
  ) => Effect.Effect<Context<Input>, EsbuildFailed, Scope.Scope>;
}

export class Esbuild extends EffectContext.Service<Esbuild, Service>()("effect-build-esbuild/Context/Esbuild") {}

/** esbuild releases exercised by this repository's CI; others proceed with a warning. */
const tested: Toolchain.TestedRange = { minimum: "0.25.0", before: "0.30.0" };

/** Hidden release; failures surface as Scope-finalization Cause, never as ContextError. */
const releaseNativeContext = (native: esbuild.BuildContext): Effect.Effect<void> =>
  Effect.uninterruptible(
    Effect.promise(() => native.cancel()).pipe(
      Effect.ensuring(Effect.promise(() => native.dispose())),
    ),
  );

const wrapNativeContext = <Input extends Options>(native: esbuild.BuildContext<Input>): Context<Input> => ({
  rebuild: Effect.tryPromise({
    try: () => native.rebuild(),
    catch: (error) => new EsbuildFailed({ operation: "rebuild", cause: error }),
  }),
  watch: (options?: esbuild.WatchOptions) =>
    Effect.tryPromise({
      try: () => native.watch(options),
      catch: (error) => new EsbuildFailed({ operation: "watch", cause: error }),
    }),
  serve: (options?: esbuild.ServeOptions) =>
    Effect.tryPromise({
      try: () => native.serve(options),
      catch: (error) => new EsbuildFailed({ operation: "serve", cause: error }),
    }),
  cancel: Effect.tryPromise({
    try: () => native.cancel(),
    catch: (error) => new EsbuildFailed({ operation: "cancel", cause: error }),
  }),
});

const makeService: Effect.Effect<Service> = Effect.gen(function*() {
  yield* Toolchain.warnIfUntested({ tool: "esbuild", version: esbuild.version, tested });
  const make = <const Input extends Options>(input: Input) =>
    Effect.map(
      Effect.acquireRelease(
        Effect.tryPromise({
          try: () => esbuild.context(input as Options) as Promise<esbuild.BuildContext<Input>>,
          catch: (error) => new EsbuildFailed({ operation: "make", cause: error }),
        }),
        releaseNativeContext,
      ),
      wrapNativeContext,
    );
  return { make };
});

export const make = <const Input extends Options>(
  input: Input,
): Effect.Effect<Context<Input>, EsbuildFailed, Esbuild | Scope.Scope> => Esbuild.use((service) => service.make(input));

export const layer: Layer.Layer<Esbuild> = Layer.effect(Esbuild, makeService);
