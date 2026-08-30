import { Effect, FileSystem, Path, Schema } from "effect";
import type * as CoreArtifact from "effect-build/Artifact";
import * as Executable from "effect-build/Author/Executable";
import type * as Tool from "effect-build/Author/Tool";
import * as Matrix from "effect-build/Matrix";
import type { SystemTarget } from "effect-build/SystemTarget";
import { BunCommandInputInvalid } from "../internal/CommandError.js";
import * as NativeExecutable from "../internal/Executable.js";
import type { InvocationOptions, RunError } from "../internal/Runtime.js";
import { Runtime } from "../internal/Runtime.js";

/** Exact documented Bun 1.3.14 standalone-executable targets. */
export const Target = Schema.Literals(
  [
    "bun-darwin-x64",
    "bun-darwin-x64-baseline",
    "bun-darwin-arm64",
    "bun-linux-x64",
    "bun-linux-x64-baseline",
    "bun-linux-x64-modern",
    "bun-linux-arm64",
    "bun-linux-x64-musl",
    "bun-linux-arm64-musl",
    "bun-windows-x64",
    "bun-windows-x64-baseline",
    "bun-windows-x64-modern",
    "bun-windows-arm64",
  ] as const,
);
export type Target = typeof Target.Type;

export interface MinifyOptions {
  readonly syntax?: boolean;
  readonly whitespace?: boolean;
  readonly identifiers?: boolean;
  readonly keepNames?: boolean;
}

export interface Options {
  readonly minify?: boolean | MinifyOptions;
  /** Sidecar maps are excluded from the one-file atomic publication contract. */
  readonly sourcemap?: "inline" | "none";
  readonly bytecode?: boolean;
  readonly packages?: "bundle" | "external";
  readonly external?: readonly string[];
  readonly conditions?: readonly string[];
  readonly define?: Readonly<Record<string, string>>;
  readonly environmentInline?: "inline" | "disable" | `${string}*`;
  readonly execArgv?: readonly string[];
  readonly autoloadDotenv?: boolean;
  readonly autoloadBunfig?: boolean;
  readonly autoloadTsconfig?: boolean;
  readonly autoloadPackageJson?: boolean;
  readonly windows?: {
    readonly hideConsole?: boolean;
    readonly icon?: string;
    readonly title?: string;
    readonly publisher?: string;
    readonly version?: string;
    readonly description?: string;
    readonly copyright?: string;
  };
}

export interface Input<Mode extends CoreArtifact.ObservationMode = CoreArtifact.ObservationMode>
  extends InvocationOptions
{
  readonly entrypoints: readonly [string, ...string[]];
  readonly outfile: string;
  readonly target?: Target;
  readonly observation: Mode;
  readonly options?: Options;
}

export type MatrixInput<Mode extends CoreArtifact.ObservationMode = CoreArtifact.ObservationMode> = Matrix.Input<
  Input<Mode>
>;

export type RuntimeAcquisition =
  | {
    readonly _tag: "SelectedHostRuntime";
    readonly evidence: "selected-command-content";
  }
  | {
    readonly _tag: "ProviderManagedCrossTargetRuntime";
    readonly target: Target;
    readonly evidenceGate: "cold-warm-offline-and-runtime-identity-open";
  };

export type Artifact<Mode extends CoreArtifact.ObservationMode = CoreArtifact.ObservationMode> =
  & CoreArtifact.Executable<Mode>
  & {
    readonly provider: "bun";
    readonly tool: Tool.Observation<"bun">;
    readonly bunTarget?: Target;
    readonly runtimeAcquisition: RuntimeAcquisition;
  };

export type CompileExecutableError =
  | BunCommandInputInvalid
  | Executable.Failure<RunError, NativeExecutable.NativeExecutableInspectionFailed>;

export type MatrixReport<Mode extends CoreArtifact.ObservationMode = CoreArtifact.ObservationMode> = Matrix.Report<
  Artifact<Mode>,
  CompileExecutableError,
  "bun"
>;

const targets = new Set<string>(Target.literals);

const systemTarget = (target: Target): SystemTarget => {
  switch (target) {
    case "bun-darwin-x64":
    case "bun-darwin-x64-baseline":
      return "macos-x64";
    case "bun-darwin-arm64":
      return "macos-aarch64";
    case "bun-linux-x64":
    case "bun-linux-x64-baseline":
    case "bun-linux-x64-modern":
      return "linux-x64-gnu";
    case "bun-linux-arm64":
      return "linux-aarch64-gnu";
    case "bun-linux-x64-musl":
      return "linux-x64-musl";
    case "bun-linux-arm64-musl":
      return "linux-aarch64-musl";
    case "bun-windows-x64":
    case "bun-windows-x64-baseline":
    case "bun-windows-x64-modern":
      return "windows-x64";
    case "bun-windows-arm64":
      return "windows-aarch64";
  }
};

const renderBoolean = (name: string, value: boolean | undefined): readonly string[] =>
  value === undefined ? [] : [value ? `--${name}` : `--no-${name}`];

const renderArgv = (
  input: Input<CoreArtifact.ObservationMode>,
  privateOutput: string,
): readonly string[] => {
  const options = input.options ?? {};
  const minify = options.minify;
  return [
    "build",
    "--compile",
    ...(input.target === undefined ? [] : [`--target=${input.target}`]),
    ...(minify === true ? ["--minify"] : []),
    ...(typeof minify === "object" && minify.syntax === true ? ["--minify-syntax"] : []),
    ...(typeof minify === "object" && minify.whitespace === true ? ["--minify-whitespace"] : []),
    ...(typeof minify === "object" && minify.identifiers === true ? ["--minify-identifiers"] : []),
    ...(typeof minify === "object" && minify.keepNames === true ? ["--keep-names"] : []),
    ...(options.sourcemap === undefined ? [] : [`--sourcemap=${options.sourcemap}`]),
    ...(options.bytecode === true ? ["--bytecode"] : []),
    ...(options.packages === undefined ? [] : [`--packages=${options.packages}`]),
    ...(options.external ?? []).map((value) => `--external=${value}`),
    ...(options.conditions ?? []).map((value) => `--conditions=${value}`),
    ...Object.entries(options.define ?? {}).flatMap(([name, value]) => ["--define", `${name}=${value}`]),
    ...(options.environmentInline === undefined ? [] : [`--env=${options.environmentInline}`]),
    ...(options.execArgv ?? []).map((value) => `--compile-exec-argv=${value}`),
    ...renderBoolean("compile-autoload-dotenv", options.autoloadDotenv),
    ...renderBoolean("compile-autoload-bunfig", options.autoloadBunfig),
    ...renderBoolean("compile-autoload-tsconfig", options.autoloadTsconfig),
    ...renderBoolean("compile-autoload-package-json", options.autoloadPackageJson),
    ...(options.windows?.hideConsole === true ? ["--windows-hide-console"] : []),
    ...(options.windows?.icon === undefined ? [] : [`--windows-icon=${options.windows.icon}`]),
    ...(options.windows?.title === undefined ? [] : [`--windows-title=${options.windows.title}`]),
    ...(options.windows?.publisher === undefined ? [] : [`--windows-publisher=${options.windows.publisher}`]),
    ...(options.windows?.version === undefined ? [] : [`--windows-version=${options.windows.version}`]),
    ...(options.windows?.description === undefined ? [] : [`--windows-description=${options.windows.description}`]),
    ...(options.windows?.copyright === undefined ? [] : [`--windows-copyright=${options.windows.copyright}`]),
    `--outfile=${privateOutput}`,
    ...input.entrypoints,
  ];
};

const validPath = (value: string): boolean => value.length > 0 && !value.includes("\0");

const validate = <Mode extends CoreArtifact.ObservationMode>(
  input: Input<Mode>,
): Effect.Effect<void, BunCommandInputInvalid> => {
  if (!validPath(input.outfile)) {
    return Effect.fail(
      new BunCommandInputInvalid({
        operation: "compileExecutable",
        reason: "outfile must be non-empty and contain no NUL",
      }),
    );
  }
  if (input.entrypoints.length === 0 || input.entrypoints.some((entrypoint) => !validPath(entrypoint))) {
    return Effect.fail(
      new BunCommandInputInvalid({
        operation: "compileExecutable",
        reason: "entrypoints must be a non-empty list of non-empty paths without NUL",
      }),
    );
  }
  if (input.observation !== "hashed" && input.observation !== "unhashed") {
    return Effect.fail(
      new BunCommandInputInvalid({ operation: "compileExecutable", reason: "observation must be hashed or unhashed" }),
    );
  }
  if (input.target !== undefined && !targets.has(input.target)) {
    return Effect.fail(
      new BunCommandInputInvalid({
        operation: "compileExecutable",
        reason: `unsupported Bun 1.3.14 target: ${String(input.target)}`,
      }),
    );
  }
  return Effect.void;
};

const needsExeSuffix = (target: Target | undefined): boolean => target?.startsWith("bun-windows-") === true;

export const compileExecutable = <Mode extends CoreArtifact.ObservationMode>(
  input: Input<Mode>,
): Effect.Effect<
  Artifact<Mode>,
  CompileExecutableError,
  Runtime | FileSystem.FileSystem | Path.Path | import("effect").Crypto.Crypto
> =>
  Effect.gen(function*() {
    yield* validate(input);
    const runtime = yield* Runtime;
    const fileSystem = yield* FileSystem.FileSystem;
    const requestedSystemTarget = input.target === undefined ? undefined : systemTarget(input.target);
    const executable = yield* Executable.publish(
      {
        destination: input.outfile,
        ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
        observation: input.observation,
        provenance: runtime.tool.observation,
      },
      (privateCandidate) =>
        Effect.gen(function*() {
          const providerOutput = needsExeSuffix(input.target) && !privateCandidate.toLowerCase().endsWith(".exe")
            ? `${privateCandidate}.exe` as CoreArtifact.AbsolutePath
            : privateCandidate;
          yield* runtime.run("compileExecutable", "none", renderArgv(input, providerOutput), input);
          if (providerOutput !== privateCandidate) {
            yield* fileSystem.rename(providerOutput, privateCandidate).pipe(
              Effect.mapError(() =>
                new NativeExecutable.NativeExecutableInspectionFailed({
                  path: providerOutput,
                  reason: "unable-to-normalize-private-windows-candidate",
                })
              ),
            );
          }
        }),
      (candidate) => NativeExecutable.inspect(candidate.path, "bun", runtime.version, requestedSystemTarget),
    );
    return Object.freeze({
      ...executable,
      provider: "bun" as const,
      tool: runtime.tool.observation,
      ...(input.target === undefined ? {} : { bunTarget: input.target }),
      runtimeAcquisition: input.target === undefined
        ? { _tag: "SelectedHostRuntime" as const, evidence: "selected-command-content" as const }
        : {
          _tag: "ProviderManagedCrossTargetRuntime" as const,
          target: input.target,
          evidenceGate: "cold-warm-offline-and-runtime-identity-open" as const,
        },
    }) as Artifact<Mode>;
  });

export const compileExecutableMatrix = <Mode extends CoreArtifact.ObservationMode>(
  input: MatrixInput<Mode>,
): Effect.Effect<
  MatrixReport<Mode>,
  Matrix.InvalidInput,
  Runtime | FileSystem.FileSystem | Path.Path | import("effect").Crypto.Crypto
> => Matrix.run({ provider: "bun", ...input }, (cell) => compileExecutable(cell));
