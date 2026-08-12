# Plan 002: Bootstrap effect-build and freeze the managed model contract

> **Executor instructions**: Execute only this bounded foundation slice. Write
> tests before each model implementation, observe the intended failure, then
> implement the smallest model that passes. Run every verification command in
> the step before continuing. If a STOP condition occurs, stop and report; do
> not add an executor, process wrapper, store, driver, fallback, or broader
> package architecture.
> After every done criterion passes, edit only Plan 002's status cell in
> `plans/README.md` from `TODO` to `DONE`. That status-only edit is the sole
> plan-file allowance. Include it in the final verified foundation commit and
> require `git status --short` to be empty before handing off Plan 003.
>
> **Drift check (run first)**:
>
> ```sh
> test ! -e package.json
> test ! -e pnpm-lock.yaml
> test ! -d src
> test ! -d test
> test ! -d typetest
> test "$(git -C .agent-sources/effect rev-parse HEAD)" = "df431ae72235ad7156901caa30b053688ab40a17"
> ```
>
> Expected before execution: every command exits 0. If product files now exist,
> or the Effect checkout moved, STOP for plan reconciliation. Do not overwrite
> a newer bootstrap or silently update the Effect API assumptions.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Governed by**: Plan 001 architecture decisions
- **Category**: bootstrap / models / tests / DX
- **Planned at**: unversioned greenfield workspace on 2026-08-09
- **Effect baseline**: commit `df431ae72235ad7156901caa30b053688ab40a17`,
  `effect@4.0.0-beta.106`

## Objective and proof

Create one private, strict Effect v4 TypeScript package and freeze only the
schema and type-level contract needed by later planning and execution work.
Success means untrusted managed requests can enter only through validated,
nominal constructors; serializable planning data is distinct from private
prepared execution capabilities; invalid outcome and record states do not
compile or decode; and one model-only verification command passes.

This plan does **not** run a build. It creates no process boundary, executor,
content store, filesystem snapshotter, real driver, cache, materializer, watch
session, remote protocol, or CI matrix.

## Current greenfield evidence

Observed immediately before writing this plan:

- The workspace root is
  `/Users/cjpher/Documents/Codex/2026-08-09/does-effect`.
- `package.json`, `src/`, `test/`, and product lock/config files do not exist.
- The workspace is not a Git repository and has no product `HEAD`.
- `.agent-sources/effect` resolves to `df431ae72235ad7156901caa30b053688ab40a17`.
- Local Node `24.14.1`, Bun `1.3.9`, and Deno `2.9.2` are observations only.
  This plan neither invokes them as build tools nor claims compatibility.
- There are no current product commands. Every command below is a target the
  executor must establish and verify, not a claim about present state.

Current Effect v4 source requires class-style
`Context.Service<Self, Shape>()("key")` and explicit-self
`Schema.TaggedClass<Self>()` / `Schema.TaggedError<Self>()`. This slice needs
Schema classes/errors and exactly one behavior-free service contract:
`ExecutionPlatform.Current`. It declares dependency identity for Plan 003 but
performs no I/O in this slice. No other service or implementation Layer is
justified yet.

## Fixed model decisions

1. `ResolvedBuild` is the sole serializable semantic canon and the only value a
   future canonical encoder hashes. No request, plan wrapper, prepared handle,
   attempt ID, controller runtime, path, or record becomes a second identity.
2. `ResolvedBuildDigest` is a projection of `ResolvedBuild`, not a wrapper or a
   peer canon. This plan defines the branded digest boundary but does not
   implement canonical JSON or hashing.
3. `PreparedBuild` is opaque runtime-only and has no Schema, codec, JSON form,
   or public constructor. Its eventual private association owns canonical
   resolved-build bytes/digest, the exact driver implementation and immutable
   execution profile, plus executable/tool-asset handles; those handles may
   contain absolute paths and are never semantic identity. Its public
   inspection data is recursively frozen plain Schema data. There is no
   intermediate `BuildPlan` value. Resolution and pre-spawn rehash belong to
   the next plan.
4. `ResolvedToolchain` is Schema data. It contains canonical required tool
   asset identities—role, execution target, and digest—but no absolute path,
   file descriptor, process handle, callback, or runtime object.
5. `ResolvedBuild.executionPlatform`, produced-artifact `target`, and the
   controller runtime are distinct. The first two are semantic fields in
   `ResolvedBuild`; controller runtime is attempt evidence and is excluded from
   the resolved-build identity.
6. Planning errors are not attempts. No `AttemptId` or `AttemptRecord` exists
   until a future `Build.runPrepared` validates the prepared build's captured
   driver/tool capability. There is no `PlanningFailedRecord` variant.
7. Compiler rejection is outcome data. Infrastructure, validation, planning,
   and record failures are typed errors. Effect interruption is never an error
   variant.
8. `MaterializationOutcome` is immediate Schema data only. V1 does not promise
   a durable materialization record transactionally coupled to a filesystem
   rename.
9. Every canonical numeric field is a finite safe integer with an explicit
   non-negative or positive refinement where applicable. Reject floats,
   `NaN`, infinities, unsafe integers, and ambiguous negative zero.
10. `EvidenceContractV1` is semantic input because byte quotas and raw-retention
    policy can change the outcome. It has explicit stdout, stderr, and raw
    driver-diagnostic channel policies; overflow is never silent truncation.
11. Managed V1's only public environment request is the singleton
    `EnvironmentContract.Empty`. It has no public values, ambient inheritance,
    `SecretRef`, host lookup, credential provider, or redacted value variant.
    `EnvironmentFingerprint` is exactly the singleton `EmptyV1`. Engine-owned
    fixed literals are descriptor semantics; attempt-scoped temporary paths
    belong only to a future private execution handle, never the fingerprint.
    There is no V1 host allowlist/name/hash form; needing one requires an
    explicit model/protocol version change.
12. An operation descriptor owns its request recipe, one canonical
    resolved-recipe Schema/projector, the core context/target/output contract,
    and success semantics. Each exact driver descriptor is correlated with one
    operation and owns only its own config/resolved-driver-input schemas. Bun
    and Deno can therefore implement the same operation without copying common
    entrypoint/context/target/output facts, introducing a universal options
    object, registry, dynamic fallback, native callback, raw argv field, or real
    driver in this slice. V1 is closed: generic operation, driver-descriptor,
    and managed-request factories are package-private. Public users receive
    readonly type views and later concrete Bun/Deno Schemas/constructors, never
    a dead-end custom-driver definition surface.
13. Each driver descriptor owns one versioned, Schema-encoded
    `DriverInvocationContractV1`: exact required tool profile/version/targets,
    required asset roles, one bounded declarative `ProbeContractV1`, and
    a finite nonempty set of exact invocation variants. Every variant owns one
    canonical encoded resolved-input match, executable/cwd/output selectors,
    the complete ordered argument template, complete environment replacement
    map, and managed-profile policies. This is the sole driver runtime-
    authorization canon. A pure
    `Compatibility.DriverCompatibility.fromDescriptor` projection derives
    `DriverCompatibilityV1` for documentation/conformance; compatibility is not
    independently authored or consulted at runtime. Any invocation-contract
    change requires a descriptor-version change. Controller runtime, OS,
    cancellation, filesystem, and store-durability capabilities belong to
    separate `HostCapabilityEvidence`, not the compiler driver.

## Exact file boundary

All paths below are relative to the workspace root above.

### Allowed outputs

The executor may create only these product files (plus directories containing
them):

```text
package.json
pnpm-lock.yaml
.gitignore
tsconfig.json
tsconfig.build.json
vitest.config.ts
tstyche.config.json
dprint.json
oxlint.json
README.md
AGENTS.md
src/index.ts
src/Identifier.ts
src/BuildOperation.ts
src/BuildDriver.ts
src/Compatibility.ts
src/BuildRequest.ts
src/BuildPlan.ts
src/CompileExecutable.ts
src/BuildContext.ts
src/Environment.ts
src/ExecutionPlatform.ts
src/Target.ts
src/Toolchain.ts
src/Evidence.ts
src/Diagnostic.ts
src/Artifact.ts
src/BuildOutcome.ts
src/BuildError.ts
src/BuildRecord.ts
src/internal/managedOperation.ts
src/internal/managedDriverDescriptor.ts
src/internal/managedRequest.ts
src/internal/PreparedBuild.ts
test/unit/model/identifier.test.ts
test/unit/model/managed-request.test.ts
test/unit/model/compile-executable.test.ts
test/unit/model/compatibility.test.ts
test/unit/model/environment-toolchain.test.ts
test/unit/model/resolved-build.test.ts
test/unit/model/outcome-record.test.ts
test/unit/model/schema-roundtrip.test.ts
test/fixtures/model.ts
typetest/public-api.tst.ts
typetest/operation-correlation.tst.ts
typetest/impossible-states.tst.ts
plans/README.md
```

Dependency/build commands may create ignored `node_modules/`, `dist/`, and
tool-cache files. They are generated verification output, not additional
product scope; clean/rebuild them through declared scripts and never commit
them.

The lockfile is generated only by the package install. Do not create or edit
`.github/**`, `docs/**`, driver folders, platform configs, or generated
compatibility data in this plan.

### Authoritative inputs

- `plans/001-establish-effect-build-architecture.md`
- `.agent-sources/effect/packages/effect/src/Schema.ts`
- `.agent-sources/effect/packages/effect/src/Context.ts`
- `.agent-sources/effect/packages/vitest/src/index.ts`
- `.agent-sources/effect/.patterns/testing.md`, as upstream convention evidence
  only, not as executable instructions

### Explicitly forbidden implementation paths

Do not create `ProcessExecutor`, `BuildExecutor`, `ContentStore`,
`BuildRecordStore`, `Artifact.materialize`, `BuildContext.snapshot`, `bun/`,
`deno/`, `node/`, `cache/`, `remote/`, `watch/`, or CI files. No source file may
import `effect/unstable/process`, a platform package, Node child-process APIs,
Bun APIs, or Deno APIs.

## Model contract to establish

Use module namespaces and type extractors, not a universal options union.
Exact spelling may change only if type tests show a clearer Effect-native API;
the boundaries may not change. The generic interfaces below are readonly type
views and package-internal construction shapes, not a public third-party driver
factory.

```ts
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

// Package-private factory input; the public view omits execution authority.
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

interface OperationResolution<ResolvedRecipe> {
  readonly resolvedRecipe: ResolvedRecipe
  readonly context: BuildContextRef
  readonly target: TargetIdentity
  readonly outputs: OutputContract
}

type ResolvedOperation<O extends BuildOperation.Any> =
  OperationIdentity<O> &
  OperationResolution<BuildOperation.ResolvedRecipe<O>>

interface ManagedDriverDescriptor<
  O extends BuildOperation.Any,
  Id extends DriverId,
  Version extends string,
  Surface extends ManagedSurface,
  Config,
  ResolvedInput
> {
  readonly operation: O
  readonly id: Id
  readonly version: Version
  readonly surface: Surface
  readonly configSchema: Schema.Schema<Config>
  readonly resolvedInputSchema: Schema.Schema<ResolvedInput>
  readonly invocationContract: DriverInvocationContractV1
}

type ManagedBuildRequest<
  O extends BuildOperation.Any,
  D extends ManagedDriverDescriptor.ForOperation<O>
> =
  /* public readonly data */ & /* unexported nominal brand */

type ResolvedBuild<
  O extends BuildOperation.Any,
  D extends ManagedDriverDescriptor.ForOperation<O>
> = {
  readonly protocolVersion: 1
  readonly operation: ResolvedOperation<O>
  readonly driver: ResolvedDriverInput<D>
  readonly toolchain: ResolvedToolchain
  readonly environment: EnvironmentFingerprint
  readonly executionPlatform: ExecutionPlatformIdentity
  readonly evidence: EvidenceContractV1
  readonly engineProtocolVersion: 1
}

interface PreparedBuild<
  O extends BuildOperation.Any,
  D extends ManagedDriverDescriptor.ForOperation<O>
> {
  readonly resolvedBuild: ResolvedBuild<O, D>
  readonly digest: ResolvedBuildDigest
  readonly [PreparedBuildTypeId]: unknown // unexported nominal key only
}
```

Package-private `ManagedBuildRequest.schema(operation, descriptor)` and
`ManagedBuildRequest.makeEffect(operation, descriptor)` power later concrete
Bun/Deno request Schemas and validated constructors. Do not export these generic
factories, an operation/descriptor maker, class constructor, brand symbol,
`unsafeMake`, unchecked cast, or raw internal struct. The descriptor must be
statically and dynamically tied to that exact operation; the private
constructor in `src/internal/managedRequest.ts` is called only after strict
Schema validation.

Implement package-private built-in operation construction in
`src/internal/managedOperation.ts`. It compiles strict recipe,
resolved-recipe, and success codecs and captures the projector at module
initialization, shallow-freezes the public wrapper, and stores the execution
implementation behind a WeakMap/accessor. `ManagedBuildRequest.schema` and
`makeEffect` compile/capture their strict combined codecs from this exact
operation/descriptor pair once; they do not reread public Schema properties on
each request. The resulting nominal request privately retains the exact
operation implementation token for planning.

Implement package-private descriptor construction in
`src/internal/managedDriverDescriptor.ts`. It strictly decodes a plain
`DescriptorExecutionProfile` containing operation/driver identity and the full
invocation contract, recursively freezes only that owned Schema data, computes
its canonical future fingerprint input, and shallow-freezes the descriptor
wrapper while retaining config/resolved-input Schema object identity. Compile
strict config/resolved-input encoders and decoders at that boundary and store
them with the profile behind a private association/accessor; all core ingress,
resolution validation, and canonical encoding use those captured closures.
Never recursively freeze Effect
Schema implementations. Built-in/fake descriptors use this one constructor;
public code can inspect but cannot construct or mutate executable policy.

`PreparedBuild` exposes read-only inspection of `resolvedBuild` and `digest`,
but has no public constructor. It must be absent from every Schema union and
encode/decode export. Its private handle shape stays internal and is completed
by the toolchain/execution plan with the exact selected driver implementation,
exact captured operation implementation token, execution toolchain, and
descriptor-contract fingerprint. It is not supplied a
second driver at execution. Do not add a `BuildPlan` wrapper around the same
pair.

`ResolvedBuild.operation` is the sole canonical home for normalized operation
semantics. For V1 `CompileExecutable`, `resolvedRecipe` contains only the
snapshot-relative entrypoint, while `context`, concrete `target`, and the
logical single-executable `outputs` contract are its sibling fields inside the
same `ResolvedOperation`. They must not reappear in driver `ResolvedInput` or
as sibling top-level `ResolvedBuild` fields. Decode tests must reject duplicated
or contradictory operation/driver/toolchain/platform representations.

`DriverInvocationContractV1` is the descriptor's only executable policy: core
uses it to authorize exact tool/asset resolution and to select one complete
ordered argv/environment variant by exact canonical `ResolvedInput` match.
Variants refer only to closed operation/core slots and exact literals; no
driver-authored runtime renderer or partial allowlist is another authority.
`DriverCompatibilityV1` is a pure Schema-encoded projection
used by conformance and generated documentation. It cannot be authored
separately, and tests must prove the projection reflects exact-tool identity,
required asset roles, and managed-profile policies without drift. A contract
change requires a descriptor version change. Neither shape may contain
host/controller claims. Define
`HostCapabilityEvidence` separately in `ExecutionPlatform.ts` for runtime-probed
process termination, atomic replacement, and crash-durable-store support; it is
attempt evidence, not driver compatibility or resolved-build identity. Any host
fact that truly changes compiler semantics belongs in the separately modeled
`ExecutionPlatformIdentity`, not this evidence record.

In the same module define opaque public inspection type
`ExecutionPlatform.CurrentHandle { readonly identity:
ExecutionPlatformIdentity }` with an unexported nominal key, and make the public
`ExecutionPlatform.Current` service (frozen runtime key
`effect-build/ExecutionPlatform/Current`) require that handle as its payload—
never a structural identity. It has no public constructor or Schema. Reserve
`ExecutionPlatformCapabilityInvalid` for a forced/unissued/mutated handle.
Plan 003 adds a private WeakMap issuer/unwrap path and proves
`Layer.succeed(Current, forged as any)` rejects before side effects. The architecture
reserves exactly three future constructors—`layerNode({ executable:
AbsoluteFilePath })`, `layerBun({ executable: AbsoluteFilePath })`, and
`layerDeno({ executable: AbsoluteFilePath })`—but Plan 002 must not export
runtime placeholders, `declare`-only values, or inert Layers for them. Plan 003
adds all three functions with their fixed strict probes in one atomic slice.
There is no
zero-argument/current-global Layer, PATH lookup, platform fallback, or caller-
supplied identity. Model exact typed failures `ExecutionAbiUnknown`,
`ExecutionPlatformMismatch`, and `ToolchainPlatformMismatch`. Also model the
closed public structural reason union `NativeExecutableInvalidReason` with
`Truncated | InvalidMagic | InvalidEndianness | InvalidHeader |
OffsetOutOfBounds | CountOutOfBounds | ArithmeticOverflow |
UnsupportedMachine | DuplicateSlice | ConflictingSlice`. Controller Layer
failures use `ExecutionPlatformExecutableInvalid { runtime, reason }`; compiler
or asset failures use `ToolchainExecutableInvalid { role, reason }`;
`AbiUnknown` maps only to `ExecutionAbiUnknown { subject }`. No internal parser
error may defect, leak, or be flattened to an untyped message.

## Target commands to establish

These commands do not exist today. Add exact non-mutating scripts and document
them in `README.md` and `AGENTS.md`.

| Purpose | Target command | Required result |
|---|---|---|
| Install pinned dependencies | `pnpm install --frozen-lockfile` | exit 0 after the initial lockfile exists |
| Typecheck | `pnpm check` | exit 0 |
| Model unit tests | `pnpm test:unit:models` | exact eight model-unit paths pass |
| Public type tests | `pnpm test:types` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Format check | `pnpm format:check` | exit 0, no writes |
| Library build | `pnpm build` | exit 0, ESM/declarations only |
| Whole bounded gate | `pnpm verify:models` | runs all checks above except install; exit 0 |

Pin `packageManager` to `pnpm@10.17.1`. Pin a coherent exact Effect v4 beta
family matching the reference, with `effect` as the sole runtime dependency.
Add exact matching `@effect/platform-node`, `@effect/platform-bun`, and
`@effect/platform-deno` packages as development-only dependencies for Plan
003's host substrate; this model slice must not import them. Use
`@effect/vitest` for Effect-aware unit tests and Tstyche for display and
inference assertions. Do not use caret ranges. If an exact referenced package
is unavailable, STOP before choosing substitute versions.

Define `test:unit:models` as one fixed `vitest run` command naming all eight
`test/unit/model/*.test.ts` files listed in Scope. It must not use a positional
substring filter, a glob whose membership can drift silently,
`passWithNoTests`, or a test-name expression. `verify:models` calls this exact
alias.

## Git workflow

After the drift check and before creating product files, initialize Git if the
workspace is still unversioned and create branch
`feat/effect-build-foundation`. Commit only coherent verified slices, for
example `chore: bootstrap effect-build models` and
`feat(core): define managed build contracts`. Do not push, publish, or open a
PR unless separately requested. `.git/` metadata is not product scope.

The initial `.gitignore` must exclude `.agent-sources/`, `outputs/`, `work/`,
`node_modules/`, `dist/`, and tool caches; it must not ignore `plans/`. Track the
entire existing plan set as architecture input. After all Plan 002 gates pass,
change only its `plans/README.md` row to `DONE` and include that status edit in
the final verified local commit. `git status --short` must then be empty so Plan
003's clean-handoff gate is meaningful.

## Execution steps

### Step 1: Bootstrap the private package around a failing API smoke test

Create the manifest/config files, empty directory structure, and the three
type-test files first. Add an import smoke assertion for every intended public
module and a Tstyche assertion that a structural managed-request object is not
assignable to `ManagedBuildRequest`. Run the type command and record the
expected missing-module/export failure.

Then add the minimal `src/index.ts` and module shells needed for the bootstrap
to typecheck. Configure strict ESM with `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`,
`noFallthroughCasesInSwitch`, `verbatimModuleSyntax`,
`rewriteRelativeImportExtensions`, and `erasableSyntaxOnly` where supported by
the pinned compiler. Keep the package `private: true` with no publish config.
Establish the exact `test:unit:models` alias here; it may initially fail while
the named tests are still being added, but its file list must already match
Scope and never change through substring discovery.

**Verify**: install once without `--frozen-lockfile` to create the lock, then
run `pnpm check`, `pnpm test:types`, `pnpm lint`, and `pnpm format:check`.

### Step 2: Test and implement canonical primitives

Write `identifier.test.ts` and its type assertions before implementation.
Cover protocol/version literals; operation, driver, attempt, context, artifact,
and digest brands; relative POSIX paths; and safe-integer refinements. Reject
empty IDs, traversal, separators where prohibited, malformed SHA-256, excess
fields at untrusted boundaries, floats, unsafe integers, infinities, `NaN`, and
negative zero.

Implement the schemas with current Effect v4 constructors and explicit Self
generics. Use `makeEffect` or decode Effects for untrusted values. Do not expose
`as`-cast constructors or make IDs interchangeable because their wire values
are all strings.

Define the schema shape for an immutable `BuildContextManifest` and its
`BuildContextRef`: versioned, canonically ordered portable logical file entries
with content ref/length/kind/executable intent, and no root path. This plan does
not walk or hash a filesystem; Plan 003 implements those effects. Operation
projector tests use validated in-memory manifests so `MissingEntrypoint` is
decidable with `R = never`.

**Verify**: `pnpm exec vitest run test/unit/model/identifier.test.ts`,
`pnpm test:types`, `pnpm check`.

### Step 3: Test and implement operation/driver correlation and nominal requests

Create one test-only fake operation and two fake driver descriptors in
`test/fixtures/model.ts` through package-private factories; descriptors are Schema metadata, not driver
implementations. First assert that the operation's recipe/success types remain
correlated with its resolved-recipe projector while each driver retains a
distinct config/resolved-input type through `ManagedDriverDescriptor`,
`ManagedBuildRequest`, and `ResolvedBuild`. Assert that common operation fields
occur only under `ResolvedBuild.operation`; strict fake driver schemas reject
entrypoint/context/target/output copies. Assert that another operation's
descriptor/config is rejected and that no whole-operation or whole-driver union
leaks into a concrete result.

Unit-test request decode/encode, exact operation/driver/version/surface
identity, strict config decoding, and unknown protocol rejection. Prove that
object literals, native callbacks, raw argv, and a forged brand cannot enter
the public API. Assert generic operation/descriptor/request makers are absent
from root exports. The package-private operation factory compiles and captures
strict recipe/resolved-recipe/success codecs plus its projector, shallow-freezes
the public wrapper, and keeps the implementation in a private WeakMap. The
package-private descriptor/request factories likewise compile and capture
strict config/resolved-input/request codecs once while retaining the exact
public Schema object identities for typing/introspection. Concrete ingress and
planning/canonicalization use only the captured closures, never public Schema
objects or projector properties. Tests mutate/replace public Schema `.ast`/
methods and operation properties, and present a same-ID/version wrapper;
accepted input, projection, canonical bytes, target, outputs, and success
decoding remain unchanged or the substitution rejects. Define the future resolver-input type as exactly validated
driver config plus `ResolvedOperation` and `ExecutionPlatformIdentity`; type
tests prove it exposes neither Recipe nor the whole managed request. Then
implement the package-private generic Schema factory, validated Effect
constructor, operation implementation factory, descriptor/profile constructor,
and private post-validation
nominal constructor. Concrete public request constructors are deferred to the
driver plans.

**Verify**: `pnpm exec vitest run test/unit/model/managed-request.test.ts`,
`pnpm test:types`, `pnpm check`.

### Step 4: Freeze the one normalized V1 operation

Write `compile-executable.test.ts` before `src/CompileExecutable.ts`. Define one
`CompileExecutable` descriptor whose request recipe owns only: immutable
`BuildContextRef`, one portable snapshot-relative JS/TS entrypoint, one portable
logical executable name, `CurrentHost`, and fixed syntax/module-graph semantics.
Its deterministic operation projector consumes the verified context manifest
plus resolved execution-platform facts and produces exactly one
`ResolvedOperation`: `resolvedRecipe` is only
the entrypoint; context, concrete current-host target, and the single regular
executable output contract occur once alongside it. Its normalized success is
one validated regular executable artifact. It has no
typecheck, minify, bundle, source-map, permissions, config, lock, raw argv,
runtime-family, or output-destination field; those are fixed semantics or exact
driver configuration. Prove two fake driver descriptors with disjoint config
types both implement this unchanged operation and infer the same success type.
Their resolved-input schemas reject the operation fields above.

At the model level define precise `MissingEntrypoint` operation-resolution
failure semantics: the executor plan will confirm that the logical entrypoint
exists in the immutable context before any attempt. Do not classify this as
`BuildRejected`; a valid entrypoint importing a missing module is the later
compiler-rejection case.

**Verify**: `pnpm exec vitest run test/unit/model/compile-executable.test.ts`, `pnpm test:types`,
`pnpm check`.

### Step 5: Test and implement environment, platform, toolchain, and evidence

Write failing tests for all distinctions before defining the models:

- environment replacement versus forbidden ambient inheritance;
- the sole `EnvironmentContract.Empty` variant and rejection of every custom,
  public, secret, inherited, or host-lookup field;
- execution platform versus artifact target versus controller runtime;
- generated driver compatibility evidence versus runtime-probed host capability
  evidence;
- semantic tool assets versus private executable/asset handles;
- stdout, stderr, and raw diagnostic limits and retention policies;
- canonical safe integers for every byte limit, size, and version.

`ResolvedToolchain` must separate the descriptor's `requiredProfile`
(distribution/channel/version/target policy) from the runtime `observation`
(reported version, executable digest/byte length, and V1 provenance tag
`ConfiguredObserved`), plus a canonically ordered set of required asset identities
`{ role, target, logicalPath, digest, byteLength }`; the set may be empty for a
self-contained executable. A configured path plus self-reported version never
becomes `OfficialArchiveVerified`; that future tag would require a core-issued
verified-install capability. CI archive verification is compatibility/test
evidence, not retroactive runtime provenance. Reject
duplicates, absolute paths, and a second executable-platform/target field—the
plan's `executionPlatform` is the sole executable host/ABI canon. Asset target
remains per-role because a required asset may intentionally target a different
platform. `EnvironmentFingerprint` has exactly one strict encoded value,
`EmptyV1`, with no names, hashes, values, or extension fields. There is no
request environment map, engine-keyed hash, or attempt-temporary path/value.
Model the latter only as a private future `ExecutionEnvironmentHandle`
boundary. `EvidenceContractV1` must specify an explicit overflow disposition;
silent truncation is invalid.

Export exactly one frozen `EvidenceContract.v1Default` from `src/Evidence.ts`,
available publicly only as `Evidence.EvidenceContract.v1Default`:
stdout limit `1_048_576` bytes, stderr limit `1_048_576` bytes, raw driver-
diagnostic limit `262_144` bytes, and
`StoreBoundedPrefixAndFailOnOverflow`. The fixed policy retains the bounded
prefix with `complete: false`, terminates the tool, and produces
`EvidenceLimitExceeded`; it never reclassifies incomplete output as compiler
rejection. V1 exposes no caller override. Plan construction and generated docs
must consume this same value rather than copying the numbers.

Define `DriverInvocationContractV1` as a versioned strict Schema with exact
required tool profile/version/targets, required asset roles, one bounded
declarative `ProbeContractV1`, and a finite nonempty exact `variants`
array. Each variant has a unique canonical Schema-encoded `ResolvedInput`
match; exact executable/cwd/output selectors; a complete ordered template of
`Literal`, operation-owned `SnapshotEntrypoint`, `StagedOutput`,
`ToolAsset(role)`, `ScratchPath`, or contract-exact
`PrefixedCapability` tokens; a complete environment replacement map; and a
closed tagged list of managed-profile policy claims. Define
`Compatibility.DriverCompatibility.fromDescriptor` as the only public constructor for the
versioned compatibility projection and define `HostCapabilityEvidence`
separately. Tests reject contracts containing controller/OS/cancellation/
filesystem claims, arbitrary/raw values, general interpolation, absolute path
literals, duplicate canonical matches, missing/ambiguous variants,
undeclared operation/asset/scratch slots, partial environment maps, or
duplicate/contradictory policies. Prove contract changes require a descriptor
version change, the exact ordered/env variants participate in the execution
profile, the projection cannot drift, and neither contract nor compatibility
can be supplied through a build request or used as a driver-selection registry.

`ProbeContractV1` owns exact fixed argv, private empty cwd, a complete
non-inherited environment template whose only permitted dynamic path token is
`ProbeScratchPath`,
timeout/output-byte limit, empty stderr, and exactly one newline-terminated
strict JSON stdout value under a strict expected-field Schema. It compares
reported version plus OS/architecture to descriptor/platform expectations.
Reject malformed UTF-8/JSON, unknown/missing fields, extra stdout/stderr,
truncation, or mismatch. There is no tool-specific callback, regex, or parser.
The contract owns finite exact raw OS/architecture value maps into canonical
`linux|macos|windows` and `x86_64|aarch64`; unknowns reject. Tests prove Bun-
style and Deno-style observations normalize to the same target.
Every call also owns a fresh private empty `ProbeCwd`, even if its environment
does not use `ProbeScratchPath`; `ProbeCwd` is not a template token and callers
cannot choose it. `ProbeScratchPath` is legal only in a probe environment template. Reject it in
every build invocation variant, and reject build-only `ScratchPath`, snapshot,
staged-output, and tool-asset tokens in every probe. It names a future private
per-probe directory, never an attempt ID/path or serialized semantic value.
Separately model a generic native executable-format observation (ELF, Mach-O/
universal, or PE target set) for the configured executable and every executable
asset. Define canonical `ExecutablePlatformTarget { os, architecture, abi }` as
the only membership projection and as `ToolchainAssetIdentity.target`. ABI is
the closed union `gnu | musl | darwin | windows`, with legal products only
Linux+gnu/musl, macOS+darwin, and Windows+windows. Native observation always
contains byte-proven format/class/endianness/machine; Linux ABI is optional and
only recognized from an exact ELF `PT_INTERP` path. Static/ambiguous/unknown
ELF is `ExecutionAbiUnknown`, never an ELF-OSABI inference. Mach-O maps to
coarse `darwin`, PE to coarse `windows`, and neither claims a compiler C ABI;
filesystem/path/durability capabilities remain root-specific runtime evidence,
not fields of V1 `ExecutionPlatformIdentity`. Plan 003 implements format/ABI
inspection and derives membership instead of trusting a role/path label.

**Verify**: `pnpm exec vitest run test/unit/model/compatibility.test.ts test/unit/model/environment-toolchain.test.ts`,
`pnpm test:types`, `pnpm check`.

### Step 6: Test and implement `ResolvedBuild`, digest, and prepared boundaries

Write `resolved-build.test.ts` and impossible-state type tests first. Assert
that `ResolvedBuild` contains one nested `ResolvedOperation` with exact
operation identity, resolved recipe, `BuildContextRef`, concrete target, and
outputs; plus exact driver/surface input, semantic `ResolvedToolchain`,
environment fingerprint, execution platform, evidence contract, and protocol
versions.
Assert that it contains no digest, attempt data, controller runtime, absolute
path, executable handle, destination, cache choice, timestamp, or trace ID.

Define its schema with operation-specific resolved input still correlated.
Define opaque `PreparedBuild` as public, recursively frozen
`{ resolvedBuild, digest }` inspection plus one unexported nominal key; the
private association and canonical authority are deliberately not represented
in its emitted public structure. Add type tests proving:

- `ResolvedBuild` is Schema-encodable while `PreparedBuild` is not;
- prepared values are not structurally constructible and no `BuildPlan` peer
  type exists;
- forced mutation is not an authorized execution-input path; Plan 003 will
  compare the public view to private canonical bytes as defense in depth;
- a tool-asset digest cannot stand in for an executable handle;
- execution platform and target cannot be interchanged;
- controller runtime cannot enter the resolved-build shape;
- entrypoint/context/target/output fields cannot enter driver input or sibling
  top-level plan fields, and adversarial duplicate/mismatch decodes fail;
- only `ResolvedBuild` is the input named by the future digest API.

Do not implement canonical JSON, hashing, tool resolution, handle acquisition,
rehashing, Scope, or `Build.plan`. Internal type constructors may be reserved
for the next plan but must not be exported or called by production code here.

**Verify**: `pnpm exec vitest run test/unit/model/resolved-build.test.ts`,
`pnpm test:types`, `pnpm check`.

### Step 7: Test and implement outcomes, errors, and record data

Write the tagged-union tests first. Model `BuildSucceeded` and
`BuildRejected` as the only `BuildOutcome` variants. Model planning,
infrastructure, artifact, evidence-limit, record, and materialization errors as
precise `Schema.TaggedError<Self>()` values; do not put compiler rejection or
interruption in those unions.

Reserve two exact pre-attempt errors used by Plan 003:
`DriverProfileMismatch` is a planning error when the opaque tool-resolution
token was stamped under a different captured execution profile;
`PreparedBuildChanged` is an execution error when the exposed prepared
resolved-build/digest inspection data no longer equals its private canonical
bytes. Neither creates an attempt record or permits staging/spawn. Do not add a
replaceable-driver mismatch error: `runPrepared` has no driver parameter.

Define Schema data for executed, infrastructure-failed, defected, interrupted
with confirmed termination, outcome-unknown, and immediate materialization
outcomes. Every
attempt record must reference an existing resolved-build digest and have an
attempt ID. There is no planning-failed record. A restored acquisition may
reference only prior successful artifacts; it cannot contain rejection or
fabricate fresh diagnostics. Materialization data makes no persistence or
atomic-record/filesystem-transaction claim.

Test exact exhaustive matching with no default branch, schema round trips,
strict unknown-version rejection, and absence of raw environment values. Add a
type assertion documenting the future order: `Build.runPrepared(prepared)`
creates the attempt ID only after private/public prepared-data equality and
before tool-asset rehash; do not implement that behavior here.

**Verify**: `pnpm exec vitest run test/unit/model/outcome-record.test.ts test/unit/model/schema-roundtrip.test.ts`,
`pnpm test:types`, `pnpm check`.

### Step 8: Close the public surface and run the bounded gate

Export only stable model modules from `src/index.ts`. Package exports must hide
`src/internal/**`; an external package consumer must be unable to import the
brand symbols or private constructors. Document the empty public environment
semantics, the `ResolvedBuild` canon, and all deferred behavior in `README.md`
and `AGENTS.md` without claiming that builds can run.

Run change-amplification checks: adding a fake operation should change only its
descriptor/tests; changing an evidence quota should change the resolved model
identity inputs but not outcome tags; changing controller runtime evidence
must not change `ResolvedBuild`.

**Verify**:

```sh
pnpm verify:models
! rg -n 'effect/unstable/process|node:child_process|Bun\.build|Deno\.Command' src test typetest
test "$(rg -n 'extends Context\.Service' src | wc -l | tr -d ' ')" = "1"
rg -n 'class Current extends Context\.Service' src/ExecutionPlatform.ts
! rg -n '\bany\b|@ts-ignore|@ts-expect-error' src
! rg -n 'SecretRef|inheritAmbient|extraArgs|watch\??:|fallback|retry' src
```

Expected: every command exits 0; negative searches find nothing; `dist/`
contains only ESM and declarations for the public model surface.

## Done criteria

- [ ] Exactly the allowed files were created; no other product path changed.
- [ ] The package is private, strict ESM, and has one lockfile.
- [ ] `effect` is the only runtime dependency and the Effect family is pinned.
- [ ] `pnpm verify:models` exits 0 and is non-mutating.
- [ ] Every durable/public managed datum has a versioned Schema and strict
      untrusted decode path.
- [ ] `ManagedBuildRequest` is nominal and operation-correlated; generic
      operation/descriptor/request factories are internal, while later concrete
      driver constructors alone become public validated ingress.
- [ ] Driver resolver input exposes only validated driver config, canonical
      resolved operation, and execution platform—not the ingress Recipe or
      whole request.
- [ ] `BuildOperation` owns request recipe, canonical resolved-recipe/projector,
      context/target/output contract, and success semantics; exact driver
      descriptors own only distinct config/resolved-driver-input schemas plus
      one `DriverInvocationContractV1`, and Bun/Deno-shaped fake descriptors
      implement one unchanged operation.
- [ ] Descriptor construction strictly decodes and freezes the owned plain
      execution profile without freezing Effect Schema internals; policy
      mutation attempts fail and the generic constructor is not exported.
- [ ] `ResolvedBuild` is the sole future hash input; its nested
      `ResolvedOperation` is the only home for resolved recipe/context/target/
      outputs, while execution platform remains separate and controller runtime
      is excluded.
- [ ] `ResolvedToolchain` separates required profile from
      `ConfiguredObserved` runtime provenance, contains ordered semantic asset
      identities, and has no absolute paths or runtime handles.
- [ ] The invocation contract's exact resolved-input-matched ordered argv and
      environment variants are the sole versioned driver runtime authority;
      compatibility is its generated drift-proof non-runtime projection; host
      capabilities are a separate runtime-evidence model, and none can become
      a registry or caller executable-options bag.
- [ ] No `BuildPlan` peer wrapper exists; `PreparedBuild` is the only opaque,
      runtime-only resolved-build/digest capability shell, reserved to capture
      the exact driver/tool implementation privately in Plan 003.
- [ ] `EnvironmentContractV1` has only `Empty` and exposes no custom, public,
      secret, inherited, or host-lookup input; resolved/record data contains no
      raw environment values.
- [ ] `EvidenceContractV1` versions per-channel safe-integer limits, raw
      retention, and non-truncating overflow behavior inside `ResolvedBuild`;
      the sole public `Evidence.EvidenceContract.v1Default` owns the exact V1 numbers/policy.
- [ ] Compiler rejection is outcome data; interruption is absent from error
      unions; every attempt record requires a resolved build and attempt ID.
- [ ] Planning errors create no attempt/record and no `PlanningFailedRecord`
      exists.
- [ ] `MaterializationOutcome` is immediate data only and claims no durable
      record transaction.
- [ ] Type tests prove operation correlation, plan/prepared separation, private
      construction, platform/target/controller separation, and impossible
      outcome/record states.
- [ ] No process, executor, content store, snapshotter, driver, materializer,
      cache, watch, remote, CI, publication, or GitHub work was added.
- [ ] Plan 002's DONE edit is in the final verified foundation commit and the
      worktree is clean at handoff.

## STOP conditions

Stop and report without improvising if:

- Any drift-check command fails or the pinned Effect APIs have materially
  changed.
- A coherent exact Effect v4 beta package family cannot be installed.
- The model needs `any`, an unchecked public cast, a public nominal constructor,
  or a permissive legacy decoder to typecheck.
- Correlating one operation with multiple exact driver configs requires putting
  config on the operation, a universal options bag, central registry, or
  backend switch.
- A generic operation/driver/request constructor or runnable extension SPI is
  proposed as public in closed V1, or exact invocation order/environment is
  left to an unfingerprinted renderer outside the contract.
- A Schema is proposed for `PreparedBuild`, executable handles, callbacks,
  absolute tool paths, or other runtime capabilities.
- A `BuildPlan` wrapper/peer is proposed, or `PreparedBuild` is proposed as a
  second semantic hash input alongside `ResolvedBuild`.
- Planning code attempts to allocate an attempt ID or persist an attempt record.
- Environment support adds any caller value, ambient inheritance, host lookup,
  or secret value/reference in V1.
- Canonical data requires floats, unsafe integers, silent evidence truncation,
  or unordered duplicate tool assets.
- A test requires a real compiler, subprocess, filesystem store, network
  fixture, credential, or platform-specific implementation.
- Work expands into process execution, hashing, stores, drivers, CI, cache,
  remote, watch, publishing, or an Effect repository issue.
- A verification command fails twice after one reasonable, scoped correction.

## Handoff to the next plan

The next executor may implement canonical encoding/hashing, semantic toolchain
resolution, private execution handles, exact driver-instance capture,
descriptor-contract fingerprinting, preparation, pre-spawn asset rehash, and
attempt-ID ordering against these frozen models. It must not change the
facts that only `ResolvedBuild` is hashed, `PreparedBuild` is non-serializable,
planning has no attempt record, and absolute tool paths live only in private
runtime handles.
