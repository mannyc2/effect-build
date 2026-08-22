# Lifecycle taxonomy

**[INFERENCE]** A public lifecycle type should correspond to who owns the resource, what constitutes completion, whether cancellation is provider-observable, and whether output becomes durable before the operation returns. Similar method names are not enough to justify one abstraction.

## Decision matrix

| Class | Lifecycle class | Owner while live | Honest completion | Recommended public type | Cancellation/interruption contract | Output contract |
|---|---|---|---|---|---|---|
| INFERENCE | one-shot in-process host API, no stable cancel handle | provider host API | host call resolves/rejects | `Effect<Result, E, R>` | interruption can stop the Effect from waiting; provider work may continue unless the official host API proves cancellation | return provider result and observed outputs; do not imply rollback of provider direct writes |
| INFERENCE | one-shot in-process host API with official abort/cancel | provider host API plus adapter | host settles after adapter invokes and observes official cancellation as documented | `Effect<Result, E, R>` with internal bracket; optionally expose provider-native handle directly | preserve provider-specific cancellation evidence; do not normalize stronger than upstream | provider-native result or a common profile only after semantic proof |
| INFERENCE | one-shot selected command, library-controlled | internal Scope owns official process handle | command exits and required streams are drained/collected | `Effect<CommandResult, E, R>` | interruption closes scope; Node layer attempts group/direct kill and awaits direct child exit; errors may be ignored by upstream finalizer | bounded stdout/stderr, exit observation, and outputs; no process-tree-death claim |
| INFERENCE | selected command, caller-controlled | caller's Scope | caller observes handle exit and closes Scope | `ChildProcess.Command` yielding `ChildProcessSpawner.ChildProcessHandle` | official `kill`, `forceKillAfter`, `isRunning`, and Scope semantics | raw byte streams and exit code/error |
| INFERENCE | scoped provider context | caller's Scope owns provider context | Scope closes after all desired operations | `Effect<ContextHandle, E, R | Scope.Scope>` | provider context release is registered in Scope; explicit provider `cancel` may be exposed if semantically distinct | handle methods return provider results; no durability unless operation says so |
| INFERENCE | rebuild handle | enclosing provider context | each rebuild call resolves/rejects while context remains live | `rebuild(request?): Effect<RebuildResult, E, R>` | interruption applies to the call; context liveness remains owned by Scope unless official API couples them | each call has its own observed output/version; no implicit publication |
| INFERENCE | provider-native structured watch process | Scope owns watch session | stable provider callback/event reports transitions and Scope later releases session | scoped `WatchHandle` and/or `Stream<ProviderEvent, E, R | Scope.Scope>` | provider-specific stop/release; stream end may represent release or unexpected exit and must be distinguished | only events documented by provider API |
| INFERENCE | provider command watch with human terminal output | Scope owns child process | only spawn, bytes, direct child exit, and cleanup are machine-observable | official scoped child handle plus `stdout`, `stderr`, `all` streams | best-effort termination as provided by platform layer | terminal text is diagnostics; no portable ready/rebuild event |
| INFERENCE | borrowed single file | producer owns temporary root; consumer has temporary lease | continuation exits and producer attempts cleanup | `withFile(request, use): Effect<A, ...>` with closure-owned `observe` Effect | callback interruption closes lease before cleanup; exact callback cause retained by policy | point-in-time path/kind/bytes/digest observation; expires at release |
| INFERENCE | borrowed tree | producer owns one cleanup root | continuation exits and producer attempts recursive cleanup | `withTree(request, use): Effect<A, ...>` with closure-owned manifest observation | same as borrowed file; in-flight observation policy must be explicit | coherent manifest only to the extent observation algorithm proves; no durable directory claim |
| INFERENCE | durable ordinary file | operation owns staging candidate until commit; caller owns destination after commit | successful commit observation returned | `Effect<Artifact.File, E, R>` | interruption before rename removes staging best-effort; after rename is a committed outcome | one-file commit only; include bytes/digest/commit observation |
| INFERENCE | durable executable | operation owns candidate until inspection and commit | native validation and single-file commit complete | `Effect<Artifact.Executable, E, R>` | same boundary as durable file; inspection errors are pre-commit | regular/executable/native format/runtime/system target/digest/steps |
| INFERENCE | provider direct multi-output write | provider mutates caller-selected destination during operation | provider returns, but files may already be durable before return | provider-native `Effect<Result, DirectWriteError, R>` | failure/interruption must allow `failed-after-durable-outcome` with observed remnants | no rollback or all-or-nothing promise |
| INFERENCE | independently committing matrix | each cell owns its own candidate/commit | coordinator has an `Exit` for every started cell or an explicit not-started state | one `Effect<MatrixReport, PreflightError, R>` collecting per-cell outcomes | coordinator interruption policy says whether running cells are interrupted and still records committed cells | committed artifacts survive sibling failure; matrix is not a transaction |
| INFERENCE | future signing/post-production mutation | mutation operation owns a new candidate; original remains immutable | new output is verified and committed | plain `Effect<MutatedArtifact, E, R>`; scoped signer service only if credentials/session are long-lived | no in-place mutation of observed input; interruption before new commit leaves original authoritative | provenance links input digest, mutation, signer identity policy, and output digest |

## Why these shapes differ

**[INFERENCE]** A plain `Effect` is sufficient when there is one semantic completion point and no useful live handle needs to escape. It does not mean the underlying provider is cancellable or transactional.

**[INFERENCE]** A scoped handle is required when repeated operations or a long-lived native session are semantically meaningful. Scope should own release; the handle should not manufacture a second unrelated lifetime token.

**[INFERENCE]** A `Stream` is appropriate only for repeatable observations with stable element boundaries. Bytes and lines are valid stream elements. “Build ready” is valid only when an official provider callback/protocol establishes that boundary.

**[INFERENCE]** A continuation is appropriate for borrowed output because the producer, not the caller, must close the cleanup root after arbitrary caller use. The continuation alone is not linearity; revocable operations inside it add the actual runtime authority.

**[INFERENCE]** A durable artifact is a value because ownership transfers at commit. After a successful commit, cleanup must not delete the destination as though it were still borrowed.

## One-shot in-process host APIs

**[PROPOSAL]** The default signature should preserve the official request/result and provider environment rather than force all hosts through command vocabulary.

**[PROPOSAL] PROPOSAL — illustrative; need not compile.**

```ts
interface BunApi {
  readonly build: (
    request: Bun.BuildConfig
  ) => Effect.Effect<Bun.BuildOutput, BunApiError>
}

interface DenoApi {
  readonly emit: (
    request: DenoEmitRequest
  ) => Effect.Effect<DenoEmitResult, DenoApiError>
}
```

**[PROPOSAL]** If an official host API lacks a cancellation handle, interruption documentation must say “the fiber stops awaiting” rather than “the build is stopped.” Any direct destination writes must use the direct-write outcome model.

## One-shot selected commands

**[UPSTREAM-DIRECT]** `ChildProcess.Command` already requires `ChildProcessSpawner | Scope.Scope` when executed, and the spawner supplies scoped collection helpers.

**[PROPOSAL]** `Author/Tool.Selected.command(argv, options)` should return `ChildProcess.Command`. A provider convenience method may internally call `ChildProcessSpawner.string`, `lines`, or handle streams, but it should not return a custom process handle with duplicated methods.

**[PROPOSAL]** A bounded capture operation must consume stdout and stderr concurrently, enforce independent limits, preserve truncation facts, and wait for stream completion as well as direct child exit. Merely awaiting `exitCode` can race with still-open stdio.

## Scoped provider contexts and rebuild handles

**[PROPOSAL]** Context acquisition should have a `Scope.Scope` requirement. Rebuild is a method on the acquired handle; release belongs to Scope. An explicit `dispose` method should be exposed only when the provider's API requires an early semantic shutdown that callers need independently of Scope.

**[PROPOSAL] PROPOSAL — illustrative; need not compile.**

```ts
interface RebuildHandle<Output, E, R = never> {
  readonly rebuild: () => Effect.Effect<Output, E, R>
}

declare const context: (
  request: ContextRequest
) => Effect.Effect<
  RebuildHandle<BuildOutput, BuildError>,
  ContextAcquireError,
  Scope.Scope | ProviderHost
>
```

**[INFERENCE]** A handle object can escape its Scope in JavaScript, but its operations can fail after provider release. Documentation and typed released errors are more honest than pretending `Scope` creates compile-time linearity.

## Provider-native watch

**[PROPOSAL]** Provider-native structured callbacks may be adapted into a `Stream` only when there is an official, versioned boundary for each event and a defined ordering/backpressure policy.

**[PROPOSAL]** The stream terminal model should distinguish:
- **[PROPOSAL]** requested release;
- **[PROPOSAL]** provider-reported fatal failure;
- **[PROPOSAL]** unexpected process/session exit;
- **[PROPOSAL]** downstream stream interruption.

**[INFERENCE]** Human terminal output alone supplies none of those semantic distinctions except raw bytes and eventual process exit.

## Borrowed files and trees

**[PROPOSAL]** Borrowed output has three separate values:

| Class | Value | Authority |
|---|---|---|
| PROPOSAL | raw locator/path data | lets a consumer identify a host object, but carries no continuing validity |
| PROPOSAL | immutable observation | records kind, bytes, digest, and optional host identity at one time |
| PROPOSAL | closure-owned observer | proves the lease is live and re-observes the current object before use |

**[PROPOSAL]** Tree observation must state whether it is a best-effort enumeration or a snapshot. Without filesystem snapshot/locking support, a recursive manifest can observe a mixed generation while the provider is still mutating. Therefore borrowed outputs should become visible only after the producer declares the build complete and ceases mutation for the lease.

## Durable files and executables

**[PROPOSAL]** The generic durable-file state machine is:

```text
validate request
-> claim destination
-> create same-parent candidate
-> produce bytes
-> close producer handles
-> inspect and observe candidate
-> optionally sync file and parent according to documented durability tier
-> rename candidate to destination
-> observe committed destination
-> release destination claim
```

**[INFERENCE]** The executable specialization pays rent for native-format/runtime/target inspection. The single-file publication machinery itself should be shareable with ordinary durable files rather than forcing all durable outputs through `Author/Executable`.

**[UNKNOWN]** A cross-platform “crash durable” tier is not established by Effect's `rename` API alone. It would require explicit file and directory flush behavior plus platform tests.

## Provider direct multi-output writes

**[PROPOSAL]** Direct-write errors should carry the phase and any safely observed durable remnants.

**[PROPOSAL] PROPOSAL — illustrative; need not compile.**

```ts
type DirectWriteError =
  | { readonly _tag: "FailedBeforeDurableOutcome"; readonly cause: Cause.Cause<unknown> }
  | {
      readonly _tag: "FailedAfterDurableOutcome"
      readonly cause: Cause.Cause<unknown>
      readonly observed: ReadonlyArray<Artifact.File>
      readonly observationComplete: boolean
    }
```

**[INFERENCE]** `observationComplete: false` is essential when interruption, permission failure, concurrent mutation, or a provider-owned layout prevents exhaustive enumeration.

## Independently committing matrices

**[PROPOSAL]** A matrix is a coordinator, not a transaction. Each cell should have `not-started`, `running-when-coordinator-interrupted`, or a complete `Exit`, plus a list of committed artifacts known for that cell.

**[PROPOSAL] PROPOSAL — illustrative; need not compile.**

```ts
interface MatrixReport<CellId, A, E> {
  readonly cells: ReadonlyMap<
    CellId,
    | { readonly _tag: "NotStarted" }
    | { readonly _tag: "Completed"; readonly exit: Exit.Exit<A, E> }
  >
  readonly committed: ReadonlyArray<Artifact.Observation>
}
```

**[INFERENCE]** Returning only the first failure would erase durable facts and make retry/cleanup unsafe.

## Future signing or mutation

**[PROPOSAL]** Treat signing, notarization, patching, timestamping, and post-link mutation as transformations from an immutable observed input to a new candidate. Verify the new object, commit it separately, and record a provenance edge.

**[PROPOSAL]** A signer `Layer` is justified for a long-lived credential/session/provider client. A generic signing profile is not justified until trust authority, credential exposure, platform mutation, verification, and timestamp semantics share a proven law.
