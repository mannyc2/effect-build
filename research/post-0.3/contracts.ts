import { Effect } from "effect";
import type { Layer, Scope } from "effect";
import type { CompatibilitySuccess } from "./compatibility.js";

export * from "./compatibility.js";

export const NodeMainProgramProtocol: "effect-build/profile/node-main-program@1" =
  "effect-build/profile/node-main-program@1";
export const NodeMainExecutableProtocol: "effect-build/profile/node-main-executable@1" =
  "effect-build/profile/node-main-executable@1";
export const BrowserModuleApplicationProtocol: "effect-build/profile/browser-module-application@1" =
  "effect-build/profile/browser-module-application@1";

export type ProfileProtocol =
  | typeof NodeMainProgramProtocol
  | typeof NodeMainExecutableProtocol
  | typeof BrowserModuleApplicationProtocol;

export interface ProviderPackageObservation {
  readonly name: string;
  readonly version: string;
}

export interface ToolObservation {
  readonly name: string;
  readonly version: string;
  readonly canonicalPath?: string;
  readonly compatibility: CompatibilitySuccess;
}

export interface BuildStepObservation {
  readonly operation: string;
  readonly providerPackage: ProviderPackageObservation;
  readonly profileProtocol: ProfileProtocol;
  readonly tool?: ToolObservation;
}

export interface ProfileProtocolUnsupported {
  readonly _tag: "ProfileProtocolUnsupported";
  readonly profile: "NodeMainProgram" | "NodeMainExecutable" | "BrowserModuleApplication";
  readonly expected: ProfileProtocol;
  readonly observed: string;
  readonly providerPackage: ProviderPackageObservation;
}

export const validateProfileProtocol = (
  profile: ProfileProtocolUnsupported["profile"],
  expected: ProfileProtocol,
  observed: string,
  providerPackage: ProviderPackageObservation,
): Effect.Effect<void, ProfileProtocolUnsupported> =>
  observed === expected
    ? Effect.succeed(undefined)
    : Effect.fail({
      _tag: "ProfileProtocolUnsupported",
      profile,
      expected,
      observed,
      providerPackage,
    });

export interface NodeRuntimeTarget {
  readonly runtime: "node";
  readonly version: string;
  readonly moduleResolution: "node";
}

export interface NodeSyntaxCompatibility {
  readonly minimumNodeVersion: string;
  readonly testedNodeVersions: readonly [string, ...string[]];
  readonly topLevelAwait: "supported" | "not-applicable";
  readonly dynamicImport: "supported";
  readonly jsonModules: "bundled" | "commonjs-require" | "import-attributes";
}

export interface NodeImportObservation {
  readonly kind: "static-import" | "dynamic-import" | "require" | "json";
  readonly specifier: string | null;
  readonly disposition:
    | "bundled"
    | "builtin"
    | "package-external"
    | "unresolved-external"
    | "json-bundled"
    | "json-external";
}

export interface NodeMainIdentity {
  readonly algorithm: "sha256";
  readonly digest: `sha256:${string}`;
  readonly bytes: number;
}

export interface NodeMainSnapshot extends NodeMainIdentity {
  readonly contents: Uint8Array;
}

export interface NodeMainAcquisitionFailed {
  readonly _tag: "NodeMainAcquisitionFailed";
  readonly operation: "acquire" | "read" | "authenticate";
  readonly reason: string;
}

export interface NodeMainContentAuthority {
  readonly lifetime: "borrowed";
  readonly identity: NodeMainIdentity;
  readonly acquire: Effect.Effect<NodeMainSnapshot, NodeMainAcquisitionFailed>;
}

export interface NodeMain {
  readonly _tag: "NodeMain";
  readonly profileProtocol: typeof NodeMainProgramProtocol;
  readonly providerPackage: ProviderPackageObservation;
  readonly content: NodeMainContentAuthority;
  readonly moduleFormat: "esm" | "commonjs";
  readonly runtimeTarget: NodeRuntimeTarget;
  readonly syntaxCompatibility: NodeSyntaxCompatibility;
  readonly imports: readonly NodeImportObservation[];
  readonly observations: readonly BuildStepObservation[];
}

export interface NodeMainProgramRequest {
  readonly entrypoint: string;
  readonly cwd?: string;
  readonly moduleFormat: "esm" | "commonjs";
  readonly runtimeTarget: NodeRuntimeTarget;
  readonly minify: boolean;
  readonly sourceMap: "none" | "linked" | "inline";
}

export interface NodeMainProgramService<Failure, Requirements = never> {
  readonly profile: "NodeMainProgram";
  readonly protocol: string;
  readonly providerPackage: ProviderPackageObservation;
  readonly withMain: <A, E, R>(
    request: NodeMainProgramRequest,
    use: (main: NodeMain) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<
    A,
    Failure | ProfileProtocolUnsupported | E,
    Requirements | Exclude<R, Scope.Scope>
  >;
}

export interface NodeTargetMismatch {
  readonly _tag: "NodeTargetMismatch";
  readonly produced: NodeRuntimeTarget;
  readonly requested: NodeRuntimeTarget;
}

export interface NodeMainIdentityMismatch {
  readonly _tag: "NodeMainIdentityMismatch";
  readonly expected: NodeMainIdentity;
  readonly observed: NodeMainIdentity;
}

export interface NodeExternalImportUnsupported {
  readonly _tag: "NodeExternalImportUnsupported";
  readonly imports: readonly [NodeImportObservation, ...NodeImportObservation[]];
}

export interface PublicationInterruptedBeforeCommit {
  readonly _tag: "PublicationInterruptedBeforeCommit";
  readonly destination: string;
}

export interface ExecutableArtifact {
  readonly _tag: "ExecutableArtifact";
  readonly path: string;
  readonly bytes: number;
  readonly digest?: `sha256:${string}`;
  readonly runtime: NodeRuntimeTarget;
  readonly observations: readonly BuildStepObservation[];
  readonly publication: {
    readonly commitPoint: "atomic-file-replacement";
    readonly committed: true;
  };
}

export interface PublicationInterruptedAfterCommit {
  readonly _tag: "PublicationInterruptedAfterCommit";
  readonly artifact: ExecutableArtifact;
}

export type NodeMainExecutableContractFailure =
  | ProfileProtocolUnsupported
  | NodeMainAcquisitionFailed
  | NodeTargetMismatch
  | NodeMainIdentityMismatch
  | NodeExternalImportUnsupported
  | PublicationInterruptedBeforeCommit
  | PublicationInterruptedAfterCommit;

export interface NodeMainExecutableRequest {
  readonly main: NodeMain;
  readonly destination: string;
  readonly runtimeTarget: NodeRuntimeTarget;
  readonly acquisition: "bytes" | "private-file";
  readonly digest: boolean;
}

export interface NodeMainExecutableService<Failure, Requirements = never> {
  readonly profile: "NodeMainExecutable";
  readonly protocol: string;
  readonly providerPackage: ProviderPackageObservation;
  readonly assemble: (
    request: NodeMainExecutableRequest,
  ) => Effect.Effect<
    ExecutableArtifact,
    Failure | NodeMainExecutableContractFailure,
    Requirements
  >;
}

export interface BrowserModuleApplicationRequest {
  readonly entryHtml: readonly [string, ...string[]];
  readonly cwd?: string;
  readonly minify: boolean;
  readonly sourceMap: "none" | "linked";
}

export interface BrowserResourceObservation {
  readonly path: string;
  readonly kind: "html" | "javascript" | "css" | "image" | "font" | "source-map" | "other";
  readonly bytes: number;
  readonly digest: `sha256:${string}`;
  readonly references: readonly string[];
}

export interface BrowserModuleApplicationSnapshot {
  readonly entryHtml: readonly [string, ...string[]];
  readonly resources: readonly BrowserResourceObservation[];
}

export interface BrowserModuleApplicationAcquisitionFailed {
  readonly _tag: "BrowserModuleApplicationAcquisitionFailed";
  readonly operation: "walk" | "read" | "authenticate";
  readonly reason: string;
}

export interface BrowserModuleApplication {
  readonly _tag: "BrowserModuleApplication";
  readonly profileProtocol: typeof BrowserModuleApplicationProtocol;
  readonly providerPackage: ProviderPackageObservation;
  readonly lifetime: "borrowed";
  readonly acquire: Effect.Effect<
    BrowserModuleApplicationSnapshot,
    BrowserModuleApplicationAcquisitionFailed
  >;
  readonly observations: readonly BuildStepObservation[];
}

export interface BrowserModuleApplicationService<Failure, Requirements = never> {
  readonly profile: "BrowserModuleApplication";
  readonly protocol: string;
  readonly providerPackage: ProviderPackageObservation;
  readonly withApplication: <A, E, R>(
    request: BrowserModuleApplicationRequest,
    use: (application: BrowserModuleApplication) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<
    A,
    Failure | ProfileProtocolUnsupported | E,
    Requirements | Exclude<R, Scope.Scope>
  >;
}

export interface PermanentProviderApi<Service, Failure, Requirements = never> {
  readonly status: "permanent-canonical-provider-surface";
  readonly providerPackage: ProviderPackageObservation;
  readonly layer: Layer.Layer<Service, Failure, Requirements>;
}

export interface ProfileAdapter<Service, Failure, Requirements = never> {
  readonly status: "additive-portable-role";
  readonly profile: "NodeMainProgram" | "NodeMainExecutable" | "BrowserModuleApplication";
  readonly protocol: string;
  readonly providerPackage: ProviderPackageObservation;
  readonly layer: Layer.Layer<Service, Failure, Requirements>;
}

export interface NodeSourceExecutableRequest {
  readonly program: NodeMainProgramRequest;
  readonly destination: string;
  readonly acquisition: "bytes" | "private-file";
  readonly digest: boolean;
}

export const nodeSourceExecutable = <ProducerFailure, ProducerRequirements, AssemblerFailure, AssemblerRequirements>(
  producer: NodeMainProgramService<ProducerFailure, ProducerRequirements>,
  assembler: NodeMainExecutableService<AssemblerFailure, AssemblerRequirements>,
  request: NodeSourceExecutableRequest,
): Effect.Effect<
  ExecutableArtifact,
  | ProducerFailure
  | AssemblerFailure
  | NodeMainExecutableContractFailure
  | ProfileProtocolUnsupported,
  ProducerRequirements | Exclude<AssemblerRequirements, Scope.Scope>
> =>
  Effect.flatMap(
    validateProfileProtocol(
      "NodeMainProgram",
      NodeMainProgramProtocol,
      producer.protocol,
      producer.providerPackage,
    ),
    () =>
      Effect.flatMap(
        validateProfileProtocol(
          "NodeMainExecutable",
          NodeMainExecutableProtocol,
          assembler.protocol,
          assembler.providerPackage,
        ),
        () =>
          producer.withMain(request.program, (main) =>
            assembler.assemble({
              main,
              destination: request.destination,
              runtimeTarget: request.program.runtimeTarget,
              acquisition: request.acquisition,
              digest: request.digest,
            })),
      ),
  );
