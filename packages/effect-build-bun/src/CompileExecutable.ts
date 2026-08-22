import { Context as EffectContext, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";
import type * as CoreArtifact from "effect-build/Artifact";
import type * as CoreExecutable from "effect-build/Author/Executable";
import type * as CoreMatrix from "effect-build/Matrix";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import {
  type IdentityIncomplete,
  type InvalidDriverOptions,
  invalidDriverOptions,
  type LaunchRefusal,
  type PreflightRefusal,
  type TargetUnsupported,
  targetUnsupported,
  type ToolFailed,
  toolFailed,
  type ToolNotFound,
  type ToolProbeFailed,
} from "./internal/v04/compatibility.js";
import { publishExecutable } from "./internal/v04/executable.js";
import { runMatrix } from "./internal/v04/matrix.js";
import { type AdmissionRequest, selectTool } from "./internal/v04/selected.js";

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

export interface Options {
  readonly minify?: boolean;
  readonly sourcemap?: "linked" | "inline";
  readonly bytecode?: boolean;
}

export interface LayerOptions {
  readonly executable?: CoreArtifact.AbsolutePath;
  readonly allowUntestedVersion?: boolean;
}

export interface CompileExecutableInput<Mode extends CoreArtifact.ObservationMode = CoreArtifact.ObservationMode> {
  readonly entrypoint: string;
  readonly outfile: string;
  readonly cwd?: string;
  readonly target?: Target;
  readonly observation: Mode;
  readonly options?: Options;
}

export type CompileExecutableMatrixInput<Mode extends CoreArtifact.ObservationMode = CoreArtifact.ObservationMode> =
  CoreMatrix.Input<CompileExecutableInput<Mode>>;

export type Artifact<Mode extends CoreArtifact.ObservationMode = CoreArtifact.ObservationMode> =
  & CoreArtifact.Executable<Mode>
  & {
    readonly provider: "bun";
    readonly runtime: { readonly name: "bun"; readonly version: string };
    readonly target: Target;
  };

export type MatrixReport<Mode extends CoreArtifact.ObservationMode = CoreArtifact.ObservationMode> = CoreMatrix.Report<
  Artifact<Mode>,
  CompileExecutableError,
  "bun"
>;

export type CompileExecutableError =
  | InvalidDriverOptions
  | ToolFailed
  | TargetUnsupported
  | CoreExecutable.Failure<never>
  | PreflightRefusal
  | LaunchRefusal;

type LayerError = ToolNotFound | ToolProbeFailed | IdentityIncomplete;

interface Service {
  readonly compileExecutable: <Mode extends CoreArtifact.ObservationMode>(
    input: CompileExecutableInput<Mode>,
  ) => Effect.Effect<Artifact<Mode>, CompileExecutableError>;
  readonly compileExecutableMatrix: <Mode extends CoreArtifact.ObservationMode>(
    input: CompileExecutableMatrixInput<Mode>,
  ) => Effect.Effect<MatrixReport<Mode>, CoreMatrix.InvalidInput>;
}

export class Compiler extends EffectContext.Service<Compiler, Service>()(
  "effect-build-bun/CompileExecutable/Compiler",
) {}

interface PreparedInput<Mode extends CoreArtifact.ObservationMode> {
  readonly entrypoint: string;
  readonly outfile: string;
  readonly cwd?: string;
  readonly target?: Target;
  readonly admissionTarget: Target;
  readonly observation: Mode;
  readonly options: Options;
}

const scalarFields = new Set(["entrypoint", "outfile", "cwd", "target", "observation", "options"]);
const optionFields = new Set(["minify", "sourcemap", "bytecode"]);
const availableTargets = Target.literals;

const pathInput = (value: unknown, field: "entrypoint" | "outfile" | "cwd", optional = false): string | undefined => {
  if (optional && value === undefined) return undefined;
  if (typeof value !== "string" || (!optional && value.length === 0) || value.includes("\0")) {
    throw invalidDriverOptions(`${field} must be ${optional ? "a string" : "a non-empty string"} without NUL`);
  }
  return value;
};

const validateOptions = (value: unknown): Options => {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidDriverOptions("options must be a non-null object");
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (Reflect.ownKeys(record).some((key) => typeof key !== "string" || !optionFields.has(key))) {
    throw invalidDriverOptions("options must not contain unknown fields");
  }
  if (record.minify !== undefined && typeof record.minify !== "boolean") {
    throw invalidDriverOptions("options.minify must be boolean");
  }
  if (record.bytecode !== undefined && typeof record.bytecode !== "boolean") {
    throw invalidDriverOptions("options.bytecode must be boolean");
  }
  if (record.sourcemap !== undefined && record.sourcemap !== "linked" && record.sourcemap !== "inline") {
    throw invalidDriverOptions("options.sourcemap must be linked or inline");
  }
  return {
    ...(record.minify === undefined ? {} : { minify: record.minify as boolean }),
    ...(record.sourcemap === undefined ? {} : { sourcemap: record.sourcemap as "linked" | "inline" }),
    ...(record.bytecode === undefined ? {} : { bytecode: record.bytecode as boolean }),
  };
};

const prepareInput = <Mode extends CoreArtifact.ObservationMode>(raw: unknown): PreparedInput<Mode> => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw invalidDriverOptions("input must be a non-null object");
  }
  const record = raw as Readonly<Record<string, unknown>>;
  if (Reflect.ownKeys(record).some((key) => typeof key !== "string" || !scalarFields.has(key))) {
    throw invalidDriverOptions("input must not contain unknown fields");
  }
  const entrypoint = pathInput(record.entrypoint, "entrypoint")!;
  const outfile = pathInput(record.outfile, "outfile")!;
  const cwd = pathInput(record.cwd, "cwd", true);
  if (record.observation !== "hashed" && record.observation !== "unhashed") {
    throw invalidDriverOptions("observation must be hashed or unhashed");
  }
  let target: Target | undefined;
  if (record.target !== undefined) {
    if (typeof record.target !== "string" || !(availableTargets as readonly string[]).includes(record.target)) {
      throw targetUnsupported(
        typeof record.target === "string" ? record.target : `<non-string:${typeof record.target}>`,
        availableTargets,
      );
    }
    target = record.target as Target;
  }
  return {
    entrypoint,
    outfile,
    ...(cwd === undefined ? {} : { cwd }),
    ...(target === undefined ? {} : { target }),
    admissionTarget: target ?? "linux-x64-gnu",
    observation: record.observation as Mode,
    options: validateOptions(record.options),
  };
};

const targetArg = (target: Target): string => {
  switch (target) {
    case "macos-x64":
      return "bun-darwin-x64";
    case "macos-aarch64":
      return "bun-darwin-arm64";
    case "linux-x64-gnu":
      return "bun-linux-x64";
    case "linux-x64-musl":
      return "bun-linux-x64-musl";
    case "linux-aarch64-gnu":
      return "bun-linux-arm64";
    case "windows-x64":
      return "bun-windows-x64";
  }
};

const renderArgv = (input: PreparedInput<CoreArtifact.ObservationMode>, stagedPath: string): readonly string[] => [
  "build",
  "--compile",
  ...(input.target === undefined ? [] : [`--target=${targetArg(input.target)}`]),
  ...(input.options.minify === true ? ["--minify"] : []),
  ...(input.options.sourcemap === undefined ? [] : [`--sourcemap=${input.options.sourcemap}`]),
  ...(input.options.bytecode === true ? ["--bytecode"] : []),
  `--outfile=${stagedPath}`,
  input.entrypoint,
];

const decodeLayerOptions = (raw: LayerOptions | undefined):
  & Required<Pick<LayerOptions, "allowUntestedVersion">>
  & Pick<LayerOptions, "executable"> =>
{
  if (raw === undefined) return { allowUntestedVersion: false };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("layer-options-must-be-a-non-null-object");
  }
  if (Reflect.ownKeys(raw).some((key) => key !== "executable" && key !== "allowUntestedVersion")) {
    throw new Error("layer-options-must-not-contain-unknown-fields");
  }
  if (raw.allowUntestedVersion !== undefined && typeof raw.allowUntestedVersion !== "boolean") {
    throw new Error("allowUntestedVersion-must-be-boolean");
  }
  if (
    raw.executable !== undefined
    && (typeof raw.executable !== "string" || raw.executable.length === 0 || raw.executable.includes("\0"))
  ) {
    throw new Error("executable-must-be-a-non-empty-string-without-NUL");
  }
  return {
    ...(raw.executable === undefined ? {} : { executable: raw.executable }),
    allowUntestedVersion: raw.allowUntestedVersion === true,
  };
};

const makeService = (
  rawOptions?: LayerOptions,
): Effect.Effect<
  Service,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const options = yield* Effect.try({
      try: () => decodeLayerOptions(rawOptions),
      catch: (error) => ({
        _tag: "ToolProbeFailed" as const,
        tool: "bun" as const,
        operation: {
          providerPackage: "effect-build-bun" as const,
          lane: "selected-command" as const,
          operation: "compile-executable" as const,
        },
        owner: "effect-build-bun" as const,
        phase: "layer-acquisition" as const,
        reason: error instanceof Error ? error.message : "invalid-layer-options",
      }),
    });
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;
    const selected = yield* selectTool(options, import.meta.url);

    const compileScalar = <Mode extends CoreArtifact.ObservationMode>(
      rawInput: CompileExecutableInput<Mode>,
    ): Effect.Effect<Artifact<Mode>, CompileExecutableError> =>
      Effect.gen(function*() {
        const input = yield* Effect.try({
          try: () => prepareInput<Mode>(rawInput),
          catch: (error) => error as InvalidDriverOptions | TargetUnsupported,
        });
        const admissionRequest: AdmissionRequest = {
          target: input.admissionTarget,
          allowUntestedVersion: options.allowUntestedVersion,
        };
        const admission = yield* selected.definition.evaluate(admissionRequest);
        if (admission._tag === "UntestedOverride") {
          yield* Effect.logWarning(
            `${admission.warningCode}: effect-build-bun compile-executable proceeds on unreviewed coordinates`,
          );
        }
        const published = yield* publishExecutable({
          outfile: input.outfile,
          ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
          observation: input.observation,
          runtimeVersion: selected.evidence.version,
          ...(input.target === undefined ? {} : { requestedTarget: input.target }),
          produce: (stagedPath) =>
            Effect.gen(function*() {
              const completion = yield* selected.execute(renderArgv(input, stagedPath), input.cwd);
              if (completion.exitCode !== 0) {
                return yield* Effect.fail(toolFailed(completion.exitCode, completion.stdout, completion.stderr));
              }
            }),
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(Path.Path, path),
          Effect.provideService(Crypto.Crypto, crypto),
        );
        return { ...published, provider: "bun" } as unknown as Artifact<Mode>;
      });

    const compileMatrix = <Mode extends CoreArtifact.ObservationMode>(
      input: CompileExecutableMatrixInput<Mode>,
    ): Effect.Effect<MatrixReport<Mode>, CoreMatrix.InvalidInput> =>
      runMatrix(input, compileScalar) as Effect.Effect<MatrixReport<Mode>, CoreMatrix.InvalidInput>;

    return { compileExecutable: compileScalar, compileExecutableMatrix: compileMatrix };
  });

export const compileExecutable = <Mode extends CoreArtifact.ObservationMode>(
  input: CompileExecutableInput<Mode>,
): Effect.Effect<Artifact<Mode>, CompileExecutableError, Compiler> =>
  Compiler.use((service) => service.compileExecutable(input));

export const compileExecutableMatrix = <Mode extends CoreArtifact.ObservationMode>(
  input: CompileExecutableMatrixInput<Mode>,
): Effect.Effect<MatrixReport<Mode>, CoreMatrix.InvalidInput, Compiler> =>
  Compiler.use((service) => service.compileExecutableMatrix(input));

export const layer = (
  options?: LayerOptions,
): Layer.Layer<
  Compiler,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner
> => Layer.effect(Compiler, makeService(options));
