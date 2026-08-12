# Plan 003: Build canonical content execution and truthful recording

> **Executor instructions**: Follow this plan in order. Write the named tests
> before each implementation slice, run every verification command, and confirm
> its expected result. If a STOP condition occurs, stop and report; do not
> improvise. Update only the Plan 003 status cell in `plans/README.md` when done,
> unless a dispatching reviewer owns the index. Include that edit in the final
> verified Plan 003 commit and require a clean worktree before Plan 004.
>
> **Dependency/drift check (run first)**: this plan was written in an
> unversioned greenfield workspace. Plan 002 must establish and commit the model
> baseline before execution:
>
> ```sh
> test -f plans/002-bootstrap-and-model-contract.md
> rg -q '^\| 002 \|.*\| DONE \|$' plans/README.md
> git rev-parse --verify HEAD
> pnpm verify:models
> git status --short
> ```
>
> Expected: Plan 002 is `DONE`; Git has a `HEAD`; `verify:models` exits 0;
> status is empty. If a reviewer owns the index, their explicit confirmation may
> replace only the row check. Any model mismatch below is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `plans/002-bootstrap-and-model-contract.md`
- **Category**: architecture / correctness / security / tests
- **Planned at**: unversioned workspace on 2026-08-09; Effect reference
  `df431ae`

## Why this matters

Plan 002 defines serializable managed-build models but intentionally performs no
I/O. This plan adds one content store and one local execution state machine
without creating a second identity, hashing host paths, leaking Scope, or
turning interruption into a normal error. It proves safe staging, truthful
terminal records, bounded evidence, and byte-copy-only publication with fake
drivers; Bun and Deno remain Plans 004 and 005.

## Fixed contract

Before editing, confirm Plan 002 provides `ManagedBuildRequest`,
`ResolvedBuild`, `ResolvedBuildDigest`, `PreparedBuild`'s opaque nominal shell,
`BuildContextRef`, `ResolvedToolchain`, `EnvironmentContractV1`,
`EvidenceContract`, artifact/outcome/record/error schemas, and exact driver and
operation identities.

These boundaries are final:

- `ResolvedBuild` is the only managed value encoded and hashed. It contains
  one nested `ResolvedOperation` containing identity/resolved recipe/context/
  target/outputs, plus separate driver-only input,
  `EvidenceContract`, semantic `ResolvedToolchain`, and an explicit
  `executionPlatform`. Execution platform (where the tool runs), artifact
  target, and controller runtime are different facts. Controller paths/runtime
  observations belong to attempt evidence, not identity.
- `ToolchainAssetIdentity` is Schema data: `{ role, target, logicalPath,
  digest, byteLength }`. `ResolvedToolchain` contains the executable identity
  plus a canonically sorted `requiredAssets` array. Deno's denort is one such
  asset; no tool is special-cased in core.
- `ToolchainAssetHandle` is a unique-symbol-branded runtime capability with only
  an asset-role join key, absolute source path, and planned stat—never a peer
  digest/size/target/logical-path identity. `ExecutionToolchainHandle` contains
  the executable and private asset handles but no semantic expected value.
  Neither has a Schema, encoder,
  durable-record field, or root-package export.
- Runtime-only `PreparedBuild<O, D>` publicly exposes only
  recursively frozen `{ resolvedBuild, digest }` inspection data.
  `src/internal/PreparedBuild.ts` keeps a weak, package-private association to
  `{ canonicalResolvedBuildBytes, digest, exactOperationImplementation,
  exactDriverImplementation,
  descriptorExecutionProfile, driverFingerprint, executionToolchain }`; only
  `resolvedBuild` is hashed. `runPrepared` accepts no replacement driver and
  checks inspection data against the private canonical authority before an
  attempt.
- Do not introduce a `BuildPlan` wrapper value. `src/BuildPlan.ts` may house
  `ResolvedBuild`, its digest projection, and `PreparedBuild`, but those are the
  only states/nouns.
- A driver-owned binding name/fixed literal such as `DENO_DIR` or
  `DENO_NO_PROMPT=1` is descriptor semantics. Each attempt's absolute path/value
  is held only by a unique-symbol-branded `ExecutionEnvironmentHandle` created
  after the attempt boundary. It never enters `EnvironmentFingerprint`,
  `ResolvedBuild`, a durable record value/digest, or a root export. V1 accepts
  no caller environment entries or secrets and inherits no ambient environment.
- A successful `ContentStore.put` or `BuildRecordStore.putIfAbsent` is a
  crash-durable commit, not merely a successful rename: sync the file, install
  atomically, sync the containing directory where required, and verify the
  installed bytes. Probe this capability before attempts and fail
  `UnsupportedStoreDurability` if the current filesystem adapter cannot prove
  it.

Use this public-handle/private-SPI ownership seam:

```ts
interface DriverResolution<R> {
  readonly resolvedInput: R
  readonly toolchain: ToolchainResolution
}

interface ManagedDriver<
  O extends BuildOperation.Any,
  D extends ManagedDriverDescriptor.ForOperation<O>
> {
  readonly descriptor: D
  readonly [ManagedDriverTypeId]: unknown
}

// src/internal/ManagedDriverImplementation.ts; never exported
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

The public handle's nominal key and the private implementation association are
created only by package internals. Concrete `Driver` service tags yield that
opaque handle; their exported value type cannot mention `resolve`, the removed
`prepareInvocation`, `interpretCompletion`, `InvocationCapabilities`,
`DriverInvocationSpec`, or `ProcessCompletion`.

`BuildOperation` owns Recipe, ResolvedRecipe, and Success, while its
package-private construction captures the one `ResolvedOperation` projector and
compiled codecs. The exact `ManagedDriverDescriptor<O>` owns only Config,
driver-specific ResolvedInput, and one `DriverInvocationContractV1`; generated
compatibility is merely its projection. Bun and Deno stay
statically correlated while retaining distinct config/input types without
copying common entrypoint/context/target/output facts. The runtime driver
carries that exact descriptor; no central switch reconstructs the relationship.

`Build.plan(driver, request)` validates exact driver/request identity, loads and
verifies the recipe's immutable `BuildContextManifest`, resolves the local
`ExecutionPlatformIdentity` once from the platform service, invokes the
exact private operation implementation captured by the concrete request and
invokes its captured recipe projector exactly once with those facts, then passes that immutable
operation/platform plus only validated driver config to the configured driver
for exact toolchain and driver-specific input resolution. The resolver cannot
receive or reread the ingress Recipe/whole request. Core constructs the nested `ResolvedOperation`
plus driver-only input, hashes the resulting semantic value, and returns a
`PreparedBuild` privately bound to the exact implementation selected during
planning and the exact operation implementation already captured at request
ingress. Core uses the private compiled operation/descriptor/request codecs for
decode, canonical encoding, and completion validation; it never rereads a
public Schema object or projector property. Planning is not an
attempt: it creates no `AttemptId` or `AttemptRecord`, and planning failures are
not retroactively execution records. `Build.run(driver, request)` is `plan`
followed by `runPrepared(prepared)`. `runPrepared` accepts no driver: it retrieves the captured
implementation, verifies its immutable canonical contract fingerprint, creates
the engine-owned attempt ID, and only then revalidates every tool byte. Every
terminal fact after that point, including `ToolchainChanged`, is recorded unless
the record store itself fails.

Establish one legal core construction path in this plan:
`Build.layerLocal({ contentRoot, recordRoot, workRoot })` first unwraps and
validates the required opaque `ExecutionPlatform.CurrentHandle`; an invalid
capability fails before touching any root. It then accepts validated
absolute private roots, creates/canonicalizes them without symlink components,
and uses path plus filesystem-identity checks to require pairwise disjoint,
non-nested roots. It fails Layer acquisition if aliases or proof gaps remain,
then independently probes `DurableFileCommit` in the actual `contentRoot` and
`recordRoot` capability domains; never transfer a result from one mount/root to
the other. Before yielding, it durably initializes/validates each fixed V1
layout. On **every** acquisition it opens and syncs each required directory and
the containing parent that names it—including each configured root and its
parent—regardless of whether that component pre-existed this run, then commits
and validates a canonical no-replace `layout-v1.ready` marker only after the
entire chain is durable:
`contentRoot/blobs/sha256/<00..ff>` and
`recordRoot/attempts/<00..ff>`. All 256 shards exist before the first
acknowledged put, so a leaf commit never depends on an unsynced lazily created
ancestor. A pre-existing marker has exact canonical bytes/layout digest but is
not accepted without re-syncing/revalidating the full chain on this acquisition.
Initialization is idempotent; a partial/visible-but-unsynced layout from a
failed/crashed acquisition contains no acknowledged build state and is
completed or rejected on reacquisition. A failure in either root prevents the Layer from yielding.
Root-specific `HostCapabilityEvidence` records the two independently observed
capability domains without serializing absolute paths or generalizing to the
whole OS. It then constructs content/record/executor services and yields one
store-bound `BuildExecutor`. In addition to
plan/run methods, that service owns `snapshot` and `materialize`; the public
`BuildContext.snapshot` and `Artifact.materialize` namespace functions delegate
to those methods. Therefore snapshot, execution, and materialization close over
the same private `ContentStore`, and a caller never provides an internal store
service separately. Its Layer requirement exposes only the
application-provided Effect filesystem/path/clock/random platform services
needed by the implementation; internal handles and services never escape.
It also requires one explicitly provided `ExecutionPlatform.Current`; callers
choose exactly `ExecutionPlatform.layerNode({ executable })`,
`layerBun({ executable })`, or `layerDeno({ executable })`. Those Layers probe
and inspect only the configured absolute controller executable. There is no
default global root, runtime/global platform read, environment lookup, PATH
search, or hidden fallback. Plans
004/005 add driver-specific Layers around configured absolute tool paths.
Snapshot roots and materialization destinations remain explicit per-call
inputs rather than Layer configuration or identity fields. Before any side
effect, the store-bound executor rejects a snapshot source or materialization
parent/destination that equals, contains, is contained by, or symlink-aliases
any private root. Work cleanup removes only a freshly allocated attempt leaf,
never `workRoot` or another configured root.

After the attempt boundary, core canonicalizes the prepared `ResolvedInput`,
selects its one exact invocation variant from the captured
`DescriptorExecutionProfile`, and renders the complete ordered argv/environment
template from private executable, snapshot, staged-output, scratch, and tool
asset slots. Duplicate/missing variant matches are impossible after descriptor
construction. `InvocationCapabilities`, `ExecutionEnvironmentHandle`, and the
rendered `DriverInvocationSpec` keep all raw maps in core-private WeakMaps or
closures; they have no reflective own property containing a host path/value.
Core calls `ProcessExecutor` once for the managed build and then asks the driver
to interpret `ProcessCompletion`. The driver never receives a capability,
template selector, raw path, environment map, or build spawner. Planning-time tool probes use a separate
closed `ToolchainProbe` facade and are not build invocations. Core binds the
configured executable and invocation-contract probe profile during Layer
acquisition; the retained zero-argument `probe()` creates a fresh private empty
`ProbeCwd` on every call,
the contract's complete non-inherited environment, and a newly allocated
distinct probe-only private directory for each `ProbeScratchPath` binding.
Both directories have a scope-bounded create/cleanup lifecycle wholly before any build
attempt ID or attempt `ScratchPath`; cleanup runs after success, rejection,
timeout, overflow, failure, or interruption, and no probe directory may
survive. Fixtures put hostile config files in the caller cwd, parent, and
candidate user-config locations and prove no contamination. The probe then
applies the timeout and strict output bound and
generically decodes exactly
one strict JSON stdout line under `ProbeContractV1` with empty stderr.
Malformed/unknown/extra/truncated output and version/platform mismatch fail.
It accepts no caller argv, cwd, environment, or output, and neither driver
Layers nor hidden driver implementations reference a process-spawn service.
This is the single
canonical owner for attempt environment and process supervision.

Effect v4 `Effect.scoped` removes `Scope` from an effect's environment
(`.agent-sources/effect/packages/effect/src/Effect.ts:6427-6429`). Use it inside
`runPrepared`. Use `Effect.uninterruptibleMask` (lines 7328-7332) to capture the
inner scoped `Exit` and persist after its Scope closes; restore interruptibility
for hashing, copying, driver mapping, draining, and core-owned process
execution.

### Terminal transition table

| Inner terminal fact after attempt-ID creation and Scope closure | Record | Effect result after persistence | Staging |
|---|---|---|---|
| Valid artifacts stored | `ExecutedRecord(Succeeded)` | `Executed(BuildSucceeded)` | delete |
| Compiler rejection/nonzero exit | `ExecutedRecord(Rejected)` | `Executed(BuildRejected)` | delete; ignore output candidates |
| Tool binary/asset missing or changed before spawn | `InfrastructureFailedRecord(ToolchainChanged | ToolchainAssetsUnavailable)` | typed failure; zero build spawns | delete if allocated |
| Evidence limit exceeded and termination confirmed | `InfrastructureFailedRecord(EvidenceLimitExceeded)` with bounded prefixes marked incomplete | typed failure, never compiler rejection | delete |
| Other infrastructure failure with no running process or confirmed termination | `InfrastructureFailedRecord` | original typed failure | delete |
| Defect with termination/cleanup confirmed | `DefectedRecord` with sanitized fingerprint | re-emit original defect Cause | delete |
| Interruption before child acquisition | `InterruptedRecord(NotStarted)` | preserve interruption Cause | delete |
| Interruption while running, termination confirmed | `InterruptedRecord(Confirmed)` | preserve interruption Cause | delete |
| Interruption/defect/overflow with termination unconfirmed | `OutcomeUnknownRecord` with trigger and cleanup disposition | preserve original Cause, or typed overflow Cause as applicable | move to engine-private quarantine when safe, otherwise mark unresolved; never reuse/publish |
| Terminal decision already constructed when interruption arrives | commit that decision uninterruptibly | then preserve pending interruption | as decision requires |

There is no durable pre-execution claim. After Scope closure call
`BuildRecordStore.putIfAbsent(record)`. The store validates the record and
derives the key from its embedded attempt ID, canonical bytes, and the
domain-separated record hash inside one boundary. Identical canonical records
are idempotent; different content at one ID is `AttemptRecordConflict` and never
overwrites. No caller can supply peer ID/hash/byte representations.
Persistence is uninterruptible. On failure, do not return an executed value:
return or append `RecordPersistenceError` with attempt ID, internally derived
pending hash, and sanitized original Cause/error metadata. Preserve any
original interruption/defect. CAS blobs may remain orphaned. A host crash may
leave staging/CAS orphans and no record; crash recovery is outside V1.

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Dependency | `pnpm verify:models` | exit 0 |
| Core unit suite | `pnpm test:unit:core` | exact Plan 003 unit-file list passes |
| Required host process contract | `pnpm test:host:node` | Node host contract passes; no skip path |
| Additional host contracts | `pnpm test:host:bun` and `pnpm test:host:deno` | each explicit command passes when that runtime is provisioned and fails if it is absent |
| Types | `pnpm test:types` | exit 0; no Scope/handle leak |
| Static gates | `pnpm check && pnpm lint && pnpm format:check && pnpm build` | every command exits 0 |
| Core aggregate | `pnpm verify:core` | all Plan 002/003 gates pass; no compiler integration runs |

## Scope

**In scope** (only these files):

- `src/index.ts`
- `src/Artifact.ts`
- `src/Build.ts`
- `src/BuildExecutor.ts`
- `src/BuildContext.ts`
- `src/BuildDriver.ts`
- `src/BuildPlan.ts`
- `src/BuildRecord.ts`
- `src/ContentStore.ts`
- `src/ExecutionPlatform.ts`
- `src/Toolchain.ts`
- `src/internal/CanonicalJson.ts`
- `src/internal/DurableFileCommit.ts`
- `src/internal/ExecutionEnvironmentHandle.ts`
- `src/internal/ExecutionToolchainHandle.ts`
- `src/internal/InvocationCapabilities.ts`
- `src/internal/DriverInvocation.ts`
- `src/internal/ManagedDriverImplementation.ts`
- `src/internal/NativeExecutableFormat.ts`
- `src/internal/PreparedBuild.ts`
- `src/internal/ProcessExecutor.ts`
- `src/internal/Staging.ts`
- `src/internal/ToolchainProbe.ts`
- `package.json`
- `vitest.config.ts`
- `test/testkit/FakeManagedDriver.ts`
- `test/testkit/processContract.ts`
- `test/fixtures/process/child.mjs`
- `test/unit/content-store.test.ts`
- `test/unit/build-context.test.ts`
- `test/unit/canonical-identity.test.ts`
- `test/unit/durable-file-commit.test.ts`
- `test/unit/toolchain-preparation.test.ts`
- `test/unit/native-executable-format.test.ts`
- `test/unit/execution-platform.test.ts`
- `test/unit/build-record-store.test.ts`
- `test/unit/build-executor.test.ts`
- `test/unit/interruption.test.ts`
- `test/unit/evidence.test.ts`
- `test/unit/driver-invocation.test.ts`
- `test/unit/host-capability.test.ts`
- `test/unit/process-executor.test.ts`
- `test/unit/artifact-materialization.test.ts`
- `test/host/process-node.smoke.ts`
- `test/host/process-bun.smoke.ts`
- `test/host/process-deno.smoke.ts`
- `typetest/build-executor.tst.ts` (following Plan 002's established Tstyche
  file; do not create a competing convention)
- `docs/architecture.md`
- `plans/README.md` (Plan 003 status only)

**Out of scope**:

- Lockfile/tool-version/CI changes; `src/bun/**`; `src/deno/**`; or any real
  compiler invocation. `package.json`/Vitest changes are limited to the core and
  three host-smoke scripts below; add no dependency.
- User environment variables, secrets, `.env`, native/raw argv APIs, cache
  reads, retry, fallback, remote, watch, DAG, daemon, crash recovery, or tool
  download.
- Symlink/directory artifacts, CAS/staging/materialization hard links, reflinks,
  multi-directory atomic publication, public publishing, or hermetic/
  reproducible claims. The only link exception is a transient private
  no-replace store commit whose temp name is immediately removed.

## Git workflow

Continue Plan 002's branch, normally `feat/effect-build-foundation`. Commit
verified slices with messages such as `feat(core): add canonical content store`
and `feat(core): add truthful executor records`. Do not push/open a PR unless
the operator requests it.

## Steps

### Step 1: Build one verified byte store and canonical encoder

Test first in `durable-file-commit.test.ts`, `content-store.test.ts`, and
`canonical-identity.test.ts`. Implement one internal `DurableFileCommit`
primitive used by content and record stores. It writes a same-directory `0600`
temp, applies final mode, syncs and closes it, atomically installs it with
no-replace semantics, syncs the containing directory where required for entry
durability, and reads back identity before acknowledging. Never implement this
as exists-check plus replacing rename. A private temp hard-link install followed
by temp unlink is allowed only inside the store; that inode is never linked into
staging or caller-writable space. Probe support at layer construction; a missing
atomic-no-replace/file/directory durability primitive is
`UnsupportedStoreDurability`, not a weaker silent mode. Probe the actual
content and record roots independently. A positive result for one is never
evidence for the other, even on the same OS; fail Layer acquisition if either
cannot prove the contract.

After both probes, durably establish the fixed V1 directory layouts
`blobs/sha256/<00..ff>` and `attempts/<00..ff>`. On every acquisition, no-follow
validate, open, and sync every required directory plus the containing parent
entry, including each configured root and its parent; do this for pre-existing
as well as newly created components. Only after the full chain is synced,
atomically no-replace commit/read-back the canonical `layout-v1.ready` marker
whose bytes contain the layout version and expected-shard-set digest. An
existing marker is validated but never substitutes for current full-chain
sync. Never lazily create a shard during put.
Test a fresh root and crash injection before/after every parent creation/sync,
pre-existing visible-but-unsynced ancestors, all 256 shards, marker corruption,
interrupted idempotent reacquisition, first-ever content and
record puts after initialization, and content-supported/record-unsupported plus
the inverse. No put may be acknowledged unless every ancestor needed to find
it after crash was already durably established.

In the same Layer tests, cover equal roots, every nesting direction, lexical
aliases, symlink aliases, and an adapter unable to prove filesystem identity;
all fail before a service is yielded. Prove cleanup is parameterized only by an
engine-created attempt leaf.

Implement `ContentStore` as a `Context.Service` configured with one private
absolute root; refs contain only SHA-256 and byte length. Store blobs at
`blobs/sha256/<2-hex>/<62-hex>` through `DurableFileCommit`; its final-mode input
applies `0400`/`0444` where meaningful before the file sync/install. Store
paths are never exposed. Concurrent equal puts verify and reuse the existing
blob; mismatched bytes at a digest path are `ContentCorruptionError`. Verify
full digest/length on every read.

Implement RFC 8785 canonical JSON over Schema-encoded JSON values and hash UTF-8
domain separator plus canonical bytes. Managed numbers are safe integers only;
reject floats, `undefined`, non-finite numbers, callbacks, dates, maps, blobs,
and host objects. Validate official RFC and project domain-separation vectors;
ordinary `JSON.stringify` is not the oracle. One store holds source, logs, tool
assets, and outputs. Never hard-link a blob into writable staging/destinations.

**Verify**:
`pnpm exec vitest run test/unit/durable-file-commit.test.ts test/unit/content-store.test.ts test/unit/canonical-identity.test.ts && pnpm check`
→ crash-boundary/capability, concurrent/corruption/interruption vectors pass
and no temp survives.

### Step 2: Snapshot explicit source inputs by byte copy

Test first in `build-context.test.ts`. `BuildContext.snapshot` delegates to the
store-bound executor's `snapshot` method, which canonicalizes one local root for
access only and first proves it is disjoint/non-aliasing with every private
root. Test equal/ancestor/descendant/symlink-alias cases with zero store writes.
It then evaluates explicit includes with Effect
`FileSystem.glob`, normalizes relative POSIX paths, sorts by UTF-8 bytes, and
rejects empty/absolute/`.`/`..`/NUL/backslash paths, non-NFC text, controls,
Windows reserved names, segments ending dot/space, and normalized/case-folded
collisions. Apply the same portable rules to artifact paths. Also reject
symlinks (even in-root), non-regular files, escape, and changes during read. Put
bytes in `ContentStore` and hash the ordered manifest with
`effect-build/context-manifest/v1\0`. The returned ref contains no root.

Use deterministic barriers to test component swaps before/open/during read. If
the platform exposes only path-based operations, revalidate immediately and
document the residual hostile ancestor-swap race; do not claim handle-relative
race resistance or `Hermetic`. A future scoped directory-handle adapter is a
separate stronger host capability.

Context materialization later must verify each blob and byte-copy it into private
staging; no hard link/clone/rename from CAS is allowed.

**Verify**: `pnpm exec vitest run test/unit/build-context.test.ts && pnpm check` → identical trees at
different roots have equal refs; byte/path/executable changes alter identity;
all invalid/racy inputs have exact tags.

### Step 3: Prepare canonical builds and private tool assets

Before implementing any real platform/tool probe, create
`src/internal/ProcessExecutor.ts` as the sole module importing
`effect/unstable/process` and make the focused
`process-executor.test.ts`/shared process contract green. It accepts only an
absolute executable, ordered argv, explicit cwd, and complete replacement
environment; it never accepts a shell string. It scopes one child, drains
stdout/stderr concurrently under the fixed bounds, applies timeout/
interruption termination, and returns bounded completion data. This step does
not yet implement `BuildExecutor` or allocate attempts; it establishes the
quarantined primitive required by `ToolchainProbe` and the three
`ExecutionPlatform` Layers below. `src/internal/ToolchainProbe.ts` calls this
primitive and no driver imports either module directly.

Test first in `toolchain-preparation.test.ts`,
`native-executable-format.test.ts`, `execution-platform.test.ts`,
`process-executor.test.ts`, and the type test. Implement the
package-internal total native inspector in
`src/internal/NativeExecutableFormat.ts` with this sole entry shape:

```ts
inspect(
  source: BoundedNativeReader
): Effect.Effect<NativeExecutableObservation, NativeExecutableFormatError>
```

`BoundedNativeReader` exposes an already-known safe byte length and exact
bounded range reads; the inspector never accepts a path, follows a link, or
loads the whole binary. Its closed error tags are `Truncated`, `InvalidMagic`,
`InvalidEndianness`, `InvalidHeader`, `OffsetOutOfBounds`, `CountOutOfBounds`,
`ArithmeticOverflow`, `UnsupportedMachine`, `AbiUnknown`, `DuplicateSlice`,
and `ConflictingSlice`. All offset/add/multiply operations use checked safe-
integer arithmetic. Reject more than 4,096 table/slice entries or more than
1 MiB total inspected header/table bytes before allocation/read. ELF inspection
proves class/endianness/machine and recognizes ABI only from this complete
architecture-correlated `PT_INTERP` table: x86-64 GNU
`/lib64/ld-linux-x86-64.so.2`, aarch64 GNU
`/lib/ld-linux-aarch64.so.1`, x86-64 musl
`/lib/ld-musl-x86_64.so.1`, and aarch64 musl
`/lib/ld-musl-aarch64.so.1`. Every other path, static/missing interpreter, or
architecture/path disagreement is `AbiUnknown`. Mach-O thin/fat proves the requested machine slice and coarse
`darwin`; PE proves machine and coarse `windows`. Never infer Linux ABI from
ELF OSABI. Adversarial tests cover every error tag, truncated fields, huge
counts/offsets, wraparound, overlapping/conflicting universal slices, valid
ELF/Mach-O/fat/PE observations, and bounded read/allocation totals. At the
controller boundary map every non-ABI internal tag one-to-one into
`ExecutionPlatformExecutableInvalid { runtime, reason }`; at compiler/asset
resolution map it into `ToolchainExecutableInvalid { role, reason }`. Map only
`AbiUnknown` to public `ExecutionAbiUnknown { subject }`. Tests exhaust the
mapping tables so no internal error can defect, leak, or become a generic
message.

Implement `ExecutionPlatform.Current` in this step. Each of the three public
Layers from Plan 002 captures one explicit absolute controller executable,
inspects its bytes with the same total inspector, and runs one fixed strict JSON
OS/architecture probe using a complete non-inherited replacement environment
and fresh private `ProbeCwd`: Node/Bun replacements are empty; Node uses `-e`
with a literal `process.platform`/
`process.arch` encoder; Bun uses `--no-env-file -e` with the same strict encoder;
Deno uses `eval --no-config --no-lock --no-remote --no-npm` with a literal
`Deno.build` encoder and a separate fresh `ProbeScratchPath` as `DENO_DIR`, plus
fixed `DENO_NO_UPDATE_CHECK=1` and `DENO_NO_PROMPT=1`. All three reuse the
closed 5,000 ms timeout, 256-byte stdout, and zero-byte stderr policy. They
require one bounded JSON line, empty stderr, exact known raw-value maps, and
scope cleanup on every terminal path. Resolve it once per build plan. Unknown
ABI and disagreement among controller observation, selected driver probe,
configured compiler, or companion asset fail with the exact platform errors
before an attempt. Tests cover Ubuntu/glibc, recognized musl, macOS, Windows,
unknown/static ELF, cross-architecture/ABI mismatches, parent/user config
contamination, and cleanup after success/failure/timeout/interruption.

The three Layers are the sole issuers of `CurrentHandle`. A private WeakMap
atomically associates each otherwise opaque handle with the canonical encoded
identity bytes and exact probe/native observation; its public `identity`
inspection is recursively frozen. `Build.layerLocal` unwraps the handle and
compares that inspection to the canonical bytes before probing/initializing any
store root. Unissued structural values, forced `Layer.succeed`, symbol/reflection
clones, serialized copies, mutation, and same-label issuer substitution return
`ExecutionPlatformCapabilityInvalid` with zero filesystem/process/build side
effects. The service exposes no issuer/unwrap/WeakMap/observation API.

Then implement the
generic identities/handles above. `ExecutionToolchainHandle` contains no
semantic `expected` copy. Only the core-private `ToolchainProbe` constructor may
create an otherwise opaque branded `ToolchainResolution`, deriving
`{ semantic, privateHandle, driverFingerprint }` in one operation and storing
all three in a core-private WeakMap. A driver can only return the opaque token;
reflection, mutation, serialization, and stringification expose none of those
values. `Build.plan` unwraps it and requires the fingerprint to equal the
selected captured `DescriptorExecutionProfile` before constructing
`ResolvedBuild` or `PreparedBuild`; probe-under-contract-A/plan-under-contract-B
is a planning error. Resolution must verify regular executable and required asset bytes
and derive each native executable's format/machine plus an ABI witness where
the format honestly provides one, using the generic
ELF/Mach-O-or-universal/PE inspector before staging. The current
`ExecutablePlatformTarget` projection (OS/architecture/ABI only) must be a
member for the tool and every executable asset; unknown Linux ABI is a typed
pre-attempt failure rather than guessed membership;
role/path labels are not target proof. Return `ToolchainAssetsUnavailable`
without an attempt if
planning cannot produce a `PreparedBuild`.

Core verifies the content-addressed context manifest, resolves local
execution-platform facts once, invokes the captured private operation projector with
both, and builds exactly one
nested `ResolvedOperation { id, version, resolvedRecipe, context, target,
outputs }`. Only then does it call the selected driver resolver with that
immutable operation/platform and validated driver config—never the Recipe or
whole request; driver `ResolvedInput` contains no copy of operation facts. Core
extracts the resolution's semantic value into `ResolvedBuild`, including the same explicit
`executionPlatform`, and hashes only
`effect-build/resolved-build/v1\0 + canonical-json(resolvedBuild)`. Prove
semantic changes alter the digest and attempt IDs, times, roots, runtime paths,
controller observations, staging, attempt environment paths, and destinations
do not. Equal binary/asset bytes at different roots must hash equally. The
private driver fingerprint is an execution-authorization commitment, not a
second resolved-build identity or caller field. Runtime handles/PreparedBuild
have no Schema/root export. After `runPrepared` creates
its attempt ID, rehash executable
and every asset before staging and again immediately pre-spawn, comparing only
against `prepared.resolvedBuild.toolchain`; any mismatch is
a recorded typed terminal with zero build invocations. Byte-copy verified assets
to a private tool staging root, then rehash and native-format-check the actual
staged executable asset bytes immediately after copy and immediately before
spawn against `prepared.resolvedBuild.toolchain`. Derive only allowlisted
driver-owned path bindings from those staged verified copies; revalidating an
unused source handle alone is insufficient.

Add adversarial Schema/type tests for duplicated or mismatched operation fields,
driver attempts to encode entrypoint/context/target/outputs, target/toolchain/
execution-platform incompatibility, and denort-like assets repeated outside
`ResolvedToolchain.requiredAssets`. Add a fake driver attempt to pair semantic
tool A with handle B: it must be unconstructible through public types, rejected
at the internal boundary if forced from untyped data, and spawn zero processes.
Also mutate/replace every publicly reachable operation/descriptor Schema
`.ast`/method and operation projector-looking property after module
initialization. Request acceptance, resolved-input matching, operation
projection, canonical bytes, target/output facts, and success decoding must be
unchanged; same-ID/version operation substitution must reject before an
attempt.

**Verify**:
`pnpm exec vitest run test/unit/native-executable-format.test.ts test/unit/execution-platform.test.ts test/unit/process-executor.test.ts test/unit/toolchain-preparation.test.ts test/unit/canonical-identity.test.ts && pnpm test:types && pnpm check`
→ inclusion/exclusion, asset, and non-export tests pass.

### Step 4: Persist one terminal record after Scope closure

Test first in `build-record-store.test.ts`. The engine generates Attempt IDs;
tests inject a deterministic generator. Implement only
`putIfAbsent(record)` after the inner Scope closes. Inside the record/store
boundary, validate the tagged record, derive its key from the embedded attempt
ID, encode canonical bytes, and derive both the domain-separated record hash
and an internal path key:
`SHA-256("effect-build/attempt-record-path/v1\0" +
canonical-json(encodedAttemptId))`. Commit that one canonical envelope at
`attempts/<first-2-lowercase-digest-hex>/<remaining-62-lowercase-digest-hex>.json` through the same
`DurableFileCommit` primitive used
by the CAS. An exact existing canonical record is an idempotent success;
different content at the same ID—or a fault-injected path-hash collision whose
stored envelope has another ID—is `AttemptRecordConflict`. The path digest is
an internal deterministic projection, never the record/content hash or a public
identity. Test golden key vectors and that neither
an external key, hash, nor alternate byte encoding can be supplied or preserved.
Never overwrite or interpret a conflict as retry/resume. There is no
claim/pending record or crash-recovery state machine.

Records reference separate stdout/stderr `ContentRef`s and never inline bytes,
paths, source, environment, or a claimed total channel order. Implement the
persistence-failure rules above.

**Verify**: `pnpm exec vitest run test/unit/build-record-store.test.ts && pnpm check` → concurrent
identical puts converge, differing puts conflict, and every
redaction/fault-injection/Cause-combination and canonical-envelope case passes.

### Step 5: Quarantine process execution and run once in an internal Scope

Test first in `build-executor.test.ts`, `interruption.test.ts`, `evidence.test.ts`,
`driver-invocation.test.ts`, `host-capability.test.ts`,
`process-executor.test.ts`, the process
contract/smokes, and `FakeManagedDriver`.
Create `src/BuildExecutor.ts` for the service/state machine; keep `src/Build.ts`
as its public facade. Use the already-green Step 3
`src/internal/ProcessExecutor.ts`, which remains the only module importing
`effect/unstable/process`. It accepts absolute executable, ordered
argv, explicit cwd, and environment replacement; never a shell string. Spawn in
Scope, drain channels concurrently, treat nonzero exit as data, terminate on
release, and report confirmed versus unknown termination without upgrading host
guarantees.

Create private `InvocationCapabilities`/`DriverInvocationSpec` models and one
core validator/renderer. For canonical prepared `ResolvedInput`, core must find
exactly one variant in the captured contract and render its complete ordered
template. Tokens are limited to exact `Literal`, operation-owned
`SnapshotEntrypoint`, `StagedOutput`, `ToolAsset(role)`, `ScratchPath`, and the
contract-exact `PrefixedCapability(fixedPrefix, StagedOutput)` form; there is no
general concatenation/interpolation. The environment is the variant's complete
replacement map, not an allowlist a driver fills. Capabilities and environment
handles keep raw values in core-private WeakMaps/closures with no reflective
own-property leak. Core never consults generated `DriverCompatibilityV1` at
runtime. Reject ambiguous/missing resolved-input matches, raw alternate paths,
undeclared roles/slots, shell strings, absolute template literals, or
output/cwd substitution. Only `BuildExecutor` renders raw paths and calls
`ProcessExecutor`; driver `interpretCompletion` receives bounded completion
after the child terminates. Tests count tool probes separately and prove exactly
one managed-build spawn.

Keep probe and attempt token domains disjoint. `ToolchainProbe` alone renders
`ProbeScratchPath`; the managed invocation renderer rejects it. Conversely,
probe contracts reject `ScratchPath`, snapshot, staged-output, and tool-asset
tokens. Add sentinel filesystem tests proving a probe creates a fresh path,
never allocates an attempt ID or record, and leaves no probe temp after every
terminal path including interruption.

Populate `HostCapabilityEvidence` from runtime/platform probes, not driver
metadata: controller runtime/OS/architecture, direct-child versus process-tree
termination, crash-durable store commit, and atomic leaf replacement. Persist
the applicable observation with the attempt. A request/driver cannot edit these
facts, and an unsupported required guarantee fails before spawn as exact tagged
`HostCapabilityUnsupported { capability }`; V1 capability names include
`CrashDurableStoreCommit` and `AtomicLeafReplacement`.

Implement `Build.plan`, `Build.run`, `Build.runPrepared(prepared)`, and private
`0700` staging. Retrieve the exact captured implementation/profile and compare
the frozen public inspection value with the private canonical bytes/digest
before generating the attempt ID; the method has no driver parameter. Test a
forced mutation of the exposed resolved build/digest: it produces
`PreparedBuildChanged`, allocates zero attempts, and spawns zero processes.
Test at planning that a probe token stamped for another execution profile is
`DriverProfileMismatch` with no prepared value. Same-label implementation
substitution is structurally absent because `runPrepared` has no driver input.
Afterward follow the table. Capture the inner `Effect.scoped` Exit. Confirmed
terminals clean staging; unknown cleanup moves staging to engine-private
quarantine when safe or records it unresolved. Persist outside the inner Scope
uninterruptibly before re-emitting/returning. Public APIs expose no Scope.

Start stdout/stderr drains concurrently before awaiting exit. Planning always
inserts the exact frozen public `Evidence.EvidenceContract.v1Default` from Plan 002 into
`ResolvedBuild`; there is no executor config/caller override. Spool only the
bounded stdout/stderr/raw-diagnostic prefixes. If any limit is exceeded, mark its evidence `complete: false`,
terminate, and produce `EvidenceLimitExceeded`—never `BuildRejected`. If
termination is unconfirmed, record outcome unknown plus quarantine/cleanup
disposition; never reuse or publish that staging path.
Use barriers, not sleeps, to test every interruption boundary, record failure,
one invocation, and zero fallback.

Add a type/integration slice that first provides exactly one explicit
`ExecutionPlatform.layerNode({ executable })` into `Build.layerLocal(...)`,
then merges the existing deterministic-success `FakeManagedDriver` Layer and
performs snapshot → build → materialize. Keep that fake testkit reusable by
Plan 006's real-filesystem publication harness: it must drive the core-owned
staged output path through the closed fake process substrate and produce known
fixture bytes without bypassing artifact ingestion. Its inferred environment
after all application platform services are provided must be `never`, and it must prove all
three phases observe the same content store. No public `ContentStore`
requirement or second store Layer is allowed.

Construct one private `ExecutionEnvironmentHandle` per attempt by rendering the
selected captured-contract variant against private staged asset roles and core
scratch capabilities. Pass its replacement map only
to `ProcessExecutor`. Type/schema/digest tests prove its values cannot enter
managed data or appear through reflection/serialization/stringification;
attempt records may retain only contract variable names and origin categories
needed as evidence.

Add exact scripts with no new dependency:

- `test:unit:core` runs `vitest run` with the exact fifteen Plan 003 unit
  paths listed in Scope, in a fixed order. It has no substring/positional
  filter and no `passWithNoTests` behavior.
- `test:host:node` runs
  `node --experimental-strip-types test/host/process-node.smoke.ts`;
  `test:host:bun` runs `bun run test/host/process-bun.smoke.ts`; and
  `test:host:deno` runs
  `deno run --cached-only --no-config --no-lock --allow-run --allow-read --allow-write --allow-env test/host/process-deno.smoke.ts`.
  Each smoke imports its matching platform Layer and shared contract. These
  aliases contain no skip logic: invoking one without its runtime fails.
- `verify:core` runs `verify:models`, all Plan 003 unit/type/static/build gates,
  and the required Node host smoke. Bun/Deno host aliases are explicit gates in
  their driver plans and final exact-tool CI. It must not run a real compiler
  driver.

The host contract covers separate stdout/stderr, nonzero exit, environment
replacement, cancellation/cleanup, and shell metacharacters as inert argv.

**Verify**:
`pnpm exec vitest run test/unit/process-executor.test.ts test/unit/build-executor.test.ts test/unit/interruption.test.ts test/unit/evidence.test.ts test/unit/driver-invocation.test.ts test/unit/host-capability.test.ts && pnpm test:host:node && pnpm test:types && pnpm check`
→ the import quarantine, invocation authority, and every required Node contract
row pass; interruption remains an interrupted `Exit`. Run the exact Bun/Deno
host aliases only in their provisioned driver/final-CI gates.

### Step 6: Ingest and materialize regular files without shared inodes

Test first in `artifact-materialization.test.ts`. After confirmed driver exit,
resolve nominated paths only through `ArtifactStaging`; reject traversal,
symlink, non-regular, missing/extra/duplicate, escape, and changed-during-read
outputs. Stream-copy into a CAS temp, verify, atomically ingest, and construct a
sorted artifact manifest. Never rename/link from staging into CAS.

V1 `Artifact.materialize` delegates to the store-bound `BuildExecutor` and
accepts one regular-file artifact and destination directory. Before touching
it, prove the destination parent/leaf is neither equal to, inside, containing,
nor an alias of any private root; test every direction and symlink alias with
the prior destination/CAS/records untouched. Verify CAS,
byte-copy to a random sibling temp, verify again, set
executable intent, flush/close, then atomically replace the leaf. Reject
intermediate/leaf symlinks and unsupported replacement before altering the old
file. Never hard-link, clone, symlink, or cross-filesystem rename. Return
Schema-encoded materialization data; do not claim durable atomic persistence of
a materialization record in V1.

Revalidate destination component identity immediately before temp creation and
leaf replacement and fault-test ancestor/leaf swaps. When the platform lacks
handle-relative no-follow replacement, record the residual race limitation and
claim static containment/atomic visibility only—not adversarial concurrent
filesystem safety.

**Verify**:
`pnpm exec vitest run test/unit/artifact-materialization.test.ts test/unit/build-executor.test.ts && pnpm check` → all
containment/rollback cases pass, and mutating a published file leaves CAS valid.

### Step 7: Document and run the complete core gate

Update `docs/architecture.md` with the identity/handle split,
execution-platform distinction, empty user environment/driver asset bindings,
planning-versus-attempt boundary, terminal table, evidence overflow, terminal
put-if-absent conflicts, crash limitations/CAS orphans, and byte-copy-only
publication.
State that rehash is `Observed` evidence, not hermeticity/reproducibility.

**Verify**:

```sh
pnpm verify:core
test "$(rg -l 'effect/unstable/process' src | tr '\n' ' ')" = "src/internal/ProcessExecutor.ts "
```

Expected: all exit 0; no Bun/Deno module or real tool is required.

## Test plan

- The named unit files cover CAS/canonical vectors, deterministic snapshot,
  identity inclusion/exclusion, executable/asset revalidation, record conflicts,
  process semantics, every terminal-table row, bounded evidence, interruption
  races, containment, rollback, and post-publication CAS immutability.
- The shared process contract and three host smokes prove Node/Bun/Deno
  controller wiring without invoking a real compiler.
- `typetest/build-executor.tst.ts` proves matching driver/request inference,
  `BuildRejected` outside the error channel, no public Scope, and no public or
  encodable runtime handle.
- Use `@effect/vitest`, `assert`, `it.effect`, fake Layers, deterministic barriers,
  and direct `Exit`/`Cause` inspection.

## Done criteria

- [ ] `pnpm verify:core` and the exact unstable-import assertion exit 0.
- [ ] `ResolvedBuild` alone is hashed; execution platform is distinct from
      target/controller evidence; its nested `ResolvedOperation` is the only
      home for resolved recipe/context/target/outputs; adversarial duplicate and
      mismatch decodes fail.
- [ ] Driver resolver types receive validated config plus canonical operation/
      execution platform only and cannot access Recipe or the whole request.
- [ ] `Build.layerLocal` is the single explicit core construction path and has
      no ambient roots, registry, fallback, or internal-handle leak; private
      roots are proven pairwise non-aliasing/non-nested and per-call snapshot/
      materialization paths cannot overlap them in either direction.
- [ ] The single yielded `BuildExecutor` owns snapshot, run, and materialize;
      namespace functions delegate to it, the full sample typechecks without a
      public `ContentStore` requirement, and one integration slice proves all
      phases share the same CAS.
- [ ] Host capabilities are runtime-probed attempt evidence, never compiler
      descriptor claims or caller-supplied facts; unsupported required
      guarantees fail before spawn.
- [ ] Exactly one explicit `ExecutionPlatform.Current` Layer probes/inspects
      its configured controller executable in a fresh `ProbeCwd` and issues an
      opaque WeakMap-backed handle; forged/mutated/copied service values reject
      before root/process side effects. No global runtime/PATH/platform fallback
      exists, and controller/driver/tool/asset OS-architecture-ABI disagreement
      fails before an attempt.
- [ ] Content and terminal-record puts share one crash-durable commit primitive;
      content and record roots are probed independently, all fixed ancestors and
      256 shards are durably initialized before yield, and unsupported file/
      directory sync in either root fails pre-attempt capability probing.
- [ ] Generic executable/asset identities are semantic and handles are private;
      only core can atomically create an opaque resolution whose private WeakMap
      entry binds semantic identity, handle, and the profile fingerprint;
      handles contain no peer expected identity, and all bytes are revalidated
      against `prepared.resolvedBuild.toolchain` after attempt-ID creation and
      pre-spawn.
- [ ] `Build.plan` uses the exact private operation implementation/codecs
      captured at concrete request ingress, captures the exact private driver
      implementation, and creates
      no attempt/record; `runPrepared(prepared)` accepts no replacement driver,
      rejects changed public inspection data as `PreparedBuildChanged` before
      an attempt, then creates the attempt ID before tool revalidation; planning
      rejects a mismatched probe/profile stamp. Every later terminal is put
      after Scope closure except an explicit record-store failure.
- [ ] V1 user environment decodes only `Empty`; no secret input exists; attempt
      environment paths/values are private and absent from semantic identity.
- [ ] Evidence overflow is bounded, marked incomplete, terminates the tool, and
      never becomes compiler rejection.
- [ ] Interruption/defect Cause is preserved; unknown outcomes record quarantine
      or unresolved-cleanup disposition and never reuse/publish staging.
- [ ] Identical terminal puts are idempotent; differing puts conflict without
      overwrite; the store internally derives the record key/canonical
      bytes/hash from one validated `AttemptRecord`, so mismatched peer canons
      are unrepresentable; no pre-execution claim/retry/fallback exists.
- [ ] Core selects one exact captured-contract variant by canonical resolved
      input, renders all raw paths/environment, and owns the sole managed-build
      spawn before passing bounded completion data back for interpretation;
      drivers receive no invocation capability or template-selection authority.
- [ ] Runtime authorization comes only from the exact ordered/environment
      variants in `DriverInvocationContractV1`;
      `DriverCompatibilityV1` is a generated non-runtime projection whose
      conformance tests cannot drift.
- [ ] Driver Layers and hidden driver implementations reference only closed
      `ToolchainProbe`, never `ProcessExecutor`, `ChildProcessSpawner`, or
      another process-spawn API; the probe accepts no caller argv/cwd/
      environment, enforces its captured strict JSON output contract, and the
      generic native-format inspector proves tool/asset target membership.
- [ ] The bounded total native inspector rejects every malformed/count/offset/
      overflow/duplicate/conflicting case with its exact tag, never infers
      Linux ABI from ELF OSABI, and exposes no package export; tests cover valid
      ELF GNU/musl, Mach-O thin/fat, and PE observations.
- [ ] Probe scratch and attempt scratch are distinct private token domains;
      each probe scratch directory is fresh and scope-cleaned on every terminal
      path, no attempt ID/record is allocated for it, and neither token is legal
      in the other's contract.
- [ ] CAS-to-staging, staging-to-CAS, and CAS-to-destination are byte-copy-only;
      post-publication mutation cannot corrupt CAS.
- [ ] Source/destination component-swap tests pass, and docs distinguish static
      containment/revalidation from stronger handle-relative adversarial race
      safety; no unsupported Hermetic/security claim exists.
- [ ] The Plan 003 status-cell edit is included in the final verified commit and
      `git status --short` is empty at handoff.

## STOP conditions

Stop if Plan 002 is incomplete/drifted; any runtime handle is encoded/exported
or hashed; more than `src/internal/ProcessExecutor.ts` imports the unstable
process module; `executionPlatform` is collapsed into target/controller runtime; a
binary/asset cannot be resolved and hashed without download; a user/secret
environment value is required; an attempt path/value enters semantic identity;
the filesystem cannot prove durable file/directory commit (STOP rather than
weaken `Executed`); a terminal after attempt-ID creation would go
unrecorded; a persistent claim/crash-recovery state is added; record failure
would erase the original Cause; unconfirmed execution would be retried or
published; evidence cannot be bounded; publication requires a CAS/staging/
destination link, clone, or cross-filesystem rename (the private no-replace
store-commit link exception above is allowed); a real driver/network/credential
or out-of-scope file is required; or a gate fails twice after one scoped fix.

## Maintenance notes

- New semantic inputs require Schema fields and digest tests; runtime locations
  remain handles. New companion runtimes are `ToolchainAssetIdentity` values,
  not ambient caches.
- Future GC/crash recovery must trace manifests and orphan staging/CAS; do not
  infer liveness from terminal records alone.
- Multi-file atomic publication, secrets, cache acquisition, remote recovery,
  and watch sessions require separate plans, not optional V1 fields.
- Review interruption precedence, evidence truncation, quarantine/cleanup,
  asset rehash, containment, and every operation that could share a CAS inode.
