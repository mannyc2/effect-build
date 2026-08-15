import { Crypto, Effect, FileSystem, Path, Result } from "effect";
import { ChildProcessSpawner as EffectChildProcessSpawner } from "effect/unstable/process";
import * as Integration from "../../Integration.js";
import { TargetUnsupported, ToolFailed } from "../BuildError.js";
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
