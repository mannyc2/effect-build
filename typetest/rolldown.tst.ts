import type { Effect, Layer, Scope, Stream } from "effect";
import type * as rolldown from "rolldown";
import * as Build from "../packages/effect-build-rolldown/src/Build.js";
import * as Watch from "../packages/effect-build-rolldown/src/Watch.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

declare const input: rolldown.InputOptions;
declare const output: rolldown.OutputOptions;

const made = Build.make(input);
export type _Make = Assert<
  Same<typeof made, Effect.Effect<Build.Build, Build.RolldownFailed, Build.Rolldown | Scope.Scope>>
>;

declare const build: Build.Build;
export type _Generate = Assert<
  Same<ReturnType<typeof build.generate>, Effect.Effect<rolldown.RolldownOutput, Build.RolldownFailed>>
>;

// Native close is not part of the scoped handle.
export type _NoClose = Assert<Same<"close" extends keyof Build.Build ? true : false, false>>;

const oneShot = Build.generate(input, output);
export type _OneShot = Assert<
  Same<typeof oneShot, Effect.Effect<rolldown.RolldownOutput, Build.RolldownFailed, Build.Rolldown>>
>;

export type _Layer = Assert<Same<typeof Build.layer, Layer.Layer<Build.Rolldown>>>;

declare const watchOptions: rolldown.WatchOptions;
const events = Watch.events(watchOptions);

// Watcher events are sanitized values with no native result handle to close.
export type _Events = Assert<
  Same<typeof events, Stream.Stream<Watch.Event, Watch.RolldownFailed>>
>;
export type _NoResult = Assert<
  Same<Extract<Watch.Event, { code: "BUNDLE_END" }> extends { result: unknown } ? true : false, false>
>;
export type _OnlyCompleted = Assert<Same<Watch.Event["code"], "BUNDLE_END" | "ERROR">>;
export type _Superseded = Assert<Same<Watch.Event["superseded"], number>>;

declare const failure: Build.RolldownFailed;
export type _Diagnostics = Assert<Same<typeof failure.errors, readonly rolldown.RolldownError[]>>;
