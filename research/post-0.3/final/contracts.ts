import { Context, Effect, type Scope } from "effect";

export const NodeMainProtocol = "effect-build/NodeMain@2";
export const NodeMainProgramProtocol = "effect-build/NodeMainProgram@2";
export const NodeMainExecutableProtocol = "effect-build/NodeMainExecutable@2";
export const NodeSourceExecutableProtocol = "effect-build/NodeSourceExecutable@2";
export const BrowserApplicationProtocol = "effect-build/BrowserApplication@2";

export type Digest = `sha256:${string}`;
export type ModuleFormat = "esm" | "cjs";
export type NodeMainTransport = "file" | "bytes";

export interface ToolObservation {
  readonly name: string;
  readonly version: string;
  readonly path?: string;
  readonly digest?: Digest;
  readonly compatibility: "matrix-tested" | "policy-supported" | "untested-override";
}

export interface BuildStepObservation {
  readonly operation: string;
  readonly tool: ToolObservation;
}

export interface ProfileAdapterObservation {
  readonly providerPackage: string;
  readonly providerPackageVersion: string;
  readonly profile: string;
  readonly profileProtocol: string;
  readonly adapterProtocol: string;
}

export interface ContentIdentity {
  readonly algorithm: "sha256";
  readonly digest: Digest;
  readonly bytes: number;
}

export interface NodeTarget {
  readonly runtime: "node";
  readonly version: string;
  readonly executable: string;
  readonly executableDigest: Digest;
  readonly systemTarget: string;
}

export type NodeImportKind = "static-import" | "dynamic-import" | "require" | "provider-observed";
export type NodeImportClass = "builtin" | "package" | "unresolved";

export interface NodeRuntimeImport {
  readonly specifier: string;
  readonly kind: NodeImportKind;
  readonly classification: NodeImportClass;
}

export interface NodeMainBytesLease {
  readonly _tag: "Bytes";
  readonly identity: ContentIdentity;
  readonly bytes: Uint8Array;
}

export interface NodeMainFileLease {
  readonly _tag: "File";
  readonly identity: ContentIdentity;
  readonly path: string;
}

export type NodeMainLease = NodeMainBytesLease | NodeMainFileLease;

export interface NodeMain {
  readonly protocol: typeof NodeMainProtocol;
  readonly format: ModuleFormat;
  readonly node: {
    readonly runtime: "node";
    readonly syntaxVersion: string;
    readonly syntaxCheckedBy: ToolObservation;
  };
  readonly imports: readonly NodeRuntimeImport[];
  readonly identity: ContentIdentity;
  readonly producer: ProfileAdapterObservation;
  readonly steps: readonly BuildStepObservation[];
  readonly transport: NodeMainTransport;
  readonly acquire: Effect.Effect<
    NodeMainLease,
    NodeMainExpired | NodeMainChanged | NodeMainAcquisitionFailed,
    Scope.Scope
  >;
}

export class ProfileProtocolUnsupported extends Error {
  readonly _tag = "ProfileProtocolUnsupported";
  constructor(
    readonly providerPackage: string,
    readonly profile: string,
    readonly requestedProtocol: string,
    readonly supportedProtocols: readonly string[],
  ) {
    super(`${providerPackage} does not support ${profile} protocol ${requestedProtocol}`);
  }
}

export class NodeTargetUnsupported extends Error {
  readonly _tag = "NodeTargetUnsupported";
  constructor(
    readonly providerPackage: string,
    readonly requestedVersion: string,
    readonly supportedVersions: readonly string[],
  ) {
    super(`${providerPackage} does not support Node ${requestedVersion}`);
  }
}

export class NodeMainExpired extends Error {
  readonly _tag = "NodeMainExpired";
  constructor(readonly producerPackage: string) {
    super(`NodeMain from ${producerPackage} has expired`);
  }
}

export class NodeMainChanged extends Error {
  readonly _tag = "NodeMainChanged";
  constructor(readonly expected: ContentIdentity, readonly observed: ContentIdentity) {
    super(`NodeMain changed from ${expected.digest} to ${observed.digest}`);
  }
}

export class NodeMainAcquisitionFailed extends Error {
  readonly _tag = "NodeMainAcquisitionFailed";
  constructor(readonly operation: string, readonly reason: string) {
    super(`${operation}: ${reason}`);
  }
}

export class NodeMainProductionFailed extends Error {
  readonly _tag = "NodeMainProductionFailed";
  constructor(readonly providerPackage: string, readonly reason: string, readonly providerError?: unknown) {
    super(`${providerPackage}: ${reason}`);
  }
}

export class ExternalImportUnsupported extends Error {
  readonly _tag = "ExternalImportUnsupported";
  constructor(readonly providerPackage: string, readonly imports: readonly NodeRuntimeImport[]) {
    super(`${providerPackage} cannot assemble external imports: ${imports.map((item) => item.specifier).join(", ")}`);
  }
}

export class NodeMainAuthenticationFailed extends Error {
  readonly _tag = "NodeMainAuthenticationFailed";
  constructor(readonly expected: ContentIdentity, readonly observed: ContentIdentity) {
    super(`Assembler received ${observed.digest}; expected ${expected.digest}`);
  }
}

export class NodeMainAssemblyFailed extends Error {
  readonly _tag = "NodeMainAssemblyFailed";
  constructor(readonly providerPackage: string, readonly reason: string, readonly providerError?: unknown) {
    super(`${providerPackage}: ${reason}`);
  }
}

export interface NodeMainProgramRequest {
  readonly entrypoint: string;
  readonly cwd?: string;
  readonly format: ModuleFormat;
  readonly transport: NodeMainTransport;
}

export interface NodeMainProgramPlan<Failure, Requirements = never> {
  readonly target: NodeTarget;
  readonly provider: ProfileAdapterObservation;
  readonly withMain: <A, E, R>(
    use: (main: NodeMain) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, Failure | E, Requirements | R>;
}

export interface NodeMainProgramService<Failure = never, Requirements = never> {
  readonly protocol: typeof NodeMainProgramProtocol;
  readonly supportedProtocols: readonly string[];
  readonly provider: ProfileAdapterObservation;
  readonly plan: (
    consumerProtocol: string,
    request: NodeMainProgramRequest,
    target: NodeTarget,
  ) => Effect.Effect<
    NodeMainProgramPlan<Failure, Requirements>,
    ProfileProtocolUnsupported | NodeTargetUnsupported
  >;
}

export class NodeMainProgram extends Context.Service<
  NodeMainProgram,
  NodeMainProgramService<NodeMainProductionFailed>
>()("effect-build-research/NodeMainProgram") {}

export interface NodeMainExecutableRequest {
  readonly outfile: string;
  readonly digest?: boolean;
}

export interface NodeExecutableArtifact {
  readonly path: string;
  readonly bytes: number;
  readonly digest?: Digest;
  readonly runtime: { readonly name: "node"; readonly version: string };
  readonly systemTarget: string;
  readonly profiles: readonly [ProfileAdapterObservation, ProfileAdapterObservation];
  readonly steps: readonly BuildStepObservation[];
  readonly committed: true;
}

export interface NodeMainExecutablePlan<Failure, Requirements = never> {
  readonly target: NodeTarget;
  readonly provider: ProfileAdapterObservation;
  readonly assemble: (
    main: NodeMain,
  ) => Effect.Effect<
    NodeExecutableArtifact,
    | Failure
    | ProfileProtocolUnsupported
    | NodeTargetUnsupported
    | ExternalImportUnsupported
    | NodeMainExpired
    | NodeMainChanged
    | NodeMainAcquisitionFailed
    | NodeMainAuthenticationFailed,
    Requirements
  >;
}

export interface NodeMainExecutableService<Failure = never, Requirements = never> {
  readonly protocol: typeof NodeMainExecutableProtocol;
  readonly supportedProtocols: readonly string[];
  readonly provider: ProfileAdapterObservation;
  readonly plan: (
    consumerProtocol: string,
    request: NodeMainExecutableRequest,
  ) => Effect.Effect<
    NodeMainExecutablePlan<Failure, Requirements>,
    ProfileProtocolUnsupported | NodeTargetUnsupported
  >;
}

export class NodeMainExecutable extends Context.Service<
  NodeMainExecutable,
  NodeMainExecutableService<NodeMainAssemblyFailed>
>()("effect-build-research/NodeMainExecutable") {}

export interface NodeSourceExecutableRequest {
  readonly protocol: typeof NodeSourceExecutableProtocol;
  readonly source: NodeMainProgramRequest;
  readonly executable: NodeMainExecutableRequest;
}

export type NodeSourceExecutableError =
  | ProfileProtocolUnsupported
  | NodeTargetUnsupported
  | ExternalImportUnsupported
  | NodeMainExpired
  | NodeMainChanged
  | NodeMainAcquisitionFailed
  | NodeMainAuthenticationFailed
  | NodeMainProductionFailed
  | NodeMainAssemblyFailed;
