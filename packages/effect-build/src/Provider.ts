import { Context, Effect, Layer, Schema } from "effect";
import type { Crypto, FileSystem, Path } from "effect";
import type { ChildProcessSpawner as EffectChildProcessSpawner } from "effect/unstable/process";
import type {
  ProviderName as ClosedProviderName,
  ProviderTargets as ClosedProviderTargets,
  TargetFor as ClosedTargetFor,
} from "./internal/ProviderContracts.js";
import type { Artifact as RootArtifact } from "./standalone/Artifact.js";
import type { BuildError, ToolNotFound, ToolProbeFailed } from "./standalone/BuildError.js";
import { InvalidDriverOptions, ToolFailed } from "./standalone/BuildError.js";
import { makeCompileExecutable, makeCompileExecutableMatrix } from "./standalone/CompileExecutable.js";
import type {
  CompileExecutableMatrixInput as CommonMatrixInput,
  MatrixErrorFor as CommonMatrixErrorFor,
} from "./standalone/CompileExecutableMatrix.js";
import type { CompileExecutableInput as CommonInput } from "./standalone/Driver.js";
import { makeCompilerService } from "./standalone/internal/CompilerEngine.js";
import type { ChildProcessSpawner } from "./standalone/internal/Process.js";
import { makeProviderTargetTable } from "./standalone/internal/TargetTable.js";
import { discoverTool } from "./standalone/internal/ToolDiscovery.js";

export type ProviderName = ClosedProviderName;
export type ProviderTargets = ClosedProviderTargets;
export type TargetFor<Name extends ProviderName> = ClosedTargetFor<Name>;

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

export interface Diagnostic {
  readonly channel: "stdout" | "stderr";
  readonly text: string;
  readonly truncated: boolean;
}

export interface PreparedCompileInput<Validated, Target extends string> {
  readonly entrypoint: string;
  readonly outfile: string;
  readonly cwd?: string;
  readonly target?: Target;
  readonly digest?: boolean;
  readonly options: Validated;
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
  Target extends import("./standalone/Target.js").Target,
> = Omit<RootArtifact, "target" | "tool"> & {
  readonly target: Target;
  readonly tool: {
    readonly name: Name;
    readonly version: string;
    readonly path: string;
  };
};

export type MatrixErrorFor<
  Name extends ProviderName,
  Target extends import("./standalone/Target.js").Target,
> = CommonMatrixErrorFor<Name, Target>;

export type { BuildError, ToolNotFound, ToolProbeFailed } from "./standalone/BuildError.js";

export type ProviderLayerRequirements =
  | EffectChildProcessSpawner.ChildProcessSpawner
  | FileSystem.FileSystem
  | Path.Path
  | Crypto.Crypto;

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

export interface Definition<
  Self,
  Name extends ProviderName,
  Options,
  Validated,
> {
  readonly name: Name;
  readonly service: Context.Service<Self, CompilerService<Name, Options>>;
  readonly probeArgv: readonly string[];
  readonly defaultTarget?: TargetFor<Name>;
  readonly targetTokens: Readonly<Record<TargetFor<Name>, string>>;
  readonly validateOptions: (input: unknown) => Validation<Validated>;
  readonly renderArgv: (context: {
    readonly input: PreparedCompileInput<Validated, TargetFor<Name>>;
    readonly nativeTarget?: string;
    readonly stagedOutfile: string;
  }) => readonly string[];
  readonly interpretFailure: (
    completion: CommandCompletion,
  ) => readonly Diagnostic[];
}

export interface Defined<
  Self,
  Name extends ProviderName,
  Options,
> {
  readonly Target: Schema.Literals<
    readonly [TargetFor<Name>, ...TargetFor<Name>[]]
  >;
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
  ) => Layer.Layer<
    Self,
    ToolNotFound | ToolProbeFailed,
    ProviderLayerRequirements
  >;
}

export const define = <
  Self,
  const Name extends ProviderName,
  Options,
  Validated,
>(
  definition: Definition<Self, Name, Options, Validated>,
): Defined<Self, Name, Options> => {
  const targetTable = makeProviderTargetTable(
    definition.name,
    definition.targetTokens,
  );
  const adapter = {
    toolName: definition.name,
    probeArgv: definition.probeArgv,
    targetTable,
    ...(definition.defaultTarget === undefined ? {} : { defaultTarget: definition.defaultTarget }),
    validateOptions: (input: unknown) => {
      const validation = definition.validateOptions(input);
      return validation._tag === "Valid"
        ? validation
        : {
          _tag: "Invalid" as const,
          error: new InvalidDriverOptions({
            tool: definition.name,
            reason: validation.reason,
          }),
        };
    },
    renderArgv: (context: {
      readonly input: PreparedCompileInput<Validated, TargetFor<Name>>;
      readonly stagedOutfile: string;
    }) =>
      definition.renderArgv({
        input: context.input,
        ...(context.input.target === undefined
          ? {}
          : { nativeTarget: targetTable.nativeToken(context.input.target) }),
        stagedOutfile: context.stagedOutfile,
      }),
    interpretFailure: (completion: CommandCompletion) =>
      new ToolFailed({
        tool: definition.name,
        exitCode: completion.exitCode,
        diagnostics: [...definition.interpretFailure(completion)],
      }),
  };

  const compileExecutable = makeCompileExecutable(definition.service);
  const compileExecutableMatrix = makeCompileExecutableMatrix(definition.service);
  const layer = (
    options: LayerOptions = {},
  ): Layer.Layer<
    Self,
    ToolNotFound | ToolProbeFailed,
    ChildProcessSpawner | FileSystem.FileSystem | Path.Path | Crypto.Crypto
  > =>
    Layer.effect(
      definition.service,
      Effect.gen(function*() {
        const tool = yield* discoverTool(adapter, options.executable);
        return yield* makeCompilerService(adapter, tool);
      }),
    );

  return Object.freeze({
    Target: targetTable.Target,
    compileExecutable,
    compileExecutableMatrix,
    layer,
  });
};
