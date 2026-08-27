import { Context, Crypto, Effect, FileSystem, Layer, Option, Path, Schema } from "effect";
import * as Artifact from "effect-build/Artifact";
import type { ArtifactVerificationFailed, PublishFailed, ToolFailed, ToolNotFound } from "effect-build/BuildError";
import * as Toolchain from "effect-build/Toolchain";
import { ChildProcessSpawner } from "effect/unstable/process";
import { PythonBuildFailed } from "./PythonBuildError.js";

export class BuildInput extends Schema.Class<BuildInput>("effect-build-python/BuildInput")({
  /** Finalized exact source snapshot containing pyproject.toml and the lock file. */
  source: Artifact.BundleSchema,
  /** Destination directory for the native wheel and sdist filenames. */
  outdir: Schema.NonEmptyString,
  cwd: Schema.optionalKey(Schema.NonEmptyString),
}) {}

export interface PythonArtifacts {
  readonly wheel: Artifact.FileArtifact;
  readonly sdist: Artifact.FileArtifact;
  readonly tool: Artifact.Tool;
}

export interface LayerOptions {
  /** Explicit uv executable; otherwise one deterministic PATH search. */
  readonly executable?: string;
}

export type BuildError = ArtifactVerificationFailed | ToolFailed | PublishFailed | PythonBuildFailed;

interface Service {
  readonly build: (input: BuildInput) => Effect.Effect<PythonArtifacts, BuildError>;
}

export class Builder extends Context.Service<Builder, Service>()(
  "effect-build-python/Build/Builder",
) {}

/** The exact uv minor line exercised by coordinated acceptance. */
const tested: Toolchain.TestedRange = { minimum: "0.12.0", before: "0.13.0" };

const describe = (error: unknown): string => error instanceof Error ? error.message : String(error);

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
    const executable = yield* Toolchain.resolveExecutable({ name: "uv", executable: options?.executable });
    const version = yield* Toolchain.probeVersion({
      tool: "uv",
      executable,
      args: ["--version"],
      parse: (stdout) => /^uv\s+(\S+)/.exec(stdout.trim())?.[1],
    });
    yield* Toolchain.warnIfUntested({ tool: "uv", version, tested });
    const tool: Artifact.Tool = { name: "uv", version };
    const services = Context.make(FileSystem.FileSystem, fileSystem).pipe(
      Context.add(Path.Path, path),
      Context.add(Crypto.Crypto, crypto),
      Context.add(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

    const build = Effect.fn("effect-build-python.build")(function*(candidate: BuildInput) {
      const input = yield* Schema.decodeUnknownEffect(BuildInput, { onExcessProperty: "error" })(candidate).pipe(
        Effect.mapError((error) =>
          new PythonBuildFailed({
            source: typeof candidate?.source?.outdir === "string" ? candidate.source.outdir : "<invalid>",
            reason: `decode build input: ${String(error)}`,
          })
        ),
      );
      const cwd = path.normalize(path.resolve(input.cwd ?? ""));
      const outdir = path.normalize(path.resolve(cwd, input.outdir));
      const failWith = (reason: string) => new PythonBuildFailed({ source: input.source.outdir, reason });

      return yield* Effect.scoped(
        Effect.gen(function*() {
          const source = yield* Toolchain.materializeVerifiedBundle(input.source).pipe(Effect.provide(services));
          const required = [path.join(source, "pyproject.toml"), path.join(source, "uv.lock")] as const;
          for (const requiredPath of required) {
            const information = yield* fileSystem.stat(requiredPath).pipe(
              Effect.mapError((error) => failWith(`inspect ${requiredPath}: ${describe(error)}`)),
            );
            if (information.type !== "File") {
              return yield* Effect.fail(failWith(`${requiredPath} is not a file`));
            }
          }
          const workspace = yield* fileSystem.makeTempDirectoryScoped({ prefix: "effect-build-python-" }).pipe(
            Effect.mapError((error) => failWith(`make staging directory: ${describe(error)}`)),
          );
          const produced = path.join(workspace, "dist");
          const cache = path.join(workspace, "cache");
          yield* fileSystem.makeDirectory(produced).pipe(
            Effect.mapError((error) => failWith(`make distribution staging directory: ${describe(error)}`)),
          );
          yield* Toolchain.runOrFail({
            tool: "uv",
            executable,
            args: [
              "lock",
              "--check",
              "--directory",
              source,
              "--no-python-downloads",
              "--cache-dir",
              cache,
            ],
            cwd,
          }).pipe(Effect.provide(services));
          yield* Toolchain.runOrFail({
            tool: "uv",
            executable,
            args: [
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
            ],
            cwd,
          }).pipe(Effect.provide(services));
          const names = yield* fileSystem.readDirectory(produced).pipe(
            Effect.mapError((error) => failWith(`read uv outputs: ${describe(error)}`)),
          );
          const files: Array<{ readonly name: string; readonly contents: Uint8Array }> = [];
          for (const name of names) {
            const output = path.join(produced, name);
            if (Option.isSome(yield* Effect.option(fileSystem.readLink(output)))) {
              return yield* Effect.fail(failWith(`uv output ${name} is a symbolic link`));
            }
            const information = yield* fileSystem.stat(output).pipe(
              Effect.mapError((error) => failWith(`inspect uv output ${name}: ${describe(error)}`)),
            );
            if (information.type !== "File") {
              return yield* Effect.fail(failWith(`uv output ${name} is not a regular file`));
            }
            const contents = yield* fileSystem.readFile(output).pipe(
              Effect.mapError((error) => failWith(`read uv output ${name}: ${describe(error)}`)),
            );
            if (Option.isSome(yield* Effect.option(fileSystem.readLink(output)))) {
              return yield* Effect.fail(failWith(`uv output ${name} became a symbolic link while captured`));
            }
            const confirmed = yield* fileSystem.stat(output).pipe(
              Effect.mapError((error) => failWith(`reinspect uv output ${name}: ${describe(error)}`)),
            );
            if (confirmed.type !== "File" || Number(confirmed.size) !== contents.byteLength) {
              return yield* Effect.fail(failWith(`uv output ${name} changed while captured`));
            }
            files.push({ name, contents });
          }
          const wheels = files.map(({ name }) => name).filter((name) => name.endsWith(".whl"));
          const sdists = files.map(({ name }) => name).filter((name) => name.endsWith(".tar.gz"));
          if (files.length !== 2 || wheels.length !== 1 || sdists.length !== 1) {
            return yield* Effect.fail(
              failWith(
                `uv must produce exactly one wheel and one sdist; observed ${
                  JSON.stringify(files.map(({ name }) => name).sort())
                }`,
              ),
            );
          }
          const bundle = yield* Toolchain.publishBundle({
            tool,
            outdir,
            produce: (staging) =>
              Effect.forEach(files, ({ name, contents }) =>
                fileSystem.writeFile(path.join(staging, name), contents).pipe(
                  Effect.mapError((error) => failWith(`stage uv output ${name}: ${describe(error)}`)),
                )).pipe(Effect.asVoid),
          }).pipe(Effect.provide(services));
          const finalized = bundle.entries.filter((entry) => entry._tag === "File");
          const project = (name: string): Effect.Effect<Artifact.FileArtifact, PythonBuildFailed> => {
            const entry = finalized.find((candidate) => path.basename(candidate.path) === name);
            return entry === undefined
              ? Effect.fail(failWith(`atomic Python bundle omitted ${name}`))
              : Effect.succeed({
                _tag: "File",
                path: entry.path,
                bytes: entry.bytes,
                tool,
                sha256: entry.sha256,
              });
          };
          const wheel = yield* project(wheels[0] ?? "");
          const sdist = yield* project(sdists[0] ?? "");
          return { wheel, sdist, tool };
        }),
      );
    });

    return { build };
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
