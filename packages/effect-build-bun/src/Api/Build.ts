/// <reference types="bun-types" preserve="true" />

import type * as bun from "bun";
import { Context, Effect, Layer } from "effect";
import { BunApiFailed, BunApiUnavailable, BunBuildModeInvalid } from "../internal/ApiError.js";

export { BunApiFailed, BunApiUnavailable, BunBuildModeInvalid } from "../internal/ApiError.js";

type NativeConfig = bun.BuildConfig;

/** Bun.build with no Bun-directed durable output mode. */
export type BuildOptions = Omit<NativeConfig, "outdir" | "compile"> & {
  readonly outdir?: never;
  readonly compile?: never;
};

/** Bun.build with a provider-direct output directory. */
export type BuildToDirectoryOptions = Omit<NativeConfig, "compile"> & {
  readonly outdir: string;
  readonly compile?: never;
};

export type Output = bun.BuildOutput;
export type Artifact = bun.BuildArtifact;

interface BunHost {
  readonly version: string;
  readonly build: (options: NativeConfig) => Promise<Output>;
}

interface Service {
  readonly build: <const Input extends BuildOptions>(
    input: Input,
  ) => Effect.Effect<Output, BunApiFailed | BunBuildModeInvalid>;
  readonly buildToDirectory: <const Input extends BuildToDirectoryOptions>(
    input: Input,
  ) => Effect.Effect<Output, BunApiFailed | BunBuildModeInvalid>;
}

export class Build extends Context.Service<Build, Service>()("effect-build-bun/Api/Build/Build") {}

const exactVersion = "1.3.14";

const globalHost = (): Effect.Effect<BunHost, BunApiUnavailable> =>
  Effect.gen(function*() {
    const value = Reflect.get(globalThis, "Bun") as unknown;
    if (typeof value !== "object" || value === null) {
      return yield* new BunApiUnavailable({
        capability: "Bun.build",
        expectedVersion: exactVersion,
        reason: "globalThis.Bun is absent",
      });
    }
    const version = Reflect.get(value, "version");
    const build = Reflect.get(value, "build");
    if (typeof version !== "string" || version !== exactVersion || typeof build !== "function") {
      return yield* new BunApiUnavailable({
        capability: "Bun.build",
        expectedVersion: exactVersion,
        ...(typeof version === "string" ? { observedVersion: version } : {}),
        reason: typeof build !== "function" ? "Bun.build is absent" : "host version is not the pinned contract",
      });
    }
    return { version, build: build.bind(value) as BunHost["build"] };
  });

const layerFromHost = (host: BunHost): Layer.Layer<Build> => {
  const invoke = (input: NativeConfig): Effect.Effect<Output, BunApiFailed> =>
    Effect.tryPromise({
      // Bun.build has no AbortSignal/cancel handle. Interruption only stops awaiting.
      try: () => host.build(input),
      catch: (cause) => new BunApiFailed({ operation: "build", cause }),
    });
  return Layer.succeed(Build, {
    build: (input) =>
      input.outdir !== undefined || (input.compile !== undefined && input.compile !== false)
        ? Effect.fail(
          new BunBuildModeInvalid({
            mode: "memory",
            reason: "outdir and compile are distinct provider-direct durable operations",
          }),
        )
        : invoke(input),
    buildToDirectory: (input) =>
      typeof input.outdir === "string" && input.outdir.length > 0
        && (input.compile === undefined || input.compile === false)
        ? invoke(input)
        : Effect.fail(
          new BunBuildModeInvalid({
            mode: "direct",
            reason: "outdir must select provider-direct directory publication and compile must be absent",
          }),
        ),
  });
};

export const build = <const Input extends BuildOptions>(
  input: Input,
): Effect.Effect<Output, BunApiFailed | BunBuildModeInvalid, Build> => Build.use((service) => service.build(input));

/**
 * Provider-direct durable publication. Failure/interruption may leave partial
 * files or cache mutations; this operation does not claim rollback or atomicity.
 */
export const buildToDirectory = <const Input extends BuildToDirectoryOptions>(
  input: Input,
): Effect.Effect<Output, BunApiFailed | BunBuildModeInvalid, Build> =>
  Build.use((service) => service.buildToDirectory(input));

export const layer: Layer.Layer<Build, BunApiUnavailable> = Layer.unwrap(
  Effect.map(globalHost(), layerFromHost),
);
