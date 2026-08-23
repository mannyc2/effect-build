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
} from "./internal/compatibility.js";
import { publishExecutable } from "./internal/executable.js";
import { runMatrix } from "./internal/matrix.js";
import { type AdmissionRequest, selectTool } from "./internal/selected.js";

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

export type Options =
  | {
    readonly bundle?: false;
    readonly minify?: never;
    readonly permissions?: Permissions;
  }
  | {
    readonly bundle: true;
    readonly minify?: boolean;
    readonly permissions?: Permissions;
  };

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
    readonly provider: "deno";
    readonly runtime: { readonly name: "deno"; readonly version: string };
    readonly target: Target;
  };

export type MatrixReport<Mode extends CoreArtifact.ObservationMode = CoreArtifact.ObservationMode> = CoreMatrix.Report<
  Artifact<Mode>,
  CompileExecutableError,
  "deno"
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
  "effect-build-deno/CompileExecutable/Compiler",
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
const optionFields = new Set(["bundle", "minify", "permissions"]);
const permissionFields = new Set(["all", "read", "write", "net", "env", "run", "ffi", "sys", "import"]);
const permissionNames = ["read", "write", "net", "env", "run", "ffi", "sys", "import"] as const;
const availableTargets = Target.literals;

const pathInput = (value: unknown, field: "entrypoint" | "outfile" | "cwd", optional = false): string | undefined => {
  if (optional && value === undefined) return undefined;
  if (typeof value !== "string" || (!optional && value.length === 0) || value.includes("\0")) {
    throw invalidDriverOptions(field + " must be " + (optional ? "a string" : "a non-empty string") + " without NUL");
  }
  return value;
};

const permissionValue = (value: unknown, name: string): PermissionValue => {
  if (value === true) return true;
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string")) {
    throw invalidDriverOptions("options.permissions." + name + " must be true or a non-empty string array");
  }
  return Object.freeze([...value] as string[]);
};

const renderPermission = (name: string, value: PermissionValue): string =>
  value === true ? "--allow-" + name : "--allow-" + name + "=" + value.join(",");

const validatePermissions = (value: unknown): Permissions | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidDriverOptions("options.permissions must be a non-null object");
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (Reflect.ownKeys(record).some((key) => typeof key !== "string" || !permissionFields.has(key))) {
    throw invalidDriverOptions("options.permissions must not contain unknown fields");
  }
  if (record.all === true) {
    if (Reflect.ownKeys(record).length !== 1) {
      throw invalidDriverOptions("options.permissions.all cannot be mixed with scoped permissions");
    }
    return { all: true };
  }
  if (record.all !== undefined && record.all !== false) {
    throw invalidDriverOptions("options.permissions.all must be boolean");
  }
  const values: {
    all?: false;
    read?: PermissionValue;
    write?: PermissionValue;
    net?: PermissionValue;
    env?: PermissionValue;
    run?: PermissionValue;
    ffi?: PermissionValue;
    sys?: PermissionValue;
    import?: PermissionValue;
  } = {};
  if (record.all === false) values.all = false;
  for (const name of permissionNames) {
    const raw = record[name];
    if (raw === undefined) continue;
    values[name] = permissionValue(raw, name);
  }
  return Object.freeze(values) as Permissions;
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
  if (record.bundle !== undefined && typeof record.bundle !== "boolean") {
    throw invalidDriverOptions("options.bundle must be boolean");
  }
  if (record.minify !== undefined && typeof record.minify !== "boolean") {
    throw invalidDriverOptions("options.minify must be boolean");
  }
  if (record.minify !== undefined && record.bundle !== true) {
    throw invalidDriverOptions("options.minify requires options.bundle to be true");
  }
  const permissions = validatePermissions(record.permissions);
  if (record.bundle === true) {
    return Object.freeze({
      bundle: true,
      ...(record.minify === undefined ? {} : { minify: record.minify as boolean }),
      ...(permissions === undefined ? {} : { permissions }),
    }) as Options;
  }
  return Object.freeze({
    ...(record.bundle === false ? { bundle: false as const } : {}),
    ...(permissions === undefined ? {} : { permissions }),
  }) as Options;
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
        typeof record.target === "string" ? record.target : "<non-string:" + typeof record.target + ">",
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

const nativeTarget = (target: Target): string => {
  switch (target) {
    case "macos-x64":
      return "x86_64-apple-darwin";
    case "macos-aarch64":
      return "aarch64-apple-darwin";
    case "linux-x64-gnu":
      return "x86_64-unknown-linux-gnu";
    case "linux-aarch64-gnu":
      return "aarch64-unknown-linux-gnu";
    case "windows-x64":
      return "x86_64-pc-windows-msvc";
    case "windows-aarch64":
      return "aarch64-pc-windows-msvc";
  }
};

const permissionArguments = (permissions: Permissions | undefined): readonly string[] => {
  if (permissions === undefined) return [];
  if (permissions.all === true) return ["--allow-all"];
  return permissionNames.flatMap((name) => {
    const value = permissions[name];
    return value === undefined ? [] : [renderPermission(name, value)];
  });
};

const renderArgv = (input: PreparedInput<CoreArtifact.ObservationMode>, stagedPath: string): readonly string[] => [
  "compile",
  ...(input.target === undefined ? [] : ["--target", nativeTarget(input.target)]),
  ...(input.options.bundle === true ? ["--bundle"] : []),
  ...(input.options.bundle === true && input.options.minify === true ? ["--minify"] : []),
  ...permissionArguments(input.options.permissions),
  "--output",
  stagedPath,
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
        tool: "deno" as const,
        operation: {
          providerPackage: "effect-build-deno" as const,
          lane: "selected-command" as const,
          operation: "compile-executable" as const,
        },
        owner: "effect-build-deno" as const,
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
        const preflight = yield* selected.preflight(admissionRequest);
        if (preflight.admission._tag === "UntestedOverride") {
          yield* Effect.logWarning(
            "EFFECT_BUILD_UNTESTED_VERSION: effect-build-deno compile-executable proceeds on unreviewed coordinates",
          );
        }
        const published = yield* publishExecutable({
          outfile: input.outfile,
          ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
          observation: input.observation,
          runtimeVersion: selected.evidence.version,
          ...(input.target === undefined ? {} : { requestedTarget: input.target }),
          beforeMutation: () =>
            Effect.gen(function*() {
              yield* selected.reauthenticateCommand();
              yield* selected.reauthenticateRuntime(preflight.binding);
            }),
          produce: (stagedPath) =>
            Effect.gen(function*() {
              const completion = yield* selected.execute(renderArgv(input, stagedPath), preflight.binding, input.cwd);
              if (completion.exitCode !== 0) {
                return yield* Effect.fail(toolFailed(completion.exitCode, completion.stdout, completion.stderr));
              }
            }),
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(Path.Path, path),
          Effect.provideService(Crypto.Crypto, crypto),
        );
        return { ...published, provider: "deno" } as unknown as Artifact<Mode>;
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
