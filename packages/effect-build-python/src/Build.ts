import { Context, Crypto, Effect, FileSystem, Layer, Option, Path, Schema } from "effect";
import type * as Artifact from "effect-build/Artifact";
import * as ArtifactSchema from "effect-build/Artifact";
import * as TreeAuthor from "effect-build/Author/Tree";
import { ChildProcessSpawner } from "effect/unstable/process";
import * as UvRuntime from "./internal/UvRuntime.js";
import {
  PythonBuildFailed,
  type UvCommandFailed,
  type UvOutputTruncated,
  type UvToolChanged,
  type UvToolUnavailable,
  type UvTransportFailed,
} from "./PythonBuildError.js";

export class BuildInput extends Schema.Class<BuildInput>("effect-build-python/BuildInput")({
  /** Finalized exact source snapshot containing pyproject.toml and uv.lock. */
  source: ArtifactSchema.HashedTreeSchema,
  /** Destination directory for the native wheel and sdist filenames. */
  outdir: Schema.NonEmptyString,
  cwd: Schema.optionalKey(Schema.NonEmptyString),
}) {}

export interface PythonArtifacts {
  readonly wheel: Artifact.HashedFile;
  readonly sdist: Artifact.HashedFile;
}

export interface LayerOptions {
  /** Explicit uv executable; otherwise one deterministic PATH search. */
  readonly executable?: string;
  /** Maximum retained bytes for each uv stdout/stderr stream. */
  readonly outputLimitBytes?: number;
}

export type BuildError =
  | TreeAuthor.TreeVerificationFailed
  | TreeAuthor.PublicationFailure
  | TreeAuthor.TreeFileProjectionFailed
  | UvToolChanged
  | UvTransportFailed
  | UvCommandFailed
  | UvOutputTruncated
  | PythonBuildFailed;

interface Service {
  readonly build: (input: BuildInput) => Effect.Effect<PythonArtifacts, BuildError>;
}

export class Builder extends Context.Service<Builder, Service>()(
  "effect-build-python/Build/Builder",
) {}

const describe = (error: unknown): string => error instanceof Error ? error.message : String(error);

export type LayerError = UvToolUnavailable | UvToolChanged | UvTransportFailed | UvCommandFailed | UvOutputTruncated;

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
    const runtime = yield* UvRuntime.make(options);
    const services = Context.make(FileSystem.FileSystem, fileSystem).pipe(
      Context.add(Path.Path, path),
      Context.add(Crypto.Crypto, crypto),
      Context.add(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

    const build = Effect.fn("effect-build-python.build")(function*(candidate: BuildInput) {
      const input = yield* Schema.decodeUnknownEffect(BuildInput, { onExcessProperty: "error" })(candidate).pipe(
        Effect.mapError((error) =>
          new PythonBuildFailed({
            source: typeof candidate?.source?.root === "string" ? candidate.source.root : "<invalid>",
            reason: `decode build input: ${String(error)}`,
          })
        ),
      );
      const cwd = path.normalize(path.resolve(input.cwd ?? ""));
      const outdir = path.normalize(path.resolve(cwd, input.outdir));
      const failWith = (reason: string) => new PythonBuildFailed({ source: input.source.root, reason });

      return yield* TreeAuthor.withVerifiedSnapshot(input.source, (source) =>
        Effect.scoped(
          Effect.gen(function*() {
            const required = [path.join(source, "pyproject.toml"), path.join(source, "uv.lock")] as const;
            for (const requiredPath of required) {
              const information = yield* fileSystem.stat(requiredPath).pipe(
                Effect.mapError((error) => failWith(`inspect ${requiredPath}: ${describe(error)}`)),
              );
              if (information.type !== "File") return yield* failWith(`${requiredPath} is not a file`);
            }

            const workspace = yield* fileSystem.makeTempDirectoryScoped({ prefix: "effect-build-python-" }).pipe(
              Effect.mapError((error) => failWith(`make staging directory: ${describe(error)}`)),
            );
            const produced = path.join(workspace, "dist");
            const cache = path.join(workspace, "cache");
            yield* fileSystem.makeDirectory(produced).pipe(
              Effect.mapError((error) => failWith(`make distribution staging directory: ${describe(error)}`)),
            );

            yield* runtime.run("lock", [
              "lock",
              "--check",
              "--directory",
              source,
              "--no-python-downloads",
              "--cache-dir",
              cache,
            ], cwd);
            yield* runtime.run("build", [
              "build",
              "--wheel",
              "--sdist",
              "--force-pep517",
              "--clear",
              "--no-create-gitignore",
              "--no-python-downloads",
              "--cache-dir",
              cache,
              "--out-dir",
              produced,
              source,
            ], cwd);

            const names = yield* fileSystem.readDirectory(produced).pipe(
              Effect.mapError((error) => failWith(`read uv outputs: ${describe(error)}`)),
            );
            const files: Array<{ readonly name: string; readonly contents: Uint8Array }> = [];
            for (const name of names) {
              const output = path.join(produced, name);
              if (Option.isSome(yield* Effect.option(fileSystem.readLink(output)))) {
                return yield* failWith(`uv output ${name} is a symbolic link`);
              }
              const information = yield* fileSystem.stat(output).pipe(
                Effect.mapError((error) => failWith(`inspect uv output ${name}: ${describe(error)}`)),
              );
              if (information.type !== "File") return yield* failWith(`uv output ${name} is not a regular file`);
              const contents = yield* fileSystem.readFile(output).pipe(
                Effect.mapError((error) => failWith(`read uv output ${name}: ${describe(error)}`)),
              );
              if (Option.isSome(yield* Effect.option(fileSystem.readLink(output)))) {
                return yield* failWith(`uv output ${name} became a symbolic link while captured`);
              }
              const confirmed = yield* fileSystem.stat(output).pipe(
                Effect.mapError((error) => failWith(`reinspect uv output ${name}: ${describe(error)}`)),
              );
              if (
                confirmed.type !== "File"
                || `${confirmed.size}` !== `${contents.byteLength}`
                || `${confirmed.mtime}` !== `${information.mtime}`
              ) {
                return yield* failWith(`uv output ${name} changed while captured`);
              }
              files.push({ name, contents });
            }

            const wheels = files.filter(({ name }) => name.endsWith(".whl"));
            const sdists = files.filter(({ name }) => name.endsWith(".tar.gz"));
            if (files.length !== 2 || wheels.length !== 1 || sdists.length !== 1) {
              return yield* failWith(
                `uv must produce exactly one wheel and one sdist; observed ${JSON.stringify(names.slice().sort())}`,
              );
            }

            const generation = yield* TreeAuthor.publish(
              { outdir, observation: "hashed", provenance: runtime.tool },
              (staging) =>
                Effect.forEach(files, ({ name, contents }) =>
                  fileSystem.writeFile(path.join(staging, name), contents).pipe(
                    Effect.mapError((error) => failWith(`stage uv output ${name}: ${describe(error)}`)),
                  ), { discard: true }),
            );
            const wheel = yield* TreeAuthor.projectFile(generation, wheels[0]!.name);
            const sdist = yield* TreeAuthor.projectFile(generation, sdists[0]!.name);
            return { wheel, sdist };
          }),
        ));
    });

    return { build: (input) => build(input).pipe(Effect.provide(services)) };
  });

export const build = (
  input: BuildInput,
): Effect.Effect<PythonArtifacts, BuildError, Builder> => Builder.use((service) => service.build(input));

export const layer = (
  options?: LayerOptions,
): Layer.Layer<
  Builder,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Builder, makeService(options));
