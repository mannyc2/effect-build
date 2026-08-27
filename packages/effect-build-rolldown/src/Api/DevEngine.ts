import { Effect, type Scope } from "effect";
import type * as rolldown from "rolldown";
import { DevEngine as NativeDevEngine, type DevOptions } from "rolldown/experimental";
import { RolldownFailed } from "../internal/error.js";

export type { DevOptions } from "rolldown/experimental";
export { RolldownFailed } from "../internal/error.js";

type MemoryOptions = Omit<DevOptions, "watch"> & {
  readonly watch: NonNullable<DevOptions["watch"]> & { readonly skipWrite: true };
};

type DirectOptions = Omit<DevOptions, "watch"> & {
  readonly watch?: NonNullable<DevOptions["watch"]> & { readonly skipWrite?: false };
};

export interface DevEngine {
  readonly run: Effect.Effect<void, RolldownFailed>;
  readonly ensureCurrentBuildFinish: Effect.Effect<void, RolldownFailed>;
  readonly ensureLatestBuildOutput: Effect.Effect<void, RolldownFailed>;
  readonly getBundleState: Effect.Effect<Awaited<ReturnType<NativeDevEngine["getBundleState"]>>, RolldownFailed>;
  readonly triggerFullBuild: Effect.Effect<void, RolldownFailed>;
  readonly registerClient: (clientId: string) => Effect.Effect<void, RolldownFailed>;
  readonly notifyPayloadDelivered: (filename: string) => Effect.Effect<void, RolldownFailed>;
  readonly removeClient: (clientId: string) => Effect.Effect<void, RolldownFailed>;
  readonly compileEntry: (
    moduleId: string,
    clientId: string,
  ) => Effect.Effect<Awaited<ReturnType<NativeDevEngine["compileEntry"]>>, RolldownFailed>;
}

const wrap = (native: NativeDevEngine, isAccepting: () => boolean): DevEngine => {
  const run = <A>(body: () => Promise<A>): Effect.Effect<A, RolldownFailed> =>
    Effect.tryPromise({
      try: () => {
        if (!isAccepting()) throw new Error("the scoped Rolldown DevEngine has already begun release");
        return body();
      },
      catch: (cause) => new RolldownFailed({ operation: "dev", cause }),
    });
  const sync = (body: () => void): Effect.Effect<void, RolldownFailed> =>
    Effect.try({
      try: () => {
        if (!isAccepting()) throw new Error("the scoped Rolldown DevEngine has already begun release");
        body();
      },
      catch: (cause) => new RolldownFailed({ operation: "dev", cause }),
    });
  return {
    run: run(() => native.run()),
    ensureCurrentBuildFinish: run(() => native.ensureCurrentBuildFinish()),
    ensureLatestBuildOutput: run(() => native.ensureLatestBuildOutput()),
    getBundleState: run(() => native.getBundleState()),
    triggerFullBuild: sync(() => native.triggerFullBuild()),
    registerClient: (clientId) => run(() => native.registerClient(clientId)),
    notifyPayloadDelivered: (filename) => run(() => native.notifyPayloadDelivered(filename)),
    removeClient: (clientId) => run(() => native.removeClient(clientId)),
    compileEntry: (moduleId, clientId) => run(() => native.compileEntry(moduleId, clientId)),
  };
};

const make = (
  input: rolldown.InputOptions,
  output: rolldown.OutputOptions | undefined,
  options: DevOptions,
): Effect.Effect<DevEngine, RolldownFailed, Scope.Scope> =>
  Effect.flatMap(
    Effect.tryPromise({
      try: () => NativeDevEngine.create(input, output, options),
      catch: (cause) => new RolldownFailed({ operation: "dev", cause }),
    }),
    (native) => {
      let accepting = true;
      const release = Effect.uninterruptible(
        Effect.suspend(() => {
          accepting = false;
          return Effect.promise(() => native.close());
        }),
      );
      return Effect.as(Effect.addFinalizer(() => release), wrap(native, () => accepting));
    },
  );

/** Callback/memory DevEngine; native durable writes are disabled explicitly. */
export const makeMemory = (
  input: rolldown.InputOptions,
  output: rolldown.OutputOptions | undefined,
  options: MemoryOptions,
): Effect.Effect<DevEngine, RolldownFailed, Scope.Scope> => make(input, output, options);

/** Provider-direct DevEngine; partial durable output remains native semantics. */
export const makeToDirectory = (
  input: rolldown.InputOptions,
  output?: rolldown.OutputOptions,
  options: DirectOptions = {},
): Effect.Effect<DevEngine, RolldownFailed, Scope.Scope> => make(input, output, options);
