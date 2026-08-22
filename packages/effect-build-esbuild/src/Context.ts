import { Context as EffectContext, type Crypto, Effect, type FileSystem, Layer, type Path, type Scope } from "effect";
import * as esbuild from "esbuild";
import {
  type Admission,
  evaluateAdmission,
  hasProviderMessageArrays,
  type IdentityIncomplete,
  type InstalledEvidence,
  type InvalidOptions,
  invalidOptions,
  operationCoordinate,
  type PreflightRefusal,
  type ProviderBuildFailure,
  providerBuildFailure,
  type ProviderContextFailure,
  providerContextFailure,
  type ToolProbeFailed,
} from "./internal/v04/compatibility.js";
import { observeInstalled } from "./internal/v04/installed.js";

export interface LayerOptions {
  readonly allowUntestedVersion?: boolean;
}

/** Native esbuild options with the frozen in-memory refinement; `write` must be the literal `false`. */
export type Options = esbuild.BuildOptions & { readonly write: false };

export type MakeInput = Options;

export type ContextError =
  | InvalidOptions<"make">
  | ProviderBuildFailure<"make" | "rebuild">
  | ProviderContextFailure<"cancel" | "make" | "serve" | "watch">
  | PreflightRefusal;

/**
 * The scoped native state owner. `rebuild`, `watch`, `serve`, and `cancel` are
 * methods of this one owner; native `dispose` stays hidden and is owned only by
 * the Scope finalizer's cancel-then-dispose sequence.
 */
export interface Context<Input extends Options = Options> {
  readonly rebuild: Effect.Effect<esbuild.BuildResult<Input>, ContextError>;
  readonly watch: (options?: esbuild.WatchOptions) => Effect.Effect<void, ContextError>;
  readonly serve: (options?: esbuild.ServeOptions) => Effect.Effect<esbuild.ServeResult, ContextError>;
  readonly cancel: Effect.Effect<void, ContextError>;
}

interface Service {
  readonly make: <const Input extends Options>(
    input: Input,
  ) => Effect.Effect<Context<Input>, ContextError, Scope.Scope>;
}

export class Esbuild extends EffectContext.Service<Esbuild, Service>()("effect-build-esbuild/Context/Esbuild") {}

const operation = operationCoordinate("context-memory");

const hasExplicitWriteFalse = (input: unknown): boolean =>
  typeof input === "object" && input !== null && !Array.isArray(input)
  && (input as { readonly write?: unknown }).write === false;

const admit = (
  evidence: InstalledEvidence,
  allowUntestedVersion: boolean,
): Effect.Effect<Admission, PreflightRefusal> => {
  const outcome = evaluateAdmission({ operation, evidence, allowUntestedVersion });
  if (outcome._tag === "Refused") return Effect.fail(outcome.refusal);
  if (outcome.admission._tag === "UntestedOverride") {
    return Effect.logWarning(
      `${outcome.admission.warningCode}: effect-build-esbuild context-memory proceeds on unreviewed coordinates`,
    ).pipe(Effect.as(outcome.admission));
  }
  return Effect.succeed(outcome.admission);
};

const acquireFailure = (error: unknown): ContextError =>
  hasProviderMessageArrays(error) ? providerBuildFailure("make", error) : providerContextFailure("make", error);

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
    catch: (error) => providerBuildFailure("rebuild", error),
  }),
  watch: (options?: esbuild.WatchOptions) =>
    Effect.tryPromise({
      try: () => native.watch(options),
      catch: (error) => providerContextFailure("watch", error),
    }),
  serve: (options?: esbuild.ServeOptions) =>
    Effect.tryPromise({
      try: () => native.serve(options),
      catch: (error) => providerContextFailure("serve", error),
    }),
  cancel: Effect.tryPromise({
    try: () => native.cancel(),
    catch: (error) => providerContextFailure("cancel", error),
  }),
});

const makeService = (options?: LayerOptions): Effect.Effect<
  Service,
  IdentityIncomplete | ToolProbeFailed,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function*() {
    const allowUntestedVersion = options?.allowUntestedVersion === true;
    const evidence = yield* observeInstalled(operation, import.meta.url);
    const make: Service["make"] = <const Input extends Options>(input: Input) =>
      Effect.gen(function*() {
        if (!hasExplicitWriteFalse(input)) return yield* Effect.fail(invalidOptions("make"));
        yield* admit(evidence, allowUntestedVersion);
        const native = yield* Effect.acquireRelease(
          Effect.tryPromise({
            try: () => esbuild.context(input as Options) as Promise<esbuild.BuildContext<Input>>,
            catch: acquireFailure,
          }),
          releaseNativeContext,
        );
        return wrapNativeContext(native);
      });
    return { make };
  });

export const make = <const Input extends Options>(
  input: Input,
): Effect.Effect<Context<Input>, ContextError, Esbuild | Scope.Scope> => Esbuild.use((service) => service.make(input));

export const layer = (
  options?: LayerOptions,
): Layer.Layer<
  Esbuild,
  IdentityIncomplete | ToolProbeFailed,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path
> => Layer.effect(Esbuild, makeService(options));
