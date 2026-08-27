/// <reference types="bun-types" preserve="true" />

import type * as bun from "bun";
import { Context, Effect, Layer } from "effect";
import { BunApiFailed, BunApiUnavailable, BunBuildModeInvalid } from "../internal/ApiError.js";

export { BunApiFailed, BunApiUnavailable, BunBuildModeInvalid } from "../internal/ApiError.js";

type NativeConfig = bun.BuildConfig;

/** Exact Bun 1.3.14 host compile request, including HTML/full-stack modes. */
export type Options = Omit<NativeConfig, "outdir" | "compile"> & {
  readonly outdir?: never;
  readonly compile: Exclude<NativeConfig["compile"], false | undefined>;
};

export type Output = bun.BuildOutput;
export type Artifact = bun.BuildArtifact;

interface BunHost {
  readonly version: string;
  readonly build: (options: NativeConfig) => Promise<Output>;
}

interface Service {
  readonly compileExecutableDirect: <const Input extends Options>(
    input: Input,
  ) => Effect.Effect<Output, BunApiFailed | BunBuildModeInvalid>;
}

export class CompileExecutable extends Context.Service<CompileExecutable, Service>()(
  "effect-build-bun/Api/CompileExecutable/CompileExecutable",
) {}

const exactVersion = "1.3.14";

const globalHost = (): Effect.Effect<BunHost, BunApiUnavailable> =>
  Effect.gen(function*() {
    const value = Reflect.get(globalThis, "Bun") as unknown;
    if (typeof value !== "object" || value === null) {
      return yield* new BunApiUnavailable({
        capability: "Bun.build compile",
        expectedVersion: exactVersion,
        reason: "globalThis.Bun is absent",
      });
    }
    const version = Reflect.get(value, "version");
    const build = Reflect.get(value, "build");
    if (version !== exactVersion || typeof build !== "function") {
      return yield* new BunApiUnavailable({
        capability: "Bun.build compile",
        expectedVersion: exactVersion,
        ...(typeof version === "string" ? { observedVersion: version } : {}),
        reason: typeof build !== "function" ? "Bun.build is absent" : "host version is not the pinned contract",
      });
    }
    return { version, build: build.bind(value) as BunHost["build"] };
  });

const layerFromHost = (host: BunHost): Layer.Layer<CompileExecutable> =>
  Layer.succeed(CompileExecutable, {
    compileExecutableDirect: (input) => {
      const compile = Reflect.get(input, "compile") as unknown;
      return compile === undefined || compile === false || input.outdir !== undefined
        ? Effect.fail(
          new BunBuildModeInvalid({
            mode: "compileExecutableDirect",
            reason: "compile must select native host compilation and outdir must be absent",
          }),
        )
        : Effect.tryPromise({
          // Bun.build exposes no cancellation handle. Interruption only stops awaiting.
          try: () => host.build(input),
          catch: (cause) => new BunApiFailed({ operation: "compileExecutableDirect", cause }),
        });
    },
  });

/** Provider-direct publication; failure/interruption can leave executable or cache remnants. */
export const compileExecutableDirect = <const Input extends Options>(
  input: Input,
): Effect.Effect<Output, BunApiFailed | BunBuildModeInvalid, CompileExecutable> =>
  CompileExecutable.use((service) => service.compileExecutableDirect(input));

export const layer: Layer.Layer<CompileExecutable, BunApiUnavailable> = Layer.unwrap(
  Effect.map(globalHost(), layerFromHost),
);
