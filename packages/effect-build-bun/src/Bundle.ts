import { Context, Crypto, Effect, FileSystem, Layer, Path } from "effect";
import type * as Artifact from "effect-build/Artifact";
import type { PublishFailed, ToolFailed, ToolNotFound } from "effect-build/BuildError";
import * as Toolchain from "effect-build/Toolchain";
import { ChildProcessSpawner } from "effect/unstable/process";

/** The intended execution environment of the bundle; bun's own `--target` values. */
export type Target = "browser" | "bun" | "node";

export type Format = "esm" | "cjs" | "iife";

export type Sourcemap = "linked" | "inline" | "external" | "none";

export interface BundleInput {
  readonly entrypoints: readonly [string, ...string[]];
  readonly outdir: string;
  readonly cwd?: string;
  /** Defaults to bun's own default, `browser`. */
  readonly target?: Target;
  readonly format?: Format;
  readonly minify?: boolean;
  readonly sourcemap?: Sourcemap;
  readonly splitting?: boolean;
  /** Bundle dependencies or keep them external; bun's own `--packages` values. */
  readonly packages?: "bundle" | "external";
  readonly external?: readonly string[];
}

export interface LayerOptions {
  /** Explicit bun executable; otherwise one deterministic PATH search. */
  readonly executable?: string;
}

export type BundleError = ToolFailed | PublishFailed;

interface Service {
  readonly bundle: (input: BundleInput) => Effect.Effect<Artifact.Bundle, BundleError>;
}

export class Bundler extends Context.Service<Bundler, Service>()(
  "effect-build-bun/Bundle/Bundler",
) {}

/** Bun releases exercised by this repository's CI; others proceed with a warning. */
const tested: Toolchain.TestedRange = { minimum: "1.2.0", before: "2.0.0" };

const renderArgv = (input: BundleInput, stagedDirectory: string): readonly string[] => [
  "build",
  `--outdir=${stagedDirectory}`,
  ...(input.target === undefined ? [] : [`--target=${input.target}`]),
  ...(input.format === undefined ? [] : [`--format=${input.format}`]),
  ...(input.minify === true ? ["--minify"] : []),
  ...(input.sourcemap === undefined ? [] : [`--sourcemap=${input.sourcemap}`]),
  ...(input.splitting === true ? ["--splitting"] : []),
  ...(input.packages === undefined ? [] : [`--packages=${input.packages}`]),
  ...(input.external ?? []).map((specifier) => `--external=${specifier}`),
  ...input.entrypoints,
];

type LayerError = ToolNotFound | ToolFailed;

const makeService = (
  options?: LayerOptions,
): Effect.Effect<
  Service,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const executable = yield* Toolchain.resolveExecutable({ name: "bun", executable: options?.executable });
    const version = yield* Toolchain.probeVersion({ tool: "bun", executable, args: ["--version"] });
    yield* Toolchain.warnIfUntested({ tool: "bun", version, tested });
    const tool: Artifact.Tool = { name: "bun", version };
    const services = Context.make(FileSystem.FileSystem, fileSystem).pipe(
      Context.add(Path.Path, path),
      Context.add(Crypto.Crypto, crypto),
      Context.add(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

    const bundle = (input: BundleInput): Effect.Effect<Artifact.Bundle, BundleError> =>
      Toolchain.publishBundle({
        tool,
        outdir: input.outdir,
        cwd: input.cwd,
        produce: (stagedDirectory) =>
          Effect.asVoid(
            Toolchain.runOrFail({
              tool: "bun",
              executable,
              args: renderArgv(input, stagedDirectory),
              cwd: input.cwd,
            }),
          ),
      }).pipe(Effect.provide(services));

    return { bundle };
  });

export const bundle = (
  input: BundleInput,
): Effect.Effect<Artifact.Bundle, BundleError, Bundler> => Bundler.use((service) => service.bundle(input));

export const layer = (
  options?: LayerOptions,
): Layer.Layer<
  Bundler,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Bundler, makeService(options));
