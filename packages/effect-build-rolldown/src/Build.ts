import { Context, Effect, Layer, type Scope } from "effect";
import * as Toolchain from "effect-build/Toolchain";
import * as rolldown from "rolldown";
import { RolldownFailed } from "./internal/error.js";

export { RolldownFailed } from "./internal/error.js";

/**
 * The scoped native state owner. `generate` and `write` are methods of this
 * one owner; native `close` stays hidden and is owned only by the Scope
 * finalizer, which runs even when neither method was ever called.
 */
export interface Build {
  /** Bundles in memory; rolldown's own `generate`. */
  readonly generate: (output?: rolldown.OutputOptions) => Effect.Effect<rolldown.RolldownOutput, RolldownFailed>;
  /** Bundles onto disk; rolldown's own `write`. */
  readonly write: (output?: rolldown.OutputOptions) => Effect.Effect<rolldown.RolldownOutput, RolldownFailed>;
}

interface Service {
  readonly make: (input: rolldown.InputOptions) => Effect.Effect<Build, RolldownFailed, Scope.Scope>;
}

export class Rolldown extends Context.Service<Rolldown, Service>()("effect-build-rolldown/Build/Rolldown") {}

/** Rolldown releases exercised by this repository's CI; others proceed with a warning. */
const tested: Toolchain.TestedRange = { minimum: "1.0.0", before: "2.0.0" };

const releaseNativeBuild = (native: rolldown.RolldownBuild): Effect.Effect<void> =>
  Effect.uninterruptible(Effect.promise(() => native.close().catch(() => undefined)));

const wrapNativeBuild = (native: rolldown.RolldownBuild): Build => ({
  generate: (output?: rolldown.OutputOptions) =>
    Effect.tryPromise({
      try: () => native.generate(output),
      catch: (error) => new RolldownFailed({ operation: "generate", cause: error }),
    }),
  write: (output?: rolldown.OutputOptions) =>
    Effect.tryPromise({
      try: () => native.write(output),
      catch: (error) => new RolldownFailed({ operation: "write", cause: error }),
    }),
});

const makeService: Effect.Effect<Service> = Effect.gen(function*() {
  yield* Toolchain.warnIfUntested({ tool: "rolldown", version: rolldown.VERSION, tested });
  const make = (input: rolldown.InputOptions) =>
    Effect.map(
      Effect.acquireRelease(
        Effect.tryPromise({
          try: () => rolldown.rolldown(input),
          catch: (error) => new RolldownFailed({ operation: "make", cause: error }),
        }),
        releaseNativeBuild,
      ),
      wrapNativeBuild,
    );
  return { make };
});

export const make = (
  input: rolldown.InputOptions,
): Effect.Effect<Build, RolldownFailed, Rolldown | Scope.Scope> => Rolldown.use((service) => service.make(input));

/** One-shot in-memory bundle: make, generate, close. */
export const generate = (
  input: rolldown.InputOptions,
  output?: rolldown.OutputOptions,
): Effect.Effect<rolldown.RolldownOutput, RolldownFailed, Rolldown> =>
  Effect.scoped(Effect.flatMap(make(input), (build) => build.generate(output)));

/** One-shot on-disk bundle: make, write, close. */
export const write = (
  input: rolldown.InputOptions,
  output?: rolldown.OutputOptions,
): Effect.Effect<rolldown.RolldownOutput, RolldownFailed, Rolldown> =>
  Effect.scoped(Effect.flatMap(make(input), (build) => build.write(output)));

export const layer: Layer.Layer<Rolldown> = Layer.effect(Rolldown, makeService);
