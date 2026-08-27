import { Context, Crypto, Effect, FileSystem, Layer, Path } from "effect";
import type * as Artifact from "effect-build/Artifact";
import type { PublishFailed, ToolFailed, ToolNotFound } from "effect-build/BuildError";
import * as Toolchain from "effect-build/Toolchain";
import { ChildProcessSpawner } from "effect/unstable/process";

/** Where the bundle is meant to run; deno's own `--platform` values. */
export type Platform = "browser" | "deno";

export type Sourcemap = "linked" | "inline" | "external";

export interface BundleInput {
  readonly entrypoints: readonly [string, ...string[]];
  readonly outdir: string;
  readonly cwd?: string;
  /** Defaults to deno's own default, `deno`. */
  readonly platform?: Platform;
  readonly minify?: boolean;
  readonly codeSplitting?: boolean;
  readonly sourcemap?: Sourcemap;
  readonly external?: readonly string[];
}

export interface LayerOptions {
  /** Explicit deno executable; otherwise one deterministic PATH search. */
  readonly executable?: string;
}

export type BundleError = ToolFailed | PublishFailed;

interface Service {
  readonly bundle: (input: BundleInput) => Effect.Effect<Artifact.Bundle, BundleError>;
}

export class Bundler extends Context.Service<Bundler, Service>()(
  "effect-build-deno/Bundle/Bundler",
) {}

/** Deno releases with `deno bundle` exercised by this repository's CI; others proceed with a warning. */
const tested: Toolchain.TestedRange = { minimum: "2.4.0", before: "3.0.0" };

const renderArgv = (input: BundleInput, stagedDirectory: string): readonly string[] => [
  "bundle",
  "--outdir",
  stagedDirectory,
  ...(input.platform === undefined ? [] : ["--platform", input.platform]),
  ...(input.minify === true ? ["--minify"] : []),
  ...(input.codeSplitting === true ? ["--code-splitting"] : []),
  ...(input.sourcemap === undefined ? [] : [`--sourcemap=${input.sourcemap}`]),
  ...(input.external ?? []).flatMap((specifier) => ["--external", specifier]),
  ...input.entrypoints,
];

/** `deno --version` reports e.g. `deno 2.4.0 (stable, release, x86_64-unknown-linux-gnu)`. */
const parseDenoVersion = (stdout: string): string | undefined => /^deno (\S+)/.exec(stdout.trim())?.[1];

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
    const executable = yield* Toolchain.resolveExecutable({ name: "deno", executable: options?.executable });
    const version = yield* Toolchain.probeVersion({
      tool: "deno",
      executable,
      args: ["--version"],
      parse: parseDenoVersion,
    });
    yield* Toolchain.warnIfUntested({ tool: "deno", version, tested });
    const tool: Artifact.Tool = { name: "deno", version };
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
              tool: "deno",
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
