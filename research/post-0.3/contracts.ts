import type { Effect, Layer, Scope, Stream } from "effect";

export type Compatibility = "tested" | "untested-override";

export interface TestedRange {
  readonly minimum: string;
  readonly maximum: string;
}

export interface ToolObservation<Name extends string = string> {
  readonly name: Name;
  readonly version: string;
  readonly path?: string;
  readonly compatibility: Compatibility;
  readonly testedRange: TestedRange;
}

export interface ProviderLayerOptions {
  readonly executable?: string;
  readonly allowUntestedVersion?: boolean;
}

export interface ToolVersionUnsupported {
  readonly _tag: "ToolVersionUnsupported";
  readonly provider: string;
  readonly lane: "api" | "command";
  readonly observed: string;
  readonly testedRange: TestedRange;
  readonly knownIncompatible: boolean;
  readonly missingCapabilities: readonly string[];
  readonly remediation:
    | "select-supported-version"
    | "enable-untested-version-override";
}

export interface ToolVersionUntestedOverride {
  readonly _tag: "ToolVersionUntestedOverride";
  readonly provider: string;
  readonly lane: "api" | "command";
  readonly observed: string;
  readonly testedRange: TestedRange;
}

export interface CommandLogChunk {
  readonly channel: "stdout" | "stderr";
  readonly bytes: Uint8Array;
}

export interface CommandExit {
  readonly exitCode: number;
  readonly signal?: string;
}

/** Integration-author process ownership. This is not an application event protocol. */
export interface AuthorCommandSession {
  readonly logs: Stream.Stream<CommandLogChunk, never>;
  readonly exit: Effect.Effect<CommandExit>;
}

/** App-facing command watch when no truthful typed rebuild parser exists. */
export interface OpaqueWatchSession {
  readonly tool: ToolObservation;
  readonly logs: Stream.Stream<CommandLogChunk, never>;
  readonly exit: Effect.Effect<CommandExit>;
}

/** Only publish this shape when provider output proves stable event boundaries. */
export interface TypedWatchSession<Event, Error> extends OpaqueWatchSession {
  readonly ready: Effect.Effect<void, Error>;
  readonly events: Stream.Stream<Event, Error>;
}

export interface BorrowedFile {
  readonly path: string;
  readonly bytes: number;
  readonly digest: `sha256:${string}`;
}

export interface BuildStepObservation {
  readonly operation: string;
  readonly tool: ToolObservation;
}

export interface NodeMainProgramRequest {
  readonly entrypoint: string;
  readonly cwd?: string;
  readonly format: "esm" | "cjs";
}

/**
 * Narrowed role: a Node main entry, not an arbitrary importable module.
 * One continuation owns cleanup. The closure-owned file Effect preserves typed
 * expiry and mutation checks without a second callback.
 */
export interface BorrowedNodeMainProgram {
  readonly protocol: "effect-build/NodeMainProgram@1";
  readonly format: "esm" | "cjs";
  readonly resolutionTarget: "node";
  readonly executionRole: "main";
  readonly externalImportObservations: readonly string[];
  readonly steps: readonly BuildStepObservation[];
  readonly file: Effect.Effect<BorrowedFile, NodeMainProgramExpired | NodeMainProgramChanged>;
}

export interface NodeMainProgramExpired {
  readonly _tag: "NodeMainProgramExpired";
}

export interface NodeMainProgramChanged {
  readonly _tag: "NodeMainProgramChanged";
  readonly reason: "missing" | "not-file" | "byte-count-changed" | "digest-changed";
}

export interface NodeMainProgramService<Failure> {
  readonly withProgram: <A, E, R>(
    request: NodeMainProgramRequest,
    use: (program: BorrowedNodeMainProgram) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, Failure | E, Exclude<R, Scope.Scope>>;
}

export interface ArtifactFile {
  readonly path: string;
  readonly bytes: number;
  readonly digest?: `sha256:${string}`;
}

export interface ArtifactExecutable extends ArtifactFile {
  readonly runtime: "node" | "bun" | "deno";
  readonly systemTarget: string;
  readonly steps: readonly BuildStepObservation[];
}

/** A candidate future role validated only for Node runtimes. */
export interface NodeMainExecutableRequest {
  readonly main: BorrowedFile;
  readonly format: "commonjs" | "module";
  readonly outfile: string;
  readonly systemTarget?: string;
  readonly assets?: Readonly<Record<string, string>>;
}

export interface NodeMainExecutableService<Failure> {
  readonly createExecutable: (
    request: NodeMainExecutableRequest,
  ) => Effect.Effect<ArtifactExecutable & { readonly runtime: "node" }, Failure>;
}

/**
 * Deliberately rejected broad role. Runtime identity is output semantics, not
 * merely an implementation detail. A caller that accepts this union has not
 * gained provider substitution.
 */
export interface UniversalRuntimeExecutableRequest {
  readonly entrypoint: string;
  readonly outfile: string;
  readonly runtime: "node" | "bun" | "deno";
  readonly permissions?: unknown;
  readonly systemTarget?: string;
}

export interface StaticWebApplicationRequest {
  readonly entryHtml: readonly [string, ...string[]];
  readonly cwd?: string;
  readonly minify?: boolean;
}

export interface BorrowedStaticWebApplication {
  readonly protocol: "effect-build/StaticWebApplication@1";
  readonly target: "browser";
  readonly entryHtml: readonly string[];
  readonly files: Effect.Effect<
    readonly ArtifactFile[],
    StaticWebApplicationExpired | StaticWebApplicationChanged
  >;
  readonly steps: readonly BuildStepObservation[];
}

export interface StaticWebApplicationExpired {
  readonly _tag: "StaticWebApplicationExpired";
}

export interface StaticWebApplicationChanged {
  readonly _tag: "StaticWebApplicationChanged";
  readonly path: string;
}

export interface StaticWebApplicationService<Failure> {
  readonly withApplication: <A, E, R>(
    request: StaticWebApplicationRequest,
    use: (application: BorrowedStaticWebApplication) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, Failure | E, Exclude<R, Scope.Scope>>;
}

export interface RebuildEvent<Output> {
  readonly _tag: "Rebuilt";
  readonly sequence: number;
  readonly output: Output;
}

/** Future API-context role; not a command-stdout normalization. */
export interface IncrementalNodeMainSession<Failure> {
  readonly rebuild: Effect.Effect<BorrowedNodeMainProgram, Failure>;
  readonly changes?: Stream.Stream<RebuildEvent<BorrowedNodeMainProgram>, Failure>;
}

export interface IncrementalNodeMainService<Failure> {
  readonly context: (
    request: NodeMainProgramRequest,
  ) => Effect.Effect<IncrementalNodeMainSession<Failure>, Failure, Scope.Scope>;
}

export interface PermanentProviderApi<Service, LayerError, Requirements = never> {
  readonly status: "permanent-canonical-provider-surface";
  readonly layer: Layer.Layer<Service, LayerError, Requirements>;
}

export interface ProfileAdapter<Service, LayerError, Requirements = never> {
  readonly status: "additive-portable-role";
  readonly layer: Layer.Layer<Service, LayerError, Requirements>;
}
