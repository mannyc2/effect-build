import { Effect, type Scope } from "effect";
import type { InputOptions, OutputOptions } from "rolldown";
import { DevEngine as NativeDevEngine, type DevOptions } from "rolldown/experimental";
import { Failed } from "./Error.js";

export type { DevOptions } from "rolldown/experimental";

export interface DevEngine {
  readonly run: Effect.Effect<void, Failed>;
  readonly ensureCurrentBuildFinish: Effect.Effect<void, Failed>;
  readonly ensureLatestBuildOutput: Effect.Effect<void, Failed>;
  readonly getBundleState: Effect.Effect<Awaited<ReturnType<NativeDevEngine["getBundleState"]>>, Failed>;
  readonly triggerFullBuild: Effect.Effect<void, Failed>;
  readonly registerClient: (clientId: string) => Effect.Effect<void, Failed>;
  readonly notifyPayloadDelivered: (filename: string) => Effect.Effect<void, Failed>;
  readonly removeClient: (clientId: string) => Effect.Effect<void, Failed>;
  readonly compileEntry: (
    moduleId: string,
    clientId: string,
  ) => Effect.Effect<Awaited<ReturnType<NativeDevEngine["compileEntry"]>>, Failed>;
}

const invoke = <A>(operation: string, run: () => Promise<A>): Effect.Effect<A, Failed> =>
  Effect.tryPromise({ try: run, catch: (cause) => new Failed({ operation, cause }) });

/** Native watch.skipWrite selects callback-only output; Scope owns the engine's close. */
export const make = (
  input: InputOptions,
  output?: OutputOptions,
  options: DevOptions = {},
): Effect.Effect<DevEngine, Failed, Scope.Scope> => Effect.gen(function*() {
  const native = yield* Effect.acquireRelease(
    invoke("dev.create", () => NativeDevEngine.create(input, output, options)),
    (native) => Effect.promise(() => native.close()),
  );
  return {
    run: invoke("dev.run", () => native.run()),
    ensureCurrentBuildFinish: invoke("dev.ensureCurrentBuildFinish", () => native.ensureCurrentBuildFinish()),
    ensureLatestBuildOutput: invoke("dev.ensureLatestBuildOutput", () => native.ensureLatestBuildOutput()),
    getBundleState: invoke("dev.getBundleState", () => native.getBundleState()),
    triggerFullBuild: Effect.try({ try: () => native.triggerFullBuild(), catch: (cause) => new Failed({ operation: "dev.triggerFullBuild", cause }) }),
    registerClient: (clientId) => invoke("dev.registerClient", () => native.registerClient(clientId)),
    notifyPayloadDelivered: (filename) => invoke("dev.notifyPayloadDelivered", () => native.notifyPayloadDelivered(filename)),
    removeClient: (clientId) => invoke("dev.removeClient", () => native.removeClient(clientId)),
    compileEntry: (moduleId, clientId) => invoke("dev.compileEntry", () => native.compileEntry(moduleId, clientId)),
  } satisfies DevEngine;
});
