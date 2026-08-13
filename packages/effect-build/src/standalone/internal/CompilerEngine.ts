import { Crypto, Effect, FileSystem, Path, Result, Stream } from "effect";
import type { PreparedCompileInput, ProviderArtifact, ProviderName as ToolName } from "../../Provider.js";
import type { BuildError } from "../BuildError.js";
import { OutputInvalid, OutputMissing, TargetUnsupported, ToolFailed } from "../BuildError.js";
import { captureCellResult, type CompilerRunner, makeMatrixFailedFor } from "../CompileExecutableMatrix.js";
import { InvalidMatrixInput, type MatrixIssue } from "../MatrixError.js";
import type { Target } from "../Target.js";
import { acquireAtomicOutput } from "./AtomicOutput.js";
import {
  inspectNativeExecutableChunks,
  type NativeExecutableObservation,
  NativeExecutableRangeRequired,
} from "./NativeExecutable.js";
import { ChildProcessSpawner, runProcess } from "./Process.js";
import { descriptorOf, matchesObservation, type TargetDescriptor, targetFromObservation } from "./TargetCatalog.js";
import type { TargetTable } from "./TargetTable.js";
import type { DiscoveredCompiler } from "./ToolDiscovery.js";

export type { DiscoveredCompiler } from "./ToolDiscovery.js";

export type OptionsValidation<ValidatedOptions> =
  | { readonly _tag: "Valid"; readonly value: ValidatedOptions }
  | {
    readonly _tag: "Invalid";
    readonly error: import("../BuildError.js").InvalidDriverOptions;
  };

export interface CompilerAdapter<
  Options,
  Name extends ToolName,
  SupportedTarget extends Target,
  ValidatedOptions = Options,
> {
  readonly toolName: Name;
  readonly probeArgv: readonly string[];
  readonly targetTable: TargetTable<SupportedTarget>;
  readonly defaultTarget?: SupportedTarget;
  readonly validateOptions: (
    options: unknown,
  ) => OptionsValidation<ValidatedOptions>;
  readonly renderArgv: (context: {
    readonly input: PreparedCompileInput<ValidatedOptions, SupportedTarget>;
    readonly stagedOutfile: string;
  }) => readonly string[];
  readonly interpretFailure: (
    completion: import("./Process.js").ProcessCompletion,
  ) => ToolFailed;
}

const inferTarget = <SupportedTarget extends Target>(
  observation: NativeExecutableObservation,
  requested: SupportedTarget | undefined,
  fallback: SupportedTarget | undefined,
  resolve: (value: unknown) => SupportedTarget | undefined,
): SupportedTarget => {
  if (requested !== undefined) {
    if (!matchesObservation(requested, observation)) throw new Error("native target does not match requested target");
    return requested;
  }
  const canonical = targetFromObservation(observation, fallback);
  if (canonical === undefined) throw new Error("native target is ambiguous");
  const providerTarget = resolve(canonical);
  if (providerTarget === undefined) throw new Error("native target is unsupported by the selected compiler");
  return providerTarget;
};

const describeUnknownTarget = (value: unknown): string => {
  if (value === null) return "<non-string:null>";
  if (Array.isArray(value)) return "<non-string:array>";
  return `<non-string:${typeof value}>`;
};

const collectRange = (fileSystem: FileSystem.FileSystem, file: string, offset: number, bytesToRead: number) =>
  fileSystem.stream(file, { offset, bytesToRead }).pipe(
    Stream.runFold(() => new Uint8Array(0), (current, chunk) => {
      const combined = new Uint8Array(current.byteLength + chunk.byteLength);
      combined.set(current);
      combined.set(chunk, current.byteLength);
      return combined;
    }),
  );

const inspectNativeExecutableFile = (
  fileSystem: FileSystem.FileSystem,
  file: string,
  size: number,
): Effect.Effect<NativeExecutableObservation, unknown> =>
  Effect.gen(function*() {
    const initialLength = Math.min(size, 1024 * 1024);
    const initial = initialLength === 0
      ? new Uint8Array(0)
      : yield* collectRange(fileSystem, file, 0, initialLength);
    if (initial.byteLength !== initialLength) return yield* Effect.fail(new Error("truncated-header"));
    const chunks = [{ offset: 0, bytes: initial }];

    for (let reads = 0;; reads++) {
      const step = yield* Effect.sync(() => {
        try {
          return { _tag: "Done", value: inspectNativeExecutableChunks(size, chunks) } as const;
        } catch (error) {
          return error instanceof NativeExecutableRangeRequired
            ? { _tag: "Read", request: error } as const
            : { _tag: "Failed", error } as const;
        }
      });
      if (step._tag === "Done") return step.value;
      if (step._tag === "Failed") return yield* Effect.fail(step.error);
      if (reads === 4) return yield* Effect.fail(new Error("too-many-header-ranges"));
      const bytes = yield* collectRange(fileSystem, file, step.request.offset, step.request.length);
      if (bytes.byteLength !== step.request.length) return yield* Effect.fail(new Error("truncated-header"));
      chunks.push({ offset: step.request.offset, bytes });
    }
  });

const hex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

interface PreparedCell<ValidatedOptions, SupportedTarget extends Target> {
  readonly input: Omit<PreparedCompileInput<ValidatedOptions, SupportedTarget>, "target">;
  readonly selection?: {
    readonly target: SupportedTarget;
    readonly descriptor: TargetDescriptor;
  };
}

interface PreparedMatrixCell<ValidatedOptions, SupportedTarget extends Target>
  extends PreparedCell<ValidatedOptions, SupportedTarget>
{
  readonly selection: {
    readonly target: SupportedTarget;
    readonly descriptor: TargetDescriptor;
  };
}

type MatrixPreflight<ValidatedOptions, SupportedTarget extends Target> =
  | { readonly _tag: "Invalid"; readonly error: InvalidMatrixInput }
  | {
    readonly _tag: "Valid";
    readonly cells: readonly PreparedMatrixCell<ValidatedOptions, SupportedTarget>[];
    readonly concurrency: number;
  };

const describeUnknownValue = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value === null) return "<non-string:null>";
  if (Array.isArray(value)) return "<non-string:array>";
  switch (typeof value) {
    case "undefined":
      return "<non-string:undefined>";
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (Number.isNaN(value)) return "NaN";
      if (value === Number.POSITIVE_INFINITY) return "Infinity";
      if (value === Number.NEGATIVE_INFINITY) return "-Infinity";
      if (Object.is(value, -0)) return "-0";
      return `${value}`;
    case "bigint":
      return `${value}`;
    default:
      return `<non-string:${typeof value}>`;
  }
};

const issue = (
  field: MatrixIssue["field"],
  reason: string,
  context: { readonly index?: number; readonly value?: string } = {},
): MatrixIssue => ({ field, reason, ...context });

const preflightMatrix = <
  Options,
  const Name extends ToolName,
  SupportedTarget extends Target,
  ValidatedOptions,
>(
  adapter: CompilerAdapter<Options, Name, SupportedTarget, ValidatedOptions>,
  path: Path.Path,
  rawInput: unknown,
): MatrixPreflight<ValidatedOptions, SupportedTarget> => {
  if (typeof rawInput !== "object" || rawInput === null || Array.isArray(rawInput)) {
    return {
      _tag: "Invalid",
      error: new InvalidMatrixInput({
        issues: [issue("input", "must be a non-null object", { value: describeUnknownValue(rawInput) })],
      }),
    };
  }

  const record = rawInput as Readonly<Record<string, unknown>>;
  // Read each public field exactly once. Throwing getters and Proxy traps stay
  // defects because this entire preflight runs inside Effect.sync.
  const entrypointValue = record.entrypoint;
  const outdirValue = record.outdir;
  const nameValue = record.name;
  const targetsValue = record.targets;
  const cwdPresent = Object.hasOwn(record, "cwd");
  const cwdValue = record.cwd;
  const digestPresent = Object.hasOwn(record, "digest");
  const digestValue = record.digest;
  const optionsValue = record.options;
  const concurrencyPresent = Object.hasOwn(record, "concurrency");
  const concurrencyValue = record.concurrency;

  const issues: MatrixIssue[] = [];

  let entrypoint: string | undefined;
  if (typeof entrypointValue !== "string" || entrypointValue.length === 0) {
    issues.push(issue("entrypoint", "must be a non-empty string", { value: describeUnknownValue(entrypointValue) }));
  } else if (entrypointValue.includes("\0")) {
    issues.push(issue("entrypoint", "must not contain NUL"));
  } else {
    entrypoint = entrypointValue;
  }

  let outdir: string | undefined;
  if (typeof outdirValue !== "string" || outdirValue.length === 0) {
    issues.push(issue("outdir", "must be a non-empty string", { value: describeUnknownValue(outdirValue) }));
  } else if (outdirValue.includes("\0")) {
    issues.push(issue("outdir", "must not contain NUL"));
  } else {
    outdir = outdirValue;
  }

  let name: string | undefined;
  if (typeof nameValue !== "string") {
    issues.push(issue("name", "must be a string", { value: describeUnknownValue(nameValue) }));
  } else if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(nameValue)) {
    issues.push(issue("name", "must be an ASCII artifact stem of 1 to 128 characters", { value: nameValue }));
  } else {
    name = nameValue;
  }

  const targets: SupportedTarget[] = [];
  let targetsValid = true;
  if (!Array.isArray(targetsValue)) {
    issues.push(issue("targets", "must be a non-empty array", { value: describeUnknownValue(targetsValue) }));
    targetsValid = false;
  } else if (targetsValue.length === 0) {
    issues.push(issue("targets", "must be non-empty"));
    targetsValid = false;
  } else {
    const seen = new Set<SupportedTarget>();
    for (let index = 0; index < targetsValue.length; index++) {
      const unsafeTarget: unknown = targetsValue[index];
      const target = adapter.targetTable.resolve(unsafeTarget);
      if (target === undefined) {
        targetsValid = false;
        issues.push(issue("targets", "is not supported by the selected compiler", {
          index,
          value: describeUnknownValue(unsafeTarget),
        }));
      } else if (seen.has(target)) {
        targetsValid = false;
        issues.push(issue("targets", "must not contain duplicate targets", { index, value: target }));
      } else {
        seen.add(target);
        targets.push(target);
      }
    }
  }

  let cwd: string | undefined;
  if (cwdPresent) {
    if (typeof cwdValue !== "string") {
      issues.push(issue("cwd", "must be a string", { value: describeUnknownValue(cwdValue) }));
    } else if (cwdValue.includes("\0")) {
      issues.push(issue("cwd", "must not contain NUL"));
    } else {
      cwd = cwdValue;
    }
  }

  let digest: boolean | undefined;
  if (digestPresent) {
    if (typeof digestValue !== "boolean") {
      issues.push(issue("digest", "must be boolean", { value: describeUnknownValue(digestValue) }));
    } else {
      digest = digestValue;
    }
  }

  const optionsValidation = adapter.validateOptions(optionsValue);
  let validatedOptions: ValidatedOptions | undefined;
  let optionsValid = false;
  if (optionsValidation._tag === "Invalid") {
    issues.push(issue("options", optionsValidation.error.reason));
  } else {
    validatedOptions = optionsValidation.value;
    optionsValid = true;
  }

  let concurrency = 1;
  if (concurrencyPresent) {
    if (!Number.isSafeInteger(concurrencyValue) || typeof concurrencyValue !== "number" || concurrencyValue <= 0) {
      issues.push(issue("concurrency", "must be a positive safe integer", {
        value: describeUnknownValue(concurrencyValue),
      }));
    } else {
      concurrency = concurrencyValue;
    }
  }

  const cells: PreparedMatrixCell<ValidatedOptions, SupportedTarget>[] = [];
  if (
    entrypoint !== undefined
    && outdir !== undefined
    && name !== undefined
    && targetsValid
    && targets.length > 0
    && (!cwdPresent || cwd !== undefined)
    && (!digestPresent || digest !== undefined)
    && optionsValid
  ) {
    const resolvedOutdir = path.normalize(path.resolve(cwd ?? "", outdir));
    const destinations = new Set<string>();
    for (let index = 0; index < targets.length; index++) {
      const target = targets[index]!;
      const descriptor = descriptorOf(target);
      const outfile = path.normalize(path.join(resolvedOutdir, `${name}-${target}${descriptor.executableSuffix}`));
      if (destinations.has(outfile)) {
        issues.push(issue("output", "generated destinations must be unique", { index, value: outfile }));
      } else {
        destinations.add(outfile);
      }
      cells.push({
        input: {
          entrypoint,
          outfile,
          ...(cwd === undefined ? {} : { cwd }),
          ...(digest === undefined ? {} : { digest }),
          options: validatedOptions as ValidatedOptions,
        },
        selection: { target, descriptor },
      });
    }
  }

  if (issues.length > 0) {
    const [first, ...rest] = issues;
    return {
      _tag: "Invalid",
      error: new InvalidMatrixInput({ issues: [first!, ...rest] }),
    };
  }

  return { _tag: "Valid", cells, concurrency };
};

export const makeCompilerRunner = <
  Options,
  const Name extends ToolName,
  SupportedTarget extends Target,
  ValidatedOptions,
>(
  adapter: CompilerAdapter<Options, Name, SupportedTarget, ValidatedOptions>,
  tool: DiscoveredCompiler<Name>,
): Effect.Effect<
  CompilerRunner<Options, Name, SupportedTarget>,
  never,
  ChildProcessSpawner | FileSystem.FileSystem | Path.Path | Crypto.Crypto
> =>
  Effect.gen(function*() {
    const spawner = yield* ChildProcessSpawner;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;

    const compilePreparedCell = (
      cell: PreparedCell<ValidatedOptions, SupportedTarget>,
    ): Effect.Effect<ProviderArtifact<Name, SupportedTarget>, BuildError> => {
      const executableSuffix = cell.selection === undefined
        ? tool.hostOs === "windows" ? ".exe" : ""
        : cell.selection.descriptor.executableSuffix;
      return Effect.scoped(
        Effect.gen(function*() {
          const output = yield* acquireAtomicOutput(fileSystem, path, {
            outfile: cell.input.outfile,
            ...(cell.input.cwd === undefined ? {} : { cwd: cell.input.cwd }),
            executableSuffix,
          });
          const argv = yield* Effect.sync(() =>
            adapter.renderArgv({
              input: {
                ...cell.input,
                ...(cell.selection === undefined ? {} : { target: cell.selection.target }),
              },
              stagedOutfile: output.staged,
            })
          );
          const completion = yield* runProcess(tool.artifactTool.path, argv, cell.input.cwd).pipe(
            Effect.provideService(ChildProcessSpawner, spawner),
            Effect.mapError((error) =>
              new ToolFailed({
                tool: adapter.toolName,
                exitCode: 1,
                diagnostics: [{ channel: "stderr", text: error.message, truncated: false }],
              })
            ),
          );
          if (completion.exitCode !== 0) return yield* adapter.interpretFailure(completion);

          const exists = yield* fileSystem.exists(output.staged).pipe(
            Effect.mapError((error) => new OutputInvalid({ path: output.staged, reason: error.message })),
          );
          if (!exists) return yield* new OutputMissing({ path: output.staged });
          const information = yield* fileSystem.stat(output.staged).pipe(
            Effect.mapError((error) => new OutputInvalid({ path: output.staged, reason: error.message })),
          );
          if (information.type !== "File") {
            return yield* new OutputInvalid({ path: output.staged, reason: "not-regular" });
          }
          if (executableSuffix !== ".exe" && (information.mode & 0o111) === 0) {
            return yield* new OutputInvalid({ path: output.staged, reason: "not-executable" });
          }
          const bytes = Number(information.size);
          if (!Number.isSafeInteger(bytes) || bytes < 0) {
            return yield* new OutputInvalid({ path: output.staged, reason: "invalid-byte-count" });
          }
          const target = yield* inspectNativeExecutableFile(fileSystem, output.staged, bytes).pipe(
            Effect.flatMap((observation) =>
              Effect.try({
                try: () =>
                  inferTarget(
                    observation,
                    cell.selection?.target,
                    adapter.defaultTarget,
                    adapter.targetTable.resolve,
                  ),
                catch: (error) => new OutputInvalid({ path: output.staged, reason: String(error) }),
              })
            ),
            Effect.mapError((error) =>
              error instanceof OutputInvalid
                ? error
                : new OutputInvalid({ path: output.staged, reason: String(error) })
            ),
          );
          const digest = cell.input.digest === true
            ? yield* fileSystem.readFile(output.staged).pipe(
              Effect.flatMap((bytes) => crypto.digest("SHA-256", bytes)),
              Effect.map((bytes) => `sha256:${hex(bytes)}` as const),
              Effect.mapError((error) => new OutputInvalid({ path: output.staged, reason: error.message })),
            )
            : undefined;
          yield* output.commit;
          return {
            path: output.destination,
            bytes,
            ...(digest === undefined ? {} : { digest }),
            target,
            tool: tool.artifactTool,
          } satisfies ProviderArtifact<Name, SupportedTarget>;
        }),
      );
    };

    const compileExecutable: CompilerRunner<Options, Name, SupportedTarget>["compileExecutable"] = (input) =>
      Effect.gen(function*() {
        const unsafeTarget: unknown = input.target;
        const requestedTarget = unsafeTarget === undefined ? undefined : adapter.targetTable.resolve(unsafeTarget);
        if (unsafeTarget !== undefined && requestedTarget === undefined) {
          return yield* new TargetUnsupported({
            tool: adapter.toolName,
            requested: typeof unsafeTarget === "string" ? unsafeTarget : describeUnknownTarget(unsafeTarget),
            available: [...adapter.targetTable.Target.literals],
          });
        }

        const optionsValidation = yield* Effect.sync(() => adapter.validateOptions(input.options));
        if (optionsValidation._tag === "Invalid") return yield* optionsValidation.error;

        return yield* compilePreparedCell({
          input: {
            entrypoint: input.entrypoint,
            outfile: input.outfile,
            ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
            ...(input.digest === undefined ? {} : { digest: input.digest }),
            options: optionsValidation.value,
          },
          ...(requestedTarget === undefined
            ? {}
            : { selection: { target: requestedTarget, descriptor: descriptorOf(requestedTarget) } }),
        });
      });

    const compileExecutableMatrix: CompilerRunner<Options, Name, SupportedTarget>["compileExecutableMatrix"] = (
      input,
    ) =>
      Effect.gen(function*() {
        const preflight = yield* Effect.sync(() => preflightMatrix(adapter, path, input));
        if (preflight._tag === "Invalid") return yield* preflight.error;
        const results = yield* Effect.forEach(
          preflight.cells,
          (cell) => captureCellResult(compilePreparedCell(cell)),
          { concurrency: preflight.concurrency },
        );
        const artifacts: ProviderArtifact<Name, SupportedTarget>[] = [];
        const failures: Array<{
          readonly tool: Name;
          readonly target: SupportedTarget;
          readonly path: string;
          readonly error: BuildError;
        }> = [];
        for (let index = 0; index < results.length; index++) {
          const result = results[index]!;
          const cell = preflight.cells[index]!;
          if (Result.isSuccess(result)) {
            artifacts.push(result.success);
          } else {
            failures.push({
              tool: adapter.toolName,
              target: cell.selection.target,
              path: cell.input.outfile,
              error: result.failure,
            });
          }
        }
        const [first, ...rest] = failures;
        if (first !== undefined) {
          return yield* Effect.fail(makeMatrixFailedFor({ artifacts, failures: [first, ...rest] }));
        }
        return artifacts;
      });

    return { compileExecutable, compileExecutableMatrix };
  });

export const makeCompilerService = <
  Options,
  const Name extends ToolName,
  SupportedTarget extends Target,
  ValidatedOptions,
>(
  adapter: CompilerAdapter<Options, Name, SupportedTarget, ValidatedOptions>,
  tool: DiscoveredCompiler<Name>,
): Effect.Effect<
  CompilerRunner<Options, Name, SupportedTarget>,
  never,
  ChildProcessSpawner | FileSystem.FileSystem | Path.Path | Crypto.Crypto
> => makeCompilerRunner(adapter, tool);
