import type { Effect, Scope } from "effect";
import * as Api from "../packages/effect-build-esbuild/src/Api/index.js";
import * as Command from "../packages/effect-build-esbuild/src/Command/index.js";
import * as Watch from "../packages/effect-build-esbuild/src/Command/Watch.js";
import * as Runtime from "../packages/effect-build-esbuild/src/internal/Runtime.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

const watched = Watch.watch({
  entrypoints: ["src/main.ts"],
  output: { _tag: "Outdir", path: "dist" },
  platform: "browser",
});

export type _Watch = Assert<
  Same<
    typeof watched,
    Effect.Effect<
      Watch.Watch,
      Runtime.ProcessError | Runtime.EsbuildCommandInputInvalid,
      Runtime.Runtime | Scope.Scope
    >
  >
>;

declare const handle: Watch.Watch;
export type _ProviderDirect = Assert<Same<typeof handle.publication, "provider-direct-durable">>;

// Watch is a selected-command operation. The in-process lane exposes watch only on scoped Context owners.
export type _NoStandaloneApiWatch = Assert<Same<"Watch" extends keyof typeof Api ? true : false, false>>;
export type _CommandWatch = Assert<Same<"Watch" extends keyof typeof Command ? true : false, true>>;

// @ts-expect-error! an explicit non-empty output is mandatory.
Watch.watch({ entrypoints: ["src/main.ts"] });
// @ts-expect-error! at least one entrypoint is required.
Watch.watch({ entrypoints: [], output: { _tag: "Outdir", path: "dist" } });
