/// <reference types="bun-types" preserve="true" />

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

export const layer = Layer.effect(Build, Effect.gen(function*() {
  const native = yield* globalApi("build");
  const invoke = (input: bun.BuildConfig) =>
    Effect.tryPromise({
      // Bun.build has no cancellation handle; interruption only stops awaiting it.
      try: () => native(input),
      catch: (cause) => new BunApiFailed({ operation: "build", cause }),
    });
  return {
    build: (input) => input.outdir !== undefined || input.compile !== undefined
      ? Effect.fail(new InputInvalid({ reason: "Use buildToDirectory for outdir or Bun.compile for an executable" }))
      : invoke(input),
    buildToDirectory: (input) => typeof input.outdir === "string" && input.outdir.length > 0 && input.compile === undefined
      ? invoke(input)
      : Effect.fail(new InputInvalid({ reason: "buildToDirectory requires outdir and does not accept compile" })),
  } satisfies Service;
}));
