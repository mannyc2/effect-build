import type { Crypto, Effect, FileSystem, Layer, Path } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import * as Bundle from "../packages/effect-build-deno/src/Bundle.js";
import type * as BuildError from "../packages/effect-build/src/BuildError.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type LayerError<L> = L extends Layer.Layer<infer _A, infer E, infer _R> ? E : never;
type LayerServices<L> = L extends Layer.Layer<infer _A, infer _E, infer R> ? R : never;

export type _Platform = Assert<Same<Bundle.Platform, "browser" | "deno">>;

export type _Error = Assert<
  Same<Bundle.DirectWriteError, BuildError.ToolFailed | BuildError.ArtifactInvalid | BuildError.SelectedToolChanged>
>;

const bundled = Bundle.directWrite({ entrypoints: ["src/main.ts"], outdir: "dist", platform: "browser" });

export type _Bundle = Assert<
  Same<typeof bundled, Effect.Effect<Bundle.Bundle, Bundle.DirectWriteError, Bundle.Bundler>>
>;

// Entrypoints are a non-empty tuple; an empty list is unrepresentable.
// @ts-expect-error!
Bundle.directWrite({ entrypoints: [], outdir: "dist" });

const built = Bundle.layer();

export type _LayerError = Assert<
  Same<
    LayerError<typeof built>,
    BuildError.ToolNotFound | BuildError.ToolFailed | BuildError.ArtifactInvalid | BuildError.SelectedToolChanged
  >
>;
export type _LayerServices = Assert<
  Same<
    LayerServices<typeof built>,
    Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner
  >
>;
