import { Context, Effect, Layer, Result, Schema } from "effect";
import type { Crypto, FileSystem, Path, PlatformError } from "effect";
import { ChildProcessSpawner as EffectChildProcessSpawner } from "effect/unstable/process";
import { type CommandCompletion, executeCommand } from "./Integration.js";
import type { ExecutableArtifact, FileArtifact, StageObservation, ToolObservation } from "./standalone/Artifact.js";
import { ExecutableArtifact as ExecutableArtifactSchema } from "./standalone/Artifact.js";
import type { BuildError as CoreBuildError, Diagnostic } from "./standalone/BuildError.js";
import { InvalidDriverOptions, ToolFailed, type ToolNotFound, type ToolProbeFailed } from "./standalone/BuildError.js";
import type { CompileExecutableMatrixInput as CommonMatrixInput } from "./standalone/CompileExecutableMatrix.js";
import type { CompileExecutableInput as CommonInput } from "./standalone/Driver.js";
import type { CommandCompilerAdapter } from "./standalone/internal/CompilerAdapter.js";
import { makeCompilerService } from "./standalone/internal/CompilerEngine.js";
import { makeTargetTable, type TargetEntries } from "./standalone/internal/TargetTable.js";
import { discoverTool } from "./standalone/internal/ToolDiscovery.js";
import { InvalidMatrixInput, MatrixFailed } from "./standalone/MatrixError.js";
import type { SystemTarget } from "./standalone/Target.js";

type NonEmptyProviderName<Name extends string> = Name extends "" ? never : Name;

export interface LayerOptions {
  readonly executable?: string;
}

export interface PreparedCommandInput<Validated, Target extends SystemTarget> {
  readonly entrypoint: string;
  readonly target?: Target;
  readonly options: Validated;
}

export type CompileExecutableInput<Options, Target extends SystemTarget> = CommonInput<Options, Target>;

export type CompileExecutableMatrixInput<Target extends SystemTarget, Options> = CommonMatrixInput<Target, Options>;

export type ProviderStage<Name extends string> = StageObservation & {
  readonly tool: ToolObservation & { readonly name: Name };
};

export type ProviderStages<Name extends string> = readonly [ProviderStage<Name>];

export type ProviderArtifact<
  Name extends string,
  Target extends SystemTarget,
  Stages extends ProviderStages<Name>,
> = Readonly<
  ExecutableArtifact & {
    readonly provider: Name;
    readonly target: Target;
    readonly stages: Stages;
  }
>;

type NarrowToolError<Error, Name extends string> = Error extends { readonly tool: string }
  ? Error & { readonly tool: Name }
  : Error;

type BuildErrorFor<Name extends string> = NarrowToolError<CoreBuildError, Name>;

export type ProviderMatrixError<
  Name extends string,
  Target extends SystemTarget,
  Stages extends ProviderStages<Name>,
> =
  | InvalidMatrixInput
  | (MatrixFailed & {
    readonly artifacts: readonly ProviderArtifact<Name, Target, Stages>[];
    readonly failures: readonly [
      {
        readonly provider: Name;
        readonly target: Target;
        readonly path: string;
        readonly error: BuildErrorFor<Name>;
      },
      ...Array<{
        readonly provider: Name;
        readonly target: Target;
        readonly path: string;
        readonly error: BuildErrorFor<Name>;
      }>,
    ];
  });

export interface CompilerService<
  Name extends string,
  Options,
  Target extends SystemTarget,
  Stages extends ProviderStages<Name>,
> {
  readonly compileExecutable: (
    input: CompileExecutableInput<Options, Target>,
  ) => Effect.Effect<ProviderArtifact<Name, Target, Stages>, CoreBuildError>;
  readonly compileExecutableMatrix: (
    input: CompileExecutableMatrixInput<Target, Options>,
  ) => Effect.Effect<readonly ProviderArtifact<Name, Target, Stages>[], ProviderMatrixError<Name, Target, Stages>>;
}

export interface BoundCommand<Name extends string> {
  readonly tool: {
    readonly name: Name;
    readonly version: string;
    readonly path: FileArtifact["path"];
  };
  readonly execute: (
    argv: readonly string[],
    cwd?: string,
  ) => Effect.Effect<CommandCompletion, PlatformError.PlatformError>;
}

export interface CommandServiceContext<
  Name extends string,
  Options,
  Target extends SystemTarget,
  Stages extends ProviderStages<Name>,
> extends CompilerService<Name, Options, Target, Stages> {
  readonly command: BoundCommand<Name>;
}

export interface CommandDefinition<
  Self,
  Name extends string,
  Entries extends TargetEntries,
  Stages extends ProviderStages<Name>,
  Options,
  Validated,
  Service extends CompilerService<Name, Options, Entries[number][0], Stages>,
> {
  readonly name: NonEmptyProviderName<Name>;
  readonly service: Context.Service<Self, Service>;
  readonly makeService: (
    context: CommandServiceContext<Name, Options, Entries[number][0], Stages>,
  ) => Service;
  readonly targetEntries: Entries;
  readonly Stages: Schema.ConstraintDecoder<Stages, never>;
  readonly defaultTarget?: Entries[number][0];
  readonly validateOptions: (input: unknown) => Result.Result<Validated, string>;
  readonly probeArgv: readonly string[];
  readonly renderArgv: (context: {
    readonly input: PreparedCommandInput<Validated, Entries[number][0]>;
    readonly nativeTarget?: string;
    readonly stagedOutfile: string;
  }) => readonly string[];
  readonly interpretFailure: (completion: CommandCompletion) => readonly Diagnostic[];
}

type TargetsOf<Entries extends TargetEntries> = {
  readonly [Index in keyof Entries]: Entries[Index] extends readonly [infer Target extends SystemTarget, string]
    ? Target
    : never;
};

export interface Defined<
  Self,
  Name extends string,
  Entries extends TargetEntries,
  Stages extends ProviderStages<Name>,
  Options,
> {
  readonly Target: Schema.Literals<TargetsOf<Entries>>;
  readonly Artifact: Schema.Schema<ProviderArtifact<Name, Entries[number][0], Stages>>;
  readonly MatrixError: Schema.Schema<ProviderMatrixError<Name, Entries[number][0], Stages>>;
  readonly compileExecutable: (
    input: CompileExecutableInput<Options, Entries[number][0]>,
  ) => Effect.Effect<ProviderArtifact<Name, Entries[number][0], Stages>, CoreBuildError, Self>;
  readonly compileExecutableMatrix: (
    input: CompileExecutableMatrixInput<Entries[number][0], Options>,
  ) => Effect.Effect<
    readonly ProviderArtifact<Name, Entries[number][0], Stages>[],
    ProviderMatrixError<Name, Entries[number][0], Stages>,
    Self
  >;
  readonly layer: (
    options?: LayerOptions,
  ) => Layer.Layer<Self, ToolNotFound | ToolProbeFailed, ProviderLayerRequirements>;
}

export type BuildError = CoreBuildError;
export type { ToolNotFound, ToolProbeFailed } from "./standalone/BuildError.js";

export type ProviderLayerRequirements =
  | EffectChildProcessSpawner.ChildProcessSpawner
  | FileSystem.FileSystem
  | Path.Path
  | Crypto.Crypto;

const authorError = (message: string): never => {
  throw new Error(message);
};

const freezeStages = <Stages extends readonly StageObservation[]>(stages: readonly StageObservation[]): Stages =>
  Object.freeze(stages.map((stage) => Object.freeze({ ...stage, tool: Object.freeze({ ...stage.tool }) }))) as Stages;

const captureAdditionalServiceEffects = <
  Name extends string,
  Options,
  Target extends SystemTarget,
  Stages extends ProviderStages<Name>,
  Service extends CompilerService<Name, Options, Target, Stages>,
>(
  service: Service,
  platform: Context.Context<ProviderLayerRequirements>,
): Service => {
  const captured: Record<PropertyKey, unknown> = {};
  for (const key of Reflect.ownKeys(service)) {
    const value = service[key as keyof Service];
    captured[key] = key === "compileExecutable" || key === "compileExecutableMatrix" || typeof value !== "function"
      ? value
      : (...args: readonly unknown[]) =>
        Effect.provide(
          Reflect.apply(
            value as (...args: readonly unknown[]) => Effect.Effect<unknown, unknown, unknown>,
            service,
            args,
          ),
          platform,
        );
  }
  return Object.freeze(captured) as Service;
};

export const define = <
  Self,
  const Name extends string,
  const Entries extends TargetEntries,
  Stages extends ProviderStages<Name>,
  Options,
  Validated,
  Service extends CompilerService<Name, Options, Entries[number][0], Stages>,
>(
  definition: CommandDefinition<Self, Name, Entries, Stages, Options, Validated, Service>,
): Defined<Self, Name, Entries, Stages, Options> => {
  if (!Schema.is(Schema.NonEmptyString)(definition.name)) {
    return authorError("provider name must be non-empty");
  }
  const targetTable = makeTargetTable(definition.targetEntries);
  if (definition.defaultTarget !== undefined && !targetTable.isTarget(definition.defaultTarget)) {
    return authorError("provider default target must appear in targetEntries");
  }
  const name = definition.name as Name;
  const Artifact = Schema.Struct({
    ...ExecutableArtifactSchema.fields,
    provider: Schema.Literal(name),
    target: targetTable.Target,
    stages: definition.Stages,
  }) as unknown as Schema.Schema<ProviderArtifact<Name, Entries[number][0], Stages>>;
  const isArtifact = Schema.is(Artifact);
  type SpecificMatrixFailed = MatrixFailed & {
    readonly artifacts: readonly ProviderArtifact<Name, Entries[number][0], Stages>[];
    readonly failures: readonly [
      {
        readonly provider: Name;
        readonly target: Entries[number][0];
        readonly path: string;
        readonly error: BuildErrorFor<Name>;
      },
      ...Array<{
        readonly provider: Name;
        readonly target: Entries[number][0];
        readonly path: string;
        readonly error: BuildErrorFor<Name>;
      }>,
    ];
  };
  const SpecificMatrixFailed = MatrixFailed.pipe(
    Schema.refine(
      (value): value is SpecificMatrixFailed =>
        value.artifacts.every(isArtifact)
        && value.failures.every((failure) =>
          failure.provider === name
          && targetTable.isTarget(failure.target)
          && (!("tool" in failure.error) || failure.error.tool === name)
        ),
      { message: `matrix values must belong to ${name}` },
    ),
  );
  const MatrixError = Schema.Union([InvalidMatrixInput, SpecificMatrixFailed]) as unknown as Schema.Schema<
    ProviderMatrixError<Name, Entries[number][0], Stages>
  >;

  const decodeStages = (input: unknown): Result.Result<Stages, ToolFailed> =>
    Result.flatMap(
      Result.mapError(
        Schema.decodeUnknownResult(definition.Stages, { onExcessProperty: "error" })(input),
        () =>
          new ToolFailed({
            tool: name,
            exitCode: 1,
            diagnostics: [{ channel: "stderr", text: `invalid ${name} stage tuple`, truncated: false }],
          }),
      ),
      (stages) =>
        stages.length === 1 && stages[0].tool.name === name
          ? Result.succeed(freezeStages<Stages>(stages))
          : Result.fail(
            new ToolFailed({
              tool: name,
              exitCode: 1,
              diagnostics: [{ channel: "stderr", text: `invalid ${name} stage tuple`, truncated: false }],
            }),
          ),
    );

  const adapter: CommandCompilerAdapter<Name, Entries[number][0], Stages, Validated> = {
    toolName: name,
    targetTable,
    ...(definition.defaultTarget === undefined ? {} : { defaultTarget: definition.defaultTarget }),
    validateOptions: (input: unknown) =>
      Result.match(definition.validateOptions(input), {
        onFailure: (reason) => ({
          _tag: "Invalid" as const,
          error: new InvalidDriverOptions({ tool: name, reason }),
        }),
        onSuccess: (value) => ({ _tag: "Valid" as const, value }),
      }),
    renderArgv: (
      request: import("./standalone/internal/CompilerAdapter.js").PreparedExecutableRequest<
        Validated,
        Entries[number][0]
      >,
    ) =>
      definition.renderArgv({
        input: {
          entrypoint: request.entrypoint,
          ...(request.target === undefined ? {} : { target: request.target }),
          options: request.options,
        },
        ...(request.target === undefined ? {} : { nativeTarget: targetTable.nativeToken(request.target) }),
        stagedOutfile: request.stagedOutfile,
      }),
    interpretFailure: (completion: CommandCompletion) =>
      new ToolFailed({
        tool: name,
        exitCode: completion.exitCode,
        diagnostics: [...definition.interpretFailure(completion)],
      }),
    decodeStages,
  };

  const service = definition.service;
  const compileExecutable: Defined<Self, Name, Entries, Stages, Options>["compileExecutable"] = (input) =>
    service.use((implementation) => implementation.compileExecutable(input));
  const compileExecutableMatrix: Defined<Self, Name, Entries, Stages, Options>["compileExecutableMatrix"] = (input) =>
    service.use((implementation) => implementation.compileExecutableMatrix(input));
  const layer = (
    options: LayerOptions = {},
  ): Layer.Layer<Self, ToolNotFound | ToolProbeFailed, ProviderLayerRequirements> =>
    Layer.effect(
      service,
      Effect.gen(function*() {
        const tool = yield* discoverTool(
          { toolName: name, probeArgv: definition.probeArgv },
          options.executable,
        );
        const platform = yield* Effect.context<ProviderLayerRequirements>();
        const spawner = yield* EffectChildProcessSpawner.ChildProcessSpawner;
        const compiler = yield* makeCompilerService<Options, Name, Entries[number][0], Stages, Validated>(
          adapter,
          tool,
        );
        const command: BoundCommand<Name> = Object.freeze({
          tool: Object.freeze(tool.artifactTool),
          execute: (argv: readonly string[], cwd?: string) =>
            executeCommand(tool.artifactTool.path, argv, cwd).pipe(
              Effect.provideService(EffectChildProcessSpawner.ChildProcessSpawner, spawner),
            ),
        });
        return captureAdditionalServiceEffects<Name, Options, Entries[number][0], Stages, Service>(
          definition.makeService(Object.freeze({ ...compiler, command })),
          platform,
        );
      }),
    );

  return Object.freeze({
    Target: targetTable.Target as Schema.Literals<TargetsOf<Entries>>,
    Artifact,
    MatrixError,
    compileExecutable,
    compileExecutableMatrix,
    layer,
  });
};
