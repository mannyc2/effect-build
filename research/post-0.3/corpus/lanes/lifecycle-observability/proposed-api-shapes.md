# Proposed API shapes

**[PROPOSAL]** Every signature in this file is illustrative, is labeled `PROPOSAL`, and need not compile. The purpose is to expose ownership and failure boundaries, not to freeze naming or generic parameter order.

## Shared observations

**[PROPOSAL] PROPOSAL — illustrative; need not compile.**

```ts
import {
  Cause,
  Context,
  Data,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Option,
  Path,
  PlatformError,
  Scope,
  Stream
} from "effect"
import {
  ChildProcess,
  ChildProcessSpawner
} from "effect/unstable/process"

export interface Digest {
  readonly algorithm: "sha256"
  readonly value: string
}

export interface HostPathObservation {
  readonly path: string
  readonly realPath: string
  readonly kind: "file" | "directory" | "symlink" | "other"
  readonly observedAtUnixMillis: number
  readonly sizeBytes?: bigint
  readonly device?: bigint
  readonly inode?: bigint
}

export interface FileObservation {
  readonly location: HostPathObservation
  readonly bytes: bigint
  readonly digest: Digest
}

export interface TreeEntryObservation {
  readonly relativePath: string
  readonly kind: "file" | "directory" | "symlink"
  readonly bytes?: bigint
  readonly digest?: Digest
}

export interface TreeObservation {
  readonly root: HostPathObservation
  readonly entries: ReadonlyArray<TreeEntryObservation>
  readonly totalFiles: number
  readonly totalBytes: bigint
  readonly manifestDigest: Digest
}
```

**[PROPOSAL]** `HostPathObservation` records a fact; it does not decode arbitrary strings, reserve a path, or promise continuing existence.

**[PROPOSAL]** `FileObservation` requires a digest because any API claiming mutation detection needs content evidence. APIs that merely report size may define a weaker observation type instead of making digest ambiguously optional.

## `Author/Tool`

**[PROPOSAL]** The Tool primitive should capture compatibility authority and delegate process mechanics to official Effect.

**[PROPOSAL] PROPOSAL — illustrative; need not compile.**

```ts
export type ToolCompatibility =
  | { readonly _tag: "Tested" }
  | {
      readonly _tag: "UntestedOverride"
      readonly testedMin: string
      readonly testedMax: string
    }

export interface ToolObservation<Name extends string> {
  readonly name: Name
  readonly executable: HostPathObservation
  readonly version: string
  readonly compatibility: ToolCompatibility
  readonly capabilities: ReadonlySet<string>
}

export interface SelectedTool<Name extends string> {
  readonly observation: ToolObservation<Name>
  readonly command: (
    argv: ReadonlyArray<string>,
    options?: ChildProcess.CommandOptions
  ) => ChildProcess.Command
}

export interface ToolSpec<Name extends string> {
  readonly name: Name
  readonly explicitExecutable?: string
  readonly versionArgv: ReadonlyArray<string>
  readonly parseVersion: (stdout: string, stderr: string) => Effect.Effect<string, ToolProbeError>
  readonly tested: { readonly min: string; readonly max: string }
  readonly knownIncompatible: ReadonlySet<string>
  readonly requiredCapabilities: ReadonlySet<string>
  readonly probeCapabilities: (
    selectedExecutable: HostPathObservation
  ) => Effect.Effect<ReadonlySet<string>, ToolProbeError>
}

export declare const selectTool: <Name extends string>(
  spec: ToolSpec<Name>
) => Effect.Effect<
  SelectedTool<Name>,
  ToolSelectionError,
  FileSystem.FileSystem |
    Path.Path |
    ChildProcessSpawner.ChildProcessSpawner
>
```

**[PROPOSAL]** `SelectedTool.command` closes over the canonical selected executable. It must not re-run PATH lookup, install a tool, silently select a sibling provider, or substitute an unobserved binary.

**[PROPOSAL]** The version/capability probe may use official child-process helpers privately. It should preserve bounded stdout/stderr and exact probe diagnostics without exporting a new process model.

## One-shot in-process host operation

**[PROPOSAL]** Keep provider request/result types native whenever no portable profile has been proven.

**[PROPOSAL] PROPOSAL — illustrative; need not compile.**

```ts
export interface BunApiService {
  readonly build: (
    request: Bun.BuildConfig
  ) => Effect.Effect<Bun.BuildOutput, BunApiError>
}

export class BunApi extends Context.Service<BunApi, BunApiService>()(
  "effect-build-bun/Api"
) {}
```

**[PROPOSAL]** The real adapter should not claim that interrupting the Effect cancels `Bun.build` unless the pinned official host API supplies and the adapter observes that cancellation.

## One-shot selected command

**[PROPOSAL]** A provider operation may expose a bounded result while internally using the selected official command.

**[PROPOSAL] PROPOSAL — illustrative; need not compile.**

```ts
export interface CommandCapture {
  readonly exitCode: ChildProcessSpawner.ExitCode
  readonly stdout: Uint8Array
  readonly stderr: Uint8Array
  readonly stdoutTruncated: boolean
  readonly stderrTruncated: boolean
}

export declare const runSelected: <Name extends string>(
  tool: SelectedTool<Name>,
  argv: ReadonlyArray<string>,
  options: {
    readonly command?: ChildProcess.CommandOptions
    readonly maxStdoutBytes: bigint
    readonly maxStderrBytes: bigint
  }
) => Effect.Effect<
  CommandCapture,
  CommandExecutionError,
  ChildProcessSpawner.ChildProcessSpawner
>
```

**[PROPOSAL]** `runSelected` should use `Effect.scoped`, consume stdout and stderr concurrently, observe stream closure, and preserve the official process error/cause. It remains a private or provider-level helper unless the bounded-transcript law is itself a supported public product.

**[PROPOSAL]** For caller-controlled execution, expose `SelectedTool.command(...)` directly rather than this capture helper.

## Scoped provider context and rebuild handle

**[PROPOSAL] PROPOSAL — illustrative; need not compile.**

```ts
export interface RebuildHandle<Output, RebuildError, R = never> {
  readonly rebuild: (
    request?: RebuildRequest
  ) => Effect.Effect<Output, RebuildError, R>

  readonly watch?: Effect.Effect<
    ProviderWatchHandle,
    ProviderWatchError,
    Scope.Scope | R
  >
}

export interface EsbuildContextService {
  readonly context: (
    request: esbuild.BuildOptions
  ) => Effect.Effect<
    RebuildHandle<esbuild.BuildResult, EsbuildRebuildError>,
    EsbuildContextError,
    Scope.Scope
  >
}
```

**[PROPOSAL]** The outer Scope owns context release. `rebuild` should not require a fresh Scope unless the provider operation itself allocates a nested live resource.

**[PROPOSAL]** A released handle may return a typed provider-context-expired error if the underlying API permits a deterministic check; otherwise the contract should merely prohibit use after Scope closure.

## Provider-native structured watch

**[PROPOSAL]** Use a structured event type only when the provider exposes stable machine-readable callbacks or protocol messages.

**[PROPOSAL] PROPOSAL — illustrative; need not compile.**

```ts
export type ProviderWatchEvent<Output, Diagnostic> =
  | { readonly _tag: "InitialBuildStarted"; readonly sequence: bigint }
  | {
      readonly _tag: "BuildCompleted"
      readonly sequence: bigint
      readonly output: Output
      readonly diagnostics: ReadonlyArray<Diagnostic>
    }
  | {
      readonly _tag: "BuildFailed"
      readonly sequence: bigint
      readonly diagnostics: ReadonlyArray<Diagnostic>
    }

export interface ProviderWatchHandle<Output, Diagnostic, E> {
  readonly events: Stream.Stream<ProviderWatchEvent<Output, Diagnostic>, E>
  readonly current: Effect.Effect<
    Option.Option<ProviderWatchEvent<Output, Diagnostic>>,
    never
  >
}
```

**[PROPOSAL]** Sequence numbers should come from the adapter's serialization of official callbacks, not from parsing wall-clock timestamps.

**[PROPOSAL]** The event stream should not be emitted through OpenTelemetry as its correctness path. Spans/logs may mirror events for operators.

## Human-output command watch

**[PROPOSAL]** The portable surface is official process capability, not a guessed event model.

**[PROPOSAL] PROPOSAL — illustrative; need not compile.**

```ts
export declare const startCommandWatch: (
  command: ChildProcess.Command
) => Effect.Effect<
  ChildProcessSpawner.ChildProcessHandle,
  PlatformError.PlatformError,
  Scope.Scope | ChildProcessSpawner.ChildProcessSpawner
>
```

**[PROPOSAL]** Consumers use:
- **[UPSTREAM-DIRECT]** `handle.stdout`;
- **[UPSTREAM-DIRECT]** `handle.stderr`;
- **[UPSTREAM-DIRECT]** `handle.all`;
- **[UPSTREAM-DIRECT]** `handle.exitCode`;
- **[UPSTREAM-DIRECT]** `handle.isRunning`;
- **[UPSTREAM-DIRECT]** `handle.kill({ killSignal, forceKillAfter })`;
- **[UPSTREAM-DIRECT]** Scope closure.

**[PROPOSAL]** An optional experimental parser should preserve every unrecognized line.

**[PROPOSAL] PROPOSAL — illustrative; need not compile.**

```ts
export type ParsedTerminalObservation<Known> =
  | { readonly _tag: "Known"; readonly value: Known; readonly raw: string }
  | { readonly _tag: "UnknownLine"; readonly stream: "stdout" | "stderr"; readonly raw: string }

export interface ExperimentalWatchParser<Known> {
  readonly provider: string
  readonly exactVersions: ReadonlySet<string>
  readonly parseLine: (
    stream: "stdout" | "stderr",
    line: string
  ) => ParsedTerminalObservation<Known>
}
```

**[PROPOSAL]** The parser must not convert absence of a line into a positive readiness claim, and it must fail closed outside its exact tested versions.

## Borrowed output errors and authority

**[PROPOSAL] PROPOSAL — illustrative; need not compile.**

```ts
export class BorrowedOutputExpired extends Data.TaggedError(
  "BorrowedOutputExpired"
)<{
  readonly leaseId: string
}> {}

export class BorrowedOutputChanged extends Data.TaggedError(
  "BorrowedOutputChanged"
)<{
  readonly expected: FileObservation | TreeObservation
  readonly observed: FileObservation | TreeObservation
}> {}

export class BorrowedOutputEscaped extends Data.TaggedError(
  "BorrowedOutputEscaped"
)<{
  readonly root: HostPathObservation
  readonly candidate: string
}> {}

export interface BorrowedFile {
  readonly path: string
  readonly initial: FileObservation
  readonly observe: Effect.Effect<
    FileObservation,
    BorrowedOutputExpired |
      BorrowedOutputChanged |
      BorrowedOutputEscaped |
      PlatformError.PlatformError
  >
}

export interface BorrowedTree {
  readonly rootPath: string
  readonly initial: TreeObservation
  readonly observe: Effect.Effect<
    TreeObservation,
    BorrowedOutputExpired |
      BorrowedOutputChanged |
      BorrowedOutputEscaped |
      PlatformError.PlatformError
  >
}
```

**[PROPOSAL]** `path` and `rootPath` are locators for tools; they are intentionally copyable. `observe` is the producer-controlled authority.

## Borrowed continuation and cleanup policy

**[PROPOSAL] PROPOSAL — illustrative; need not compile.**

```ts
export interface CleanupObservation {
  readonly root: HostPathObservation
  readonly requestedAtUnixMillis: number
  readonly completedAtUnixMillis?: number
  readonly outcome:
    | { readonly _tag: "Removed" }
    | { readonly _tag: "AlreadyMissing" }
    | { readonly _tag: "Incomplete"; readonly cause: Cause.Cause<unknown> }
}

export interface CleanupReporter {
  readonly report: (
    observation: CleanupObservation
  ) => Effect.Effect<void>
}

export declare const withBorrowedTree: <A, E, R>(
  produce: Effect.Effect<ProducedTree, ProduceError, Scope.Scope>,
  use: (tree: BorrowedTree) => Effect.Effect<A, E, R>
) => Effect.Effect<
  A,
  ProduceError | E | CleanupFailedAfterSuccessfulUse,
  Exclude<R, Scope.Scope> |
    FileSystem.FileSystem |
    Path.Path |
    CleanupReporter
>
```

**[PROPOSAL]** The implementation should preserve the callback's exact `Exit`. If use fails/interruption and cleanup also fails, `CleanupReporter` receives the cleanup observation while the primary effect re-emits the original cause.

**[PROPOSAL]** If use succeeds and cleanup fails, `CleanupFailedAfterSuccessfulUse` may fail the operation because no caller cause needs exact preservation.

## Browser module application as a borrowed tree

**[GITHUB-DIRECT]** The repository's selected role is an HTML module application whose module-reachable CSS/assets are included; it is borrowed rather than a durable directory transaction.

**[PROPOSAL] PROPOSAL — illustrative; need not compile.**

```ts
export interface BrowserModuleApplicationRequest {
  readonly entryHtml: string
  readonly cwd?: string
  readonly minify?: boolean
  readonly sourceMap?: boolean
}

export interface BrowserModuleApplication {
  readonly profileProtocol: "effect-build/profile/browser-module-application@1"
  readonly entryHtmlRelativePath: string
  readonly tree: BorrowedTree
  readonly providerObservation?: ProviderBuildGraphObservation
}

export interface BrowserModuleApplicationService {
  readonly withApplication: <A, E, R>(
    request: BrowserModuleApplicationRequest,
    use: (
      application: BrowserModuleApplication
    ) => Effect.Effect<A, E, R>
  ) => Effect.Effect<A, BrowserBuildError | E, R>
}
```

**[PROPOSAL]** The common role should not assert that top-level non-module-reachable files are preserved unless every provider adapter proves it.

## Durable ordinary file

**[PROPOSAL]** Durable publication is broader than executables and deserves either a small public primitive or shared private machinery.

**[PROPOSAL] PROPOSAL — illustrative; need not compile.**

```ts
export interface DurableFileRequest {
  readonly destination: string
  readonly digest: boolean
  readonly durability: "rename-commit" | "flush-file-and-parent"
}

export interface DurableFile {
  readonly artifact: FileObservation
  readonly committedAtUnixMillis: number
  readonly commit: "same-parent-rename"
  readonly durability: "rename-commit" | "flush-file-and-parent"
}

export declare const publishFile: (
  request: DurableFileRequest,
  writeCandidate: (
    candidatePath: string
  ) => Effect.Effect<void, ProducerError>
) => Effect.Effect<
  DurableFile,
  DestinationClaimError |
    ProducerError |
    CandidateValidationError |
    CommitError,
  FileSystem.FileSystem | Path.Path
>
```

**[UNKNOWN]** The stronger `flush-file-and-parent` tier needs an Effect/platform implementation and runtime evidence; it should not be declared merely because `File.sync` exists.

## Durable executable

**[PROPOSAL] PROPOSAL — illustrative; need not compile.**

```ts
export interface RuntimeObservation {
  readonly name: "node" | "bun" | "deno" | string
  readonly version?: string
}

export interface SystemTargetObservation {
  readonly os: string
  readonly architecture: string
  readonly abi?: string
}

export interface BuildStepObservation {
  readonly operation: string
  readonly providerPackage: string
  readonly tool: ToolObservation<string>
  readonly profileProtocol?: string
}

export interface ExecutableArtifact extends DurableFile {
  readonly nativeFormat: "elf" | "mach-o" | "pe"
  readonly runtime: RuntimeObservation
  readonly systemTarget: SystemTargetObservation
  readonly steps: ReadonlyArray<BuildStepObservation>
}

export declare const publishExecutable: (
  request: ExecutablePublicationRequest,
  produceCandidate: (
    candidatePath: string
  ) => Effect.Effect<void, ProducerError>
) => Effect.Effect<
  ExecutableArtifact,
  ProducerError |
    NativeInspectionError |
    RuntimeObservationError |
    CommitError,
  FileSystem.FileSystem | Path.Path
>
```

**[PROPOSAL]** `Author/Executable` should not decide which producer/runtime is appropriate. It inspects and publishes a candidate supplied by a provider/profile operation.

## Direct multi-output writes

**[PROPOSAL] PROPOSAL — illustrative; need not compile.**

```ts
export interface ObservedDurableOutcome {
  readonly destinationRoot: string
  readonly files: ReadonlyArray<FileObservation>
  readonly complete: boolean
}

export class DirectWriteFailure extends Data.TaggedError(
  "DirectWriteFailure"
)<{
  readonly phase:
    | "before-provider-call"
    | "provider-running"
    | "provider-returned"
    | "post-observation"
  readonly cause: Cause.Cause<unknown>
  readonly durableOutcome?: ObservedDurableOutcome
}> {}
```

**[PROPOSAL]** The absence of `durableOutcome` means “none observed,” not necessarily “none exists,” unless the failure phase and provider law prove no mutation began.

## Independently committing matrices

**[PROPOSAL] PROPOSAL — illustrative; need not compile.**

```ts
export type CellState<A, E> =
  | { readonly _tag: "NotStarted"; readonly reason: string }
  | { readonly _tag: "Completed"; readonly exit: Exit.Exit<A, E> }

export interface MatrixReport<CellId, A, E> {
  readonly cells: ReadonlyMap<CellId, CellState<A, E>>
  readonly committedArtifacts: ReadonlyArray<{
    readonly cell: CellId
    readonly artifact: FileObservation
  }>
  readonly cleanupWarnings: ReadonlyArray<CleanupObservation>
}

export declare const runMatrix: <CellId, A, E, R>(
  cells: ReadonlyArray<CellId>,
  runCell: (cell: CellId) => Effect.Effect<A, E, R>
) => Effect.Effect<MatrixReport<CellId, A, E>, MatrixPreflightError, R>
```

**[PROPOSAL]** Cell failures live inside each cell `Exit`; only coordinator preflight/construction errors fail the outer Effect before a report can be formed. An alternative outer failure type is acceptable only if it carries the complete report.

## Future signing or mutation

**[PROPOSAL] PROPOSAL — illustrative; need not compile.**

```ts
export interface ProvenanceEdge {
  readonly operation: "sign" | "notarize" | "patch" | "timestamp" | string
  readonly input: Digest
  readonly output: Digest
  readonly tool?: ToolObservation<string>
  readonly policyDigest: Digest
  readonly startedAtUnixMillis: number
  readonly completedAtUnixMillis: number
}

export interface MutatedArtifact {
  readonly artifact: FileObservation
  readonly provenance: ProvenanceEdge
  readonly verification: {
    readonly verifier: string
    readonly result: "verified"
  }
}

export interface SignerSession {
  readonly mutate: (
    input: FileObservation,
    destination: string,
    request: SigningRequest
  ) => Effect.Effect<MutatedArtifact, SigningError>
}

export declare const signerLayer: (
  config: SignerConfig
) => Layer.Layer<SignerSession, SignerAcquireError>
```

**[PROPOSAL]** `SignerSession` is scoped only if the implementation owns a genuinely long-lived credential/session/client. The mutation operation always produces a distinct destination observation and never alters the input path in place.

## Optional tagged source references

**[PROPOSAL]** Do not publish this merely to unify parameter names; publish only when multiple APIs need it.

**[PROPOSAL] PROPOSAL — illustrative; need not compile.**

```ts
export type SourceRef =
  | {
      readonly _tag: "HostPath"
      readonly observation: HostPathObservation
    }
  | {
      readonly _tag: "FileUrl"
      readonly url: URL
    }
  | {
      readonly _tag: "RemoteUrl"
      readonly url: URL
      readonly integrity?: Digest
    }
  | {
      readonly _tag: "PackageSpecifier"
      readonly specifier: string
      readonly lockfileDigest?: Digest
    }
  | {
      readonly _tag: "Virtual"
      readonly id: string
      readonly contentDigest: Digest
    }
  | {
      readonly _tag: "Stdin"
      readonly contentDigest: Digest
    }
```

**[PROPOSAL]** Resolution belongs to the provider/integration that understands the variant. A `RemoteUrl` without integrity and a `PackageSpecifier` without lock resolution should be recorded as non-reproducible input in durable provenance rather than normalized into a false stable source identity.
