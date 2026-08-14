import { Context, Effect, Layer, Schema } from "effect";
import type { Crypto, FileSystem, Path, PlatformError } from "effect";
import type { ChildProcessSpawner as EffectChildProcessSpawner } from "effect/unstable/process";
import type {
  ProviderName as ClosedProviderName,
  ProviderTargets as ClosedProviderTargets,
  TargetFor as ClosedTargetFor,
} from "./internal/ProviderContracts.js";
import type { Artifact as RootArtifact, StagesFor } from "./standalone/Artifact.js";
import type { BuildError, ToolNotFound, ToolProbeFailed } from "./standalone/BuildError.js";
import { InvalidDriverOptions, ToolFailed } from "./standalone/BuildError.js";
import { makeCompileExecutable, makeCompileExecutableMatrix } from "./standalone/CompileExecutable.js";
import type {
  CompileExecutableMatrixInput as CommonMatrixInput,
  MatrixErrorFor as CommonMatrixErrorFor,
} from "./standalone/CompileExecutableMatrix.js";
import type { CompileExecutableInput as CommonInput } from "./standalone/Driver.js";
import type { CandidateProducer } from "./standalone/internal/CompilerAdapter.js";
import { makeCompilerService } from "./standalone/internal/CompilerEngine.js";
import { ChildProcessSpawner as CoreChildProcessSpawner, runProcess } from "./standalone/internal/Process.js";
import { makeProviderTargetTable } from "./standalone/internal/TargetTable.js";
import { discoverTool } from "./standalone/internal/ToolDiscovery.js";

export type ProviderName = ClosedProviderName;
export type ProviderTargets = ClosedProviderTargets;
export type TargetFor<Name extends ProviderName> = ClosedTargetFor<Name>;
export type CommandProviderName = Exclude<ProviderName, "node-sea">;

export interface LayerOptions {
  readonly executable?: string;
}

export type Validation<A> =
  | { readonly _tag: "Valid"; readonly value: A }
  | { readonly _tag: "Invalid"; readonly reason: string };

export interface CommandOutput {
  readonly text: string;
  readonly truncated: boolean;
}

export interface CommandCompletion {
  readonly exitCode: number;
  readonly stdout: CommandOutput;
  readonly stderr: CommandOutput;
}

export type ExecuteCommand = (
  executable: string,
  argv: readonly string[],
  cwd?: string,
) => Effect.Effect<CommandCompletion, PlatformError.PlatformError>;

export interface Diagnostic {
  readonly channel: "stdout" | "stderr";
  readonly text: string;
  readonly truncated: boolean;
}

export interface PreparedCommandInput<Validated, Target extends string> {
  readonly entrypoint: string;
  readonly target?: Target;
  readonly options: Validated;
}

export interface ComposedCandidateInput<Validated, Target extends string> {
  readonly entrypoint: string;
  readonly target?: Target;
  readonly options: Validated;
  readonly stagedOutfile: string;
  readonly resolvedDestination: string;
  readonly cwd?: string;
}

export type CompileExecutableInput<
  Options,
  Target extends import("./standalone/Target.js").Target,
> = CommonInput<Options, Target>;

export type CompileExecutableMatrixInput<
  Target extends import("./standalone/Target.js").Target,
  Options,
> = CommonMatrixInput<Target, Options>;

export type ProviderArtifact<
  Name extends ProviderName,
  Target extends import("./standalone/Target.js").Target = TargetFor<Name>,
> = [Target] extends [TargetFor<Name>]
  ? Omit<Extract<RootArtifact, { readonly provider: Name }>, "target"> & { readonly target: Target }
  : never;

export type MatrixErrorFor<
  Name extends ProviderName,
  Target extends import("./standalone/Target.js").Target = TargetFor<Name>,
> = [Target] extends [TargetFor<Name>] ? CommonMatrixErrorFor<Name, Target> : never;

export type { BuildError, ToolNotFound, ToolProbeFailed } from "./standalone/BuildError.js";

export type ProviderLayerRequirements =
  | EffectChildProcessSpawner.ChildProcessSpawner
  | FileSystem.FileSystem
  | Path.Path
  | Crypto.Crypto;

export type ComposedProviderRequirements = FileSystem.FileSystem | Path.Path;

export interface CompilerService<
  Name extends ProviderName,
  Options,
> {
  readonly compileExecutable: (
    input: CompileExecutableInput<Options, TargetFor<Name>>,
  ) => Effect.Effect<ProviderArtifact<Name, TargetFor<Name>>, BuildError, never>;
  readonly compileExecutableMatrix: (
    input: CompileExecutableMatrixInput<TargetFor<Name>, Options>,
  ) => Effect.Effect<
    readonly ProviderArtifact<Name, TargetFor<Name>>[],
    MatrixErrorFor<Name, TargetFor<Name>>,
    never
  >;
}

interface CommonDefinition<Self, Name extends ProviderName, Options, Validated> {
  readonly name: Name;
  readonly service: Context.Service<Self, CompilerService<Name, Options>>;
  readonly defaultTarget?: TargetFor<Name>;
  readonly targetTokens: Readonly<Record<TargetFor<Name>, string>>;
  readonly validateOptions: (input: unknown) => Validation<Validated>;
}

export interface CommandDefinition<
  Self,
  Name extends CommandProviderName,
  Options,
  Validated,
> extends CommonDefinition<Self, Name, Options, Validated> {
  readonly kind: "command";
  readonly probeArgv: readonly string[];
  readonly renderArgv: (context: {
    readonly input: PreparedCommandInput<Validated, TargetFor<Name>>;
    readonly nativeTarget?: string;
    readonly stagedOutfile: string;
  }) => readonly string[];
  readonly interpretFailure: (completion: CommandCompletion) => readonly Diagnostic[];
}

export interface ComposedProducer<Name extends ProviderName, Validated> {
  readonly produceCandidate: (
    input: ComposedCandidateInput<Validated, TargetFor<Name>>,
  ) => Effect.Effect<StagesFor<Name>, ToolFailed>;
}

export interface ComposedDefinition<Self, Options, Validated>
  extends CommonDefinition<Self, "node-sea", Options, Validated>
{
  readonly kind: "composed";
  readonly makeProducer: (
    options: LayerOptions,
    execute: ExecuteCommand,
  ) => Effect.Effect<
    ComposedProducer<"node-sea", Validated>,
    ToolNotFound | ToolProbeFailed,
    ComposedProviderRequirements
  >;
}

export type Definition<Self, Name extends ProviderName, Options, Validated> = Name extends "node-sea"
  ? ComposedDefinition<Self, Options, Validated>
  : CommandDefinition<Self, Extract<Name, CommandProviderName>, Options, Validated>;

export interface Defined<Self, Name extends ProviderName, Options> {
  readonly Target: Schema.Literals<readonly [TargetFor<Name>, ...TargetFor<Name>[]]>;
  readonly compileExecutable: (
    input: CompileExecutableInput<Options, TargetFor<Name>>,
  ) => Effect.Effect<ProviderArtifact<Name, TargetFor<Name>>, BuildError, Self>;
  readonly compileExecutableMatrix: (
    input: CompileExecutableMatrixInput<TargetFor<Name>, Options>,
  ) => Effect.Effect<
    readonly ProviderArtifact<Name, TargetFor<Name>>[],
    MatrixErrorFor<Name, TargetFor<Name>>,
    Self
  >;
  readonly layer: (
    options?: LayerOptions,
  ) => Layer.Layer<Self, ToolNotFound | ToolProbeFailed, ProviderLayerRequirements>;
}

export function define<Self, const Name extends CommandProviderName, Options, Validated>(
  definition: CommandDefinition<Self, Name, Options, Validated>,
): Defined<Self, Name, Options>;
export function define<Self, Options, Validated>(
  definition: ComposedDefinition<Self, Options, Validated>,
): Defined<Self, "node-sea", Options>;
export function define<Self, const Name extends ProviderName, Options, Validated>(
  definition: Definition<Self, Name, Options, Validated>,
): Defined<Self, Name, Options> {
  const common = definition as unknown as CommonDefinition<Self, Name, Options, Validated>;
  const service = common.service as Context.Service<Self, CompilerService<Name, Options>>;
  const targetTable = makeProviderTargetTable<Name>(
    common.name,
    common.targetTokens as Readonly<Record<TargetFor<Name>, string>>,
  );
  const adapter = {
    toolName: common.name,
    targetTable,
    ...(common.defaultTarget === undefined ? {} : { defaultTarget: common.defaultTarget }),
    validateOptions: (input: unknown) => {
      const validation = common.validateOptions(input);
      return validation._tag === "Valid"
        ? validation
        : {
          _tag: "Invalid" as const,
          error: new InvalidDriverOptions({ tool: common.name, reason: validation.reason }),
        };
    },
  };

  const compileExecutable = makeCompileExecutable(service);
  const compileExecutableMatrix = makeCompileExecutableMatrix(service);
  const layer = (
    options: LayerOptions = {},
  ): Layer.Layer<Self, ToolNotFound | ToolProbeFailed, ProviderLayerRequirements> =>
    Layer.effect(
      service,
      Effect.gen(function*() {
        if (definition.kind === "command") {
          const command = definition as unknown as CommandDefinition<
            Self,
            Extract<Name, CommandProviderName>,
            Options,
            Validated
          >;
          const tool = yield* discoverTool(
            { toolName: command.name, probeArgv: command.probeArgv },
            options.executable,
          );
          const commandAdapter = {
            ...adapter,
            renderArgv: (
              request: import("./standalone/internal/CompilerAdapter.js").PreparedExecutableRequest<
                Validated,
                TargetFor<Name>
              >,
            ) =>
              command.renderArgv({
                input: {
                  entrypoint: request.entrypoint,
                  ...(request.target === undefined ? {} : { target: request.target }),
                  options: request.options,
                } as PreparedCommandInput<Validated, TargetFor<Extract<Name, CommandProviderName>>>,
                ...(request.target === undefined ? {} : { nativeTarget: targetTable.nativeToken(request.target) }),
                stagedOutfile: request.stagedOutfile,
              }),
            interpretFailure: (completion: CommandCompletion) =>
              new ToolFailed({
                tool: common.name,
                exitCode: completion.exitCode,
                diagnostics: [...command.interpretFailure(completion)],
              }),
          };
          return yield* makeCompilerService(commandAdapter, tool);
        }
        const composedDefinition = definition as ComposedDefinition<Self, Options, Validated>;
        const spawner = yield* CoreChildProcessSpawner;
        const execute: ExecuteCommand = (executable, argv, cwd) =>
          runProcess(executable, argv, cwd).pipe(Effect.provideService(CoreChildProcessSpawner, spawner));
        const composed = yield* composedDefinition.makeProducer(options, execute);
        const producer: CandidateProducer<Name, TargetFor<Name>, Validated> = {
          produceCandidate: (request) =>
            composed.produceCandidate(
              request as unknown as ComposedCandidateInput<Validated, "linux-x64-gnu">,
            ) as unknown as ReturnType<CandidateProducer<Name, TargetFor<Name>, Validated>["produceCandidate"]>,
        };
        return yield* makeCompilerService(adapter, producer);
      }),
    );

  return Object.freeze({ Target: targetTable.Target, compileExecutable, compileExecutableMatrix, layer });
}
