import { Context, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";
import type * as Artifact from "effect-build/Artifact";
import type * as Tool from "effect-build/Author/Tool";
import * as Toolchain from "effect-build/Author/Tool";
import type {
  ArtifactInvalid,
  PublishFailed,
  SelectedToolChanged,
  ToolFailed,
  ToolNotFound,
} from "effect-build/BuildError";
import { UnsupportedTarget } from "effect-build/BuildError";
import { ChildProcessSpawner } from "effect/unstable/process";

export const Target = Schema.Literals(
  [
    "macos-x64",
    "macos-aarch64",
    "linux-x64-gnu",
    "linux-x64-musl",
    "linux-aarch64-gnu",
    "windows-x64",
  ] as const,
);
export type Target = typeof Target.Type;

export interface CompileExecutableInput {
  readonly entrypoint: string;
  readonly outfile: string;
  readonly cwd?: string;
  /** Required; the orchestrator host never mints target identity. */
  readonly target: Target;
  readonly minify?: boolean;
  readonly sourcemap?: "linked" | "inline";
  readonly bytecode?: boolean;
}

export interface LayerOptions {
  /** Explicit bun executable; otherwise one deterministic PATH search. */
  readonly executable?: string;
}

export type CompileExecutableError =
  | ToolFailed
  | UnsupportedTarget
  | PublishFailed
  | ArtifactInvalid
  | SelectedToolChanged;

interface Service {
  readonly compileExecutable: (
    input: CompileExecutableInput,
  ) => Effect.Effect<Artifact.Executable, CompileExecutableError>;
}

export class Compiler extends Context.Service<Compiler, Service>()(
  "effect-build-bun/CompileExecutable/Compiler",
) {}

/** Bun releases exercised by this repository's CI; others proceed with a warning. */
const tested: Toolchain.TestedRange = { minimum: "1.2.0", before: "2.0.0" };

const targetArg: Record<Target, string> = {
  "macos-x64": "bun-darwin-x64",
  "macos-aarch64": "bun-darwin-arm64",
  "linux-x64-gnu": "bun-linux-x64",
  "linux-x64-musl": "bun-linux-x64-musl",
  "linux-aarch64-gnu": "bun-linux-arm64",
  "windows-x64": "bun-windows-x64",
};

const renderArgv = (input: CompileExecutableInput, stagedPath: string): readonly string[] => [
  "build",
  "--compile",
  `--target=${targetArg[input.target]}`,
  ...(input.minify === true ? ["--minify"] : []),
  ...(input.sourcemap === undefined ? [] : [`--sourcemap=${input.sourcemap}`]),
  ...(input.bytecode === true ? ["--bytecode"] : []),
  `--outfile=${stagedPath}`,
  input.entrypoint,
];

const supported = (value: string): value is Target => (Target.literals as readonly string[]).includes(value);

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

    const compileExecutable = (
      input: CompileExecutableInput,
    ): Effect.Effect<Artifact.Executable, CompileExecutableError> =>
      Effect.gen(function*() {
        const requested = input.target;
        if (!supported(requested)) {
          return yield* Effect.fail(
            new UnsupportedTarget({
              tool: "bun",
              requested: String(requested),
              available: Target.literals,
            }),
          );
        }
        return yield* Toolchain.publishExecutable({
          tool,
          outfile: input.outfile,
          cwd: input.cwd,
          target: requested,
          produce: (stagedPath) =>
            Effect.asVoid(
              Toolchain.runOrFailSelected({
                selected: tool,
                args: renderArgv(input, stagedPath),
                cwd: input.cwd,
              }),
            ),
        });
      }).pipe(Effect.provide(services));

    return { compileExecutable };
  });

export const compileExecutable = (
  input: CompileExecutableInput,
): Effect.Effect<Artifact.Executable, CompileExecutableError, Compiler> =>
  Compiler.use((service) => service.compileExecutable(input));

export const layer = (
  options?: LayerOptions,
): Layer.Layer<
  Compiler,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Compiler, makeService(options));
