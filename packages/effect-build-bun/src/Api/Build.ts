/// <reference types="bun-types" preserve="true" />
/// <reference path="../../src/Api/NativeTypes.d.ts" preserve="true" />

import type * as bun from "bun";
import { Context, Effect, Layer } from "effect";
import { InputInvalid } from "../Bun.js";
import { BunApiFailed, globalApi } from "../internal/ApiError.js";

export { BunApiFailed, BunApiUnavailable } from "../internal/ApiError.js";

export type BuildOptions = Omit<bun.BuildConfig, "outdir" | "compile"> & {
  readonly outdir?: never;
  readonly compile?: never;
};
export type BuildToDirectoryOptions = Omit<bun.BuildConfig, "compile"> & {
  readonly outdir: string;
  readonly compile?: never;
};
export type Output = bun.BuildOutput;

interface Service {
  readonly build: (input: BuildOptions) => Effect.Effect<Output, BunApiFailed | InputInvalid>;
  readonly buildToDirectory: (input: BuildToDirectoryOptions) => Effect.Effect<Output, BunApiFailed | InputInvalid>;
}
export class Build extends Context.Service<Build, Service>()("effect-build-bun/Api/Build") {}

export const build = (input: BuildOptions): Effect.Effect<Output, BunApiFailed | InputInvalid, Build> =>
  Build.use((service) => service.build(input));

/** Native directory output has Bun's own write behavior; use Bun.bundle for atomic output. */
export const buildToDirectory = (
  input: BuildToDirectoryOptions,
): Effect.Effect<Output, BunApiFailed | InputInvalid, Build> => Build.use((service) => service.buildToDirectory(input));

export const layer = Layer.effect(Build, Effect.map(globalApi("build"), (native) => {
  const invoke = (input: bun.BuildConfig) =>
    Effect.tryPromise({
      // Bun.build has no cancellation handle; interruption only stops awaiting it.
      try: () => native(input),
      catch: (cause) => new BunApiFailed({ operation: "build", cause }),
    });
  return {
    build: Effect.fn("Bun.Api.Build.build")(function*(input: BuildOptions) {
      if (input.outdir !== undefined || input.compile !== undefined) {
        return yield* new InputInvalid({ reason: "Use buildToDirectory for outdir or Bun.compile for an executable" });
      }
      return yield* invoke(input);
    }),
    buildToDirectory: Effect.fn("Bun.Api.Build.buildToDirectory")(function*(input: BuildToDirectoryOptions) {
      if (typeof input.outdir !== "string" || input.outdir.length === 0 || input.compile !== undefined) {
        return yield* new InputInvalid({ reason: "buildToDirectory requires outdir and does not accept compile" });
      }
      return yield* invoke(input);
    }),
  } satisfies Service;
}));
