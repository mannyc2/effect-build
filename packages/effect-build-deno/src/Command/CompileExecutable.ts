import { Effect, FileSystem, Path } from "effect";
import type * as CoreArtifact from "effect-build/Artifact";
import * as Executable from "effect-build/Author/Executable";
import type * as Tool from "effect-build/Author/Tool";
import * as Matrix from "effect-build/Matrix";
import { DenoCommandInputInvalid } from "../internal/CommandError.js";
import {
  type Input,
  needsExeSuffix,
  type Options,
  type Permissions,
  renderArgv,
  systemTarget,
  Target as TargetSchema,
  type Target as TargetType,
  validateInput,
} from "../internal/CompileCommand.js";
import * as NativeExecutable from "../internal/Executable.js";
import type { RunError } from "../internal/Runtime.js";
import { Runtime } from "../internal/Runtime.js";

export const Target = TargetSchema;
export type Target = TargetType;
export type { Input, Options, Permissions };

export type MatrixInput<Mode extends CoreArtifact.ObservationMode = CoreArtifact.ObservationMode> = Matrix.Input<
  Input<Mode>
>;

export type RuntimeAcquisition =
  | {
    readonly _tag: "ExplicitDenort";
    readonly tool: Tool.Observation<"denort">;
    readonly relation: "target-validated" | "target-validated-engine-relation-open";
  }
  | {
    readonly _tag: "ProviderManagedDenort";
    readonly denoDir?: CoreArtifact.AbsolutePath;
    readonly evidenceGate: "cold-warm-corrupt-offline-target-relation-open";
  };

export type Artifact<Mode extends CoreArtifact.ObservationMode = CoreArtifact.ObservationMode> =
  & CoreArtifact.Executable<Mode>
  & {
    readonly provider: "deno";
    readonly tool: Tool.Observation<"deno">;
    readonly denoTarget?: TargetType;
    readonly runtimeAcquisition: RuntimeAcquisition;
  };

export type CompileExecutableError =
  | DenoCommandInputInvalid
  | Executable.Failure<RunError, NativeExecutable.NativeExecutableInspectionFailed>;

export type MatrixReport<Mode extends CoreArtifact.ObservationMode = CoreArtifact.ObservationMode> = Matrix.Report<
  Artifact<Mode>,
  CompileExecutableError,
  "deno"
>;

export const compileExecutable = <Mode extends CoreArtifact.ObservationMode>(
  input: Input<Mode>,
): Effect.Effect<
  Artifact<Mode>,
  CompileExecutableError,
  Runtime | FileSystem.FileSystem | Path.Path | import("effect").Crypto.Crypto
> =>
  Effect.gen(function*() {
    yield* validateInput(input);
    const runtime = yield* Runtime;
    const fileSystem = yield* FileSystem.FileSystem;
    const expected = input.target === undefined ? undefined : systemTarget(input.target);
    if (runtime.denort !== undefined) {
      yield* NativeExecutable.inspect(runtime.denort.executablePath, runtime.version, expected);
    }
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
      (candidate) => NativeExecutable.inspect(candidate.path, runtime.version, expected),
    );
    const runtimeAcquisition: RuntimeAcquisition = runtime.denort === undefined
      ? {
        _tag: "ProviderManagedDenort",
        ...(runtime.denoDir === undefined ? {} : { denoDir: runtime.denoDir }),
        evidenceGate: "cold-warm-corrupt-offline-target-relation-open",
      }
      : {
        _tag: "ExplicitDenort",
        tool: runtime.denort.observation,
        relation: input.engine === "quickjs" ? "target-validated-engine-relation-open" : "target-validated",
      };
    return Object.freeze({
      ...executable,
      provider: "deno" as const,
      tool: runtime.tool.observation,
      ...(input.target === undefined ? {} : { denoTarget: input.target }),
      runtimeAcquisition,
    }) as unknown as Artifact<Mode>;
  });

export const compileExecutableMatrix = <Mode extends CoreArtifact.ObservationMode>(
  input: MatrixInput<Mode>,
): Effect.Effect<
  MatrixReport<Mode>,
  Matrix.InvalidInput,
  Runtime | FileSystem.FileSystem | Path.Path | import("effect").Crypto.Crypto
> => Matrix.run({ provider: "deno", ...input }, (cell) => compileExecutable(cell));
