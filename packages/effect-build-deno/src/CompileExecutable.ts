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
    "linux-aarch64-gnu",
    "windows-x64",
    "windows-aarch64",
  ] as const,
);
export type Target = typeof Target.Type;

export type PermissionValue = true | readonly string[];

export type Permissions =
  | { readonly all: true }
  | {
    readonly all?: false;
    readonly read?: PermissionValue;
    readonly write?: PermissionValue;
    readonly net?: PermissionValue;
    readonly env?: PermissionValue;
    readonly run?: PermissionValue;
    readonly ffi?: PermissionValue;
    readonly sys?: PermissionValue;
    readonly import?: PermissionValue;
  };

interface BaseInput {
  readonly entrypoint: string;
  readonly outfile: string;
  readonly cwd?: string;
  /** Required; the orchestrator host never mints target identity. */
  readonly target: Target;
  readonly permissions?: Permissions;
}

/** `minify` requires `bundle`; the union keeps that constraint in the types. */
export type CompileExecutableInput =
  & BaseInput
  & ({ readonly bundle?: false; readonly minify?: never } | { readonly bundle: true; readonly minify?: boolean });

export interface LayerOptions {
  /** Explicit deno executable; otherwise one deterministic PATH search. */
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
  "effect-build-deno/CompileExecutable/Compiler",
) {}

/** Deno releases exercised by this repository's CI; others proceed with a warning. */
const tested: Toolchain.TestedRange = { minimum: "2.0.0", before: "3.0.0" };

const nativeTarget: Record<Target, string> = {
  "macos-x64": "x86_64-apple-darwin",
  "macos-aarch64": "aarch64-apple-darwin",
  "linux-x64-gnu": "x86_64-unknown-linux-gnu",
  "linux-aarch64-gnu": "aarch64-unknown-linux-gnu",
  "windows-x64": "x86_64-pc-windows-msvc",
  "windows-aarch64": "aarch64-pc-windows-msvc",
};

const permissionNames = ["read", "write", "net", "env", "run", "ffi", "sys", "import"] as const;

const permissionArguments = (permissions: Permissions | undefined): readonly string[] => {
  if (permissions === undefined) return [];
  if (permissions.all === true) return ["--allow-all"];
  return permissionNames.flatMap((name) => {
    const value = permissions[name];
    if (value === undefined) return [];
    return [value === true ? `--allow-${name}` : `--allow-${name}=${value.join(",")}`];
  });
};

const renderArgv = (input: CompileExecutableInput, stagedPath: string): readonly string[] => [
  "compile",
  "--target",
  nativeTarget[input.target],
  ...(input.bundle === true ? ["--bundle"] : []),
  ...(input.bundle === true && input.minify === true ? ["--minify"] : []),
  ...permissionArguments(input.permissions),
  "--output",
  stagedPath,
  input.entrypoint,
];

/** `deno --version` reports e.g. `deno 2.1.4 (stable, release, x86_64-unknown-linux-gnu)`. */
const parseDenoVersion = (stdout: string): string | undefined => /^deno (\S+)/.exec(stdout.trim())?.[1];

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

    const compileExecutable = (
      input: CompileExecutableInput,
    ): Effect.Effect<Artifact.Executable, CompileExecutableError> =>
      Effect.gen(function*() {
        const requested = input.target;
        if (!supported(requested)) {
          return yield* Effect.fail(
            new UnsupportedTarget({
              tool: "deno",
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
