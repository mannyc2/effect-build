import { Effect, type Scope } from "effect";
import * as esbuild from "esbuild";
import { EsbuildFailed } from "./error.js";

/** The one state owner shared by the memory and provider-direct context projections. */
export interface Owner<Input extends esbuild.BuildOptions = esbuild.BuildOptions> {
  readonly rebuild: Effect.Effect<esbuild.BuildResult<Input>, EsbuildFailed>;
  readonly watch: (options?: esbuild.WatchOptions) => Effect.Effect<void, EsbuildFailed>;
  readonly serve: (options?: esbuild.ServeOptions) => Effect.Effect<esbuild.ServeResult, EsbuildFailed>;
  readonly cancel: Effect.Effect<void, EsbuildFailed>;
}

const release = (native: esbuild.BuildContext): Effect.Effect<void> =>
  Effect.uninterruptible(
    Effect.promise(() => native.cancel()).pipe(
      Effect.ensuring(Effect.promise(() => native.dispose())),
    ),
  );

const wrap = <Input extends esbuild.BuildOptions>(native: esbuild.BuildContext<Input>): Owner<Input> => ({
  rebuild: Effect.tryPromise({
    try: () => native.rebuild(),
    catch: (cause) => new EsbuildFailed({ operation: "rebuild", cause }),
  }),
  watch: (options) =>
    Effect.tryPromise({
      try: () => native.watch(options),
      catch: (cause) => new EsbuildFailed({ operation: "watch", cause }),
    }),
  serve: (options) =>
    Effect.tryPromise({
      try: () => native.serve(options),
      catch: (cause) => new EsbuildFailed({ operation: "serve", cause }),
    }),
  cancel: Effect.tryPromise({
    try: () => native.cancel(),
    catch: (cause) => new EsbuildFailed({ operation: "cancel", cause }),
  }),
});

export interface Acquired<Input extends esbuild.BuildOptions = esbuild.BuildOptions> {
  readonly owner: Owner<Input>;
  readonly release: Effect.Effect<void>;
}

/** Package-private acquisition for composite scoped owners. */
export const open = <const Input extends esbuild.BuildOptions>(
  input: Input,
): Effect.Effect<Acquired<Input>, EsbuildFailed> =>
  Effect.map(
    Effect.tryPromise({
      try: () => esbuild.context(input as esbuild.BuildOptions) as Promise<esbuild.BuildContext<Input>>,
      catch: (cause) => new EsbuildFailed({ operation: "make", cause }),
    }),
    (native) => ({ owner: wrap(native), release: release(native) }),
  );

export const make = <const Input extends esbuild.BuildOptions>(
  input: Input,
): Effect.Effect<Owner<Input>, EsbuildFailed, Scope.Scope> =>
  Effect.map(
    Effect.acquireRelease(
      open(input),
      ({ release }) => release,
    ),
    ({ owner }) => owner,
  );
