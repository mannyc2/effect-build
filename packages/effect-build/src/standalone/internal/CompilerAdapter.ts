import { Schema } from "effect";
import { type TargetFor, targetsFor } from "../../internal/ProviderContracts.js";
import { Artifact, type ArtifactFor, type StagesFor, type ToolName } from "../Artifact.js";
import type {
  InvalidDriverOptions,
  OutputInvalid,
  OutputLocked,
  OutputMissing,
  PublicationFailed,
  ToolFailed,
} from "../BuildError.js";
import type { Target } from "../Target.js";
import type { ProcessCompletion } from "./Process.js";
import type { OperatingSystem } from "./TargetCatalog.js";
import type { TargetTable } from "./TargetTable.js";

export type ProviderArtifact<Name extends ToolName, SupportedTarget extends Target> = [SupportedTarget] extends
  [TargetFor<Name>] ? Omit<ArtifactFor<Name>, "target"> & { readonly target: SupportedTarget }
  : never;

export type OptionsValidation<ValidatedOptions> =
  | { readonly _tag: "Valid"; readonly value: ValidatedOptions }
  | { readonly _tag: "Invalid"; readonly error: InvalidDriverOptions };

export type CellExecutionError = ToolFailed | OutputMissing | OutputInvalid | OutputLocked | PublicationFailed;

const decodeArtifact = Schema.decodeUnknownSync(Artifact, { onExcessProperty: "error" });

export const decodeStagesFor = <Name extends ToolName>(
  provider: Name,
  input: unknown,
): StagesFor<Name> => {
  try {
    const decoded = decodeArtifact({
      path: "/effect-build-stage-validation",
      bytes: 0,
      provider,
      target: targetsFor(provider)[0],
      stages: input,
    });
    return Object.freeze(
      decoded.stages.map((stage) => Object.freeze({ ...stage, tool: Object.freeze({ ...stage.tool }) })),
    ) as unknown as StagesFor<Name>;
  } catch (cause) {
    throw new Error(`invalid ${provider} stage tuple`, { cause });
  }
};

export interface PreparedExecutableRequest<ValidatedOptions, SupportedTarget extends Target> {
  readonly entrypoint: string;
  readonly target?: SupportedTarget;
  readonly options: ValidatedOptions;
  readonly stagedOutfile: string;
  readonly resolvedDestination: string;
  readonly cwd?: string;
}

export interface CandidateProducer<
  Name extends ToolName,
  SupportedTarget extends Target,
  ValidatedOptions,
> {
  readonly hostOs?: OperatingSystem;
  readonly produceCandidate: (
    request: PreparedExecutableRequest<ValidatedOptions, SupportedTarget>,
  ) => import("effect").Effect.Effect<StagesFor<Name>, CellExecutionError>;
}

export interface DiscoveredCompiler<Name extends ToolName> {
  readonly artifactTool: {
    readonly name: Name;
    readonly version: string;
    readonly path: string;
  };
  readonly hostOs: OperatingSystem;
}

export interface CompilerAdapter<
  Options,
  Name extends ToolName = ToolName,
  SupportedTarget extends Target = Target,
  ValidatedOptions = Options,
> {
  readonly toolName: Name;
  readonly targetTable: TargetTable<SupportedTarget>;
  readonly defaultTarget?: SupportedTarget;
  readonly validateOptions: (options: unknown) => OptionsValidation<ValidatedOptions>;
}

export interface CommandCompilerAdapter<
  Options,
  Name extends ToolName = ToolName,
  SupportedTarget extends Target = Target,
  ValidatedOptions = Options,
> extends CompilerAdapter<Options, Name, SupportedTarget, ValidatedOptions> {
  readonly renderArgv: (
    request: PreparedExecutableRequest<ValidatedOptions, SupportedTarget>,
  ) => readonly string[];
  readonly interpretFailure: (completion: ProcessCompletion) => ToolFailed;
}
