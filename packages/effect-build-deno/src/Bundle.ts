import { Context, Crypto, Effect, FileSystem, Layer, Path } from "effect";
import type { Digest } from "effect-build/Artifact";
import type * as Tool from "effect-build/Author/Tool";
import * as Toolchain from "effect-build/Author/Tool";
import * as TreeSnapshot from "effect-build/Author/TreeSnapshot";
import { ArtifactInvalid, type SelectedToolChanged, type ToolFailed, type ToolNotFound } from "effect-build/BuildError";
import { ChildProcessSpawner } from "effect/unstable/process";

/** Where the bundle is meant to run; deno's own `--platform` values. */
export type Platform = "browser" | "deno";

export type Sourcemap = "linked" | "inline" | "external";

export interface DirectWriteInput {
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
  "effect-build-deno/Bundle/Bundler",
) {}

/** Deno releases with `deno bundle` exercised by this repository's CI; others proceed with a warning. */
const tested: Toolchain.TestedRange = { minimum: "2.4.0", before: "3.0.0" };

const renderArgv = (input: DirectWriteInput, outdir: string): readonly string[] => [
  "bundle",
  "--outdir",
  outdir,
  ...(input.platform === undefined ? [] : ["--platform", input.platform]),
  ...(input.minify === true ? ["--minify"] : []),
  ...(input.codeSplitting === true ? ["--code-splitting"] : []),
  ...(input.sourcemap === undefined ? [] : [`--sourcemap=${input.sourcemap}`]),
  ...(input.external ?? []).flatMap((specifier) => ["--external", specifier]),
  ...input.entrypoints,
];

/** `deno --version` reports e.g. `deno 2.4.0 (stable, release, x86_64-unknown-linux-gnu)`. */
const parseDenoVersion = (stdout: string): string | undefined => /^deno (\S+)/.exec(stdout.trim())?.[1];

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
      name: "deno",
      executable: options?.executable,
      versionArgs: ["--version"],
      parseVersion: parseDenoVersion,
    });
    yield* Toolchain.warnIfUntested({ tool: "deno", version: tool.version, tested });
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
