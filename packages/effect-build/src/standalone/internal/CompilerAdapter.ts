import type { Result } from "effect";
import type { CommandCompletion } from "../../Integration.js";
import type { ExecutableArtifact, StageObservation } from "../Artifact.js";
import type {
  InvalidDriverOptions,
  OutputInvalid,
  OutputLocked,
  OutputMissing,
  PublicationFailed,
  ToolFailed,
} from "../BuildError.js";
import type { SystemTarget } from "../Target.js";
import type { TargetTable } from "./TargetTable.js";

export type { DiscoveredCompiler } from "./ToolDiscovery.js";

export type ProviderStages<Name extends string> = readonly [
  StageObservation & { readonly tool: StageObservation["tool"] & { readonly name: Name } },
];

export type ProviderArtifact<
  Name extends string,
  SupportedTarget extends SystemTarget,
  Stages extends ProviderStages<Name>,
> = Readonly<
  ExecutableArtifact & {
    readonly provider: Name;
    readonly target: SupportedTarget;
    readonly stages: Stages;
  }
>;

export type OptionsValidation<ValidatedOptions> =
  | { readonly _tag: "Valid"; readonly value: ValidatedOptions }
  | { readonly _tag: "Invalid"; readonly error: InvalidDriverOptions };

export type CellExecutionError = ToolFailed | OutputMissing | OutputInvalid | OutputLocked | PublicationFailed;

export interface PreparedExecutableRequest<ValidatedOptions, SupportedTarget extends SystemTarget> {
  readonly entrypoint: string;
  readonly target?: SupportedTarget;
  readonly options: ValidatedOptions;
  readonly stagedOutfile: string;
  readonly resolvedDestination: string;
  readonly cwd?: string;
}

export interface CommandCompilerAdapter<
  Name extends string,
  SupportedTarget extends SystemTarget,
  Stages extends ProviderStages<Name>,
  ValidatedOptions,
> {
  readonly toolName: Name;
  readonly targetTable: TargetTable<SupportedTarget>;
  readonly defaultTarget?: SupportedTarget;
  readonly validateOptions: (options: unknown) => OptionsValidation<ValidatedOptions>;
  readonly renderArgv: (
    request: PreparedExecutableRequest<ValidatedOptions, SupportedTarget>,
  ) => readonly string[];
  readonly interpretFailure: (completion: CommandCompletion) => ToolFailed;
  readonly decodeStages: (input: unknown) => Result.Result<Stages, ToolFailed>;
}
