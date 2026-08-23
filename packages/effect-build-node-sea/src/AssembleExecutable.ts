import { Context, Crypto, Effect, FileSystem, Layer, Path } from "effect";
import type * as Artifact from "effect-build/Artifact";
import type { ToolNotFound } from "effect-build/BuildError";
import { PublishFailed, ToolFailed, UnsupportedTarget } from "effect-build/BuildError";
import * as CoreTarget from "effect-build/Target";
import * as Toolchain from "effect-build/Toolchain";
import { ChildProcessSpawner } from "effect/unstable/process";

export type MainFormat = "commonjs" | "module";

export type Main =
  | { readonly _tag: "File"; readonly path: string; readonly format: MainFormat }
  | { readonly _tag: "Bytes"; readonly contents: Uint8Array; readonly format: MainFormat };

export interface AssembleExecutableInput {
  readonly main: Main;
  readonly outfile: string;
  readonly cwd?: string;
  /** Record a SHA-256 digest on the artifact (default true). */
  readonly hash?: boolean;
  /** Embedded assets by key; each value is a file path resolved against cwd. */
  readonly assets?: Readonly<Record<string, string>>;
  readonly disableExperimentalSEAWarning?: boolean;
}

export interface LayerOptions {
  /** Node executable that runs `--check` and `--build-sea`; otherwise one PATH search for `node`. */
  readonly builderExecutable?: string;
  /** Node executable injected as the artifact base; defaults to the builder. */
  readonly baseExecutable?: string;
}

export type AssembleExecutableError = ToolFailed | UnsupportedTarget | PublishFailed;

interface Service {
  readonly assembleExecutable: (
    input: AssembleExecutableInput,
  ) => Effect.Effect<Artifact.Executable, AssembleExecutableError>;
}

export class Assembler extends Context.Service<Assembler, Service>()(
  "effect-build-node-sea/AssembleExecutable/Assembler",
) {}

/** Node releases whose direct `--build-sea` assembly is exercised by CI; others proceed with a warning. */
const tested: Toolchain.TestedRange = { minimum: "26.7.0", before: "27.0.0" };

const parseNodeVersion = (stdout: string): string | undefined => stdout.trim().split("\n")[0]?.trim().replace(/^v/, "");

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
    const builder = yield* Toolchain.resolveExecutable({ name: "node", executable: options?.builderExecutable });
    const base = options?.baseExecutable === undefined
      ? builder
      : yield* Toolchain.resolveExecutable({ name: "node", executable: options.baseExecutable });
    const version = yield* Toolchain.probeVersion({
      tool: "node",
      executable: builder,
      args: ["--version"],
      parse: parseNodeVersion,
    });
    yield* Toolchain.warnIfUntested({ tool: "node", version, tested });
    const tool: Artifact.Tool = { name: "node", version };
    const services = Context.make(FileSystem.FileSystem, fileSystem).pipe(
      Context.add(Path.Path, path),
      Context.add(Crypto.Crypto, crypto),
      Context.add(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

    const produce = (
      input: AssembleExecutableInput,
      cwd: string,
      stagedPath: string,
    ): Effect.Effect<void, ToolFailed | PublishFailed, ChildProcessSpawner.ChildProcessSpawner> =>
      Effect.gen(function*() {
        const failWith = (reason: string) => new PublishFailed({ destination: stagedPath, reason });
        const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));
        const inputs = path.join(path.dirname(stagedPath), "inputs");
        yield* fileSystem.makeDirectory(inputs, { recursive: true }).pipe(
          Effect.mapError((error) => failWith(`make inputs directory: ${describe(error)}`)),
        );
        let main: string;
        if (input.main._tag === "File") {
          main = path.normalize(path.resolve(cwd, input.main.path));
        } else {
          main = path.join(inputs, input.main.format === "module" ? "main.mjs" : "main.cjs");
          yield* fileSystem.writeFile(main, input.main.contents).pipe(
            Effect.mapError((error) => failWith(`write main: ${describe(error)}`)),
          );
        }
        const check = yield* Toolchain.run({ tool: "node", executable: builder, args: ["--check", main], cwd });
        if (check.exitCode !== 0) {
          return yield* Effect.fail(
            new ToolFailed({
              tool: "node",
              exitCode: check.exitCode,
              stdout: check.stdout.text,
              stderr: check.stderr.text,
            }),
          );
        }
        const assets = Object.fromEntries(
          Object.entries(input.assets ?? {}).map(([key, asset]) => [key, path.normalize(path.resolve(cwd, asset))]),
        );
        const config = {
          main,
          mainFormat: input.main.format,
          executable: base,
          output: stagedPath,
          useSnapshot: false,
          useCodeCache: false,
          ...(Object.keys(assets).length === 0 ? {} : { assets }),
          ...(input.disableExperimentalSEAWarning === true ? { disableExperimentalSEAWarning: true } : {}),
        };
        const configPath = path.join(inputs, "sea-config.json");
        yield* fileSystem.writeFileString(configPath, JSON.stringify(config)).pipe(
          Effect.mapError((error) => failWith(`write sea-config: ${describe(error)}`)),
        );
        yield* Effect.asVoid(
          Toolchain.runOrFail({ tool: "node", executable: builder, args: ["--build-sea", configPath], cwd }),
        );
      });

    const assembleExecutable = (
      input: AssembleExecutableInput,
    ): Effect.Effect<Artifact.Executable, AssembleExecutableError> =>
      Effect.gen(function*() {
        const target = CoreTarget.host();
        if (target === undefined) {
          return yield* Effect.fail(
            new UnsupportedTarget({ tool: "node", requested: "<undetermined host>", available: [] }),
          );
        }
        const cwd = path.normalize(path.resolve(input.cwd ?? ""));
        return yield* Toolchain.publishExecutable({
          tool,
          outfile: input.outfile,
          cwd,
          target,
          hash: input.hash ?? true,
          produce: (stagedPath) => produce(input, cwd, stagedPath),
        });
      }).pipe(Effect.provide(services));

    return { assembleExecutable };
  });

export const assembleExecutable = (
  input: AssembleExecutableInput,
): Effect.Effect<Artifact.Executable, AssembleExecutableError, Assembler> =>
  Assembler.use((service) => service.assembleExecutable(input));

export const layer = (
  options?: LayerOptions,
): Layer.Layer<
  Assembler,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Assembler, makeService(options));
