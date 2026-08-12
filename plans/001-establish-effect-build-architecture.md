# Plan 001: Govern the effect-build architecture and Bun/Deno executable proof

> **Executor instructions**: This is the governing architecture and aggregate
> acceptance contract, not one implementation-sized change. Execute bounded
> Plans 002 through 006 in dependency order; those plans own exact file sets and
> gates. Use this plan to resolve conceptual conflicts, and STOP rather than
> weakening an invariant. Mark Plan 001 `DONE` only after every child plan is
> `DONE` and this plan's aggregate done criteria pass.
>
> **Initial drift check (owned by Plan 002)**: this workspace had no Git `HEAD`
> and no product files when planned. Before the first child plan, run:
>
> ```sh
> test ! -e package.json && test ! -d src && test ! -d test
> ```
>
> Expected before Plan 002: exit 0. If it fails, inspect the new product
> files and STOP for plan reconciliation. Do not overwrite a newly initialized
> implementation. The reference Effect checkout must still report
> `df431ae` from `git -C .agent-sources/effect rev-parse --short HEAD`; if it
> differs, revalidate every Effect API cited below before proceeding.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Execution dependency**: none (governing architecture)
- **Aggregate completion depends on**: Plans 002–006
- **Category**: direction / architecture / tests / DX
- **Planned at**: unversioned workspace on 2026-08-09; Effect reference commit
  `df431ae`

## Why this matters

`effect-build` should not become another spelling of `Bun.build`, `deno
compile`, or a generic subprocess call. Its durable value is a normalized,
Effect-native control plane for declared inputs, exact toolchains, scoped
execution, truthful outcomes, artifact identity, provenance, and later safe
caching or remote execution. Compiler-specific semantics remain in explicitly
selected drivers.

This plan establishes the final architecture and proves its most important
boundary with two independent standalone-executable drivers. Bun and Deno must
share the lifecycle and artifact model without sharing a fictional universal
flag model. Nothing is published until this cross-driver proof passes.

## Product contract

The project has two deliberately separate lanes.

### Managed lane: the product

A managed build is schema-decodable, uses an immutable source snapshot, names
one operation and one driver, resolves one exact toolchain, runs once in
system-owned staging, validates declared outputs, stores them by content, and
produces a versioned record.

Managed builds may eventually be cacheable or remotely executable, but only
when the resolved build proves all semantic inputs are closed. Cacheability is
derived evidence, never caller intent.

### Native lane: the escape hatch

Native adapters preserve an upstream surface exactly:

- CLI parity means an ordered argv array passed directly to one executable,
  never a shell string.
- TypeScript API parity means accepting the upstream request type and returning
  the upstream result type.

Native invocations receive Effect lifecycle wrapping and telemetry only where
truthful. They are not managed, remotely serializable, cacheable, or safely
published by default. A native output enters the managed artifact store only
through an explicit future `Artifact.adopt` operation that validates and copies
it.

Do not implement the native lane in this plan. Preserve the architectural
space for it and test that native values cannot enter the managed API.

### Surface selection policy

Core never chooses CLI versus TypeScript API. The selected driver/surface is
part of the request and resolved identity.

- Managed V1 uses CLI processes because ordered argv is serializable, the same
  driver can run from Node/Bun/Deno hosts, Effect Scope can supervise the real
  process, and output staging is enforceable.
- A direct TypeScript API adapter is the right later surface for exact upstream
  request/result parity, plugins, virtual files, and structured diagnostics,
  but it remains native and host-specific when its values include callbacks or
  runtime objects.
- A future managed API surface must run in an isolated worker process behind a
  versioned Schema protocol. It may normalize structured API results, but may
  not accept callbacks or silently fall back to CLI.
- Raw CLI parity is an explicit native argv adapter. It is useful for immediate
  feature reach, but cannot claim managed input closure or artifact authority.

Thus “full parity” is a property of each native surface, not the normalized
product contract. Normalization covers the lifecycle and the operation subset
whose semantics can be stated and tested identically.

### What is deterministic

Determinism applies to the control plane: validated request decoding, one
operation projection, exact driver routing, canonical plan encoding, tool/asset
identity, phase transitions, bounded evidence, artifact validation, and record
commit. It does **not** assume Bun/Deno/compiler bytes are reproducible. Tool
outputs are opaque observations until independent clean runs prove equal
artifact manifests; only then may a named case claim `ReproducibleVerified`.
This distinction lets the architecture be deterministic without laundering an
upstream compiler's clocks, paths, randomness, or platform behavior into a
false guarantee.

### Relationship to Effect Platform

Build orchestration should begin as an external `effect-build` companion
library, not as another module inside `@effect/platform-*`. Effect Platform owns
host capabilities such as filesystem, paths, process supervision, streams, and
workers; this project owns tool policy, operation semantics, source snapshots,
artifact contracts, provenance, and compatibility pins. Those concerns change
on different schedules and only the former are broadly reusable by unrelated
Effect applications.

Accordingly, `effect-build` consumes platform Layers but never makes
`@effect/platform-bun`, `@effect/platform-deno`, or
`@effect/platform-node` depend on compiler tooling. If implementation proves a
missing platform-neutral primitive—rather than merely a desirable build
abstraction—that narrow primitive can be proposed upstream with a reproduction
and cross-platform contract tests. The build model itself should remain
external until adoption and stability provide stronger evidence.

## Current state and authoritative evidence

### Workspace at audit start

- `/Users/cjpher/Documents/Codex/2026-08-09/does-effect` contained no product
  repository, manifest, source, tests, CI, or design documents before these
  plans were written.
- `.agent-sources/effect` is a read-only reference checkout at commit
  `df431ae`, version `4.0.0-beta.106`.
- Locally observed tools are Node `24.14.1`, Bun `1.3.9`, and Deno `2.9.2` on
  Apple Silicon macOS. These observations are development evidence, not a broad
  compatibility promise.
- Local Node 24 exposes `--experimental-sea-config` but not the newer
  `--build-sea`; Node SEA is therefore explicitly outside this plan.

### Effect conventions to follow

The current reference uses class-style `Context.Service`:

```ts
// .agent-sources/effect/packages/effect/src/Context.ts:161-185
class Config extends Context.Service<Config, {
  port: number
}>()("Config") {}
```

Use schema-backed tagged errors with the explicit self generic:

```ts
// .agent-sources/effect/packages/effect/src/Schema.ts:14449-14460
class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  id: Schema.Number
}) {}
```

Reusable library implementations should follow the reference repository's
`Effect.fnUntraced` convention. Intentional public spans belong around major
build phases, not every helper. Effect tests use `@effect/vitest`, `assert`, and
`it.effect`; each `it.effect` already owns a Scope.

The process substrate is explicitly unstable and must be quarantined:

```ts
// .agent-sources/effect/packages/effect/src/unstable/process/ChildProcess.ts:42-47
export interface StandardCommand extends
  Effect.Effect<
    ChildProcessHandle,
    PlatformError.PlatformError,
    ChildProcessSpawner | Scope.Scope
  >
```

The handle supplies separate stdout and stderr byte streams, an exit code, and
kill support. Do not use the merged `all` stream because it loses channel
identity. Drain stdout and stderr concurrently to avoid pipe deadlocks.

Effect interruption only aborts a wrapped promise when the underlying API
observes its `AbortSignal`:

```ts
// .agent-sources/effect/packages/effect/src/Effect.ts:890-892
// The thunk receives an AbortSignal that is aborted if the effect is
// interrupted. The underlying asynchronous operation only stops if it observes
// that signal.
```

That is why managed V1 uses supervised CLI processes. Callback-bearing native
APIs remain outside the managed plane until a process-isolated, serializable
worker protocol is justified.

### Runtime facts constraining the design

- Bun documents both `bun build` and `Bun.build`, watch on the CLI, API-only
  virtual files/plugins, structured `BuildOutput`, and executable compilation:
  <https://bun.com/docs/bundler> and <https://bun.com/reference/bun/build>.
- Deno documents standalone compilation and cross-target/watch options in the
  CLI, while `Deno.bundle` is a narrower experimental API:
  <https://docs.deno.com/runtime/reference/cli/compile/> and
  <https://docs.deno.com/api/deno/bundler/>.
- Deno's release policy says the 2.9 LTS line begins at 2.9.3 and warns that
  stable- and LTS-channel builds with the same version may differ at the byte
  level; official compatibility evidence therefore includes channel plus
  archive/binary digest, while ordinary configured-runtime observation refuses
  to infer either channel from a version string:
  <https://docs.deno.com/runtime/fundamentals/stability_and_releases/>.
- Node's built-in SEA generation is active development and consumes a bundled
  script rather than acting as a general bundler:
  <https://nodejs.org/api/single-executable-applications.html>.

So, among the initial three runtimes, two expose some TypeScript build-adjacent
API if Deno's experimental bundler is counted, but only Bun exposes a broad
build API; neither Deno nor Node exposes a TypeScript API with parity to its
standalone-executable CLI workflow. These are not three interchangeable build APIs. The normalized layer must
therefore model operations and lifecycle, while drivers own tool semantics.

## Architectural invariants

All implementation and review decisions must preserve these invariants.

1. **One semantic canon**: `ResolvedBuild` is the sole managed-build identity.
   User requests, argv, cache entries, records, and filesystem paths are inputs
   or projections, never competing canons.
2. **Exact routing**: a build names exactly one operation, driver, and surface;
   that exact driver descriptor fixes its V1 toolchain requirement and its
   Layer supplies one configured installation. No code tries alternatives or
   selects the first compatible registered driver.
3. **Separate host, tool, and target**: the runtime hosting effect-build, the
   tool being invoked, and the produced artifact target are independent facts.
4. **Operation-specific semantics**: `CompileExecutable`, `Bundle`,
   `Transpile`, `TypeCheck`, `Package`, and future operations are separate
   protocols. Each operation alone projects its validated recipe into one
   canonical resolved recipe plus core execution contract; drivers do not copy
   entrypoints, contexts, targets, or output contracts into their own inputs.
   There is no universal options bag.
5. **Serializable managed boundary**: every managed request, resolved driver
   input, plan, artifact manifest, diagnostic, and durable record has an Effect
   Schema. Callback-bearing or runtime-object input is structurally native.
6. **Snapshot inputs**: managed recipes contain a content-addressed
   `BuildContextRef`, not a live absolute workspace path. Snapshot creation is
   a separate Effect and is the point-in-time boundary.
7. **Exact tool evidence**: planning records the descriptor's required profile,
   reported version, executable and required tool-asset digests/lengths/targets,
   driver version, and `ConfiguredObserved` provenance. Distribution/channel
   belongs only to an independently verified install capability or CI fixture
   evidence; it is never inferred from a configured path/version. Host-local paths are execution
   capability, not semantic identity. Immediately before spawn, execution
   re-stats and re-hashes that path and fails with `ToolchainChanged` on any
   mismatch. No library code installs or downloads a tool automatically.
8. **No ambient semantic input in cacheable work**: undeclared environment,
   config discovery, mutable network resources, callbacks, or host files make a
   build cache-ineligible.
9. **Core-owned outputs**: drivers receive a private staging capability and
   never a user destination. Only core validates, hashes, stores, and later
   materializes artifacts.
10. **No partial publication**: rejected, failed, interrupted, or
    outcome-unknown attempts publish no new user-visible output and preserve the
    previous materialization.
11. **Compiler rejection is data after spawn**: syntax/module-resolution
    failures and nonzero CLI exits from the selected build invocation produce
    `BuildRejected`; they are not infrastructure errors. A recipe whose declared
    entrypoint is absent from its immutable context fails operation resolution
    before an attempt and is not mislabeled as a compiler outcome.
12. **Infrastructure failures are typed errors**: unavailable tools, unsupported
    versions, spawn failures, process termination, artifact violations, storage
    failures, and record failures use the Effect error channel.
13. **Interruption remains interruption**: do not translate Effect interruption
    into a normal `BuildError`. After the execution Scope closes, an
    uninterruptible outer finalizer persists `InterruptedRecord` only when
    termination is confirmed; otherwise it persists `OutcomeUnknownRecord` and
    re-emits a Cause that still contains the original interruption.
14. **Truthful bounded evidence**: normalized diagnostics are additive. Within
    declared quotas, raw stdout, raw stderr, and native diagnostic payloads
    remain separately addressable. Overflow stores only a bounded prefix marked
    incomplete and becomes `EvidenceLimitExceeded`; never call that prefix
    lossless or claim a total order between stdout and stderr observations.
15. **Artifact identity is content**: a filesystem destination is a projection.
    V1 artifact identity is SHA-256 content digest plus logical path, byte
    length, media type, and executable bit.
16. **Attempt data is not semantic identity**: timestamps, attempt IDs, trace
    IDs, staging paths, cache policy, queue state, and destination paths never
    enter the resolved-build digest.
17. **No transparent retry**: the executor invokes a selected driver at most
    once per attempt. A caller may explicitly create a new attempt.
18. **Watch is a session**: future watch/incremental support is a scoped stream
    of independently recorded rebuilds, never `watch?: boolean`.
19. **Remote is coordination**: future remote queues, leases, placement, and
    outcome recovery wrap the same local executor and do not enter core's
    one-attempt state machine.
20. **Effect composes builds**: do not create a DAG, task graph, registry-based
    scheduler, or build language until a demonstrated serializable-remote use
    case cannot be served by ordinary Effect composition.
21. **A plan is not execution authority**: `ResolvedBuild` is canonical Schema
    data, but decoded data alone can never authorize a local spawn. Execution
    requires an opaque `PreparedBuild` containing a locally resolved capability,
    and that capability is revalidated immediately before use.
22. **Acknowledged storage is crash-durable**: content and terminal-record puts
    do not succeed after rename alone or use check-then-replace. The
    implementation syncs bytes, atomically installs without replacing an
    existing key, syncs the containing directory where required, and verifies
    the installed value. A host that cannot prove this contract fails
    capability preflight before an attempt; it may not relabel process-visible
    page-cache state as durable persistence.

## Semantic compression target

This is greenfield, so there is no honest source-line deletion baseline and no
sLOC-reduction claim. The forcing function is state-space compression:

| Dimension | V1 target | What it rules out |
|---|---:|---|
| Managed semantic canons | 1 `ResolvedBuild` | request/argv/path/cache-key peers |
| Local execution capabilities | 1 opaque `PreparedBuild` | executing decoded plans or host paths directly |
| Normalized operations | 1 `CompileExecutable` | universal option bags |
| Resolved operation projections | 1 per operation | driver-owned copies of common recipe semantics |
| Real managed drivers | 2 explicit CLI drivers | automatic discovery/fallback |
| Driver-selection branches in core | 0 | registries and backend switches |
| Public environment choices | 1 `Empty` | ambient/custom/secret states |
| Artifact kinds | 1 regular file | partial directory/symlink semantics |
| One-shot workflow variants | 1 plan/runPrepared path | retry/cache/watch/native mixtures |
| Publication owners | 1 core materializer | driver/user destination writes |
| Legacy adapters/fallbacks | 0 | compatibility debt before a first release |

Tests, fixtures, generated docs, and plans are measured separately from future
production source. Do not call added schemas or modules “compression” unless
they make one of the invalid states or peer workflows above impossible.

## Canonical model

### Request, plan, attempt, artifact, and destination are different things

```text
BuildContext.snapshot(local directory)
  -> BuildContextRef

BuildRequest
  = operation recipe (including BuildContextRef)
  + exact driver identity/config
  + EnvironmentContract.Empty in V1

Configured driver Layer
  = absolute executable/required-asset paths
  -> validated private toolchain capability matching the exact descriptor pin

Build.plan(driver, request)
  -> PreparedBuild(ResolvedBuild + ResolvedBuildDigest + local execution capability)

Build.run(driver, request)
  = Build.plan(driver, request) + Build.runPrepared(prepared)

Build.runPrepared(prepared)
  -> Executed(BuildSucceeded | BuildRejected)
  or typed infrastructure failure / Effect interruption

Build.acquire(cache-eligible resolved build)          [future]
  -> Executed(BuildSucceeded | BuildRejected)
  | Restored(previous successful artifacts)

Artifact.materialize(artifact set, destination)
  -> atomic user-facing filesystem projection
```

Use these names consistently. In particular, `materialize` means projecting
stored artifacts to a destination; it does not mean “maybe run a build.”

`ResolvedBuild` is the sole serialized semantic identity, but it is deliberately
not an execution token. `PreparedBuild<O, D>` is an opaque, non-Schema
capability whose operation and exact driver descriptor stay statically
correlated:

```ts
interface PreparedBuild<
  O extends BuildOperation.Any,
  D extends ManagedDriverDescriptor.ForOperation<O>
> {
  readonly resolvedBuild: ResolvedBuild<O, D>
  readonly digest: ResolvedBuildDigest
  readonly [PreparedBuildTypeId]: unknown // unexported nominal key
}
```

The public type exposes a recursively frozen plain `resolvedBuild` and `digest`
for inspection, but neither the symbol nor the private payload.
`src/internal/PreparedBuild.ts` retains that payload in a package-private weak
association containing the canonical resolved-build bytes/digest, the exact
`ManagedDriverImplementation` instance selected by `Build.plan`, its captured
immutable `DescriptorExecutionProfile`, `ExecutionToolchainHandle`, and a
private token for the exact captured built-in operation implementation, plus a
`PreparedDriverFingerprint`. The fingerprint is a
domain-separated digest, computed only by core from the canonical tuple of
operation identity, driver ID/version/surface, and the exact
`DriverInvocationContractV1`; it is a commitment to the existing contract
canon, not a second authored descriptor. Only `Build.plan` constructs it.
`Build.runPrepared(prepared)` accepts no replaceable driver. It retrieves the
exact captured implementation/profile, re-encodes the public inspection value,
and requires exact equality with the private canonical bytes/digest before it
allocates an attempt ID or revalidates its toolchain capability. Forced mutation
is `PreparedBuildChanged` with no attempt, staging, or spawn; a second same-label
implementation is never selectable. Invocation authorization reads only the
captured profile, operation projection uses only the captured private projector/
codecs, and neither rereads the public descriptor/operation/Schemas. It never accepts a decoded
`ResolvedBuild`. A future remote
worker may decode a `ResolvedBuild`, but must resolve it again into a new local
`PreparedBuild` and prove the digest is unchanged before execution.

### `ResolvedBuild`

The canonical schema must contain:

```ts
interface ResolvedBuild<
  O extends BuildOperation.Any,
  D extends ManagedDriverDescriptor.ForOperation<O>
> {
  readonly protocolVersion: 1
  readonly operation: {
    readonly id: OperationId
    readonly version: number
    readonly resolvedRecipe: BuildOperation.ResolvedRecipe<O>
    readonly context: BuildContextRef
    readonly target: TargetIdentity
    readonly outputs: OutputContract
  }
  readonly driver: {
    readonly id: DriverId
    readonly version: string
    readonly surface: "Cli" | "ManagedWorker"
    readonly resolvedInput: ManagedDriverDescriptor.ResolvedInput<D>
  }
  readonly toolchain: ResolvedToolchain
  readonly environment: EnvironmentFingerprint
  readonly executionPlatform: ExecutionPlatformIdentity
  readonly evidence: EvidenceContract
  readonly engineProtocolVersion: 1
}
```

The actual implementation should use Schema classes and branded identifiers.
The sketch shows the wire shape; the concrete operation and descriptor retain
the exact recipe/config/resolved-input relationship in public TypeScript.
The package-private operation implementation's captured projector is the sole
projector from validated request recipe plus the verified context manifest and
resolved execution-platform facts
to the nested operation value
`{ id, version, resolvedRecipe, context, target, outputs }`.
`CompileExecutable.ResolvedRecipe` contains only its snapshot-relative
entrypoint; context, exact target, and logical executable contract occur inside
that operation value exactly once. Driver
`ResolvedInput` contains only driver-specific semantic input. Cross-field Schema
validation rejects a decoded plan whose operation, driver, toolchain, and
execution-platform facts disagree.

Encode this value with RFC 8785 canonical JSON and hash the domain-separated
bytes with SHA-256:

```text
"effect-build/resolved-build/v1\0" + canonical-json(resolvedBuild)
```

The digest includes every declared semantic input and excludes attempt-local
data. A plan digest is a trustworthy cache key only when `CacheEligibility` is
derived as `Eligible`; equal declared inputs alone do not prove ambient input
closure.

`ExecutionPlatformIdentity` records only platform facts the selected driver
declares semantically relevant. In V1 it is exactly OS, architecture, and ABI;
filesystem/path/durability facts are runtime evidence for the actual configured
roots and do not enter compiler identity. The Node/Bun/Deno runtime hosting the Effect
controller is attempt evidence and stays outside plan identity unless a driver
actually executes inside that runtime. Tool host and artifact target remain
separate even when both resolve from a `CurrentHost` request.

Define one canonical `ExecutablePlatformTarget` projection containing only
OS, architecture, and executable ABI. Its closed ABI algebra is
`gnu | musl | darwin | windows`; legal products are Linux with `gnu | musl`,
macOS with `darwin`, and Windows with `windows`, each on `x86_64 | aarch64`.
Reject every other decoded product. Native inspection always proves only the
format, bit class, endianness, and machine encoded in the bytes. It may also
prove Linux ABI only from an exact recognized ELF `PT_INTERP` path; an
ambiguous, static, or unknown ELF returns typed `ExecutionAbiUnknown` and must
never infer glibc/musl from the ELF OSABI byte. Mach-O maps to the coarse
`darwin` ABI and PE to the coarse `windows` ABI; do not claim an MSVC toolchain.
Universal Mach-O must contain the requested slice exactly once and reject
conflicting/duplicate slices. `ToolchainAssetIdentity.target` uses this
projection; filesystem/path/durability capabilities remain root-specific
`HostCapabilityEvidence` and are never claimed by a binary header or copied
into `ExecutionPlatformIdentity`.

Make current execution identity explicit rather than consulting controller
globals. `ExecutionPlatform.Current` is a public Effect service with frozen
runtime key `effect-build/ExecutionPlatform/Current`; its payload is an opaque,
non-constructible `CurrentHandle`, not a structural identity. The handle has a
recursively frozen public identity inspection plus an unexported nominal key,
while a core-private WeakMap binds it to canonical identity bytes and the exact
successful probe/native observation. Build unwraps it and compares the public
inspection to the private canon before any root initialization/planning. A
caller-forged `Layer.succeed`, reflected-symbol clone, mutation, serialization,
or handle issued under a different implementation fails
`ExecutionPlatformCapabilityInvalid` before side effects. Only these
public constructors: `ExecutionPlatform.layerNode({ executable })`,
`ExecutionPlatform.layerBun({ executable })`, and
`ExecutionPlatform.layerDeno({ executable })`. Each accepts one validated
absolute controller executable, runs its fixed strict JSON OS/architecture
probe in a fresh private `ProbeCwd`, and inspects those exact executable bytes
for the ABI witness above. It performs no `PATH`, `process.platform`, global
runtime, environment, or fallback discovery. Core resolves this service once;
the selected driver probe, native executable/asset observations, and the
resulting `ExecutionPlatformIdentity` must agree or fail with
`ExecutionPlatformMismatch`, `ToolchainPlatformMismatch`, or
`ExecutionAbiUnknown` before an attempt. `Build.layerLocal` requires this
service in addition to its platform filesystem/process services; it never
constructs a hidden default host identity.

`EvidenceContract` includes versioned per-channel byte limits and raw-retention
policy. Limits are engine policy, not ad hoc caller flags, but enter the
resolved identity because exceeding them changes the attempt disposition.

Split semantic tool identity from the host-local capability:

```ts
interface ResolvedToolchain {
  readonly name: string
  readonly requiredProfile: ToolRequirementProfile
  readonly observation: {
    readonly reportedVersion: string
    readonly binaryDigest: Sha256Digest
    readonly binaryByteLength: SafeByteLength
    readonly provenance: "ConfiguredObserved"
  }
  readonly requiredAssets: ReadonlyArray<ToolchainAssetIdentity> // canonical role order
}

interface ExecutionToolchainHandle {
  readonly absolutePath: string
  readonly plannedStat: ToolFileStat
  readonly assetHandles: ReadonlyArray<ToolchainAssetHandle>
  readonly probeEvidence: ToolProbeEvidence
}

interface ToolchainResolution {
  readonly [ToolchainResolutionTypeId]: unknown // unexported nominal key only
}
```

`ResolvedToolchain` enters `ResolvedBuild`; `requiredProfile` records descriptor
policy while `observation.provenance` honestly says only that configured bytes
were hashed/probed. A path and self-reported version never prove an official
archive; `OfficialArchiveVerified` would require a future core-issued install
proof. CI archive verification is separate compatibility evidence. The absolute path, inode/file ID,
timestamps, and probe transcript do not. `ExecutionToolchainHandle` stays inside
the opaque prepared value and contains no peer `expected` semantic identity.
The closed core `ToolchainProbe` constructor derives one branded
`ToolchainResolution` atomically from observed bytes/probe evidence plus the
selected invocation contract. A core-private `WeakMap` associates the otherwise
opaque token with `{ semantic, executionToolchain, driverFingerprint }`;
neither property mutation, a symbol lookup, reflection, serialization, nor
stringification by driver code can reveal or replace semantic facts, a host
path, or the fingerprint. Drivers cannot construct or pair those parts
independently. `Build.plan` unwraps the association, requires its fingerprint to
equal the exact captured `DescriptorExecutionProfile` fingerprint, copies its
semantic value into
`ResolvedBuild.toolchain`, and retains the handle, fingerprint, and exact
driver implementation only in the private `PreparedBuild` association.
Immediately before spawn, core re-stats and re-hashes the absolute path and
every executable tool asset, then compares reported version, binary identity,
asset roles, and probe compatibility directly with
`prepared.resolvedBuild.toolchain` and the plan's sole `executionPlatform`.
Replacement produces `ToolchainChanged`, never implicit replanning. This closes
the ordinary plan-to-spawn replacement gap, but a remaining check-to-exec race
means V1 can claim `Observed` and qualified `InputClosed`, not hermetic tool
execution.

### Outcome and durable-record algebra

Use exhaustive tagged unions rather than optional-field bags:

```ts
type BuildOutcome<A> =
  | BuildSucceeded<A>
  | BuildRejected

type BuildAcquisition<A> =
  | Executed<A>   // contains a BuildOutcome<A>
  | Restored<A>   // references the original successful execution record

type AttemptRecord =
  | ExecutedRecord       // disposition is Succeeded or Rejected
  | InfrastructureFailedRecord
  | DefectedRecord       // sanitized defect fingerprint, Cause is re-emitted
  | InterruptedRecord    // termination confirmed
  | OutcomeUnknownRecord // termination or remote outcome not confirmed

type MaterializationOutcome =
  | Materialized
  | MaterializationFailed
```

`Build.run` performs no cache lookup or retry and invokes the selected driver at
most once. If the compiler completes, it returns `Executed`; planning or
infrastructure may fail before that. `Build.acquire` is the future cache-aware
operation and may return `Restored`. A restored result must never fabricate a
native compiler return value or fresh diagnostics.

`Build.requireSuccess` is a derived helper that converts `BuildRejected` into a
typed `BuildFailed` for workflows that prefer fail-fast composition. The base
executor preserves rejection as successful Effect data.

`MaterializationOutcome` is the immediate Schema result, not a promised durable
record. Atomically coupling a user-filesystem rename with a separate record
store is impossible without a journal/recovery protocol. V1 does not invent
that transaction; a later publication journal must be its own plan.

Terminal recording is part of the executor contract, not best-effort telemetry.
Planning is not yet an execution attempt: `Build.plan` allocates no attempt ID,
staging, or `AttemptRecord`, and a planning error returns with span/log evidence
only. After validating the prepared capability and its captured immutable
driver fingerprint, `Build.runPrepared` creates the
attempt ID at the explicit attempt boundary; from then on, every terminal state
owes a record under the table below. If durable planning
audits are later needed, add a distinct request/planning record rather than an
`AttemptRecord` lacking a resolved identity.

`BuildRecordStore.putIfAbsent(record)` accepts one validated `AttemptRecord` and
derives its key, canonical bytes, and domain-separated record hash inside the
store boundary. It is idempotent only when an existing record at the embedded
attempt ID has the same canonical bytes and derived hash. Any different record
at that ID fails with `AttemptRecordConflict`; there are no peer caller-supplied
ID/hash/byte canons to disagree. The executor generates the attempt ID; callers
cannot reuse an ID to request a retry. Apply this transition table after the
inner execution Scope has closed:

| Inner terminal state after cleanup | Record to persist | Returned Effect/Cause after persistence |
|---|---|---|
| `BuildSucceeded` or `BuildRejected` | `ExecutedRecord` | Return `Executed` only after persistence succeeds |
| Typed infrastructure error | `InfrastructureFailedRecord` | Re-fail with the original typed error |
| Defect, with termination/cleanup confirmed | `DefectedRecord` with sanitized fingerprint | Re-emit the original defect Cause |
| Interruption, with termination confirmed | `InterruptedRecord` | Re-emit a Cause still containing the original interruption |
| Interruption/defect with termination unknown | `OutcomeUnknownRecord` with quarantine/cleanup disposition | Re-emit the original Cause; never report ordinary completion |

The outer recording step runs uninterruptibly. If persistence fails, do not
claim a durable record and do not return an executed value. Return or append a
`RecordPersistenceError` containing the original typed error/Cause metadata and
the sanitized pending record hash, never raw logs or environment values. For an
interrupted or defected attempt, combine the persistence failure with the
original Cause without deleting its interruption/defect. Immutable content
blobs written before this point may remain as garbage-collectable orphans.
Confirmed terminals remove staging. If a process outcome/termination is
unknown, move staging to an engine-private quarantine when safe or record that
cleanup remains unresolved; never reuse or materialize it.

For the built-in filesystem stores, “persistence succeeds” is a capability
claim: sync the completed temporary file, atomically install it without replace
in the same private directory, sync the containing directory when required for
entry durability, then read back and verify identity. A supported implementation
may use a private temporary hard-link install followed by unlinking the temp;
the linked inode never enters staging or a caller-writable destination. A
check-then-rename sequence is forbidden. Use the same commit protocol for content
blobs before a terminal record can reference them. If the current filesystem
adapter cannot express or prove the required behavior, fail store-layer
construction with `UnsupportedStoreDurability` before any attempt. A weaker
best-effort store may exist only as an explicitly different future service
whose results are not returned as V1 `Executed`.

The terminal-decision boundary is closure of the inner execution Scope. An
interruption observed before that boundary classifies the attempt as interrupted
or outcome-unknown. An interruption requested afterward cannot rewrite a
truthful succeeded/rejected/failed record; recording completes uninterruptibly,
then caller cancellation is restored. Interruption during artifact storage may
leave immutable orphan blobs but never a published output.

### Build phases

```text
Received
-> Resolving
-> Prepared
-> RevalidatingToolchain
-> Staging
-> Executing
-> ValidatingArtifacts
-> StoringArtifacts
-> Recording
-> Executed(Succeeded | Rejected)
```

Typed infrastructure failure may terminate any phase. Interruption initiates
cleanup and termination confirmation. There is no retry transition and no
alternate-driver edge.

The `Received -> Resolving -> Prepared` portion belongs to `Build.plan` and has
no attempt record. The recorded attempt state machine begins at
`RevalidatingToolchain` inside `Build.runPrepared`.

Implement the one-shot lifecycle with `Effect.uninterruptibleMask`: restore
interruptibility around the actual attempt inside an internal `Effect.scoped`
region; let that Scope own context materialization, spawn, concurrent stream
drainage, kill confirmation, and staging cleanup; then classify the resulting
`Exit` plus `CleanupReport` and persist the terminal record in the masked outer
region. Public `Build.run` and `Build.runPrepared` therefore require no
`Scope.Scope`. A later watch/session API intentionally exposes Scope.

### Artifact contract

V1 supports regular files only:

```ts
interface ArtifactIdentity {
  readonly logicalPath: ArtifactPath // relative POSIX-style path
  readonly digest: Sha256Digest
  readonly byteLength: number
  readonly mediaType: string
  readonly executable: boolean
}

interface ArtifactRef {
  readonly identity: ArtifactIdentity
  readonly storeRef: ArtifactStoreRef
}
```

`ArtifactIdentity` and the canonically ordered artifact-set manifest are
store-independent. `ArtifactStoreRef` is only a locatable projection and never
enters an artifact or plan digest.

Reject absolute paths, empty segments, `.`/`..`, NUL, duplicate logical paths,
backslashes, non-NFC text, control characters, portable-name collisions
(including Unicode-normalized/case-folded collisions), Windows reserved names,
segments ending in dot/space, symlinks, sockets, devices, missing declared
outputs, undeclared extra outputs, and anything resolving outside staging.
V1 deliberately uses a conservative portable `ArtifactPath`; a later
host-specific artifact kind must be explicit rather than weakening this type.
Preserve executable intent explicitly rather than treating a full POSIX mode as
portable.

For user materialization, byte-copy into a sibling temporary file on the
destination filesystem, flush it when the platform exposes a durability
primitive, verify its digest and length, apply executable intent, and atomically
rename it into place. V1 never hard-links a content-store inode into a
user-writable location: a later mutation would corrupt every reference to that
blob. Reflinks remain future work until copy-on-write behavior is proven on each
advertised filesystem. Keep the content-store root engine-private and its blob
files non-writable. If the host cannot make replacement atomically visible,
fail with `UnsupportedPublicationGuarantee`; if directory/file flushing is not
available, report the weaker crash-durability evidence rather than claiming it.

Do not overstate path-race safety. Private store/staging roots are engine-owned
and non-shared. Source and destination roots are caller-owned: re-stat and
revalidate path components immediately around reads/replacement, and reject any
observed change, but document the remaining check-to-use race when the platform
adapter lacks handle-relative no-follow operations. V1 then claims static
containment plus `Observed` evidence, not resistance to an adversarial process
renaming ancestors concurrently. If a future adapter exposes a scoped directory
handle that closes this gap, advertise that stronger capability explicitly.

### Environment and secrets

- The only public V1 request environment is nominal `EnvironmentContract.Empty`.
  A request for a user variable, secret, inherited environment, or custom value
  fails with `UnsupportedCapability` before snapshot materialization or spawn.
  A secret-input service is a later plan; redaction is not a substitute for
  declaring and resolving a semantic input.
- Driver Layers receive explicit absolute tool/asset paths; neither planning nor
  spawn searches `PATH`. The spawned process receives no inherited environment
  wholesale.
- `EnvironmentFingerprint` is the closed singleton `EmptyV1` in managed V1.
  It has no host allowlist, names, hashes, or extension fields. A future
  operation that cannot avoid semantic host environment must version the model
  and cache contract rather than silently widening this fingerprint.
- Fixed driver literals are descriptor semantics. Attempt-scoped values such as
  staging output and `DENO_DIR` paths live only in a private
  `ExecutionEnvironmentHandle`; records may name their role/disposition but
  contain neither their value nor a value digest. They never enter
  `EnvironmentFingerprint` or `ResolvedBuild` identity.
- No encoded request or durable record shape has a field capable of containing
  a raw environment value. Raw tool logs may still echo sensitive source/tool
  content, so they remain local content refs and are never uploaded or printed
  automatically.
- Managed V1 disables ambient configuration discovery where the selected tool
  provides such a flag. Explicit config and lock files must live in the source
  snapshot.

## Public API target

Use namespace modules and data-last composability consistent with Effect. The
ergonomic path should read approximately as follows:

```ts
import { Effect, Layer } from "effect"
import * as NodeServices from "@effect/platform-node/NodeServices"
import {
  Artifact,
  Build,
  BuildContext,
  CompileExecutable,
  ExecutionPlatform
} from "effect-build"
import * as BunCli from "effect-build/bun/BunCli"

const program = Effect.gen(function*() {
  const context = yield* BuildContext.snapshot({
    root: "/absolute/project/path",
    include: ["src/**", "package.json", "bun.lock"]
  })

  const recipe = yield* CompileExecutable.makeEffect({
    context,
    entrypoint: "src/main.ts",
    output: "app",
    target: { _tag: "CurrentHost" }
  })

  const request = yield* BunCli.makeCompileExecutableRequest({ recipe })

  const driver = yield* BunCli.Driver
  const executed = yield* Build.run(driver, request)
  const success = yield* Build.requireSuccess(executed.outcome)

  yield* Artifact.materialize(success.artifacts, {
    directory: "/absolute/project/path/dist"
  })
})

const Core = Build.layerLocal({
    contentRoot: "/absolute/private/content",
    recordRoot: "/absolute/private/records",
    workRoot: "/absolute/private/work"
  }).pipe(
    Layer.provide(
      ExecutionPlatform.layerNode({ executable: "/absolute/tools/node-24.14.1" })
    )
  )

const Live = Layer.merge(
  Core,
  BunCli.layer({ executable: "/absolute/tools/bun-1.3.9" }),
).pipe(Layer.provide(NodeServices.layer))

const runnable = Effect.provide(program, Live)
```

Names may change during implementation only if type tests demonstrate a clearer
Effect-native API. Preserve the semantic sequence and boundaries. The type test
must prove the fully provided program's environment is `never`; merging
`ExecutionPlatform.Current` as a sibling of `Build.layerLocal` is invalid
because sibling Layer outputs do not satisfy one another's requirements.

### Core services

```text
BuildExecutor
|- ContentStore
|- BuildRecordStore
|- ExecutionPlatform.Current (explicit configured controller Layer)
`- ProcessExecutor (internal unstable-Effect quarantine)
   `- effect ChildProcessSpawner

BunCli.Driver / DenoCli.Driver
`- ToolchainProbe (closed version/identity probe; no argv/cwd/environment API)
   `- ProcessExecutor (internal planning-probe path)
```

- `BuildExecutor` is justified because it owns staging, execution phases,
  artifact authority, records, and spans. It is not a forwarding wrapper.
- `Build.plan(driver, request)` resolves canonical data and returns an opaque
  `PreparedBuild`; `Build.runPrepared(prepared)` revalidates and executes the
  exact private driver/tool capability captured by planning;
  `Build.run(driver, request)` is exactly their composition. All three require
  `BuildExecutor`. The request and public driver handle are separate inputs to
  planning; the prepared implementation/tool payload is never serialized or
  replaceable at execution.
- `BuildContext.snapshot` and `Artifact.materialize` also require
  `BuildExecutor` and delegate to its store-bound methods. They use the same
  private `ContentStore` captured by `Build.layerLocal`; no internal store tag
  leaks into the public program environment.
- Concrete services such as `BunCli.Driver` and `DenoCli.Driver` are explicitly
  yielded and passed; backend selection is not hidden in `BuildExecutor`.
- Driver layer constructors capture only a closed `ToolchainProbe` capability
  for the configured tool. During Layer acquisition, core binds the configured
  executable and descriptor's bounded fixed-literal version-probe profile into
  a zero-argument `probe()` capability with an engine-private empty cwd,
  complete non-inherited replacement environment, strict output limit, and
  timeout. Node/Bun probe environments are empty; Deno's exact replacement is
  fresh `DENO_DIR` plus `DENO_NO_UPDATE_CHECK=1` and `DENO_NO_PROMPT=1`. The retained capability accepts
  no caller argv, cwd, environment, or output and cannot express a managed
  build; neither the constructor nor
  hidden driver implementation references `ProcessExecutor` or
  `ChildProcessSpawner`.
  Request construction and post-layer resolution methods have `R = never`.
  `BuildExecutor` alone calls `ProcessExecutor` for the managed
  build inside an internal `Scope.Scope`, which it supplies and closes. The
  restricted planning-time tool-probe facade is separate. The future public session API
  also requires `Scope.Scope`.
- Keep `ProcessExecutor` internal. It is the only module allowed to import
  `effect/unstable/process`.
- V1 must provide one exact constructible private-storage ingress.
  `Build.layerLocal` accepts
  explicit private content/record/work roots, probes crash-durable store
  support, and yields `BuildExecutor`. At Layer acquisition it creates/
  canonicalizes the roots without symlink components, proves their filesystem
  identities are pairwise disjoint and non-nested in both directions, and
  fails if the platform cannot prove that fact. Cleanup is restricted to a
  freshly allocated leaf under `workRoot`, never any configured root. It requires application-provided Effect
  `FileSystem`, `Path`, clock/random, and platform process services as indicated
  by its Layer type. `BunCli.layer({ executable })` and
  `DenoCli.layer({ executable, denort })` accept absolute configured paths,
  validate the fixed descriptor tool requirements, construct private handles
  internally, and yield their `Driver` service tags. Requests never contain
  host paths, tests pass harness paths to these layer factories rather than
  constructing handles, and no factory searches/falls back/downloads. Platform
  Node/Bun/Deno live layers remain application-provided.

Snapshot roots and materialization destinations remain explicit per-call local
inputs. They are deliberately not Layer configuration, plan identity, or
durable-record fields. Before touching them, the store-bound executor resolves
existing ancestors/file identities and rejects any path that equals, contains,
is contained by, or symlink-aliases content, record, or work roots. This applies
to snapshot sources and both materialization parent/destination paths; inability
to prove separation is a typed pre-side-effect failure, not a permissive mode.

Use current Effect v4 syntax:

```ts
interface OperationResolution<R> {
  readonly resolvedRecipe: R
  readonly context: BuildContextRef
  readonly target: TargetIdentity
  readonly outputs: OutputContract
}

interface BuildOperation<
  Id extends OperationId,
  Version extends number,
  Recipe,
  ResolvedRecipe,
  Success
> {
  readonly id: Id
  readonly version: Version
  readonly recipeSchema: Schema.Schema<Recipe>
  readonly resolvedRecipeSchema: Schema.Schema<ResolvedRecipe>
  readonly successSchema: Schema.Schema<Success>
}

// Package-private construction input; never emitted from the public root.
interface BuildOperationImplementation<O extends BuildOperation.Any> {
  readonly publicView: O
  readonly resolveRecipe: (
    recipe: BuildOperation.Recipe<O>,
    facts: {
      readonly executionPlatform: ExecutionPlatformIdentity
      readonly contextManifest: BuildContextManifest
    }
  ) => Effect.Effect<
    OperationResolution<BuildOperation.ResolvedRecipe<O>>,
    OperationResolutionError
  >
}

type ResolvedOperation<O extends BuildOperation.Any> =
  OperationIdentity<O> &
  OperationResolution<BuildOperation.ResolvedRecipe<O>>

export class BuildExecutor extends Context.Service<BuildExecutor, {
  readonly snapshot: (
    options: BuildContext.SnapshotOptions
  ) => Effect.Effect<BuildContextRef, BuildContextSnapshotError>
  readonly materialize: (
    artifacts: ArtifactSet,
    options: Artifact.MaterializeOptions
  ) => Effect.Effect<MaterializationOutcome, MaterializationError>
  readonly plan: <
    O extends BuildOperation.Any,
    D extends ManagedDriverDescriptor.ForOperation<O>
  >(
    driver: ManagedDriver<O, D>,
    request: ManagedBuildRequest<O, D>
  ) => Effect.Effect<PreparedBuild<O, D>, BuildPlanningError>
  readonly runPrepared: <
    O extends BuildOperation.Any,
    D extends ManagedDriverDescriptor.ForOperation<O>
  >(
    prepared: PreparedBuild<O, D>
  ) => Effect.Effect<Executed<BuildOperation.Success<O>>, BuildExecutionError>
  readonly run: <
    O extends BuildOperation.Any,
    D extends ManagedDriverDescriptor.ForOperation<O>
  >(
    driver: ManagedDriver<O, D>,
    request: ManagedBuildRequest<O, D>
  ) => Effect.Effect<
    Executed<BuildOperation.Success<O>>,
    BuildPlanningError | BuildExecutionError
  >
}>()("effect-build/BuildExecutor") {}
```

The exact generic implementation may need an internal type-lambda encoding.
Protect user-facing inference with Tstyche tests. Do not expose unsimplified
internal intersections or `any` to make the signature compile.

`BuildContext.snapshot` and `Artifact.materialize` are namespace functions that
delegate to these two store-bound methods. They do not request a second
`ContentStore` service. The `BuildExecutor` yielded by `Build.layerLocal`
captures the same private content store used by planning, execution, and
materialization, so the complete public sample has no residual internal-service
requirement after its core and driver Layers are provided.

### Public driver handle and private implementation protocol

The public selectable value is operation-specific but opaque. It is safe to
yield from a concrete Effect service and pass to `Build.plan`/`run` without
exposing executor capabilities in emitted declarations:

```ts
interface ManagedDriver<
  O extends BuildOperation.Any,
  D extends ManagedDriverDescriptor.ForOperation<O>
> {
  readonly descriptor: D
  readonly [ManagedDriverTypeId]: unknown // unexported nominal key
}
```

V1 is intentionally closed to the built-in `CompileExecutable` operation and
Bun/Deno drivers. Generic operation/descriptor/request factories are
package-private; public modules expose readonly type views, concrete Schemas,
and validated concrete request constructors only. Otherwise consumers could
construct extension requests without any legal way to construct the private
driver SPI. A future third-party driver API requires its own security and
versioning design.

The package-private operation factory compiles strict recipe/resolved-recipe/
success encoder-decoder closures and captures the projector once at module
initialization. It shallow-freezes the public operation wrapper and associates
that wrapper with the captured implementation through a private WeakMap. The
concrete request factory captures the same implementation token. `Build.plan`
unwraps and uses only those private closures; it never rereads a public
operation property or public Schema object. Replacing public wrapper methods,
mutating/replacing Schema `.ast`/methods, or presenting a same-ID/version
operation object therefore cannot change ingress, projection, canonical bytes,
target, outputs, or success decoding. Mutation and same-label substitution
tests are required.

The internal descriptor factory strictly decodes a plain
`DescriptorExecutionProfile` containing operation/driver identity and the full
invocation contract, recursively freezes only that owned Schema-encoded data,
computes its canonical fingerprint, and shallow-freezes the descriptor wrapper.
It also compiles and captures strict config/resolved-input encoder-decoder
closures once. It does not recursively freeze Effect `Schema` objects. The
wrapper retains the exact config/resolved-input Schema objects by identity for
public typing and introspection, while concrete request ingress and core
canonicalization use only the captured private codecs and core reads runtime
authorization only from the private captured profile. Built-in descriptor
modules must use this factory at module initialization; mutation attempts before
Layer acquisition or planning cannot change identity, tool, template, binding,
policy, accepted input, or canonical bytes.

The package-private `src/internal/ManagedDriverImplementation.ts` owns the
implementation SPI and associates it with that handle through an unexported
capability. It is not re-exported by the root or driver subpaths and must not
appear in their emitted `.d.ts` signatures:

```ts
interface ManagedDriverImplementation<
  O extends BuildOperation.Any,
  D extends ManagedDriverDescriptor.ForOperation<O>
> {
  readonly publicHandle: ManagedDriver<O, D>

  readonly resolve: (
    input: {
      readonly config: ManagedDriverDescriptor.Config<D>
      readonly operation: ResolvedOperation<O>
      readonly executionPlatform: ExecutionPlatformIdentity
    }
  ) => Effect.Effect<
    DriverResolution<ManagedDriverDescriptor.ResolvedInput<D>>,
    DriverResolutionError
  >

  readonly interpretCompletion: (
    completion: ProcessCompletion
  ) => Effect.Effect<
    DriverCompletion<BuildOperation.Success<O>>,
    DriverInterpretationError
  >
}
```

Only package internals can construct or unwrap the implementation. Public
`BunCli.Driver` and `DenoCli.Driver` service values expose the opaque handle
shape above; their runtime service keys are respectively
`effect-build/BunCli/Driver` and `effect-build/DenoCli/Driver`, so merging both
Layers cannot collide. External declaration-consumer tests must prove that
`InvocationCapabilities`, `DriverInvocationSpec`, `ProcessCompletion`, the
implementation SPI, and internal argv renderers are unreachable.

`CompileExecutable` is one concrete `BuildOperation`; Bun and Deno each export
a different exact descriptor whose `Config` and `ResolvedInput` are owned by
that descriptor. The operation owns its request recipe, canonical resolved
recipe projection, core execution contract, and successful result. Driver
`ResolvedInput` is deliberately narrower: Bun V1's is strict empty and Deno
V1's contains only its optimization choice.

Each descriptor also owns exactly one `DriverInvocationContractV1`. It is the
runtime canon for exact tool-profile/version/asset requirements and a finite,
nonempty set of exact invocation variants. Each variant owns one canonical
Schema-encoded `ResolvedInput` match, exact executable/cwd/output selectors, the
complete ordered argument template, the complete environment replacement map,
and fixed managed-profile policies. Descriptor construction rejects duplicate
matches, partial templates, undeclared roles/slots, and a resolved-input value
with no unique variant. Bun has one `{}` variant; Deno has exactly the three
encoded optimization values. The same contract owns a strict bounded
`ProbeContractV1`: exact executable selector/argv, private empty cwd, complete
non-inherited environment template whose only permitted dynamic path token is the
probe-only `ProbeScratchPath`,
timeout/byte limit, stderr-empty rule, and one strict JSON stdout line whose
strict Schema maps reported version and OS/architecture to expected profile/
platform fields. Unknown keys, extra lines/bytes, malformed UTF-8/JSON,
truncation, or version/platform mismatch fail resolution. Core uses one generic
strict JSON decoder; no hidden Bun/Deno probe parser is another authority.
The probe contract also owns finite exact raw-value maps into canonical
`ExecutablePlatformTarget` OS names (`linux|macos|windows`) and architectures
(`x86_64|aarch64`); unknown values fail, while ABI comes from native-format
inspection. Core creates one fresh private empty `ProbeCwd` for every probe
call, regardless of whether the contract uses scratch, plus a distinct fresh
private directory when it binds `ProbeScratchPath`. Both are scope-cleaned
whether probing succeeds, fails, overflows, times out, or is interrupted. They
exist wholly before any build-attempt boundary, are never an attempt
`ScratchPath`, attempt ID, `ResolvedBuild` field, or durable-record field, and
cannot be used by a build invocation variant. Parent/user configuration files
must not contaminate either directory. Bun and Deno observations on one host
must normalize identically.
Thus required isolation flags and ordering cannot
drift in an un-fingerprinted renderer. `Compatibility.DriverCompatibility.fromDescriptor` is a pure
Schema projection for documentation/conformance; there is no separately
authored compatibility field, and core never authorizes execution from the
projection. Contract changes require a driver descriptor version change,
enforced by conformance tests, while the private prepared fingerprint and
captured implementation prevent execution-time substitution even if labels are
reused incorrectly.

`DriverResolution` pairs schema-encoded driver-specific input with one opaque
`ToolchainResolution` atomically created by core from the same observation.
Drivers cannot inspect or independently pair semantic identity, a local
execution handle, and the profile fingerprint. Core resolves the local execution platform once,
invokes the operation-owned projector once, then gives that immutable operation
and only the validated driver config to the selected driver for exact
tool/config resolution. A driver resolver cannot access the ingress Recipe or
whole `ManagedBuildRequest`. Core stores
the operation separately from driver input when constructing `ResolvedBuild`;
the handle is retained only inside `PreparedBuild`.
Core—not optional driver code—re-stats and re-hashes every executable/asset
handle immediately before spawn and may not silently rebuild the plan. The
exact internal generic form can differ, but these authority and serialization
boundaries cannot.

Core owns context materialization, staging/scratch roots, actual managed-build
process spawn, environment replacement, logs, artifact validation, storage,
record construction, and spans. After the attempt boundary it canonicalizes
the prepared driver's `ResolvedInput`, selects exactly one invocation variant
from the captured execution profile, and renders its closed template from
core-owned slots: descriptor-fixed `Literal`, operation-owned
`SnapshotEntrypoint`, `StagedOutput`, `ToolAsset(role)`, `ScratchPath`, and only
contract-exact `PrefixedCapability(fixedPrefix, StagedOutput)` forms. The driver
never selects a template and never receives `InvocationCapabilities`, a raw
path/environment value, `ProcessExecutor`, or `ChildProcessSpawner`; it owns
tool/config resolution and bounded completion interpretation only.

`InvocationCapabilities`, `ExecutionEnvironmentHandle`, and the rendered
`DriverInvocationSpec` are private, non-Schema core values. Their raw path and
environment maps live only in core-private WeakMaps/closures, never as own
properties hidden by discoverable symbols. Reflection, JSON serialization, and
stringification tests with sentinel paths must prove no leakage. Core validates
the selected exact template against the captured profile, verifies
executable/cwd/output authority, and calls `ProcessExecutor` exactly once for
the managed build. Planning-time
version probes use the closed `ToolchainProbe` facade backed by the same
quarantined module and do not count as build invocations.
Build-variant validation rejects `ProbeScratchPath`; probe-contract validation
rejects attempt-only `ScratchPath`, snapshot, staged-output, and tool-asset
tokens. These vocabularies never alias.
`DriverCompatibilityV1` is generated from the invocation contract for docs and
conformance and is never runtime authority. `DriverCompletion`
only nominates staged candidates; it cannot publish them.

The driver module supplies one validated Effect-returning request constructor
with `R = never` and a precise Schema/decode error. Any separately named trusted
throwing convenience is future work, not an ambiguous overload. The request
contains exact driver ID/surface and serializable config, but never the driver
implementation, service, callback, or closure. `Build.run` verifies that the
request identity matches the explicitly passed driver before any staging side
effect.

Make managed requests nominal with a private brand and public schema-decoding
constructors. Reject unknown fields, functions, callbacks, runtime objects, and
non-Schema values. Because native adapters are not implemented in V1, do not
invent dummy native types merely to claim a negative parity test; prove the
actual boundary by showing managed requests cannot be structurally forged and
callback-bearing input cannot encode.

For static local code, callers use concrete typed drivers directly. Add a
dynamic `DriverRouter` only with a future versioned wire/RPC boundary. That
router maps each exact `DriverId` to exactly one implementation, rejects
duplicate/unknown IDs, and never searches for alternatives.

## Package and module topology

Start as one package. The codebase does not yet contain enough evidence to
justify many release units:

```text
effect-build/
  .gitignore
  .github/
    workflows/
      ci.yml
  AGENTS.md
  README.md
  package.json
  pnpm-lock.yaml
  tsconfig.json
  tsconfig.build.json
  tstyche.config.json
  vitest.config.ts
  dprint.json
  oxlint.json
  tooling/
    tool-pins.json
    support-matrix.json
    public-api.json
  scripts/
    read-tooling.mjs
    verify-tool-assets.mjs
    generate-compatibility.mjs
    test-built-consumer.mjs
  docs/
    architecture.md
    compatibility.md       # generated from descriptors, pins, core, support matrix
    roadmap.md
  src/
    index.ts
    Artifact.ts
    Build.ts
    BuildExecutor.ts
    BuildContext.ts
    BuildDriver.ts
    BuildError.ts
    BuildOperation.ts
    BuildOutcome.ts
    BuildPlan.ts
    BuildRecord.ts
    BuildRequest.ts
    Compatibility.ts
    ContentStore.ts
    Diagnostic.ts
    Environment.ts
    Evidence.ts
    ExecutionPlatform.ts
    Identifier.ts
    Target.ts
    Toolchain.ts
    CompileExecutable.ts
    internal/
      CanonicalJson.ts
      DurableFileCommit.ts
      DriverInvocation.ts
      ExecutionEnvironmentHandle.ts
      ExecutionToolchainHandle.ts
      InvocationCapabilities.ts
      ManagedDriverImplementation.ts
      NativeExecutableFormat.ts
      PreparedBuild.ts
      ProcessExecutor.ts
      Staging.ts
      ToolchainProbe.ts
      managedDriverDescriptor.ts
      managedRequest.ts
      managedOperation.ts
    bun/
      BunCli.ts
      internal/
        BunCliImplementation.ts
    deno/
      DenoCli.ts
      internal/
        DenoCliImplementation.ts
  test/
    unit/
    integration/
    host/
    conformance/
    architecture/
    consumer/
    fixtures/
      executable-success/
      executable-rejected/
    testkit/
  typetest/
```

After Bun and Deno prove independent dependency/release boundaries, consider
package extraction only in a separate trusted-driver-SPI/API review. The
semantic canons should remain stable, but a package-private V1 implementation
SPI cannot simply be consumed from separate packages:

```text
@effect-build/core
@effect-build/runner
@effect-build/testing
@effect-build/bun-cli
@effect-build/bun-native       # later; Bun-host-only
@effect-build/deno-cli
@effect-build/deno-native      # later; Deno-host-only, experimental
@effect-build/node-sea         # later; executable assembly, not bundling
```

Do not pre-create cache, remote, watch, graph, daemon, or CLI packages. Package
names are provisional until namespace ownership is confirmed; keep the initial
root package private.

## Commands to establish

The workspace has no commands today. Establish scripts only when their real
tests exist: Plan 002 creates model/unit/type/quality/build gates; Plan 003 adds
core/process/host substrate; Plan 004 adds Bun integration; Plan 005 adds Deno
integration; Plan 006 freezes the aggregate aliases. Never add a no-op,
`passWithNoTests`, or silent-skip script merely to make this table appear green.
Final `test:unit` is an explicit composition of the fixed
`test:unit:models`, `test:unit:core`, `test:unit:bun`, and `test:unit:deno`
aliases; it does not discover files through a glob or positional filter.

| Purpose | Command | Expected on success |
|---|---|---|
| Install after lockfile exists | `pnpm install --frozen-lockfile` | exit 0, lockfile unchanged |
| Typecheck | `pnpm check` | exit 0, no TypeScript errors |
| Unit tests | `pnpm test:unit` | exit 0, all unit tests pass |
| Integration tests | `pnpm test:integration:all` | exit 0 with both exact provisioned tools; CI permits no skip |
| Type tests | `pnpm test:types` | exit 0, all Tstyche assertions pass |
| Node host smoke | `pnpm test:host:node` | exit 0 |
| Bun host smoke | `pnpm test:host:bun` | exit 0 |
| Deno host smoke | `pnpm test:host:deno` | exit 0 with the exact observed capability contract; absent runtime fails |
| Lint | `pnpm lint` | exit 0, no diagnostics |
| Format check | `pnpm format:check` | exit 0, no changed files |
| Build | `pnpm build` | exit 0 and emit declarations/ESM into `dist/` |
| Generated docs check | `pnpm docs:check` | exit 0, generated compatibility document is current |
| Full local gate | `pnpm verify` | runs check, lint, format check, exact unit aliases, types, build, and required Node host smoke; real-tool integrations remain separate required-real commands; exit 0 |

Pin `packageManager` to `pnpm@10.17.1`, matching the reference repository.
Pin one exact Effect beta family rather than using a caret range. The reference
baseline is `effect`, `@effect/vitest`, and platform packages at
`4.0.0-beta.106`; TypeScript is `7.0.2` in the reference. If any exact package
is unavailable, STOP and choose a new coherent baseline from current official
packages and source before writing code.

The local `pnpm --version` probe attempted a Corepack network lookup because no
root `packageManager` exists. Step 1 must create `package.json` before invoking
pnpm. Dependency installation is an executor action, not part of this planning
turn.

## Suggested executor toolkit

- Use the `effect-ts` skill if available. Follow the pinned Effect source when
  it conflicts with stale skill examples; current source uses `Context.Service`
  and `Schema.TaggedError<Self>()`.
- Use the `recover-deterministic-architecture` skill when evaluating any new
  abstraction, fallback, cache policy, or duplicated representation.
- Use official Bun, Deno, Node, and Effect source/documentation as the authority
  for tool behavior. Do not infer parity from similarly named flags.

## Scope

**In scope**:

- The root project/configuration files and source/test/doc paths listed in the
  package topology above.
- A single private TypeScript package using Effect v4 beta.
- Core schemas, resolved-plan hashing, managed state machine, staging,
  content-addressed local artifact storage, record creation, and separate file
  materialization.
- One `CompileExecutable` normalized recipe.
- Bun CLI and Deno CLI implementations for that recipe on the current host.
- Unit, type-level, differential, lifecycle, artifact-safety, and real binary
  integration tests.
- Generated compatibility documentation from driver descriptors.
- CI for the initially claimed host/tool matrix.

**Out of scope**:

- Native Bun/Deno TypeScript API wrappers or raw CLI escape-hatch exports.
- `Bundle`, `Transpile`, `TypeCheck`, `Package`, Node SEA, TypeScript, npm,
  esbuild, Rollup, or other drivers.
- Watch/incremental sessions.
- Cache reads, remote caches, remote execution, RPC, queues, leases, daemons,
  or a serialized build graph.
- Library/runtime tool downloads, installers, version managers, registry
  publishing, deployment, code signing, notarization, or container
  orchestration. CI setup may provision the exact pinned Bun and Deno binaries
  from official distributions with verified checksums; test execution is
  offline after setup.
- Directory/symlink artifacts; V1 manages regular files only.
- Bit-for-bit reproducibility claims. V1 records evidence but does not call a
  build reproducible without an independent repeatability test.
- A GitHub issue or proposal to the Effect repository.
- Public npm publication or a 1.0 API promise.

## Git workflow

- No Git repository or commit convention existed at planning time.
- If execution is authorized and the workspace is still unversioned, initialize
  Git before product changes and use branch `feat/effect-build-foundation`.
- Use Conventional Commit messages such as
  `feat(core): add resolved build identity` and
  `test(bun): prove executable lifecycle`.
- Commit by coherent verified step. Do not push, publish, or open a PR unless the
  operator explicitly requests it.

## Bounded execution plans

- Plan 002 owns bootstrap and the schema/type-level model (aggregate Steps 1-2).
- Plan 003 owns content identity, tool preparation, the scoped executor,
  terminal recording, and safe materialization (aggregate Steps 3-5).
- Plan 004 owns the Bun CLI executable driver (aggregate Step 6).
- Plan 005 owns the Deno CLI normalization proof (aggregate Step 7).
- Plan 006 owns API/conformance freeze, generated compatibility docs, CI, and
  the evidence-backed roadmap (aggregate Steps 8-10).

Each child has a narrower drift check and file boundary. The sequence below is
the architectural cross-check; when it conflicts with a child's incidental
wording, preserve these invariants and reconcile the plan before coding.

## Aggregate sequence

### Step 1: Bootstrap a strict, private Effect library with one verification command

Create the root manifest/configuration, `README.md`, `AGENTS.md`, and source/test
folders. Keep the package private. Plan 006 owns CI once real suites exist; do
not add an empty or skip-only workflow here. Use ESM, strict TypeScript,
`exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`,
`noFallthroughCasesInSwitch`, `verbatimModuleSyntax`,
`rewriteRelativeImportExtensions`, and `erasableSyntaxOnly`, following
`.agent-sources/effect/tsconfig.base.json` where suitable.

Define the model/unit/type/quality/build subset of “Commands to establish.”
Later child plans add a command only with its real suite. Make every verification
alias deterministic and non-mutating after installation. Formatting has
separate write and check commands; CI only uses the check command.

Add `AGENTS.md` with:

- the architectural invariants from this plan;
- exact check/test commands;
- the sole-owner rule for `ResolvedBuild`, staging, and publication;
- no fallback, auto-install, shell strings, native-to-managed coercion, or
  secret persistence;
- generated-file ownership for `docs/compatibility.md`;
- the rule that all `effect/unstable/process` imports stay in
  `src/internal/ProcessExecutor.ts`.

Before implementing behavior, add a baseline test that imports every intended
public module and a Tstyche smoke assertion proving the package exposes no
`any` from its basic constructors.

**Verify**:

```sh
pnpm install
pnpm check
pnpm test:unit:models
pnpm test:types
pnpm lint
pnpm format:check
```

Expected: every command exits 0; one lockfile is created; no product runtime
dependency other than `effect` exists; platform packages are development or
peer/test dependencies only.

### Step 2: Specify the model with tests before implementing the executor

Create schema-backed, versioned models for identifiers, relative source and
artifact paths, context refs, toolchain/compatibility evidence, driver identity,
target identity, output contracts, diagnostics, artifacts, outcomes, errors,
attempt records, `ResolvedBuild`, and the public view of opaque
`PreparedBuild`. Define `Build.plan`, `Build.runPrepared`, and `Build.run` at the
type level before executor behavior. A decoded `ResolvedBuild` must not satisfy
the `PreparedBuild` parameter.

Write tests first for:

- every invalid relative path class;
- duplicate artifact paths;
- exhaustive outcome/record constructors;
- serialization round trips;
- rejection of unknown protocol versions and excess fields where appropriate;
- `EnvironmentContract.Empty` as the only constructible V1 request environment;
- rejection of custom, inherited, or secret environment fields and proof that
  no encoded request/record shape can contain raw environment values;
- inability to construct `Restored` with `BuildRejected`;
- inability to construct `BuildSucceeded` without validated artifact refs;
- exact operation/driver/surface identity.

Use `Schema.TaggedClass<Self>()` and `Schema.TaggedError<Self>()`. Use
`makeEffect` or explicit decode Effects for untrusted boundaries. A synchronous
convenience constructor may throw only when clearly documented as a trusted
programmer API.

Keep compiler rejection out of the error hierarchy. Define precise planning,
execution, artifact, store, and record errors; interruption is not one of them.
Use private brands and decoding constructors so a structurally similar object
or callback-bearing native value cannot be forged into a managed request.

**Verify**:

```sh
pnpm test:unit:models
pnpm test:types
pnpm check
```

Expected: all model and type tests pass; exhaustive matching produces no
default branch; `rg -n "\bany\b|@ts-ignore|@ts-expect-error" src` finds no
escape hatch except intentionally checked type-test assertions outside `src`.

### Step 3: Implement canonical source snapshots and resolved-plan identity

Implement one local `ContentStore` for immutable blobs addressed by SHA-256;
both source contexts and output artifacts use this same byte store. Context and
artifact manifests remain distinct domain values, but they must not duplicate
blob persistence.

The store uses an engine-private root (mode `0700` where meaningful), writes a
sibling temporary blob, verifies digest/length, syncs and atomically installs
it, syncs the containing directory where required, verifies the installed
value, and makes installed blobs non-writable. An existing digest path with
mismatched bytes is `ContentCorruptionError`, never overwritten. Unsupported
crash-durable commit semantics fail capability preflight. Store APIs expose
byte-copy reads/streams, not a hard-link capability to caller-writable
destinations.

`Build.layerLocal` probes the actual content and record roots independently;
no OS-level or one-mount result is reused for the other. Before yielding it
durably creates/validates every fixed V1 ancestor and all 256 two-hex shards for
both `contentRoot/blobs/sha256` and `recordRoot/attempts`. On every acquisition
it no-follow validates and syncs every required directory and the parent entry
that names it—including pre-existing roots/ancestors—then commits/validates a
canonical layout-ready marker. Puts never lazily create ancestors. A crash or
interruption during idempotent layout initialization acknowledges no build
state; reacquisition completes or rejects it. Root-specific capability evidence
describes only the tested configured domain, never a blanket host guarantee.

Implement `BuildContext.snapshot` as the only local-path ingress to managed
builds. It must:

- walk only explicit includes under one canonical root;
- reject traversal and symlink escape;
- normalize relative logical paths to POSIX separators and reject non-NFC,
  control/reserved-name, and normalized/case-folded collisions rather than
  making snapshot identity depend on the host filesystem's lookup rules;
- capture relative path, content digest, byte length, file kind, and executable
  intent in canonical order;
- store regular file content in `ContentStore`;
- produce a Merkle-style `BuildContextRef` independent of the absolute root;
- never include output/staging paths implicitly;
- avoid logging file contents;
- make ignore/config semantics explicit and versioned.

Implement RFC 8785 canonical JSON for schema-encoded plan values and
domain-separated SHA-256 plan hashing. Add golden vectors for ordering,
Unicode, numbers allowed by schemas, empty collections, and path separators.
Managed canonical schemas admit strings, booleans, null, arrays, objects, and
safe integers only; reject floating-point values rather than hand-waving number
equivalence. Do not support `undefined`, non-finite numbers, callbacks, dates,
maps, blobs, or host objects in managed encoding. Validate the implementation
against official RFC vectors plus project domain-separation vectors instead of
assuming ordinary `JSON.stringify` is canonical.

Test that changing source bytes, executable intent, driver version, tool binary
or required-asset digest, target, execution-platform identity, environment
fingerprint, operation version, driver input, or output contract changes the
plan digest. Changing the evidence contract must also change it. Test that
changing attempt ID, timestamp, trace ID, staging root,
cache policy, or materialization destination does not.

Construct the nested `ResolvedOperation` only through the operation-owned
projector. For `CompileExecutable`, its entrypoint occurs only in
`operation.resolvedRecipe`, while context, concrete target, and output contract
occur once beside it. Bun `ResolvedInput` is empty; Deno's contains only
optimization. Adversarial decodes that duplicate/mismatch those fields or repeat
a companion asset outside `ResolvedToolchain.requiredAssets` must fail.

Test separately that equivalent tool installations at different absolute paths
produce the same `ResolvedToolchain` and plan digest, while their opaque
`ExecutionToolchainHandle`s differ. Neither path nor stat/probe evidence may
appear in canonical JSON.

**Verify**:

```sh
pnpm exec vitest run test/unit/durable-file-commit.test.ts test/unit/content-store.test.ts test/unit/build-context.test.ts test/unit/canonical-identity.test.ts
pnpm check
```

Expected: the focused completed-slice tests pass and repeated snapshots of identical fixture trees at
different absolute roots produce the same context and plan digests.

### Step 4: Quarantine process execution and resolve exact toolchains

Create `src/internal/ProcessExecutor.ts` as the only unstable-process boundary.
Its managed operation must:

- accept an absolute executable path and ordered argv, never a shell string;
- accept an explicit cwd and environment replacement contract;
- spawn once inside a Scope;
- begin draining stdout and stderr concurrently before waiting for exit;
- spool bytes to bounded files/artifact sinks rather than collecting unbounded
  output in memory;
- if either evidence quota is exceeded, terminate the process, fail with
  `EvidenceLimitExceeded`, retain the bounded prefix with an explicit
  incomplete marker, and never report a compiler success/rejection from
  incomplete evidence;
- preserve channels independently and expose only observation order, not a
  claimed emission order;
- treat nonzero exit as completed data;
- terminate on scope release and confirm termination when the host supports it;
- report external signal termination as a typed execution failure;
- record the host's cancellation guarantee without silently upgrading it.

Implement toolchain resolution around the configured absolute executable/asset
paths captured by the selected driver Layer; it never searches `PATH`. Perform
the descriptor's closed version/identity check through `ToolchainProbe`, whose
API accepts no caller argv, cwd, environment, or output and is the only
planning capability captured by the driver Layer. Validate the selected
driver's exact invocation-contract pin, compute binary and asset identities, and
return one otherwise opaque core-branded `ToolchainResolution`; its semantic
identity, private execution handle, and exact profile fingerprint remain
together in the core WeakMap. `Build.plan` unwraps them, verifies the profile
match, places only semantic identity in `ResolvedBuild`, and retains the rest in
`PreparedBuild`. Managed mode fails outside that pin before allocating staging.
Every planning/tool/platform probe finishes and its `ProbeCwd`/
`ProbeScratchPath` is cleaned before the attempt ID exists. Immediately before
spawn, re-stat, re-hash, and re-inspect the actual staged native executable/
asset bytes; compare them with the captured semantic identity and native
observation. Never re-probe or re-plan after the attempt boundary. A byte or
native-format mismatch fails `ToolchainChanged` rather than replanning. No
downloader or alternate lookup is allowed.

Add a reusable process contract suite modeled on
`.agent-sources/effect/packages/effect/test/unstable/process/ChildProcessSpawnerTest.ts`.
Cover large simultaneous stdout/stderr, exact quota boundaries/overflow,
nonzero exit, missing executable, explicit environment replacement,
cancellation, cleanup, and no shell interpretation.

Node/Bun host implementations currently support process groups through the
Node-shared spawner. The Deno host kills only the direct child. Represent this
as evidence and fail preflight when a request requires a stronger guarantee.

**Verify**:

```sh
test "$(rg -l 'effect/unstable/process' src | wc -l | tr -d ' ')" = "1"
pnpm exec vitest run test/unit/native-executable-format.test.ts test/unit/execution-platform.test.ts test/unit/toolchain-preparation.test.ts test/unit/process-executor.test.ts test/unit/host-capability.test.ts
```

Expected: the focused process/tool/platform slice passes. The full
`test:unit:core` and `test:host:node` aliases are established and run only after
Step 5 completes the executor/record/materialization suite. Bun/Deno host
aliases are exercised only by Plans 004–006 after exact tools are provisioned;
unsupported process-tree semantics remain explicit capability failures, never
silent success.

### Step 5: Give the executor exclusive staging, artifact, and record authority

Build the artifact-manifest operations on the existing `ContentStore`, then
implement `BuildRecordStore`, private staging, and `BuildExecutor`. For each
attempt:

1. `plan` validates the exact selected driver and produces one opaque prepared
   capability without allocating staging;
2. `runPrepared` retrieves the exact captured driver implementation, validates
   its frozen contract fingerprint, creates one engine-owned attempt ID, and
   revalidates the exact tool;
3. inside an internal Scope, allocate one private staging root and materialize
   the immutable context by byte-copy without path escape or store hard links;
4. have core select the one exact captured-contract variant matching canonical
   driver input, render it from private slots, spawn exactly once while
   concurrently draining both output channels, then ask the driver to interpret
   the completed process data;
5. on rejection, capture diagnostics/log refs and store no output artifacts;
6. on success, validate every candidate against the output contract;
7. hash and atomically ingest validated files into the content store;
8. close the Scope, confirm termination/cleanup, then construct and persist one
   terminal record uninterruptibly according to the transition table above;
9. return/re-fail/re-emit the original outcome only after record persistence.

Persistence of immutable CAS blobs may leave harmless orphans if record
creation fails; user-visible materialization must not occur. Document and test
garbage collection as a future store concern rather than pretending a
cross-filesystem transaction exists.

Implement `Artifact.materialize` separately for one regular file. Verify the
source digest, byte-copy to a sibling temporary path, flush when supported,
verify the copied digest/length, and replace the destination atomically or fail
without changing the old file. Never use a hard link. Store roots are private
and blobs non-writable; collision with corrupt existing content is an error,
not overwrite permission.

Use Effect spans for `build.plan`, `build.revalidate`, `build.stage`, `build.execute`,
`build.validate`, `build.store`, `build.record`, and `artifact.materialize`.
Attributes may include IDs, versions, sizes, and digests but never source,
secret, or complete log contents.

Write fake-driver state-machine tests for success, rejection, each
infrastructure phase failure, interruption with confirmed termination,
outcome-unknown termination, artifact traversal, symlink, missing/extra output,
duplicate output, store failure, record failure, and materialization rollback.
Assert one invocation and zero fallback attempts in every case. Exercise every
row of the terminal-record table, identical/different `putIfAbsent` retries,
combined interruption-plus-record-failure Causes, internal Scope elimination,
pre-spawn tool replacement, orphan-blob allowance, and absence of publication.

**Verify**:

```sh
pnpm test:unit:core
pnpm test:host:node
pnpm check
```

Expected: all transitions pass; failed/rejected/confirmed-interrupted attempts
remove staging; outcome-unknown attempts retain only an explicit private
quarantine/unresolved-cleanup disposition; no case modifies a prior
materialized artifact.

### Step 6: Implement the Bun CLI standalone-executable driver

Create an operation-specific Bun CLI driver for
`CompileExecutable.Recipe`. Support only intentionally normalized V1 semantics:

- one relative TypeScript/JavaScript entrypoint from the snapshot;
- one regular executable output;
- current-host target;
- fixed explicit minification after a Bun 1.3.9 differential probe; because V1
  has no alternative optimization state, this is invocation-contract semantics,
  not a one-case caller option, driver resolved input, or `minify: boolean`;
- fixed `NoSourceMap` for the one-file V1 output contract; add source maps only
  with an explicit multi-artifact contract later;
- explicit Bun build-process environment isolation with `--no-env-file`, plus
  produced-runtime autoload controls. The four
  `--no-compile-autoload-*` flags govern the produced executable, not the build
  process. The entire build cwd is the content-addressed snapshot, so any
  snapshot-local `package.json`, `tsconfig.json`, or `bunfig.toml` is declared
  input; a Bun 1.3.9 probe must prove no parent/user config is discovered from
  the fresh engine-owned parent. If it is, STOP and reconcile an explicit
  core-owned config-file capability rather than claiming closure;
- no plugins, watch, app mode, auto-downloaded cross target, raw extra args, or
  arbitrary output path.

Both Bun `Config` and driver `ResolvedInput` are strict empty. The driver reads
entrypoint/context/target/output only from the nested resolved operation. Its
versioned `DriverInvocationContractV1` owns the fixed Bun profile/probe and its
single exact `{}`-matched ordered argv/environment template; compatibility is
generated from that contract.
Provision it
only through `BunCli.layer({ executable: absolutePath })`, which yields the
`Driver` service and creates private handles internally without PATH/environment
discovery.

The normalized recipe promises syntax/module-graph compilation, not a separate
typecheck. Type checking remains a future `TypeCheck` operation; the fixtures
must prove a type-only error does not become a Bun-versus-Deno semantic split.
Because Bun documentation says `--compile` implies production while also
documenting optional `--minify`, test the exact argv behavior before freezing
the driver config. If non-minified output cannot be forced, do not expose that
state; never accept `false` and silently emit minified output.

Core renders the contract's one exact argv template and forces output into the
provided staging location. The driver interprets raw stdout/stderr and produces an
additive normalized diagnostic even when Bun only supplies human CLI text. Do
not heuristically invent stable diagnostic codes or source locations.

Pin and test Bun `1.3.9` initially. Runtime version support belongs in the
versioned driver invocation contract; generated compatibility documentation
projects it rather than owning a second table.

Write differential integration tests that invoke the same Bun command directly
and through the driver, compare exit disposition and executable behavior, and
verify the managed artifact. Include valid, syntax-error, missing-import,
missing-entrypoint preflight, large-output, missing-tool, wrong-version,
output-escape fault injection, and interruption fixtures.

Distinguish the missing-entrypoint preflight deliberately: managed operation
resolution returns `MissingEntrypoint` with no attempt/spawn because the path is
absent from the immutable context. Use a valid entrypoint that imports a missing
module for direct-versus-driver compiler-rejection parity. Do not force the
managed layer to invoke a compiler merely to imitate the direct CLI's later
error timing.

**Verify**:

```sh
EFFECT_BUILD_REQUIRE_REAL_BUN=1 EFFECT_BUILD_BUN_BIN=/abs/bun-1.3.9 pnpm test:integration:bun
pnpm test:host:node
pnpm test:host:bun
```

Expected: the success fixture builds and runs with the asserted output;
syntax/missing-import fixtures return `BuildRejected`; absent declared
entrypoint is a zero-attempt planning error; infrastructure cases fail with
their precise tags; interruption confirms termination; no alternate driver
executes.

### Step 7: Add Deno CLI as the normalization proof before freezing the API

Implement the same `CompileExecutable.Recipe` through Deno CLI using a separate
driver config and descriptor. Support current-host output only. The V1 Deno
config has only choices that affect this proof:

- configuration is fixed `NoConfig` and locking is fixed `NoLock`; with local
  inputs and no typecheck/npm/remote dependency graph, exposing config/lock
  variants would add states without V1 product value;
- optimization is `Unbundled` or `Bundled { minify: boolean }`, so the illegal
  state “minify without bundle” is unrepresentable;
- compiled-runtime permissions are the fixed `DenyAll` V1 policy; broader Deno
  permissions are later driver-specific variants, not core fields;
- dependency policy is offline/local-snapshot only; remote imports, cache
  mutation, permission expansion, raw args, watch, and cross-target compilation
  are unsupported.

Deno `ResolvedInput` contains only the optimization choice. It reads all common
operation facts from the nested resolved operation; denort identity exists only
in `ResolvedToolchain.requiredAssets`. Provision through
`DenoCli.layer({ executable: absolutePath, denort: absolutePath })`, yielding the
service and constructing private handles without PATH/cache/environment
discovery.

Map these choices to the exact documented `deno compile` arguments, disabling
automatic config/lock discovery. Fixtures contain no remote imports, and tests
run with network denied after tool provisioning. Deno documents that the first
compile for a version/target downloads a `denort` runtime into `DENO_DIR`;
managed V1 must not allow that implicit network path. Resolve and hash the
configured current-target `denort` as a required toolchain asset, set the
driver-owned `DENORT_BIN` to its local execution handle, and fail
`ToolchainAssetsUnavailable` before staging when it is absent. The path is not
semantic identity; the denort target and digest are. Runtime cannot extract a
semantic Deno release version from arbitrary denort bytes: it validates only
regular-file bytes/digest/length plus native target and records them as
`ConfiguredObserved`. The pinned official archive joined to Deno 2.9.3 and a
successful real executable run are CI fixture evidence, not a runtime claim
that any configured denort is the “matching 2.9.3” asset.

Set `DENO_DIR` to an engine-owned empty attempt directory,
`DENO_NO_UPDATE_CHECK=1`, and `DENO_NO_PROMPT=1`; never read the user's global Deno cache. With local-only
inputs, explicit denort, and network denied in conformance tests, this makes the
claimed input boundary testable rather than trusting `--cached-only` to cover
the separate denort download path.

Pass Deno's explicit no-typecheck option so it implements the unchanged V1
syntax/module-graph recipe rather than silently strengthening it. Explicit
config/lock support is a later Deno-driver feature gated by an operation that
actually needs it; do not rely on CLI/config precedence as an unstated
invariant.

Run the same executor/artifact contract suite and equivalent direct-versus-
driver integration fixtures. Deno-specific permissions and diagnostics remain
inside `DenoCli`; do not add them to `CompileExecutable.Recipe`.

This is the abstraction gate:

- Plan 005 may not repair core/shared semantics in place. If Deno exposes a
  missing backend-independent lifecycle or artifact concept, STOP Plan 005 and
  reconcile/revise Plans 001-003 first with a new red core contract; resume
  only after that prerequisite is independently green.
- It is not acceptable to add Deno/Bun flags, a growing capability boolean bag,
  `extraArgs`, driver fallbacks, or nullable backend fields to core.
- No Deno implementation commit may mix a core redesign with driver proof.

Pin CI compatibility evidence to the Deno **stable-channel 2.9.3
distribution** and
verify the official Deno and companion `denort` SHA-256 values in CI setup.
The runtime descriptor requires exact version `2.9.3` and current executable
target; its probe cannot infer a release channel from the same version string.
The stable archive name/checksum is therefore separate CI evidence, while
runtime provenance remains `ConfiguredObserved`. The locally observed 2.9.2 is
development-only and never satisfies the claimed-support gate. CI setup may download the exact verified tool;
effect-build library/runtime code never downloads tools, and integration tests
are offline after setup. See the official denort behavior and `DENORT_BIN`
override: <https://docs.deno.com/runtime/reference/cli/compile/#the-denort-binary>.

**Verify**:

```sh
EFFECT_BUILD_REQUIRE_REAL_DENO=1 EFFECT_BUILD_DENO_BIN=/abs/deno-2.9.3 EFFECT_BUILD_DENORT_BIN=/abs/denort-2.9.3 pnpm test:integration:deno
EFFECT_BUILD_REQUIRE_REAL_BUN=1 EFFECT_BUILD_BUN_BIN=/abs/bun-1.3.9 EFFECT_BUILD_REQUIRE_REAL_DENO=1 EFFECT_BUILD_DENO_BIN=/abs/deno-2.9.3 EFFECT_BUILD_DENORT_BIN=/abs/denort-2.9.3 pnpm test:integration:cross-driver
pnpm test:host:deno
pnpm test:types
pnpm check
```

Expected: both Bun and Deno implement the unchanged normalized recipe and
artifact contract; Deno-specific configuration is absent from core; both real
binaries execute successfully on a matching host.

### Step 8: Freeze the V1 API with conformance, architecture-boundary, and security tests

Extract a reusable driver contract suite under `test/testkit/`. A driver may
declare exact tagged capability values, but capabilities validate the already
selected driver; they never choose one. Driver descriptors own one executable
`DriverInvocationContractV1`; driver/tool/profile compatibility is derived from
it. Generate `docs/compatibility.md` by joining those generated projections
with the core evidence contract, exact tool-pin source, and one CI-consumed
tested host/support matrix. Runtime host capabilities come from probes, never
compiler descriptors. Fail CI if regeneration would change the checked-in
document or if a compatibility projection can drift from its contract.

Add Tstyche assertions that:

- Bun and Deno requests infer the same normalized artifact outcome type;
- their config types remain distinct;
- resolved entrypoint/context/target/output semantics occur only in the nested
  operation projection; Bun driver input is empty, Deno input is
  optimization-only, and companion assets occur only in toolchain identity;
- managed requests cannot be structurally forged and callback/function input
  cannot pass their Schema boundary;
- `Restored` can contain only a prior successful artifact set;
- `BuildRejected` is not in the Effect error channel;
- `Build.run` does not expose Scope for one-shot use;
- future session types require Scope;
- invalid operation/driver combinations cannot compile in the static API;
- no driver-native result leaks from core;
- only explicit core/driver Layer factories accept storage/tool paths, while
  runtime handles remain private.

Replace subjective change-amplification exercises with machine-checkable
architecture boundaries: core must not import `src/bun` or `src/deno`; drivers
may import core but not one another; only `ProcessExecutor` may import unstable
process APIs; core contains no switch/conditional over known driver IDs; and
compatibility docs are generated solely from their separated canonical evidence
sources rather than copied tables. Reviewers
may still reason about change amplification, but CI must not claim a synthetic
edit exercise passed when it has no oracle.

Add defensive tests for shell injection boundaries, path traversal, symlink
escape, malicious filenames, executable-bit handling, secret redaction,
unbounded logs, hostile diagnostic bytes, corrupted CAS blobs, and preexisting
destination preservation. These are defensive contract tests; do not include
step-by-step misuse instructions in public docs.

**Verify**:

```sh
pnpm verify
pnpm test:conformance
pnpm build
pnpm exec vitest run test/architecture/import-boundaries.test.ts test/architecture/public-api.test.ts
pnpm test:consumer
pnpm test:types
pnpm docs:check
```

Expected: all pre-CI gates pass and generated compatibility documentation is
current. Do not run `verify:freeze` yet: its generated/CI architecture test
requires the finalized workflow created in Step 9.

### Step 9: Add CI and document the evidence level honestly

Create CI jobs for:

- Linux unit/type/lint/build gates on pinned Node `24.14.1`;
- Bun `1.3.9` and Deno stable-channel `2.9.3` real-tool integration tests;
- macOS and Windows artifact path/publication smoke tests;
- Node-hosted, Bun-hosted, and Deno-hosted process-boundary smoke tests where
  their declared guarantees are supported;
- generated documentation freshness;
- package installation/import smoke tests without publishing.

Provision Bun, Deno, and Deno's official current-target `denort` fixture only in CI
setup, from their official release distributions, and verify the pinned
per-OS/architecture SHA-256 before adding/using them. Compatibility-doc
generation and CI setup must consume one checked-in pin/checksum source so they
cannot drift; driver descriptors do not consume archive URLs/checksums.
Pass denort through the driver's explicit execution-asset handle and deny
network for integration fixtures. This exception for CI infrastructure does not
create a library downloader or managed auto-install feature.

Keep the required PR matrix narrow and deterministic. Add a non-blocking
scheduled canary job for newer tool patches only after V1 is stable. V1 has no
advertised version range: every version other than the descriptor's exact pin
is rejected as unsupported. Supporting a new version requires a new descriptor
version, exact compatibility evidence, and its own pins; canary observations do
not silently widen support.

Document four distinct evidence levels:

- `Observed`: invocation and outputs were recorded.
- `InputClosed`: all semantic input channels are declared/snapshotted.
- `Hermetic`: enforced isolation prevented undeclared reads/network/environment.
- `ReproducibleVerified`: independent clean executions produced identical
  artifact manifests.

V1 may truthfully provide `Observed` and portions of `InputClosed`. It must not
claim `Hermetic` or `ReproducibleVerified` until tests enforce them.

**Verify**:

```sh
pnpm verify
pnpm verify:freeze
pnpm docs:check
EFFECT_BUILD_REQUIRE_REAL_BUN=1 \
EFFECT_BUILD_BUN_BIN=/abs/bun-1.3.9 \
EFFECT_BUILD_REQUIRE_REAL_DENO=1 \
EFFECT_BUILD_DENO_BIN=/abs/deno-2.9.3 \
EFFECT_BUILD_DENORT_BIN=/abs/denort-2.9.3 \
pnpm test:integration:all
```

Expected locally: the ordinary and full post-workflow freeze gates pass, and the real-tool gate is run only
with those exact verified paths. Expected in CI: the required-real command
cannot skip; every advertised matrix entry passes without `continue-on-error`.

### Step 10: Record the gated roadmap without implementing it

Update `README.md` and `docs/architecture.md` with this sequence:

1. **V1 foundation**: normalized executable recipe, Bun CLI, Deno CLI,
   executor, records, CAS, and file materialization.
2. **Operation expansion**: add `Bundle` as a separate recipe and prove it with
   Bun/Deno/esbuild drivers; then `TypeCheck`, `Transpile`, and `Package` only
   where semantics justify them.
3. **Native lane**: exact Bun/Deno/API and raw CLI adapters in clearly named
   modules. Managed API workers may be added later to gain structured API
   results with process isolation, but only with a versioned serializable
   protocol.
4. **Node SEA**: model as executable assembly from an already bundled artifact,
   not as a Node bundler. Require a Node version that actually supports the
   chosen SEA workflow.
5. **Scoped sessions**: add watch/incremental drivers returning a scoped
   `BuildSession` and stream of immutable rebuild records.
6. **Cache reads**: implement `Build.acquire` only after input-closure proofs;
   verify every restored digest and distinguish `Executed` from `Restored`.
7. **Remote coordination**: transport only Schema-encoded managed jobs/context
   refs. Lookup an outcome-unknown attempt by ID; never blindly retry it.
8. **Package extraction and 0.x release**: split core/runner/testing and driver
   packages only when dependency and host restrictions demonstrate the boundary.
9. **1.0**: wait for Effect v4 stability, stable core contracts, at least two
   downstream applications, and multiple effect-build releases without core
   redesign.

Document the upstream Effect proposal gate. Do not open a broad build-support
issue. Propose upstream work only after:

- working Bun, Deno, and Node/tool drivers exist externally;
- at least two downstream applications use the normalized core;
- the core remains stable across at least two releases;
- one platform-neutral primitive is demonstrably duplicated and cannot be
  expressed through current `FileSystem`, `Path`, `Scope`, `Stream`, or
  `ChildProcessSpawner`;
- the proposal includes a minimal reproduction and cross-platform tests.

An independently reproducible Effect process/filesystem bug may be reported
earlier as that narrow bug; it is not a request for a universal Build service.
The most plausible first platform proposal is not `Build`: it is a narrowly
specified atomic-no-replace/crash-durable file-commit or directory-sync
primitive if Plan 003 proves current `FileSystem` adapters cannot express the
same contract portably. Bring a minimal cross-platform reproduction and tests;
do not infer the gap merely from API shape.

**Verify**:

```sh
rg -n "fallback|auto-install|watch\?:|universal BuildOptions|reproducible" README.md docs AGENTS.md
pnpm verify
```

Expected: every occurrence either documents a prohibition, a scoped future
phase, or an evidence-backed guarantee; the full verification gate passes.

## Test plan

### Unit model tests

- Schema decode/encode for every public managed type and error.
- Exhaustive tagged-state transitions and impossible-state rejections.
- Canonical JSON and SHA-256 golden vectors.
- Source-context snapshots and relative path validation.
- Exact plan-digest inclusion/exclusion table.
- Driver descriptor/version/capability preflight.
- `EnvironmentContract.Empty`, rejection of user/secret environment inputs, and
  encoded request/record shapes with no raw-value field.

### Core lifecycle tests

- Success, compiler rejection, every infrastructure phase failure.
- Exactly one invocation and no fallback.
- Concurrent stdout/stderr drainage with payloads larger than pipe buffers.
- Interruption with confirmed process termination and staging cleanup.
- Outcome-unknown record when termination cannot be confirmed.
- Every `Exit`/cleanup row and record-persistence failure precedence.
- Planned tool replacement detected immediately before spawn.
- Output traversal, symlink, duplicate, missing, extra, changed-after-hash, and
  non-regular-file rejection.
- Artifact store corruption detection.
- Existing destination preserved across byte-copy, verification, rename, and
  record failures; no materialization path hard-links a store inode.

### Driver integration tests

- Direct CLI versus driver observable equivalence.
- Successful Bun and Deno standalone executable creation and execution.
- Syntax/resolve failure as `BuildRejected` with raw stderr retained.
- Missing executable and unsupported version fail before staging.
- Explicit config/lock/environment behavior.
- Current-host target only; no cross-target execution claim.

### Type-level tests

- Operation/driver inference.
- Driver config isolation.
- Single operation projection ownership and rejection of duplicated common/tool
  asset fields.
- Nominal managed-request construction and rejection of callbacks/functions.
- Decoded `ResolvedBuild` cannot satisfy opaque `PreparedBuild`.
- Outcome and error-channel separation.
- Restored-success constraint.
- Clean displayed public types with no leaked internals.
- Explicit Layer configuration with unconstructible private handles.

### Host/OS tests

- Node, Bun, and Deno host wiring for the shared process boundary.
- Linux, macOS, and Windows path and atomic file materialization behavior.
- Explicit capability failure where process-tree or atomic replacement
  guarantees cannot be supplied.
- Atomic-no-replace and crash-durable content/record commit, or pre-attempt
  unsupported-capability failure.

## Done criteria

All of the following must hold:

- [ ] The workspace has one private, strict TypeScript package and one lockfile.
- [ ] `pnpm verify` exits 0.
- [ ] Bun and Deno implement one unchanged `CompileExecutable.Recipe` through
      distinct config/driver modules.
- [ ] Real Bun- and Deno-produced current-host binaries execute with asserted
      output.
- [ ] `ResolvedBuild` is the only canonical value hashed to form the managed
      plan identity; content/artifact hashes retain their separate domains.
- [ ] Its nested `ResolvedOperation` is the sole home for resolved recipe,
      context, artifact target, and outputs; driver inputs contain only
      driver-specific semantics and required assets occur only in toolchain
      identity.
- [ ] Absolute executable paths and stat/probe transcripts never enter that
      identity; required tool profile, observed binary digest, and honest
      `ConfiguredObserved` provenance do, without claiming an official archive.
- [ ] Core atomically creates each fully opaque toolchain token whose private
      WeakMap entry binds semantic identity, handle, and profile fingerprint;
      handles contain no peer expected identity, and pre-spawn
      checks compare actual bytes directly with
      `prepared.resolvedBuild.toolchain`.
- [ ] `Build.runPrepared(prepared)` accepts no driver, detects changed public
      prepared inspection data and tool replacement before spawn, and no
      decoded `ResolvedBuild` can directly authorize execution.
- [ ] Equal declared semantic inputs yield equal plan digests across different
      absolute roots; every declared semantic change changes the digest.
- [ ] No caller can supply a cache key, staging path, output destination, shell
      command, retry, or fallback to a managed driver.
- [ ] `Build.layerLocal`, the three explicit `ExecutionPlatform.layer*`
      constructors, `BunCli.layer`, and `DenoCli.layer` are the only
      private storage-root/tool-installation path ingress; explicit per-call
      snapshot roots and materialization destinations remain outside identity;
      private roots are pairwise disjoint/non-nested/non-aliased, per-call paths
      cannot overlap them in either direction, service tags are yielded,
      handles remain private, and no
      PATH/environment/cache discovery occurs.
- [ ] `BuildContext.snapshot` and `Artifact.materialize` delegate through the
      same store-bound `BuildExecutor`; the public sample has no residual
      internal `ContentStore` requirement.
- [ ] Only `src/internal/ProcessExecutor.ts` imports
      `effect/unstable/process`.
- [ ] stdout and stderr are drained concurrently and retained separately.
- [ ] Nonzero compiler exit is `BuildRejected`, not an Effect execution error.
- [ ] Effect interruption remains interruption and persists only a truthful
      confirmed/unknown record.
- [ ] Public one-shot execution exposes no `Scope.Scope`; terminal recording
      occurs only after the internal Scope closes.
- [ ] Every terminal record uses conflict-detecting idempotent persistence, and
      record failure never produces a false durable/executed claim.
- [ ] CAS and record acknowledgment uses atomic no-replace, file/directory sync,
      and read-back verification; unsupported crash durability fails before an
      attempt rather than weakening `Executed`.
- [ ] Failed, rejected, interrupted, and unknown attempts leave prior
      materialized outputs untouched; unknown cleanup is explicitly quarantined
      or unresolved rather than reported as removed.
- [ ] Every stored artifact is a validated regular file with verified digest,
      size, logical path, media type, and executable intent.
- [ ] Raw diagnostics/logs within declared quotas remain available; overflow
      prefixes are marked incomplete, and normalized diagnostics make no
      unsupported fidelity claim.
- [ ] V1 rejects secret/custom/inherited environment requests, and no durable
      schema can contain a raw environment value.
- [ ] Closed V1 exports no generic operation/descriptor/request maker or driver
      implementation SPI; exact Bun/Deno request constructors are the only
      runnable ingress, and emitted declarations expose no private capability.
- [ ] Built-in operation/descriptor/request factories privately capture
      compiled strict codecs and the operation projector once; core never
      rereads public Schema/projector objects, and mutation/same-label
      substitution tests cannot change semantics under a frozen profile.
- [ ] CAS blobs are engine-private/non-writable and materialization uses byte
      copies, never hard links.
- [ ] Driver invocation contracts own exact canonical-input-matched ordered argv
      and environment variants; their generated compatibility projections,
      core evidence defaults, exact tool pins, and the CI-consumed support
      matrix jointly generate compatibility docs without duplicated ownership,
      runtime authorization from documentation data, or driver-owned host
      claims.
- [ ] Probe-only `ProbeScratchPath` and build-attempt `ScratchPath` are disjoint
      token/lifecycle domains; probe directories are fresh, scoped, leave no
      temp state on any terminal path, and allocate no attempt ID/record.
- [ ] Host capability claims are runtime-probed attempt evidence and disagreeing
      support-matrix cells fail CI.
- [ ] Type tests prove invalid driver/operation/request/prepared/outcome states
      do not compile.
- [ ] CI proves Bun `1.3.9`, Deno stable-channel `2.9.3`, and its matching
      current-target denort from exact checksum-verified distributions, with
      tests offline after setup.
- [ ] No native API wrapper, cache lookup, remote transport, watch session, DAG,
      Node SEA, library/runtime downloader, public publish, or Effect issue was
      added.
- [ ] `plans/README.md` marks Plan 001 `DONE` only after all gates above pass.

## STOP conditions

Stop and report; do not improvise if:

- Before Plan 002, unplanned product files appeared; during later children, the
  workspace differs from the completed predecessor plan; or the Effect
  reference commit changed.
- A coherent exact Effect v4 package set matching the reference cannot be
  installed.
- Current Effect APIs materially differ from the cited `Context.Service`,
  Schema, Scope, process, stream, or testing semantics.
- Supporting Deno requires adding Deno-specific options to the normalized
  recipe or a central backend switch. Revisit the operation boundary instead.
- A selected tool cannot be forced to write only inside private staging.
- The executor cannot confirm process termination but an implementation tries
  to record ordinary interruption or publish outputs anyway.
- Atomic regular-file replacement cannot be supplied on an advertised host and
  there is pressure to silently downgrade it.
- Source/config/environment input closure is unknown but code tries to mark the
  build cache-eligible.
- A test needs network after the explicit checksum-verified CI provisioning
  phase, library/runtime tool auto-installation, hidden emulation, or an ambient
  credential to pass.
- The implementation requires a generalized registry, DAG, daemon, retry loop,
  or remote protocol to complete the V1 slice.
- More than one module needs to import `effect/unstable/process`.
- A verification command fails twice after one reasonable scoped correction.
- Required work expands outside the in-scope file set or into public release,
  GitHub issues, deployment, signing, or publishing.

## Maintenance notes

- Review every new normalized field against the two-driver rule: it belongs in
  core only when at least two independent drivers can implement the same
  observable contract without emulation or caveat.
- Adding a tool feature should normally change one driver, its descriptor,
  generated compatibility docs, and its tests—not the core plan/record schema.
- Driver version and exact toolchain identity must enter every future cache key.
- Changes to canonical encoding, path rules, context manifests, or plan schema
  are protocol changes and require explicit versioning; never add permissive
  legacy decode fallbacks.
- Watch sessions, native APIs, cache reads, remote execution, and Node SEA each
  introduce a different lifecycle or trust boundary. Implement them as later
  plans, not opportunistic options on V1.
- Treat untrusted builds as arbitrary code execution. V1 staging is not a
  security sandbox. Do not advertise hermeticity until OS/container isolation,
  network policy, resource limits, and undeclared-read tests prove it.
- A reviewer should scrutinize output containment, cancellation confirmation,
  environment/log redaction, digest construction, and any code path that writes
  outside the content store or materialization temporary path.
