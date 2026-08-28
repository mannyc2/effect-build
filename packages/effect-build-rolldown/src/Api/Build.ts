import { Effect, type Scope } from "effect";
import type * as rolldown from "rolldown";
import * as BuildOwner from "../internal/BuildOwner.js";
import type { RolldownFailed } from "../internal/error.js";

export { RolldownFailed } from "../internal/error.js";

export type Build = BuildOwner.Owner;

/** Acquire one reusable build whose admission, drain, and close are Scope-owned. */
export const make = (
  input: rolldown.InputOptions,
): Effect.Effect<Build, RolldownFailed, Scope.Scope> => BuildOwner.make(input);

/** Generate from one previously acquired reusable build. */
export const generateScoped = (
  build: Build,
  output?: rolldown.OutputOptions,
): Effect.Effect<rolldown.RolldownOutput, RolldownFailed> => build.generate(output);

/** Write from one previously acquired reusable build. */
export const writeScoped = (
  build: Build,
  output?: rolldown.OutputOptions,
): Effect.Effect<rolldown.RolldownOutput, RolldownFailed> => build.write(output);

/** One-shot native in-memory build: acquire, generate, drain, close. */
export const generate = (
  input: rolldown.InputOptions,
  output?: rolldown.OutputOptions,
): Effect.Effect<rolldown.RolldownOutput, RolldownFailed> =>
  Effect.scoped(Effect.flatMap(make(input), (build) => build.generate(output)));

/** One-shot native provider-direct build: acquire, write, drain, close. */
export const write = (
  input: rolldown.InputOptions,
  output?: rolldown.OutputOptions,
): Effect.Effect<rolldown.RolldownOutput, RolldownFailed> =>
  Effect.scoped(Effect.flatMap(make(input), (build) => build.write(output)));
