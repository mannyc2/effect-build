import { Context, Crypto, Effect, FileSystem, Layer, Path } from "effect";
import type { Digest } from "effect-build/Artifact";
import type * as Tool from "effect-build/Author/Tool";
import * as Toolchain from "effect-build/Author/Tool";
import * as TreeSnapshot from "effect-build/Author/TreeSnapshot";
import { ArtifactInvalid, type SelectedToolChanged, type ToolFailed, type ToolNotFound } from "effect-build/BuildError";
import { ChildProcessSpawner } from "effect/unstable/process";

/** The intended execution environment of the bundle; bun's own `--target` values. */
export type Target = "browser" | "bun" | "node";

export type Format = "esm" | "cjs" | "iife";

export type Sourcemap = "linked" | "inline" | "external" | "none";

export interface DirectWriteInput {
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

export interface BundleFile {
  readonly path: string;
  readonly relativePath: string;
  readonly bytes: number;
  readonly digest: Digest;
}

/** Truthful provider-native outcome: the caller destination may be partially changed on failure. */
export interface Bundle {
  readonly _tag: "DirectWriteOutcome";
  readonly outdir: string;
  readonly files: readonly BundleFile[];
  readonly tool: Tool.SelectedTool;
}

export type DirectWriteError = ToolFailed | ArtifactInvalid | SelectedToolChanged;

interface Service {
  readonly directWrite: (input: DirectWriteInput) => Effect.Effect<Bundle, DirectWriteError>;
}

export class Bundler extends Context.Service<Bundler, Service>()(
  "effect-build-bun/Bundle/Bundler",
) {}

/** Bun releases exercised by this repository's CI; others proceed with a warning. */
const tested: Toolchain.TestedRange = { minimum: "1.2.0", before: "2.0.0" };

const renderArgv = (input: DirectWriteInput, outdir: string): readonly string[] => [
  "build",
  `--outdir=${outdir}`,
  ...(input.target === undefined ? [] : [`--target=${input.target}`]),
  ...(input.format === undefined ? [] : [`--format=${input.format}`]),
  ...(input.minify === true ? ["--minify"] : []),
  ...(input.sourcemap === undefined ? [] : [`--sourcemap=${input.sourcemap}`]),
  ...(input.splitting === true ? ["--splitting"] : []),
  ...(input.packages === undefined ? [] : [`--packages=${input.packages}`]),
  ...(input.external ?? []).map((specifier) => `--external=${specifier}`),
  ...input.entrypoints,
];

type LayerError = ToolNotFound | ToolFailed | ArtifactInvalid | SelectedToolChanged;

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
    const tool: Tool.SelectedTool = yield* Toolchain.select({
      name: "bun",
      executable: options?.executable,
      versionArgs: ["--version"],
    });
    yield* Toolchain.warnIfUntested({ tool: "bun", version: tool.version, tested });
    const services = Context.make(FileSystem.FileSystem, fileSystem).pipe(
      Context.add(Path.Path, path),
      Context.add(Crypto.Crypto, crypto),
      Context.add(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

    const directWrite = (input: DirectWriteInput): Effect.Effect<Bundle, DirectWriteError> =>
      Effect.gen(function*() {
        const outdir = path.normalize(path.resolve(input.cwd ?? "", input.outdir));
        yield* fileSystem.makeDirectory(outdir, { recursive: true }).pipe(
          Effect.mapError(() =>
            new ArtifactInvalid({
              path: outdir,
              reason: "unable to create provider-owned output directory",
            })
          ),
        );
        yield* Toolchain.runOrFailSelected({
          selected: tool,
          args: renderArgv(input, outdir),
          cwd: input.cwd,
        });
        const snapshot = yield* TreeSnapshot.observe(outdir);
        return {
          _tag: "DirectWriteOutcome" as const,
          outdir: snapshot.root,
          files: snapshot.files.map(({ path, relativePath, bytes, digest }) => ({ path, relativePath, bytes, digest })),
          tool,
        };
      }).pipe(Effect.provide(services));

    return { directWrite };
  });

export const directWrite = (
  input: DirectWriteInput,
): Effect.Effect<Bundle, DirectWriteError, Bundler> => Bundler.use((service) => service.directWrite(input));

export const layer = (
  options?: LayerOptions,
): Layer.Layer<
  Bundler,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Bundler, makeService(options));
