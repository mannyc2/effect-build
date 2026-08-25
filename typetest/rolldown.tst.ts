import type { Effect, Scope, Stream } from "effect";
import type * as rolldown from "rolldown";
import * as Build from "../packages/effect-build-rolldown/src/Api/Build.js";
import * as Api from "../packages/effect-build-rolldown/src/Api/index.js";
import * as Watch from "../packages/effect-build-rolldown/src/Api/Watch.js";
import * as Command from "../packages/effect-build-rolldown/src/Command/index.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

// Every Rolldown row is conditional. The candidates are implemented and type-tested,
// but neither public lane promotes an operation before its complete gate closes.
export type _ApiIsEmpty = Assert<Same<keyof typeof Api, never>>;
export type _CommandIsEmpty = Assert<Same<keyof typeof Command, never>>;

declare const input: rolldown.InputOptions;
declare const output: rolldown.OutputOptions;

const made = Build.make(input);
export type _MakeCandidate = Assert<
  Same<typeof made, Effect.Effect<Build.Build, Build.RolldownFailed, Scope.Scope>>
>;

declare const build: Build.Build;
const scopedGenerate = Build.generateScoped(build, output);
const scopedWrite = Build.writeScoped(build, output);
export type _Generate = Assert<
  Same<typeof scopedGenerate, Effect.Effect<rolldown.RolldownOutput, Build.RolldownFailed>>
>;
export type _Write = Assert<
  Same<typeof scopedWrite, Effect.Effect<rolldown.RolldownOutput, Build.RolldownFailed>>
>;
export type _NoClose = Assert<Same<"close" extends keyof Build.Build ? true : false, false>>;

const oneShot = Build.generate(input, output);
export type _OneShot = Assert<
  Same<typeof oneShot, Effect.Effect<rolldown.RolldownOutput, Build.RolldownFailed>>
>;

declare const directOptions: Watch.DirectOptions;
const directEvents = Watch.direct(directOptions);
export type _DirectEvents = Assert<
  Same<typeof directEvents, Stream.Stream<Watch.DirectEvent, Watch.RolldownFailed>>
>;

declare const memoryOptions: Watch.MemoryOptions;
const memoryEvents = Watch.skipWrite(memoryOptions);
export type _MemoryEvents = Assert<
  Same<typeof memoryEvents, Stream.Stream<Watch.SkipWriteEvent, Watch.RolldownFailed>>
>;
export type _NoNativeResult = Assert<
  Same<Extract<Watch.DirectEvent, { code: "BUNDLE_END" }> extends { result: unknown } ? true : false, false>
>;
export type _OnlyCompleted = Assert<Same<Watch.DirectEvent["code"], "BUNDLE_END" | "ERROR">>;

declare const failure: Build.RolldownFailed;
export type _Diagnostics = Assert<Same<typeof failure.errors, readonly rolldown.RolldownError[]>>;
