import { Crypto, Effect, FileSystem, Path, Result } from "effect";
import { ChildProcessSpawner as EffectChildProcessSpawner } from "effect/unstable/process";
import * as Integration from "../../Integration.js";
import { InvalidDriverOptions, TargetUnsupported, ToolFailed } from "../BuildError.js";
import { captureCellResult, makeMatrixFailedFor } from "../CompileExecutableMatrix.js";
import type { CompilerService } from "../Driver.js";
import { InvalidMatrixInput, type MatrixIssue } from "../MatrixError.js";
import type { SystemTarget } from "../Target.js";
import {
  type CellExecutionError,
  type CommandCompilerAdapter,
  type DiscoveredCompiler,
  type ProviderArtifact,
  type ProviderStages,
} from "./CompilerAdapter.js";
import { descriptorOf, matchesObservation, type TargetDescriptor, targetFromObservation } from "./TargetCatalog.js";

const inferTarget = <SupportedTarget extends SystemTarget>(
  observation: Integration.NativeExecutableObservation,
  requested: SupportedTarget | undefined,
  fallback: SupportedTarget | undefined,
  resolve: (value: unknown) => SupportedTarget | undefined,
): Result.Result<SupportedTarget, string> => {
  if (requested !== undefined) {
    return matchesObservation(requested, observation)
      ? Result.succeed(requested)
      : Result.fail("Error: native target does not match requested target");
  }
  const canonical = targetFromObservation(observation, fallback);
  if (canonical === undefined) return Result.fail("Error: native target is ambiguous");
  const providerTarget = resolve(canonical);
  return providerTarget === undefined
    ? Result.fail("Error: native target is unsupported by the selected compiler")
    : Result.succeed(providerTarget);
};

const describeUnknownTarget = (value: unknown): string => {
  if (value === null) return "<non-string:null>";
  if (Array.isArray(value)) return "<non-string:array>";
  return `<non-string:${typeof value}>`;
};

interface PreparedCellInput<ValidatedOptions> {
  readonly entrypoint: string;
  readonly outfile: string;
  readonly cwd?: string;
  readonly digest?: boolean;
  readonly options: ValidatedOptions;
}

interface PreparedCell<ValidatedOptions, SupportedTarget extends SystemTarget> {
  readonly input: PreparedCellInput<ValidatedOptions>;
  readonly selection?: {
    readonly target: SupportedTarget;
    readonly descriptor: TargetDescriptor;
  };
}

interface PreparedMatrixCell<ValidatedOptions, SupportedTarget extends SystemTarget>
  extends PreparedCell<ValidatedOptions, SupportedTarget>
{
  readonly selection: {
    readonly target: SupportedTarget;
    readonly descriptor: TargetDescriptor;
  };
}

type MatrixPreflight<ValidatedOptions, SupportedTarget extends SystemTarget> =
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

const decodeRequiredPath = (
  field: "entrypoint" | "outdir" | "output",
  value: unknown,
): Result.Result<string, MatrixIssue> => {
  if (typeof value !== "string" || value.length === 0) {
    return Result.fail(issue(field, "must be a non-empty string", { value: describeUnknownValue(value) }));
  }
  return value.includes("\0")
    ? Result.fail(issue(field, "must not contain NUL"))
    : Result.succeed(value);
};

const decodeCwd = (present: boolean, value: unknown): Result.Result<string | undefined, MatrixIssue> => {
  if (!present) return Result.succeed(undefined);
  if (typeof value !== "string") {
    return Result.fail(issue("cwd", "must be a string", { value: describeUnknownValue(value) }));
  }
  return value.includes("\0")
    ? Result.fail(issue("cwd", "must not contain NUL"))
    : Result.succeed(value);
};

const decodeDigest = (present: boolean, value: unknown): Result.Result<boolean | undefined, MatrixIssue> => {
  if (!present) return Result.succeed(undefined);
  return typeof value === "boolean"
    ? Result.succeed(value)
    : Result.fail(issue("digest", "must be boolean", { value: describeUnknownValue(value) }));
};

const scalarInputFields = new Set<PropertyKey>([
  "entrypoint",
  "outfile",
  "cwd",
  "target",
  "digest",
  "options",
]);

const scalarIssueError = <const Name extends string>(
  tool: Name,
  fieldIssue: MatrixIssue,
): InvalidDriverOptions =>
  new InvalidDriverOptions({
    tool,
    reason: `${fieldIssue.field === "output" ? "outfile" : fieldIssue.field} ${fieldIssue.reason}`,
  });

const preflightScalar = <
  const Name extends string,
  SupportedTarget extends SystemTarget,
  Stages extends ProviderStages<Name>,
  ValidatedOptions,
>(
  adapter: CommandCompilerAdapter<Name, SupportedTarget, Stages, ValidatedOptions>,
  rawInput: unknown,
): Result.Result<PreparedCell<ValidatedOptions, SupportedTarget>, InvalidDriverOptions | TargetUnsupported> => {
  if (typeof rawInput !== "object" || rawInput === null || Array.isArray(rawInput)) {
    return Result.fail(
      new InvalidDriverOptions({
        tool: adapter.toolName,
        reason: "input must be a non-null object",
      }),
    );
  }

  const record = rawInput as Readonly<Record<string, unknown>>;
  if (Reflect.ownKeys(record).some((field) => !scalarInputFields.has(field))) {
    return Result.fail(
      new InvalidDriverOptions({
        tool: adapter.toolName,
        reason: "input must not contain unknown fields",
      }),
    );
  }

  const entrypoint = decodeRequiredPath("entrypoint", record.entrypoint);
  if (Result.isFailure(entrypoint)) return Result.fail(scalarIssueError(adapter.toolName, entrypoint.failure));

  const outfile = decodeRequiredPath("output", record.outfile);
  if (Result.isFailure(outfile)) return Result.fail(scalarIssueError(adapter.toolName, outfile.failure));

  const unsafeTarget = record.target;
  const requestedTarget = unsafeTarget === undefined ? undefined : adapter.targetTable.resolve(unsafeTarget);
  if (unsafeTarget !== undefined && requestedTarget === undefined) {
    return Result.fail(
      new TargetUnsupported({
        tool: adapter.toolName,
        requested: typeof unsafeTarget === "string" ? unsafeTarget : describeUnknownTarget(unsafeTarget),
        available: [...adapter.targetTable.Target.literals],
      }),
    );
  }

  const cwdPresent = Object.hasOwn(record, "cwd");
  const cwd = decodeCwd(cwdPresent, cwdPresent ? record.cwd : undefined);
  if (Result.isFailure(cwd)) return Result.fail(scalarIssueError(adapter.toolName, cwd.failure));

  const digestPresent = Object.hasOwn(record, "digest");
  const digest = decodeDigest(digestPresent, digestPresent ? record.digest : undefined);
  if (Result.isFailure(digest)) return Result.fail(scalarIssueError(adapter.toolName, digest.failure));

  const options = adapter.validateOptions(record.options);
  if (options._tag === "Invalid") return Result.fail(options.error);

  return Result.succeed({
    input: {
      entrypoint: entrypoint.success,
      outfile: outfile.success,
      ...(cwd.success === undefined ? {} : { cwd: cwd.success }),
      ...(digest.success === undefined ? {} : { digest: digest.success }),
      options: options.value,
    },
    ...(requestedTarget === undefined
      ? {}
      : { selection: { target: requestedTarget, descriptor: descriptorOf(requestedTarget) } }),
  });
};

const preflightMatrix = <
  const Name extends string,
  SupportedTarget extends SystemTarget,
  Stages extends ProviderStages<Name>,
  ValidatedOptions,
>(
  adapter: CommandCompilerAdapter<Name, SupportedTarget, Stages, ValidatedOptions>,
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

  const entrypoint = decodeRequiredPath("entrypoint", entrypointValue);
  const outdir = decodeRequiredPath("outdir", outdirValue);
  const issues: MatrixIssue[] = [];
  if (Result.isFailure(entrypoint)) issues.push(entrypoint.failure);
  if (Result.isFailure(outdir)) issues.push(outdir.failure);

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

  const cwd = decodeCwd(cwdPresent, cwdValue);
  if (Result.isFailure(cwd)) issues.push(cwd.failure);

  const digest = decodeDigest(digestPresent, digestValue);
  if (Result.isFailure(digest)) issues.push(digest.failure);

  const options = adapter.validateOptions(optionsValue);
  if (options._tag === "Invalid") issues.push(issue("options", options.error.reason));

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
    Result.isSuccess(entrypoint)
    && Result.isSuccess(outdir)
    && name !== undefined
    && targetsValid
    && targets.length > 0
    && Result.isSuccess(cwd)
    && Result.isSuccess(digest)
    && options._tag === "Valid"
  ) {
    const resolvedOutdir = path.normalize(path.resolve(cwd.success ?? "", outdir.success));
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
          entrypoint: entrypoint.success,
          outfile,
          ...(cwd.success === undefined ? {} : { cwd: cwd.success }),
          ...(digest.success === undefined ? {} : { digest: digest.success }),
          options: options.value,
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

export const makeCompilerService = <
  Options,
  const Name extends string,
  SupportedTarget extends SystemTarget,
  Stages extends ProviderStages<Name>,
  ValidatedOptions,
>(
  adapter: CommandCompilerAdapter<Name, SupportedTarget, Stages, ValidatedOptions>,
  tool: DiscoveredCompiler<Name>,
): Effect.Effect<
  CompilerService<Name, SupportedTarget, Stages, Options>,
  never,
  EffectChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path | Crypto.Crypto
> =>
  Effect.gen(function*() {
    const spawner = yield* EffectChildProcessSpawner.ChildProcessSpawner;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;

    const compilePreparedCell = (
      cell: PreparedCell<ValidatedOptions, SupportedTarget>,
    ): Effect.Effect<ProviderArtifact<Name, SupportedTarget, Stages>, CellExecutionError> => {
      const executableSuffix = cell.selection === undefined
        ? path.sep === "\\" ? ".exe" : ""
        : cell.selection.descriptor.executableSuffix;
      return Integration.produceExecutable({
        outfile: cell.input.outfile,
        ...(cell.input.cwd === undefined ? {} : { cwd: cell.input.cwd }),
        ...(cell.input.digest === undefined ? {} : { digest: cell.input.digest }),
        executableSuffix,
        prepare: () => Effect.succeed(cell),
        produce: ({ stagedOutfile, resolvedDestination }) =>
          Effect.gen(function*() {
            const argv = yield* Effect.sync(() =>
              adapter.renderArgv({
                entrypoint: cell.input.entrypoint,
                ...(cell.selection === undefined ? {} : { target: cell.selection.target }),
                options: cell.input.options,
                stagedOutfile,
                resolvedDestination,
                ...(cell.input.cwd === undefined ? {} : { cwd: cell.input.cwd }),
              })
            );
            const completion = yield* Integration.executeCommand(tool.artifactTool.path, argv, cell.input.cwd).pipe(
              Effect.provideService(EffectChildProcessSpawner.ChildProcessSpawner, spawner),
              Effect.mapError((error) =>
                new ToolFailed({
                  tool: adapter.toolName,
                  exitCode: 1,
                  diagnostics: [{ channel: "stderr", text: error.message, truncated: false }],
                })
              ),
            );
            if (completion.exitCode !== 0) return yield* adapter.interpretFailure(completion);
            return Object.freeze([
              Object.freeze({
                operation: "compile-executable" as const,
                tool: Object.freeze(tool.artifactTool),
              }),
            ]);
          }),
        decodeStages: (_prepared, observedStages) => adapter.decodeStages(observedStages),
        resolveTarget: (observation) =>
          inferTarget(
            observation,
            cell.selection?.target,
            adapter.defaultTarget,
            adapter.targetTable.resolve,
          ),
      }).pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.provideService(Path.Path, path),
        Effect.provideService(Crypto.Crypto, crypto),
        Effect.map((published) =>
          ({
            ...published,
            provider: adapter.toolName,
          }) as unknown as ProviderArtifact<Name, SupportedTarget, Stages>
        ),
      );
    };

    const compileExecutable: CompilerService<Name, SupportedTarget, Stages, Options>["compileExecutable"] = Effect.fn(
      `effect-build/${adapter.toolName}.compileExecutable`,
    )((input) =>
      Effect.gen(function*() {
        const preflight = yield* Effect.sync(() => preflightScalar(adapter, input));
        if (Result.isFailure(preflight)) return yield* preflight.failure;
        return yield* compilePreparedCell(preflight.success);
      })
    );

    const compileExecutableMatrix: CompilerService<Name, SupportedTarget, Stages, Options>["compileExecutableMatrix"] =
      Effect.fn(`effect-build/${adapter.toolName}.compileExecutableMatrix`)((input) =>
        Effect.gen(function*() {
          const preflight = yield* Effect.sync(() => preflightMatrix(adapter, path, input));
          if (preflight._tag === "Invalid") return yield* preflight.error;
          const results = yield* Effect.forEach(
            preflight.cells,
            (cell) => captureCellResult(compilePreparedCell(cell)),
            { concurrency: preflight.concurrency },
          );
          const artifacts: ProviderArtifact<Name, SupportedTarget, Stages>[] = [];
          const failures: Array<{
            readonly provider: Name;
            readonly target: SupportedTarget;
            readonly path: string;
            readonly error: CellExecutionError;
          }> = [];
          for (let index = 0; index < results.length; index++) {
            const result = results[index]!;
            const cell = preflight.cells[index]!;
            if (Result.isSuccess(result)) {
              artifacts.push(result.success);
            } else {
              failures.push({
                provider: adapter.toolName,
                target: cell.selection.target,
                path: cell.input.outfile,
                error: result.failure,
              });
            }
          }
          const [first, ...rest] = failures;
          if (first !== undefined) {
            return yield* Effect.fail(
              makeMatrixFailedFor<Name, SupportedTarget, Stages>({
                artifacts,
                failures: [first, ...rest],
              }) as unknown as import("../../Provider.js").ProviderMatrixError<Name, SupportedTarget, Stages>,
            );
          }
          return artifacts;
        })
      );

    return { compileExecutable, compileExecutableMatrix };
  });
