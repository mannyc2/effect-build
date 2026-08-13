import type { Artifact, ToolName } from "../Artifact.js";
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

export type ProviderTool<Name extends ToolName> = Omit<Artifact["tool"], "name"> & {
  readonly name: Name;
};

export type ProviderArtifact<Name extends ToolName, SupportedTarget extends Target> =
  & Omit<Artifact, "target" | "tool">
  & {
    readonly target: SupportedTarget;
    readonly tool: ProviderTool<Name>;
  };

export interface DiscoveredCompiler<Name extends ToolName> {
  readonly artifactTool: ProviderTool<Name>;
  readonly hostOs: OperatingSystem;
}

export type OptionsValidation<ValidatedOptions> =
  | { readonly _tag: "Valid"; readonly value: ValidatedOptions }
  | { readonly _tag: "Invalid"; readonly error: InvalidDriverOptions };

export type CellExecutionError = ToolFailed | OutputMissing | OutputInvalid | OutputLocked | PublicationFailed;

export interface PreparedExecutableRequest<ValidatedOptions, SupportedTarget extends Target> {
  readonly entrypoint: string;
  readonly target?: SupportedTarget;
  readonly options: ValidatedOptions;
  readonly stagedOutfile: string;
}

/** The part of an adapter `discoverTool` needs: how to name the tool and how to ask it what it is. */
export interface ToolProbe<Name extends ToolName = ToolName> {
  readonly toolName: Name;
  /** Argv that makes the tool print `{path, version, hostOs}` as JSON on stdout. */
  readonly probeArgv: readonly string[];
}

export interface CompilerAdapter<
  Options,
  Name extends ToolName = ToolName,
  SupportedTarget extends Target = Target,
  ValidatedOptions = Options,
> extends ToolProbe<Name> {
  readonly targetTable: TargetTable<SupportedTarget>;
  readonly defaultTarget?: SupportedTarget;
  readonly validateOptions: (options: unknown) => OptionsValidation<ValidatedOptions>;
  readonly renderArgv: (
    request: PreparedExecutableRequest<ValidatedOptions, SupportedTarget>,
  ) => readonly string[];
  readonly interpretFailure: (completion: ProcessCompletion) => ToolFailed;
}
