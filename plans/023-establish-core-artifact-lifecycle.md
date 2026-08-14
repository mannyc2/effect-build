# Plan 023: Establish the core artifact and lifecycle primitives behind current operations

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in **STOP conditions** occurs, stop and report; do not
> improvise. This is the behavior-preserving/refactoring plan. Do not create the
> Esbuild package or change the public Node SEA operation in this plan. When
> done, update this plan's status row in `plans/README.md` unless a reviewer
> explicitly owns the index.
>
> **Governance gate (run before the drift check)**: live `AGENTS.md` still
> mandates exactly four packages, exactly the two compile operations,
> closed `Provider.define`, and package-private process capabilities. This plan
> is repository data, not authority to ignore those rules. A maintainer must
> explicitly request the granular-integration supersession. On that request,
> execute only Step 0, commit its `AGENTS.md` restamp, end the turn, and start a
> fresh executor context that reloads the new rules. If that separate
> authorization/restamp has not happened, STOP before source work.
>
> **Drift check (run first in the fresh post-restamp context)**:
>
> ```sh
> test "$(bun --version)" = "1.3.14"
> rg -Fx -- '- Architecture generation: `granular-integration-migration-v2`.' AGENTS.md
> git merge-base --is-ancestor 60259f98a460b3d9b25b95221ca71b56c17d9d78 HEAD
> git diff --stat 60259f98a460b3d9b25b95221ca71b56c17d9d78..HEAD -- \
>   packages/effect-build packages/effect-build-bun packages/effect-build-deno \
>   packages/effect-build-node-sea package.json bun.lock tooling/public-api.json \
>   scripts/read-tooling.mjs scripts/test-built-consumer.mjs scripts/provision-tool-assets.mjs \
>   test/unit test/integration test/architecture test/testkit typetest docs
> test -z "$(git status --porcelain=v1 --untracked-files=all -- \
>   packages/effect-build packages/effect-build-bun packages/effect-build-deno \
>   packages/effect-build-node-sea package.json bun.lock tooling/public-api.json \
>   scripts/read-tooling.mjs scripts/test-built-consumer.mjs scripts/provision-tool-assets.mjs \
>   test/unit test/integration test/architecture test/testkit typetest docs AGENTS.md)"
> ```
>
> If an in-scope file changed, compare the excerpts below to live code and
> restamp the plan before editing. Start in a clean worktree at current main;
> do not use the detached/dirty planning worktrees. Plan 022's matrix-fixture
> changes at `60259f9` are part of the baseline and must be retained. The one
> expected later change before source work is Step 0's committed `AGENTS.md`;
> any production/config/test drift is still a STOP/restamp condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: completed Plans 015-020; Plan 021 remains independently blocked
- **Category**: tech-debt / architecture / migration
- **Planned at**: commit `60259f9`, 2026-08-14
- **Initial state**: TODO; governance-only Step 0 must land first

## Why this matters

The implemented second pipeline proved useful concepts, but core currently
hardcodes Bun, Deno, Node SEA, esbuild 0.28.2, and Node 26.7.0 into its Artifact,
matrix errors, and provider SPI. At the same time, the real reusable lifecycle
is still package-private: hidden candidate allocation, bounded execution,
native validation, digesting, and atomic rename. This plan introduces the
smallest core vocabulary and one narrow integration-author lifecycle without
changing the existing Bun, Deno, or opaque Node SEA runtime operations.

The purpose is representation compression. It must not add a generic build
request, plan, executor, store, registry, fallback, or public native inspector.

## Current state

### Durable observations are duplicated

`packages/effect-build/src/standalone/Artifact.ts:53-57`:

```ts
const ArtifactFields = {
  path: AbsolutePath,
  bytes: ByteCount,
  digest: Schema.optionalKey(Digest),
} as const
```

`packages/effect-build/src/standalone/internal/ExecutableLifecycle.ts:26-31`:

```ts
export interface ExecutableFile<Target> {
  readonly path: string
  readonly bytes: number
  readonly target: Target
  readonly digest?: `sha256:${string}`
}
```

The current Artifact schema then repeats exact Bun, Deno, and Node SEA stage
tuples (`Artifact.ts:59-113`). Core is forced to know the integration versions.

### Publication already has the right private authority

`ExecutableLifecycle.ts:19-44,76-108,155-209` gives the producer only an
opaque candidate with `staged`; the destination and one-shot rename Effect live
in a private WeakMap. `validateAndPublishExecutable` consumes identity before
inspection, validates the native file, optionally hashes it, renames it, and
returns only durable observations. Preserve that state machine exactly.

`CompilerEngine.ts:373-425` is the current sole orchestration caller. It
resolves destination, acquires the candidate, invokes the producer with the
staged path, decodes stages, validates/publishes, and adds provider/stages.

### The scoped bundle is nominal but Esbuild-owned

`packages/effect-build-node-sea/src/internal/Esbuild.ts:33-45,98-114`:

```ts
export interface JavaScriptBundleArtifact {
  readonly path: string
  readonly format: "esm" | "cjs"
  readonly nodeSyntaxTarget: "node26.7"
  readonly observedExternalImports: readonly string[]
  readonly stage: { readonly operation: "bundle"; readonly tool: ... }
}

const liveArtifacts = new WeakSet<JavaScriptBundleArtifact>()
```

Node SEA imports the interface and Esbuild's `getJavaScriptBundleArtifact`
directly (`internal/NodeSea.ts:1-4`). The current tests prove that a copied,
forged, or post-callback value is rejected and that temporary bytes are removed
after success, failure, defect, and interruption.

Installed Effect rc.108 confirms why this cannot become a raw scoped result.
`node_modules/effect/src/Effect.ts:12776-12778` has the shape:

```ts
scoped<A, E, R>(self: Effect<A, E, R>): Effect<A, E, Exclude<R, Scope>>
```

It removes the Scope requirement but preserves `A`; it does not make the
returned handle linear or non-escaping.

### Core is a closed provider catalog

`packages/effect-build/src/internal/ProviderContracts.ts:3-31` enumerates Bun,
Deno, and Node SEA targets. `Provider.ts:147-169,188-195,263-274` adds a
Node-specific composed definition and casts through `linux-x64-gnu`.
`MatrixError.ts:44-120` repeats three provider-specific schemas.

Plan 023 may derive the current compatibility projections from the new base
schemas so all existing calls stay green. Plan 024 deletes the closed Node SEA
projection and composed provider branch in the same no-publish program.

## Target core contract

Freeze these names in red tests before implementation. Do not introduce peer
aliases after the cut.

The `effect-build` root runtime keys become exactly `Artifact`, `BuildError`,
`JavaScriptBundle`, `MatrixError`, and `Target`. Package-author functions live
only at `effect-build/Integration` and `effect-build/Provider`. The Integration
runtime keys are exactly `executeCommand`, `inspectLiveJavaScriptBundle`,
`produceExecutable`, and `withOwnedJavaScriptBundle`; Provider retains only
`define`. Do not create separate Artifact/Target/Executable/bundle subpaths.
Integration's type-only declarations are exactly `CommandOutput`,
`CommandCompletion`, `ExecuteCommand`, `NativeExecutableObservation`, and
`PublishedExecutable`. The function
parameters remain inline; do not export parallel request wrappers. Do not
duplicate command types under `Provider`.

### Artifact observations

In `packages/effect-build/src/standalone/Artifact.ts`, export structural Schema
values and their `.Type` types:

```ts
FileArtifact = Schema.Struct({
  path: AbsolutePath,
  bytes: ByteCount,
  digest: Schema.optionalKey(Digest)
})

ToolObservation = Schema.Struct({
  name: Schema.NonEmptyString,
  version: Schema.NonEmptyString,
  path: Schema.optionalKey(AbsolutePath)
})

StageObservation = Schema.Struct({
  operation: Schema.NonEmptyString,
  tool: ToolObservation
})

ExecutableArtifact = Schema.Struct({
  ...FileArtifact.fields,
  target: SystemTarget,
  stages: Schema.NonEmptyArray(StageObservation)
})
```

Use `Schema.Struct`, not a class instance, for these values: existing compile
operations return frozen/plain serializable objects and provider schemas need
to spread the exact fields. Continue using `Schema.TaggedError` for errors; the
installed Effect API does not contain `Schema.TaggedErrorClass`.
Do not add nominal brands to `AbsolutePath`, `ByteCount`, or `Digest` in this
program. Their existing Schema checks already establish the runtime facts,
while no operation accepts two confusable raw/canonical values whose type-level
separation would remove a branch. Reconsider a brand only when a real API takes
both representations; adding one now would only make construction noisier.

Plan 023's intermediate `Artifact` namespace runtime keys are exactly
`AbsolutePath`, `Artifact`, `ByteCount`, `Digest`, `ExecutableArtifact`,
`FileArtifact`, `StageObservation`, `ToolName`, and `ToolObservation`.
`Artifact`/`ToolName` and their `ArtifactFor`/`StagesFor` type projections are
the pre-existing closed compatibility surface retained only because the old
Node facade still compiles in this no-publish step; every new base is a single
Schema value that those projections reuse. Plan 024 deletes the four closed
compatibility declarations and freezes the seven neutral keys. Do not create a
second file/stage schema behind either name.

An integration-specific Artifact extends `ExecutableArtifact` with one literal
`provider` and a refined target/stage schema. `provider` is not part of the
neutral executable base. Do not add `kind`, `root`, manifest, inputs digest,
reproducibility, or receipt fields.

Replace the closed `ToolName` schema used by shared `BuildError` tool fields
with `Schema.NonEmptyString`; exact integration errors/stages refine it back to
their literal names. `TargetUnsupported.available` uses `SystemTarget` rather
than a provider catalog. This removes the last shared-error dependency on a
closed provider list without changing any Bun/Deno runtime value.
Keep the public `PublicationFailed.operation: Schema.String` field unchanged in
this behavior-preserving plan. Narrow only the lifecycle implementation with
one private TypeScript union and constructor/helper accepting exactly
`make-directory | make-staging | rename | resolve-destination-parent`. The
first three preserve the existing lifecycle; the last is reachable only for
the owned-root containment comparison introduced here. Architecture tests must
prove every internal writer uses that helper. Do not export a parallel
operation schema or narrow the public class property: existing Bun/Deno callers
may construct or decode a `PublicationFailed` carrying another string, and
Plan 023 does not make that a breaking change.

### Targets

The existing eight strings in `standalone/internal/TargetCatalog.ts:19-37`
remain the sole native-system authority. Export that schema/type as
`SystemTarget`. Add only the resolution fact required by both real producers
and the Node SEA consumer:

```ts
ResolutionTarget = Schema.Literals(["node"] as const)
```

For this intermediate behavior-preserving plan, retain the pre-existing
`Target` value/type as an identity alias of `SystemTarget`—not a second Schema
or literal table. The `Target` namespace runtime keys are exactly
`ResolutionTarget`, `SystemTarget`, and temporary `Target`. Plan 024 removes
only that alias and freezes the first two neutral keys. No release may occur
between those steps.

Do not add a neutral syntax axis in this program. Pinned Bun 1.3.9 declares top-level
`BuildConfigBase.target?: "browser" | "bun" | "node"` and a separate
`compile.target` of Bun-native OS/architecture strings; its native option map
contains no Node release. The implementation explicitly says it does not lower
arrow functions. Live 1.3.9 probes reject `target: "node26"`, silently ignore
an esbuild-shaped `supported` property, and preserve optional chaining in all
three targets. Esbuild's fixed `target: "node26.7"` remains an exact
integration request invariant; Bun's emitted syntax remains a pinned-producer
behavior; and Node SEA always checks accepted bundle bytes with its exact
selected Node. A neutral `SyntaxMode` would therefore record producer
provenance without changing a consumer decision. Keep those facts in their
owning integrations and observed stages rather than adding a core field. Do
not make Bun claim a syntax target it cannot configure or make core discover
Node on Bun's behalf.

Verified upstream evidence is pinned to Bun commit
`cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a`: `packages/bun-types/bun.d.ts`
lines 2430-2457 and 5074-5092; `src/bun.js/api/JSBundler.zig` lines 451-473;
`src/options.zig` lines 354-405; and
`src/bundler/linker_context/postProcessJSChunk.zig` lines 343-352. Recheck
those exact excerpts if the repository changes the compiler pin.

Provider modules may continue exporting their exact subset under the ergonomic
name `Target`; the `target` property on Bun/Deno results remains unchanged.
Do not add object-shaped duplicate targets, `ExecutionTarget`, or `BuildTarget`.
Keep partial native header observation distinct and non-root-public.

### Scoped JavaScript bundle

Create `packages/effect-build/src/JavaScriptBundle.ts` with:

- `Format = Schema.Literals(["esm", "cjs"] as const)`;
- an opaque generic `Artifact<Stages extends readonly StageObservation[] =
  readonly StageObservation[]>` interface containing absolute `path`, observed `bytes`,
  required observed `digest`, `format`, `resolutionTarget: "node"`, sorted
  `observedExternalImports`, ordered
  `stages`, and a non-exported unique-symbol member;
- `withFile(input, use)`, which totally validates input, resolves/stats a
  regular file through Effect `FileSystem`/`Path`, observes its byte count and
  SHA-256 content identity through `Crypto`, freezes a nominal handle,
  registers its identity only while `use` runs, and always unregisters it; it
  borrows a caller-owned file and never deletes it;
- `InvalidJavaScriptBundle { reason }` for invalid descriptors, forged/stale
  handles, and observed-content drift;
- `JavaScriptBundleAccessOperation = "realpath" | "stat" | "read" | "digest"` plus
  `JavaScriptBundleAccessFailed { path, operation, reason }` for platform
  failures while observing/rechecking bytes;
- `JavaScriptBundleTemporaryDirectoryFailed { prefix, reason }` for the one
  platform failure that occurs before core has a temporary path to report;
  and their exact `JavaScriptBundleError` union.

Define these three public errors with package-qualified Schema identifiers and
the installed `Schema.TaggedError<Self>(identifier)(tag, fields)` API. Give them one non-exported
`Symbol.for("effect-build/JavaScriptBundle/Error")` family marker and a static
identity guard per class. The marker is not a Schema field or serialized data.
It exists so integrations can map genuine core failures without catching an
arbitrary caller error that happens to reuse the same `_tag`. Keep
infrastructure messages as `Schema.String`, but define and export the finite
`InvalidReason` `Schema.Literals` authority used by
`InvalidJavaScriptBundle.reason`. Its exact members are `expected-object`, `unknown-field`,
`missing-field`, `invalid-path`, `invalid-format`,
`invalid-resolution-target`, `format-path-mismatch`,
`invalid-observed-external-import`, `invalid-byte-count`,
`observed-external-imports-not-sorted-unique`, `invalid-stages`,
`artifact-not-live`, `file-not-regular`, `byte-count-changed`,
`digest-changed`, `temporary-prefix-invalid`,
`cleanup-root-not-absolute`, `cleanup-root-not-directory`,
`cleanup-root-not-empty`, `file-outside-cleanup-root`,
`active-publication-destination-unresolvable`,
`cleanup-root-contains-active-publication`, and
`cleanup-root-overlaps-active-root`. This is the one shared reason vocabulary:
integration-specific invalid-reason Schemas compose `InvalidReason` with their
own literals rather than copying these members. Do not export a second core
reason vocabulary.
Each static guard must require an object carrying the exact symbol value and
the class's exact `_tag`; a structural tag/field match alone is insufficient.

Freeze the failure classification as part of the contract. A missing file or
non-regular stat result is
`InvalidJavaScriptBundle("file-not-regular")`; an observed byte-count change is
`InvalidJavaScriptBundle("byte-count-changed")`; and a same-size digest change
is `InvalidJavaScriptBundle("digest-changed")`. A bundle-file `NotFound`
platform error during realpath/stat/read is normalized to `file-not-regular`.
`FileSystem.Info.size` is a `bigint`; before constructing or rechecking the
handle, accept it only when `0n <= size <= BigInt(Number.MAX_SAFE_INTEGER)` and
only then convert it with `Number(size)`. A negative or unsafe value is
`InvalidJavaScriptBundle("invalid-byte-count")`, not drift and not a platform
message. This checked conversion is the sole bridge into public `ByteCount`.
For the owned-only cleanup root, a relative path returned by FileSystem is
`InvalidJavaScriptBundle("cleanup-root-not-absolute")`. A `NotFound` or
non-directory stat result is
`InvalidJavaScriptBundle("cleanup-root-not-directory")`, and a canonical bundle
path outside its canonical root is
`InvalidJavaScriptBundle("file-outside-cleanup-root")`. Only other FileSystem
realpath/stat/read failures and Crypto digest failures become
`JavaScriptBundleAccessFailed` with the exact attempted operation. This keeps
expected stale-handle states separate from infrastructure failures and gives
the integration mappings below one deterministic input.

The core-created root must also be empty before registration. A non-empty listing
is `InvalidJavaScriptBundle("cleanup-root-not-empty")`; a platform failure to
list it is `JavaScriptBundleAccessFailed { path: cleanupRoot, operation:
"read", reason }`. Core does not recursively delete a missing, non-directory,
non-empty, unobservable, overlapping, or publication-contested unaccepted
path. Ownership transfers only after an absolute canonical empty directory has
passed validation and its root claim has been installed. From that point,
production failure or callback exit uses the one deletion path described
below. Because core itself allocates the directory from a validated simple
prefix, the public author primitive cannot turn an arbitrary caller-supplied
path into a recursive-delete capability.

When owned-root registration compares against an already-live prospective
destination, classify that destination walk separately and exactly. A
non-`NotFound` stat failure is `JavaScriptBundleAccessFailed { path:
attemptedAncestor, operation: "stat", reason: error.message }`; a realpath
failure is the same class with the existing ancestor path and operation
`"realpath"`. Reaching an existing non-directory ancestor or exhausting the
walk without an existing directory is
`InvalidJavaScriptBundle("active-publication-destination-unresolvable")`.
`NotFound` merely ascends and is not itself an error. None of these failures is
delivered to or interrupts the already-running executable operation; the new
owned-root callback fails before entry.

Cleanup ownership is enforced at the state transition that can lose a durable
result, not by trying to infer file ancestry from a borrowed handle. The
Integration module maintains one private
`SynchronizedRef<ClaimState>` created with controlled module initialization.
Its one immutable value contains the canonical producer cleanup-root set and
the reference-counted map of lexically resolved prospective executable
destinations. Define the state with Effect's immutable
`HashSet.HashSet<string>` and `HashMap.HashMap<string, number>` and initialize
the module singleton with `SynchronizedRef.makeUnsafe`; do not run an Effect at
module load. Use `SynchronizedRef.modifyEffect` for effectful
check-and-register transitions and `SynchronizedRef.modify` for pure
decrement/unregister transitions. Do not keep a peer claim-registry `Semaphore`, mutable
`Set`, mutable `Map`, or second registry whose synchronization can diverge
from the state it protects. An
owned-root registration fails with
`InvalidJavaScriptBundle("cleanup-root-contains-active-publication")` if it
contains a live destination claim, and it rejects an equal/ancestor/descendant
active owned root with
`InvalidJavaScriptBundle("cleanup-root-overlaps-active-root")`. Conversely,
`produceExecutable` rejects a destination under any live owned root as
`OutputInvalid { path, reason: "destination-under-active-bundle-cleanup-root"
}`. When a comparison is required, it uses a real path-boundary/relative-path
test, never string-prefix matching. Check+registration/increment is one atomic
`SynchronizedRef.modifyEffect` transition. Equal destination claims may coexist to preserve the current
concurrent same-outfile behavior; each finalizer decrements its count and
deletes the key only at zero. Root claims are exclusive/overlap-rejecting.
Every destination claim is held for the executable operation. Every root claim
is held from accepted core allocation through producer/use Scope teardown and
the awaited physical deletion attempt. This
symmetric rule prevents an output from
being deleted by Scope cleanup even if a caller re-borrows, copies, symlinks,
or hard-links bundle bytes; the destination cannot hide its physical parent.
This is a lifecycle invariant for the stable filesystem topology controlled by
the build program, not sandbox or TOCTOU protection against an external actor
rewriting directory symlinks after validation.
No cleanup root, claim token, registry object, or mutation operation becomes an
Artifact field or public export.

The public `Input<Stages>` descriptor is generic over and preserves its exact
`stages` tuple; it omits `bytes` and `digest`, which core observes. It includes
`path`, `format`, `resolutionTarget`, sorted
`observedExternalImports`, and a required ordered `stages` array (pass
`[] as const` for a pre-existing bundle with no observed producer). Requiring
the field avoids an optional/default generic state. No Schema decoder may
manufacture a live Artifact. Require `.mjs` for `format: "esm"` and `.cjs` for
`format: "cjs"`; this one canonical suffix rule lets the selected Node run a
format-correct syntax check without adding stdin or a temporary peer copy.

Freeze the public JavaScriptBundle declarations exactly:

```ts
export const InvalidReason = Schema.Literals([
  // exactly the finite members frozen above, in that order
] as const)
export type InvalidReason = typeof InvalidReason.Type

export interface Input<Stages extends readonly StageObservation[] = readonly StageObservation[]> {
  readonly path: string
  readonly format: Format
  readonly resolutionTarget: "node"
  readonly observedExternalImports: readonly string[]
  readonly stages: Stages
}

export interface Artifact<Stages extends readonly StageObservation[] = readonly StageObservation[]> {
  readonly path: FileArtifact["path"]
  readonly bytes: FileArtifact["bytes"]
  readonly digest: Digest
  readonly format: Format
  readonly resolutionTarget: "node"
  readonly observedExternalImports: readonly string[]
  readonly stages: Stages
  readonly [nonExportedArtifactTypeId]: typeof nonExportedArtifactTypeId
}

export type JavaScriptBundleError =
  | InvalidJavaScriptBundle
  | JavaScriptBundleAccessFailed
  | JavaScriptBundleTemporaryDirectoryFailed

export const withFile: <const Stages extends readonly StageObservation[], A, E, R>(
  input: Input<Stages>,
  use: (artifact: Artifact<Stages>) => Effect.Effect<A, E, R>
) => Effect.Effect<
  A,
  InvalidJavaScriptBundle | JavaScriptBundleAccessFailed | E,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | Exclude<R, Scope.Scope>
>
```

The `JavaScriptBundle` namespace runtime members are exactly `Format`,
`InvalidReason`, `InvalidJavaScriptBundle`, `JavaScriptBundleAccessOperation`,
`JavaScriptBundleAccessFailed`, `JavaScriptBundleTemporaryDirectoryFailed`, and
`withFile`; its type-only declarations are exactly `Format`, `Input`,
`Artifact`, `InvalidReason`, `JavaScriptBundleAccessOperation`, and `JavaScriptBundleError` plus
the class instance types. Freeze these nested keys in declaration tests even
though the root tooling allowlist sees the namespace as one runtime key.

Decode descriptor objects with excess-property rejection. Require non-empty
external specifiers in strictly sorted unique order and decode every supplied
stage through core `StageObservation` before freezing. Do not silently sort,
deduplicate, or preserve an unchecked caller array: the one canonical runtime
representation is already normalized, and malformed descriptors fail before
the callback starts.
Use a total field-by-field `Result` decoder to preserve the finite public reason
codes: non-record input -> `expected-object`; an extra own key ->
`unknown-field`; an absent required key -> `missing-field`; and each known
field maps its `Schema.decodeUnknownResult` failure directly to its named code
(`invalid-path`, `invalid-format`, `invalid-resolution-target`,
`invalid-observed-external-import`, or `invalid-stages`).
Perform the format/suffix and sorted/unique checks separately. Never parse,
pretty-print, or pattern-match formatted `SchemaError` text to manufacture a
machine code; those messages are not the cross-version contract. Do not call a
throwing sync decoder and then rebuild its exception as a parallel validation
ADT.

Create `packages/effect-build/src/Integration.ts` as the advanced
integration-author boundary. It owns:

- `withOwnedJavaScriptBundle({ temporaryPrefix, produce }, use)` for a
  producer that asks core to allocate one fresh temporary root; core creates
  and claims that root before production and owns its eventual physical
  deletion, and
  `inspectLiveJavaScriptBundle(value)` for defensive consumer preflight. The
  inspection re-stats and rehashes the file, rejects missing/non-regular,
  byte-count drift, and same-length content drift, then returns the same
  authenticated nominal handle. This is a use-time integrity check, not a
  claim against a malicious concurrent writer after inspection;
- `produceExecutable(...)`, a higher-order wrapper over the existing private
  candidate lifecycle;
- `executeCommand(...)`, the existing bounded/scoped runner as a function
  requiring Effect's `ChildProcessSpawner`, not a replaceable service.

Freeze the other three Integration signatures before the executable wrapper:

```ts
export const withOwnedJavaScriptBundle: <
  const Stages extends readonly StageObservation[],
  A,
  ProduceError,
  E,
  R1,
  R2
>(
  source: {
    readonly temporaryPrefix: string
    readonly produce: (cleanupRoot: string) =>
      Effect.Effect<JavaScriptBundle.Input<Stages>, ProduceError, R1>
  },
  use: (artifact: JavaScriptBundle.Artifact<Stages>) => Effect.Effect<A, E, R2>
) => Effect.Effect<
  A,
  ProduceError | JavaScriptBundle.JavaScriptBundleError | E,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto |
    Exclude<R1 | R2, Scope.Scope>
>

export const inspectLiveJavaScriptBundle: <const Stages extends readonly StageObservation[]>(
  value: JavaScriptBundle.Artifact<Stages>
) => Effect.Effect<
  JavaScriptBundle.Artifact<Stages>,
  JavaScriptBundle.InvalidJavaScriptBundle |
    JavaScriptBundle.JavaScriptBundleAccessFailed,
  FileSystem.FileSystem | Crypto.Crypto
>

export interface CommandOutput {
  readonly text: string
  readonly truncated: boolean
}
export interface CommandCompletion {
  readonly exitCode: number
  readonly stdout: CommandOutput
  readonly stderr: CommandOutput
}
export type ExecuteCommand = (
  executable: string,
  argv: readonly string[],
  cwd?: string
) => Effect.Effect<
  CommandCompletion,
  PlatformError.PlatformError,
  ChildProcessSpawner.ChildProcessSpawner
>
export const executeCommand: ExecuteCommand
```

`temporaryPrefix` must be a non-empty simple filename prefix: reject NUL, `/`,
any single U+005C REVERSE SOLIDUS character (the Windows path separator), `.`,
and `..` as
`InvalidJavaScriptBundle("temporary-prefix-invalid")` before touching
FileSystem. Core calls unscoped
`FileSystem.makeTempDirectory({ prefix: temporaryPrefix })`; neither the
integration nor its producer may call `makeTempDirectoryScoped` or register a
second root finalizer. `JavaScriptBundleTemporaryDirectoryFailed` reports that
call's exact prefix and platform reason. The producer may require Scope because
core owns the one inner producer/use Scope.

Freeze allocation and registration as one state transition. Core runs one
`SynchronizedRef.modifyEffect` while it creates the temporary directory,
normalizes/canonicalizes it, verifies that it is an absolute empty directory,
compares it with every active root and prospective publication destination,
and installs the active-root claim. It releases the atomic transition only after the
claim is installed or the path is rejected. This prevents a destination claim
from disappearing between root validation and registration. A destination
fiber whose claim already exists may continue producing or publishing while
core performs these checks, but its decrement/release also uses the same ref,
so the conflict remains visible. A contested or overlapping path is never
accepted and is deliberately never recursively deleted; ownership did not
transfer, and preserving a possibly concurrent durable output outranks removal
of an empty directory. The callback does not enter. Add no retry, fallback, or
cleanup switch for this exceptional allocator collision.

After a successful claim, core runs `source.produce(cleanupRoot)` inside the
owned inner Scope. The returned descriptor must name a canonical file inside
that root and passes the same total observation/nominal registration as
`withFile` before `use` starts.

Freeze cleanup ordering as part of the API, not an Esbuild convention. On
success, failure, defect, or interruption, the Artifact liveness finalizer and
every scoped resource acquired by `source.produce` (including esbuild context
cancel/dispose) finish first; core then awaits recursive physical deletion of
the cleanup root; only after that deletion attempt completes does it unregister
the root claim. Use one outer `Effect.acquireUseRelease`: its acquisition
creates/validates/registers the root, its **interruptible use** runs
`Effect.scoped(source.produce -> live-handle bracket -> caller callback)`, and
its masked release awaits root deletion with claim unregistration in
`ensuring`. `acquireUseRelease` already masks only acquisition and release;
never wrap the whole operation or callback in `Effect.uninterruptible`.
Convert deletion failure to a cleanup defect so the release error remains
`never` without leaking the claim. No deletion is attempted before successful
root-claim installation. This order leaves no interval in which another fiber
can publish under a root that a pending finalizer can still delete.

`inspectLiveJavaScriptBundle` accepts the statically typed value
as `unknown` at runtime, authenticates hidden handle identity, rechecks
content, and preserves its generic stages only after that check. It returns no
wrapper, cleanup path, registry, or mutation operation.

Freeze the complete advanced signature before implementation:

```ts
export interface NativeExecutableObservation {
  readonly format: "elf" | "macho" | "pe"
  readonly os: "linux" | "macos" | "windows"
  readonly architecture: "x64" | "aarch64"
  readonly abi?: "gnu" | "musl"
}

export type PublishedExecutable<Stages extends readonly [StageObservation, ...StageObservation[]]> =
  Readonly<Omit<ExecutableArtifact, "stages"> & { readonly stages: Stages }>

export const produceExecutable: <Prepared, Stages extends readonly [StageObservation, ...StageObservation[]], PrepareError, ProduceError, InvalidStagesError, R1, R2>(
  input: {
    readonly outfile: string
    readonly cwd?: string
    readonly digest?: boolean
    readonly executableSuffix?: "" | ".exe"
    readonly prepare: (context: { readonly resolvedDestination: string }) =>
      Effect.Effect<Prepared, PrepareError, R1>
    readonly produce: (context: {
      readonly prepared: Prepared
      readonly stagedOutfile: string
      readonly resolvedDestination: string
    }) => Effect.Effect<unknown, ProduceError, R2>
    readonly decodeStages: (
      prepared: Prepared,
      value: unknown
    ) => Result.Result<Stages, InvalidStagesError>
    readonly resolveTarget: (observation: NativeExecutableObservation) =>
      Result.Result<SystemTarget, string>
  }
) => Effect.Effect<
  PublishedExecutable<Stages>,
  PrepareError | ProduceError | InvalidStagesError |
    OutputMissing | OutputInvalid | OutputLocked | PublicationFailed,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto |
    Exclude<R1 | R2, Scope.Scope>
>
```

Core resolves the destination lexically and atomically increments a private,
reference-counted publication-destination claim, allowing an equal existing
key. Do not add a filesystem probe to the ordinary claim path when no producer
cleanup root is active: Bun, Deno, and the retained facade must continue to
reach the existing candidate acquisition, whose recursive `makeDirectory`
failure remains exactly `PublicationFailed { operation: "make-directory" }`.
This preserves their current failure ordering and vocabulary.

Physical canonicalization is required only while comparing a destination with
an active cleanup root, or while a new owned root is compared with already-live
destination claims. Without following the final filename, start at
`dirname(resolvedDestination)`, walk upward on `NotFound` to the nearest
existing ancestor, require that ancestor to be a directory, realpath it, then
append the collected normalized missing segments and final basename lexically.
Reject empty, `.` and `..` collected segments. This follows symlinks in the
existing ancestor but never follows the final destination entry. In the
destination-registration direction only, a non-`NotFound` stat/realpath
failure, exhaustion before an existing directory, or existing non-directory
ancestor becomes `PublicationFailed { path: resolvedDestination, operation:
"resolve-destination-parent", reason }`. That operation is reachable only
when the newly introduced owned-bundle feature is live, not on a pre-existing
Bun/Deno/combined-facade execution in isolation. In the opposite root-
registration direction, the exact attempted-ancestor stat/realpath and
unresolvable-destination mappings frozen above fail the owned-root operation
rather than the already-running compile. A missing parent itself is not an error and candidate
acquisition may create it only after `prepare`.

Serialize root/destination check-and-registration through the one private
`SynchronizedRef`; release uses a pure atomic decrement/removal and cannot fail.
Bracket each destination claim with `Effect.acquireUseRelease`, or register it
with `Effect.acquireRelease` as the first action in an already-enclosing Scope,
so interruption cannot land between increment and finalizer installation. Do
not `yield*` a bare increment and attach a later `ensuring` cleanup.
After a successful claim, core runs `prepare` to completion before any
directory/candidate allocation, creates and consumes the hidden candidate, and
holds the destination claim until the entire operation exits. A later owned
root registration symmetrically rejects a root containing this destination.
It passes the prepared value and producer's unknown stage result to
`decodeStages` before validation/publication. The callback returns either the
one canonical typed tuple or the integration-owned typed failure; core does not
invent a parallel stage schema or error mapper. Bun/Deno implement it with
`Schema.decodeUnknownResult(..., { onExcessProperty: "error" })` plus
`Result.mapError`/`Result.flatMap`, their exact one-stage Schema decoder, and existing provider-attributed
`ToolFailed`. In this plan's retained combined Node facade, the live main does
not exist until the Esbuild callback inside `produce`; therefore outer
`prepare` retains only the fixed expected esbuild 0.28.2 stage and the
already-probed selected Node 26.7 stage. The entire
Esbuild -> authenticated-main -> Node action stays inside `produce`, which
returns the observed two-stage tuple. `decodeStages` then exact-decodes and
compares that tuple with the fixed prepared expectation, mapping mismatch
through the facade's existing provider-attributed `ToolFailed`. It must not
prebundle, leak the callback Scope, or claim that the main was authenticated
before candidate allocation. Plan 024 is the first topology where `main` is an
operation input available to `prepare`; only there does Node SEA close over and
correlate the authenticated arbitrary `main.stages` prefix with its suffix.
Producer and preflight errors propagate unchanged. The returned value contains
the decoded tuple exactly once. The outer internal Scope discharges any
callback `Scope` requirement while still finalizing on success, failure,
defect, and interruption. Only the observation type is public; no native
inspection operation is exported.

`executeCommand` is the exact existing bounded runner signature for integration
authors: executable, readonly argv, and optional cwd in; bounded stdout/stderr
completion or `PlatformError` out; `ChildProcessSpawner` required. It is not an
end-user request option, replaceable executor service, or process handle. Keep
the current one-MiB-per-channel UTF-8 bound, concurrent stdout/stderr draining,
`shell: false`, `forceKillAfter: "2 seconds"`, and scoped interruption
kill/wait/force-kill/reap semantics exactly; do not add a configurable capture
limit. Never catch or translate interruption.

Implement reusable effectful Integration boundaries with stable named
`Effect.fn` functions: `effect-build/Integration.withOwnedJavaScriptBundle`,
`effect-build/Integration.inspectLiveJavaScriptBundle`,
`effect-build/Integration.produceExecutable`, and
`effect-build/Integration.executeCommand`. Use `Effect.gen` inside sequential
bodies, but do not add ceremonial wrappers to pure decoders or one-line
delegators. Span names/attributes may contain bounded provider, operation,
target, exit-code, and truncation facts; never record argv, raw diagnostics,
or caller paths.

The module never exports a candidate, commit, rename Effect, process handle,
file inspector, or arbitrary executor.

Keep the existing `captureCellResult` cause filter for matrix cells. Do not
replace it with `Effect.result`: at both supported Effect endpoints a combined
typed-failure-plus-interruption Cause can be reduced to a `Result.Failure`,
losing interruption. The current helper's rule remains exact—capture one pure
typed failure only; propagate interruption, defects, and mixed Causes—and its
mixed-Cause regression remains mandatory.

Error mapping is owned by the integration, not silently widened into its
public union. The temporarily retained Esbuild adapter maps core
`InvalidJavaScriptBundle` to `JavaScriptBundleInvalid`, and maps core access
failure to `BundleMaterializationFailed` with the corresponding
`realpath | stat | read | digest` operation. It maps
`JavaScriptBundleTemporaryDirectoryFailed { prefix, reason }` to
`BundleMaterializationFailed { path: resolvedCwd, operation: "make-temp",
reason }`. The current Node SEA adapter maps
forged/stale identity to `InvalidNodeSeaInput("main-artifact-not-live")`, core
`file-not-regular` to `InvalidNodeSeaInput("main-artifact-not-regular")`, core
`invalid-byte-count` to the deliberately added
`InvalidNodeSeaInput("main-artifact-invalid-byte-count")`, and byte/digest
drift to the deliberately added stable reason
`InvalidNodeSeaInput("main-artifact-changed")`. Platform access failures map
to `NodeSeaPreparationFailed` operations
`realpath | stat | read-main | digest-main`.
These mappings and new literal members are frozen in tests before Plan 024
moves the integrations.
The Esbuild mapper must use the core errors' static family-marker guards with
`Effect.catchIf` (or an equivalent identity-preserving boundary), never
`Effect.catchTags` around the complete higher-order Effect. Caller error `E`
is unconstrained and may reuse a core `_tag`; a same-tag structural caller
error without the marker must pass through unchanged.

For this compatibility step, extend `BundleMaterializationOperation` to
exactly `make-temp | write | realpath | stat | read | digest`, and extend
`NodeSeaPreparationOperation` to exactly `realpath | stat | read-main |
digest-main | make-config | write-config`. The retained facade maps an outer
fixed-tuple decoder failure to `ToolFailed`, so it does not fabricate a Node
preparation operation. Plan 024 preserves those members and deliberately adds
`decode-stages` when the granular Node operation can prepare from a real main.
Compose the retained Esbuild `JavaScriptBundleInvalid.reason` Schema from the
exported core `JavaScriptBundle.InvalidReason` plus its private
Esbuild-specific literals, rather than copying core codes; this includes
`invalid-byte-count`. Neither integration may collapse an unsafe bigint
conversion into a generic platform message.

The existing `CompilerEngine` must call this operation for Bun, Deno, and the
temporarily retained combined Node SEA facade. This proves it is not a
Node-only wrapper.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| install | `bun install --frozen-lockfile` | exit 0; `bun.lock` unchanged |
| build | `bun run build` | all current four packages build |
| focused unit | `bun x vitest run test/unit/core-artifact.test.ts test/unit/standalone-process.test.ts test/unit/standalone-publication.test.ts test/unit/esbuild-bundle.test.ts test/unit/node-sea.test.ts test/unit/esbuild-node-sea-pipeline.test.ts` | all pass; existing platform skip only if applicable |
| architecture | `bun run build && bun run test:architecture` | all architecture tests pass against built declarations |
| type API | `bun run test:types` | all TSTyche assertions pass |
| complete | `bun run verify` | exit 0 |
| Effect range | `bun run verify:effect` | beta.104 and rc.108 pass the tagged-error guards, explicit Result-to-reason mapping, checked bigint size conversion, SynchronizedRef transitions, acquire/use/release interruption behavior, and named Effect functions |
| formatting | `git diff --check` | no output, exit 0 |

Always run `bun run build` before a standalone architecture-test command;
those tests inspect ignored `dist` declarations.

## Scope

**In scope** (the only source/config/test files this plan may modify):

- `packages/effect-build/src/standalone/Artifact.ts`
- `packages/effect-build/src/standalone/BuildError.ts`
- `packages/effect-build/src/standalone/CompileExecutable.ts`
- `packages/effect-build/src/standalone/CompileExecutableMatrix.ts`
- `packages/effect-build/src/standalone/Driver.ts`
- `packages/effect-build/src/standalone/Target.ts`
- `packages/effect-build/src/standalone/MatrixError.ts`
- `packages/effect-build/src/standalone/internal/ExecutableLifecycle.ts`
- `packages/effect-build/src/standalone/internal/CompilerEngine.ts`
- `packages/effect-build/src/standalone/internal/CompilerAdapter.ts`
- `packages/effect-build/src/standalone/internal/Process.ts` (delete after the
  bounded implementation moves to `Integration.ts`)
- `packages/effect-build/src/standalone/internal/TargetCatalog.ts`
- `packages/effect-build/src/standalone/internal/TargetTable.ts`
- `packages/effect-build/src/standalone/internal/ToolDiscovery.ts`
- `packages/effect-build/src/internal/ProviderContracts.ts`
- `packages/effect-build/src/Provider.ts`
- `packages/effect-build/src/JavaScriptBundle.ts` (new)
- `packages/effect-build/src/Integration.ts` (new)
- `packages/effect-build/src/index.ts`
- `packages/effect-build/package.json`
- `packages/effect-build-bun/src/Adapter.ts`
- `packages/effect-build-bun/src/index.ts`
- `packages/effect-build-deno/src/Adapter.ts`
- `packages/effect-build-deno/src/index.ts`
- `packages/effect-build-node-sea/src/Adapter.ts`
- `packages/effect-build-node-sea/src/internal/Esbuild.ts`
- `packages/effect-build-node-sea/src/internal/NodeSea.ts`
- `package.json`
- `tooling/public-api.json`
- `scripts/read-tooling.mjs`
- `scripts/test-built-consumer.mjs`
- `test/unit/core-artifact.test.ts` (new)
- `test/unit/standalone-process.test.ts`
- `test/unit/standalone-contract.test.ts`
- `test/unit/standalone-bun.test.ts`
- `test/unit/standalone-deno.test.ts`
- `test/unit/standalone-matrix.test.ts`
- `test/unit/standalone-publication.test.ts`
- `test/unit/esbuild-bundle.test.ts`
- `test/unit/node-sea.test.ts`
- `test/unit/esbuild-node-sea-pipeline.test.ts`
- `test/architecture/import-boundaries.test.ts`
- `test/architecture/generated-and-ci.test.ts`
- `test/architecture/public-api.test.ts`
- `test/architecture/provider-spi.test.ts`
- `test/architecture/workspace-topology.test.ts`
- `test/architecture/docs-contract.test.ts`
- `test/testkit/standaloneDriverContract.ts`
- `test/testkit/standaloneHostContract.ts`
- `test/integration/standalone-bun.test.ts`
- `test/integration/standalone-deno.test.ts`
- `typetest/core-artifact.tst.ts` (new)
- `typetest/provider-definition.tst.ts`
- `typetest/standalone-contract.tst.ts`
- `docs/architecture.md`
- `docs/api.md`
- `docs/errors.md`
- `docs/README.md`
- `packages/effect-build/README.md`
- `AGENTS.md`
- `plans/README.md` and this plan for status/receipt only

**Out of scope**:

- creating `effect-build-esbuild` or moving the Esbuild implementation;
- changing package count, workspace references, lockfile dependencies, release
  workflow, or CI job graph;
- removing or renaming the current Node SEA public facade (Plan 024 owns it);
- changing Bun/Deno input, result-object values, target support, option
  behavior, matrix semantics, or Layer requirements;
- scalar total-preflight behavior;
- any public native file inspector;
- any generic bundler/packager/build service, pipeline value, plan, executor,
  store, registry, cache, receipt, manifest, or remote abstraction.

## Git workflow

- Branch from a clean current main: `codex/023-core-artifact-lifecycle`.
- Use conventional commits matching repository history, for example
  `refactor: establish core artifact lifecycle`.
- Keep Plans 023-025 in one no-publish migration. Do not tag, pack a release
  candidate, push a release workflow, or publish after Plan 023 or Plan 024.
- Do not push or open a PR unless the operator explicitly requests it.

## Steps

### Step 0: Restamp repository execution governance and restart

This step requires a separate explicit maintainer request that names the
granular-integration supersession. Merely discovering this plan is not
authorization. In that authorized governance-only turn, replace `AGENTS.md`
with this exact rule set and make no source/config/test/workflow change:

```md
# effect-build execution rules

- Architecture generation: `granular-integration-migration-v2`.
- Plans 023, 024, and 025 form one no-publish migration. Plan 023 may temporarily retain the current four-package combined Node SEA facade while it establishes neutral core boundaries; Plan 024 must atomically split Esbuild and Node SEA without certifying that intermediate public cut; Plan 025 must add the selected Bun bundle producer, prove both bundle producers against Node SEA, and restamp this file to `granular-integration-v2`. No tag, package, release candidate, or publication may be produced before Plan 025 completes.
- Keep Bun and Deno's existing public scalar `compileExecutable` and homogeneous-provider `compileExecutableMatrix` operations and behavior. Their provider packages remain explicit; there is no registry, fallback, retry, raw argv, or automatic installation.
- The final state is exactly five lockstep public packages: `effect-build`, `effect-build-bun`, `effect-build-deno`, `effect-build-esbuild`, and `effect-build-node-sea`. Every integration depends one way on core and never on an integration sibling.
- In the final state, `effect-build` owns only provider-neutral Artifact/Target semantics plus the narrow `./Integration` and command-only `./Provider` author boundaries earned by current consumers. Do not add a generic builder, bundler, packager, plan, executor, store, cache, transport, or backend registry.
- During Plan 023 only, the existing Node SEA package may retain its opaque combined compatibility facade and private Esbuild producer while both migrate onto the neutral core lifecycle. Plan 024 moves Esbuild to `effect-build-esbuild`, changes `effect-build-node-sea` to consume only the core bundle capability, and makes application Effect code own composition; it must delete the opaque combined facade with no alias or sibling dependency.
- During Plan 023 only, core may retain the existing closed Artifact/MatrixError compatibility projections and composed Node SEA `Provider` branch required by that facade. Plan 024 must delete them rather than extend them; no new provider case or generic protocol may be added.
- Shared lifecycle code exclusively owns sibling staging, scoped child processes, candidate identity, executable validation, optional hashing, lifetime-safe publication claims, and atomic replacement. Integrations own tool discovery/probing, native invocation, semantic input validation, and diagnostics.
- In the final state, `effect-build/Provider.define` is a command-provider author SPI with Bun and Deno as its consumers. It may build a provider-specific service from one selected command so Bun compilation and Bun bundling cannot discover different tools; it does not expose that bound command to end users or define a generic bundler. Esbuild and Node SEA do not implement a guessed common provider protocol.
- Plan 025 may add only `Bun.withJavaScriptBundle(input, use)` to the existing Bun service. Bun fixes Node resolution and exposes its pinned producer-default bundle behavior; exact Node syntax acceptance remains owned by `NodeSea.createExecutable`. Deno remains scalar/matrix only until a separately evidenced bundle operation exists.
- `effect-build/Integration.executeCommand` is the one bounded/scoped integration-author command function. Do not expose a process handle, replaceable process service, candidate, commit, raw native inspector, or publication mutation capability.
- Keep package manager, orchestrator runtime, build tool, and artifact target independent. Applications provide one official Effect platform Layer at composition time.
- Library source uses Effect platform-neutral services. Do not import `node:*` or call `Effect.runPromise` under `packages/*/src/`.
- Preserve compiler CLI project/environment behavior and Bun/Deno operation semantics unless a dedicated public decision explicitly changes them.
- Interruption closes Scope and terminates active children. Do not translate interruption into a build error. Atomic rename remains the publication point of no return.
- Run `bun run verify` before handing off a complete implementation.
```

The replacement supersedes the stale permanent four-package/closed-provider
freeze while explicitly authorizing the one temporary Plan 023 compatibility
state; it does not relax the exclusions that this program retains. Verify and
commit only the governance change:

```sh
git diff --check
test "$(git status --porcelain=v1 --untracked-files=all | cut -c4-)" = "AGENTS.md"
rg -Fx -- '- Architecture generation: `granular-integration-migration-v2`.' AGENTS.md
rg -Fx -- '- Plans 023, 024, and 025 form one no-publish migration. Plan 023 may temporarily retain the current four-package combined Node SEA facade while it establishes neutral core boundaries; Plan 024 must atomically split Esbuild and Node SEA without certifying that intermediate public cut; Plan 025 must add the selected Bun bundle producer, prove both bundle producers against Node SEA, and restamp this file to `granular-integration-v2`. No tag, package, release candidate, or publication may be produced before Plan 025 completes.' AGENTS.md
rg -Fx -- '- The final state is exactly five lockstep public packages: `effect-build`, `effect-build-bun`, `effect-build-deno`, `effect-build-esbuild`, and `effect-build-node-sea`. Every integration depends one way on core and never on an integration sibling.' AGENTS.md
! rg -n 'exactly two public operations|exactly four lockstep|closed to Bun, Deno, and Node SEA|process capabilities package-private' AGENTS.md
git add -- AGENTS.md
git commit -m "docs: restamp granular integration governance"
test "$(git diff-tree --no-commit-id --name-only -r HEAD)" = "AGENTS.md"
test -z "$(git status --porcelain=v1)"
```

Expected: one AGENTS-only governance commit. End the turn here. The source
executor starts fresh, reruns the top drift check, and treats the restamped
rules as authoritative. Do not combine this governance transition with Step 1
or later implementation edits.

### Step 1: Freeze existing behavior and the durable vocabulary in red tests

Add `test/unit/core-artifact.test.ts` and register it in the explicit
`test:unit` script immediately. Add `typetest/core-artifact.tst.ts`. In this
step, add only the assertions consumed by Step 2; Steps 3 and 4 add their own
red assertions immediately before implementing those contracts. This avoids a
test suite that cannot become green at an intermediate checkpoint.

Tests must assert:

- exact `FileArtifact` validation for absolute path, safe byte count, and
  optional lowercase SHA-256;
- `ExecutableArtifact` requires a system target and non-empty ordered stages;
- no `ExecutionTarget`, `BuildTarget`, manifest, receipt, store, inspector,
  candidate, commit, or process handle appears in root declarations;
- the existing provider-specific projections derive from the durable base
  without changing Bun/Deno/Node SEA runtime keys, values, or errors in this
  plan.

The initial focused test is expected to fail only for the missing new contract.
Do not weaken current tests to get red.

**Verify**:

```sh
bun run build && bun x vitest run test/unit/core-artifact.test.ts test/architecture/public-api.test.ts
bun run test:types
```

Expected: failures name only the absent durable Artifact/SystemTarget contract;
current Bun/Deno/Node SEA behavior assertions still pass.

### Step 2: Establish one durable artifact and target vocabulary

Implement the target core contract above in `Artifact.ts` and `Target.ts`.
Make `TargetCatalog` project the same eight literals; do not copy them into a
second array. Derive the temporarily retained provider Artifact projections
from `ExecutableArtifact.fields` and exact provider stage schemas so runtime
output remains byte-for-byte the same shape.

Do not call stage arrays provenance or receipts. Preserve exact Bun/Deno/Node
stage observations. Rename the root semantic target schema rather than adding
an object-shaped representation. Update internal imports and the root index in
one compile-green commit.

**Verify**:

```sh
bun run build
bun run check
bun x vitest run test/unit/core-artifact.test.ts test/unit/standalone-contract.test.ts test/unit/standalone-matrix.test.ts
bun run test:types
```

Expected: exit 0; scalar/matrix values retain `path`, `bytes`, optional
`digest`, `provider`, `target`, and `stages` with the same values/order.

### Step 3: Move bundle liveness to the core nominal capability

Before implementation, append the bundle assertions to
`core-artifact.test.ts`, `core-artifact.tst.ts`, and the API architecture
contract. They must require that `JavaScriptBundle.Artifact` cannot be
structurally constructed or decoded; `withFile` rejects malformed
descriptors/non-regular files, is live only in the callback, observes bytes
plus required digest, freezes nested arrays/objects, accepts explicit empty
stages for a borrowed pre-existing bundle, uses the exact stale-vs-platform
failure classification above, rejects same-length content rewrites at
inspection, and never deletes the borrowed file. They must also prove that an
invalid descriptor reaches every frozen shape/field reason code through the
explicit `Result` mapping at both Effect endpoints without inspecting
`SchemaError` message text; fake FileSystem information with negative or
greater-than-`Number.MAX_SAFE_INTEGER` bigint size must yield
`invalid-byte-count` before any numeric conversion or handle construction.
They must also prove that an
invalid temporary prefix fails before FileSystem, temporary-directory
allocation failure is the exact
`JavaScriptBundleTemporaryDirectoryFailed`, a relative generated root uses
`cleanup-root-not-absolute`, a missing/non-directory generated cleanup root and
a bundle outside its canonical cleanup root use the other exact invalid reasons
above, and other root realpath/stat failures use
`JavaScriptBundleAccessFailed`. Freeze the owned-source ordering: `validated
prefix -> core makeTempDirectory -> root validation/comparison/claim in one
SynchronizedRef transition -> source.produce -> artifact observation -> use ->
artifact/producer Scope cleanup -> recursive root deletion -> root-claim
release`. Once the root claim succeeds, production/use failure and interruption
each still attempt exactly one core-owned deletion. Missing, non-directory,
non-empty, unobservable, overlapping, or publication-contested paths are
rejected without recursive deletion. They must prove both orders of the
private lifetime guard: with an owned root active, a lexical or symlink-parent
destination inside it returns the exact `OutputInvalid` before `prepare`,
candidate allocation, or producer work; with a destination claim held by a
blocked `prepare`, an overlapping owned-root registration returns
`cleanup-root-contains-active-publication` before its callback and does not
delete the contested root. Add the decisive race regression: while core holds
the `SynchronizedRef.modifyEffect` transition validating that generated root, let the already-claimed
destination advance through staging and atomic publication; its claim release
must wait, root registration must still observe/reject the conflict, no root
deletion may run, and the published artifact must survive. Overlapping owned
roots use their exact separate reason. Inject destination-ancestor stat and
realpath failures while registering that root and assert their exact attempted
path/operation; inject non-directory and exhausted walks and require
`active-publication-destination-unresolvable`. In every case the owned callback
does not enter and the existing compile remains otherwise live. Preserve missing-parent behavior:
a nested absent destination parent reaches `prepare` and is later created by
candidate acquisition, while a symlinked nearest existing ancestor yields the
same canonical containment decision as its real path. Run two concurrent
operations for one destination; after the first exits, an owned root containing
that destination remains rejected until the second exits, proving claim
reference counts do not replace the existing serialized-rename behavior.
With no cleanup root active, assert that destination claiming performs no
stat/realpath work and that a failing recursive parent creation still reports
the existing `PublicationFailed.operation === "make-directory"`; the new
`resolve-destination-parent` operation is tested only under an active owned
root.
Re-borrowing the owned main, an
alias, or copied bytes may create another live handle, but cannot evade the
destination check. A genuine borrowed file publishing outside all active roots
remains allowed. Freeze the exact `withFile`,
`withOwnedJavaScriptBundle`, `inspectLiveJavaScriptBundle`,
`produceExecutable`, and `executeCommand` signatures and their
environments/errors. `withFile` and inspection exclude the impossible
temporary-directory error; only the owned constructor exposes the full
`JavaScriptBundleError`. The Integration subpath is one exact public contract; do
not create a temporary two-key export surface that the next step rewrites.

Run the focused unit/type/API commands and require red failures only for these
new JavaScriptBundle/Integration declarations. An unrelated or previously
green assertion failing is a STOP. Then implement the contract below and rerun
the same commands to green.

Implement `JavaScriptBundle.ts` and its WeakMap-backed handle identity.
Implement all four `Integration.ts` operations, including the private
canonical-cleanup-root/lexical-destination claims with conditional physical
comparison and the complete
`produceExecutable` generic/decoder contract above and `executeCommand` as the
one public integration-author projection of the existing bounded runner. At
this point direct core tests exercise the new executable wrapper; Step 4 moves
all existing callers through it.

Add `./Integration` to `packages/effect-build/package.json` and update
`tooling/public-api.json`, `scripts/read-tooling.mjs`, and the declaration/API
allowlists in the same change. Update the exact root/subpath assertions in
`scripts/test-built-consumer.mjs` at the same time; otherwise the complete
verification gate cannot pass. The exact four-key Integration subpath must be
resolvable under NodeNext before any separate package imports it, and the
architecture and built-consumer tests must describe that same final surface.
Do not defer this manifest work to Step 5.

Refactor the current private Esbuild module to pass
`temporaryPrefix: "effect-build-esbuild-"` and move context acquisition,
rebuild, materialization, stat, and descriptor construction into the
`source.produce(cleanupRoot)` callback. Core allocates and registers ownership
before that callback begins. Delete Esbuild's
`makeTempDirectoryScoped`/outer root finalizer; there must be exactly one
physical allocation/deletion owner. Refactor Node SEA
to use only
`Integration.inspectLiveJavaScriptBundle` and the core Artifact type; it must
no longer import any type/function from `internal/Esbuild.ts`.

Keep the retained public facade's entire Esbuild continuation and Node SEA
consumption inside its `produce` callback. Its outer executable `prepare`
phase may retain the fixed expected Esbuild stage plus selected Node stage for
later exact decoding, but it cannot contain or authenticate a main that has
not been produced yet. Freeze this ordering in a test that records
`prepare -> candidate -> bundle callback/Node -> stage decode -> native
validation -> rename`, and assert a forged two-stage return becomes the
existing provider-attributed `ToolFailed` before publication.

Retain Esbuild's scoped context inside `source.produce`; core keeps that inner
Scope open through the user callback, then awaits context cancel/dispose,
deletes the owned temporary root, and finally releases the root claim. Public
`JavaScriptBundle.withFile` still never deletes a borrowed file.
`Integration.produceExecutable` rejects every final
destination contained by any active owned cleanup root, regardless of which
handle the caller supplies; it does not reject an unrelated destination for a
borrowed pre-existing file. Ensure Esbuild's
context release still attempts awaited `cancel()` and then awaited `dispose()`
even if cancel rejects, and remains uninterruptible/no-fail as required by
`acquireRelease`. Preserve the implemented Cause-level policy exactly:
`ensuring` attempts dispose after a cancel rejection, and an awaited cleanup
rejection becomes a defect augmenting the final Cause; it is neither logged and
swallowed nor translated into a typed build error. Keep the existing
cancel-rejects/dispose-runs and dispose-rejects Cause assertions green.

Keep the race tests deterministic and inside one Effect program: coordinate
with `Latch` or `Deferred`, store observations in `Ref`, use
`Effect.forkChild`, and await/interrupt Fibers explicitly. Do not use
`Date.now`, `setTimeout`, or polling. Do not add `@effect/vitest`; it is absent,
would change the frozen lockfile, and does not replace the required filesystem,
process, and Cause assertions. Add a same-tag callback regression proving an
ordinary caller error shaped like `InvalidJavaScriptBundle` but lacking the
family marker is returned unchanged.

Add a deterministic teardown race test. Let the user callback return, block
context dispose, and from another fiber attempt publication under the cleanup
root; it must still receive
`destination-under-active-bundle-cleanup-root`. Then release context disposal,
block the injected recursive root deletion, and require the same rejection a
second time. Only after deletion completes may the claim disappear, and the
root must no longer exist. This test must fail if claim release is merely tied
to callback exit or Artifact liveness.

Add content-staleness tests: after handle creation, missing/non-regular,
size-changing, and different-same-length main bytes must be rejected by Node
SEA before the child runs. An unrepresentable bigint file size must use the exact
`main-artifact-invalid-byte-count` mapping rather than `main-artifact-changed`
or an infrastructure string. The Esbuild mapping uses the exact
`JavaScriptBundleInvalid("invalid-byte-count")` code.
Keep the existing forged/copy/stale tests. Do not
claim arbitrary JavaScript dependency closure or protection from a malicious
concurrent writer after the use-time integrity check.

**Verify**:

```sh
bun run build
bun x vitest run test/unit/core-artifact.test.ts test/unit/esbuild-bundle.test.ts test/unit/node-sea.test.ts test/unit/esbuild-node-sea-pipeline.test.ts
bun run build && bun run test:architecture
bun run test:types
```

Expected: all pass; `effect-build/Integration` resolves with its exact final
runtime/declaration keys, no Node SEA source import references
`internal/Esbuild`, and temporary output is absent after every callback exit
path.

### Step 4: Move every producer through the one integration-author operation

Before migrating callers, append red behavior/architecture tests for the
one-MiB command bound, callback authority, provider-specific stage-decoder
mapping, stable named `Effect.fn` boundaries, `shell: false`,
`forceKillAfter: "2 seconds"`, and the single publication/rename owner. The declarations themselves
are already green from Step 3. Failures must identify only callers that still
bypass the new operations; bundle and durable-artifact assertions remain
green.

Migrate `CompilerEngine.compilePreparedCell` to the Step 3 wrapper and delete
its duplicated destination/candidate/publish choreography. The private
candidate WeakMap, one-shot consumption, inspection, digest, and rename remain
in their current owner.

The wrapper must resolve the destination and finish `prepare` before making a
directory or acquiring a candidate. It must decode the caller's stages before
calling `validateAndPublishExecutable`; a malformed stage result never
publishes. `produce` sees only the opaque `Prepared` value, `stagedOutfile`,
and `resolvedDestination`. It cannot retain or call a commit. Core may
transiently expose destination for preflight, but only the hidden lifecycle
identity retains destination plus rename authority.

Move the bounded collector/child implementation from
`standalone/internal/Process.ts` into `Integration.ts`, delete `Process.ts`,
and migrate every live caller: `CompilerAdapter.ts`, `CompilerEngine.ts`, `ToolDiscovery.ts`,
`Provider.ts`, the current Node SEA adapter, `standalone-process.test.ts`, both
real Bun/Deno integration tests, `standaloneDriverContract.ts`, and
`standaloneHostContract.ts`. Tests and testkits import the public author
function; code that needs the environment type imports Effect's official
`ChildProcessSpawner` directly. Do not retain an internal `runProcess` alias,
second collector, or compatibility re-export. `executeCommand` is one function,
not a new service or process handle.

Add type and architecture assertions for the full environment/error/return
signature and that a callback has no `.commit`, no candidate brand, and no
native inspector. Test malformed stages, missing output, wrong native target,
prepare failure with no staging allocation, hashing failure, rename failure,
interruption before publication, and the documented rename-linearization
boundary. Add a deterministic fake `ChildProcessSpawner` test coordinated by
Effect synchronization primitives: Scope closure must complete the child
finalizer before interruption returns, and the resulting Cause remains
interrupt-only. Keep one real-child kill/reap test as platform evidence.

**Verify**:

```sh
bun run build
bun x vitest run test/unit/core-artifact.test.ts test/unit/standalone-process.test.ts test/unit/standalone-publication.test.ts test/unit/standalone-bun.test.ts test/unit/standalone-deno.test.ts test/unit/node-sea.test.ts
bun run build && bun run test:architecture
bun run test:types
```

Expected: all pass; repository search finds one rename owner and no public
candidate/commit/process-handle declaration.

### Step 5: Reconcile the public contract and architecture instructions

Confirm the Step 3 package export/tooling contract is unchanged, then update
`docs/architecture.md`, `docs/api.md`, `docs/errors.md`, `docs/README.md`,
and `packages/effect-build/README.md` to say:

- the new core primitives are integration-author foundations;
- current Bun/Deno/Node SEA public operations remain temporarily unchanged;
- Plan 024 owns the atomic five-package/granular operation cut;
- scoped bundles are dynamically live capabilities, not serializable/durable
  files;
- stage observations are not receipts or reproducibility claims;
- exactly one core operation validates/hashes/renames executable candidates.

Do not revise `AGENTS.md` again here; assert that Step 0's
`granular-integration-migration-v2` marker and exact exclusions remain intact.

In particular, the package README must list the new root
`JavaScriptBundle` namespace and `./Integration` author subpath, and the error
guide must include `JavaScriptBundleError` without claiming that the two
compile operations exhaust all public tagged errors. Keep end-user compile
errors separate from integration-author bundle errors.

Use positive boundary assertions in docs tests. Do not use a broad prohibited-
word regex that rejects truthful disclaimers.

**Verify**:

```sh
bun run build && bun run test:architecture
bun run test:types
```

Expected: declarations, runtime keys, tooling manifest, docs, and type tests
agree exactly.

### Step 6: Run the complete behavior-preservation gate

Run all local gates. The lockfile must remain unchanged because this plan adds
no dependency. Keep package-manager Bun (`1.3.14`) distinct from the compiler
Bun (`1.3.9`): use the repository's checksum-pinned, CI-identical existing
tool-asset provisioner for Bun 1.3.9, Deno 2.9.3, and denort, then pass their
absolute paths only to the real-tool gate. This does not provision Node or
change any product discovery/download policy. The pinned archives are Linux
x64 binaries. On another host, do not fetch/execute them and do not fall back
to PATH; record the local real-tool gate as `UNAVAILABLE`. In every case the
reviewable implementation commit must run the existing CI workflow, and its
`node-sea` job must succeed at that exact SHA; this is the required real Node
26.7 ESM/CJS evidence. The `real-tools` job is additionally mandatory at that
SHA when the pinned Bun/Deno/denort gate was unavailable locally. Plan 023
cannot become `DONE` or hand off to Plan 024 without those exact jobs.

**Verify**:

```sh
test "$(bun --version)" = "1.3.14"
bun install --frozen-lockfile
bun run verify
bun run verify:effect
if test "$(uname -s)-$(uname -m)" = "Linux-x86_64"; then
  TOOLS_FILE="$(mktemp)"
  node scripts/provision-tool-assets.mjs > "$TOOLS_FILE"
  EFFECT_BUILD_BUN_BIN="$(sed -n 's/^bun=//p' "$TOOLS_FILE")"
  EFFECT_BUILD_DENO_BIN="$(sed -n 's/^deno=//p' "$TOOLS_FILE")"
  DENORT_BIN="$(sed -n 's/^denort=//p' "$TOOLS_FILE")"
  test "$("$EFFECT_BUILD_BUN_BIN" --version)" = "1.3.9"
  test "$("$EFFECT_BUILD_DENO_BIN" --version | sed -n '1s/^deno //p')" = "2.9.3"
  test -x "$DENORT_BIN"
  EFFECT_BUILD_BUN_BIN="$EFFECT_BUILD_BUN_BIN" \
  EFFECT_BUILD_DENO_BIN="$EFFECT_BUILD_DENO_BIN" \
  EFFECT_BUILD_DENO_VERSION="2.9.3" \
  DENORT_BIN="$DENORT_BIN" \
  bun run verify:real
else
  echo "UNAVAILABLE: pinned real-tool assets require Linux-x86_64; exact-SHA CI real-tools is mandatory"
fi
git diff --check
git diff --exit-code 60259f98a460b3d9b25b95221ca71b56c17d9d78 -- bun.lock
git diff --exit-code HEAD -- bun.lock
```

Expected: deterministic/compatibility/lock gates exit 0. The real-tool gate
either passes locally with the three explicit pinned paths or is recorded
`UNAVAILABLE` solely for host incompatibility. Create the reviewable
implementation commit after the local gates, and—with explicit operator
authorization—push it and require the existing CI `node-sea` job to complete
successfully at that exact SHA. Also require `real-tools` from that run when
the local pinned-tool branch was unavailable. Record the run ID, URL, SHA, and
each required job conclusion. Without that authorization/evidence, STOP with
Plan 023 still in progress. On CI failure, fix in a new implementation commit
and repeat; never attach an older run to new bytes. Mark `DONE` only after this
evidence and a cold review confirm every existing operation still has the same
runtime behavior.

For every implementation commit, verify the authorized remote run with:

```sh
IMPLEMENTATION_SHA="$(git rev-parse HEAD)"
gh run list --workflow ci.yml --event push --commit "$IMPLEMENTATION_SHA" --limit 5 --json databaseId,event,headSha,status,conclusion,url
# Select CI_RUN_ID only from a push entry whose headSha equals IMPLEMENTATION_SHA.
test -n "$CI_RUN_ID"
gh run watch "$CI_RUN_ID" --exit-status
test "$(gh run view "$CI_RUN_ID" --json event --jq .event)" = "push"
test "$(gh run view "$CI_RUN_ID" --json headSha --jq .headSha)" = "$IMPLEMENTATION_SHA"
gh run view "$CI_RUN_ID" --json event,headSha,status,conclusion,jobs,url
```

Expected: `event: push`, exact `headSha`, completed/success, and the named `node-sea` job is
success—not skipped, neutral, or cancelled. If local pinned Bun/Deno/denort
evidence was unavailable, the named `real-tools` job must independently be
success. The receipt records the exact run/job evidence and which source
satisfied the Bun/Deno/denort gate.

## Test plan

- `test/unit/core-artifact.test.ts`: schema boundaries, bundle nominal identity,
  borrowed-file behavior, live/stale/forged handles, nested immutability, and
  symmetric canonical-cleanup-root/lexical-destination conflicts, including
  conditional physical comparison, in both registration orders; one
  `SynchronizedRef<ClaimState>` is the only registry/serialization authority,
  and same-tag caller errors pass through unless they carry the core family
  marker.
- `test/unit/standalone-publication.test.ts`: the new integration wrapper is the
  only caller-visible publication operation; malformed stages and every output
  failure remain pre-rename; equal-destination concurrency still permits both
  producers and serializes their renames while lifetime claims ref-count.
- existing `esbuild-bundle`, `node-sea`, and full pipeline tests: unchanged
  cleanup and liveness behavior through the new core owner, including blocked
  context-dispose/root-delete concurrency.
- existing Bun/Deno scalar and matrix suites: unchanged option/target/ordering /
  partial-result behavior, including mixed typed-failure/interruption Causes
  that must not be collapsed through `Effect.result`.
- `standalone-process.test.ts`: deterministic fake-spawner finalization and
  interruption-Cause assertions plus one retained real-child kill/reap case;
  no timer polling.
- `typetest/core-artifact.tst.ts`: exact public types, non-constructible bundle
  handle, callback environment signature, absence of rejected types.
- architecture tests: one rename owner, no raw lifecycle/process handle or
  replaceable executor, exactly one bounded Integration command function,
  exact public allowlists, unchanged public
  `PublicationFailed.operation: string` with finite private lifecycle writers,
  and new tests registered in `test:unit`.

## Done criteria

- [ ] `bun install --frozen-lockfile`, `bun run verify`, and
      `bun run verify:effect` exit 0; pinned Bun/Deno/denort real-tool evidence
      passes either locally on Linux x64 or in the exact-SHA CI `real-tools`
      job.
- [ ] The exact implementation SHA has a successful, non-skipped CI
      `node-sea` job exercising the pinned Node 26.7 ESM/CJS pipeline.
- [ ] Bun/Deno/Node SEA existing public runtime keys and observable operation
      behavior are unchanged by this plan.
- [ ] `AGENTS.md` still carries `granular-integration-migration-v2` and the
      explicit no-publish Plan 023 compatibility exception; Plan 025, not this
      intermediate step, owns the final-generation restamp after the second
      producer supplies the required evidence.
- [ ] One core durable file/executable representation and one canonical system
      target vocabulary exist; provider schemas derive from them.
- [ ] A forged, copied, stale, size-changed, or same-length-content-changed
      JavaScript bundle cannot reach Node execution; a borrowed bundle is not
      deleted by core.
- [ ] Descriptor failures use explicit stable `Result` mappings rather than
      `SchemaError` text, and unsafe bigint file sizes cannot enter
      `ByteCount` or collapse into drift/platform failures.
- [ ] `PublicationFailed.operation` remains publicly `string`; only the
      package-private constructor/writers are exhaustive over the four current
      lifecycle operations.
- [ ] No executable destination can be claimed under a live producer cleanup
      root, and no new owned root can capture an active destination; alternate
      bundle handles cannot bypass that invariant.
- [ ] One private `SynchronizedRef<ClaimState>` is the sole claim/serialization
      authority; no peer claim-registry Semaphore or mutable root/destination
      collection can diverge from it. The existing distinct atomic-rename
      serialization remains lifecycle-owned.
- [ ] New core errors use package-qualified Schema identifiers, finite reason
      schemas, and identity-safe guards; a same-tag caller error passes through.
- [ ] With no owned cleanup root active, Bun/Deno/current-facade destination
      setup preserves the existing recursive `make-directory` behavior and
      exact failure operation; physical prospective-parent inspection is
      confined to the newly introduced cross-lifetime guard.
- [ ] Esbuild owns bundle production/context teardown, core owns temporary-root
      allocation, claim, and deletion plus handle liveness, and Node SEA owns
      semantic consumption checks; the root claim outlives every cleanup that
      can delete that root.
- [ ] Every current executable topology calls one core
      `produceExecutable`/validate/hash/rename path.
- [ ] No candidate, commit, raw native executable inspector, process handle,
      generic executor, registry, receipt, manifest, or aggregate build target
      is exported.
- [ ] Only the in-scope files are modified; `bun.lock` is unchanged;
      `git diff --check` is clean.
- [ ] This plan and `plans/README.md` contain the exact implementation receipt.

## STOP conditions

Stop and report without improvising if:

- the executor is not in a clean worktree descended from `60259f9` or any
  in-scope excerpt has materially drifted;
- package-manager Bun is not the repository-pinned `1.3.14`; stop before any
  Bun install/build command and obtain that exact tool externally;
- preserving Bun/Deno/current Node SEA runtime behavior requires a second
  Artifact/Target/candidate/publication representation;
- a nominal bundle can be reconstructed by Schema decode or ordinary object
  spread and still pass the live check;
- an executable destination can be claimed under a live producer cleanup root,
  or a new owned root can capture an already-active publication destination;
- a generated root rejected before claim installation is recursively deleted,
  or allocation/validation/claim installation is not one atomic
  `SynchronizedRef.modifyEffect` transition;
- `withFile` must delete a caller-owned file or a returned raw Effect value is
  treated as statically non-escaping;
- a provider can rename/publish before its stage result is decoded and native
  output is validated;
- the refactor requires adding a dependency, changing target support, or
  changing scalar/matrix failure semantics;
- a verification command fails twice after a bounded fix attempt;
- any out-of-scope source/config file must change.

## Maintenance notes

- Plan 023 deliberately leaves the existing combined Node SEA facade and
  closed compatibility projections in place for one no-publish step. Plan 024
  must delete them; do not release or present this intermediate state as the
  final architecture.
- Expand `ResolutionTarget` only when a real integration consumes a new value.
  Do not revive `SyntaxMode` merely to label Esbuild's targeted emission and
  Bun's producer-default emission; add a neutral syntax field only when a
  consumer makes a different validated decision from it.
- Reviewers should focus on one-shot publication ownership and the distinction
  between physical file ownership and live-handle registration.
- Stage observations describe work seen by the integration. They are not a
  substitute for a future closed-input manifest or receipt.

## Compression ledger

| Added | Removed/merged in this plan | Deferred deletion |
|---|---|---|
| core File/Executable/stage/tool schemas | duplicated durable fields and ad hoc stage base shapes | closed provider-specific root union |
| core scoped bundle capability + owned-root allocation/release order | Esbuild-owned liveness authority, arbitrary recursive-delete input, and claim-before-cleanup teardown gap | private Esbuild implementation location |
| integration publication/process functions | repeated caller choreography around candidate/runner | composed Node SEA Provider branch |
| one private SynchronizedRef claim state + named Effect boundaries | separate lock/mutable claim authorities and anonymous reusable effects | none |
| narrow resolution name | ambiguous use of root target for module-resolution semantics | current compatibility projections |

No new orchestration concept is accepted unless it removes one of the owners
listed in the middle column.

## Implementation handoff receipt

The executor fills this section only after every non-receipt done criterion
passes and the source/config/test changes are committed as one reviewable
implementation commit. Record that exact `HEAD`, then leave only this receipt
and the matching `plans/README.md` status edit as uncommitted plan-only handoff
changes for Plan 024. Do not make a later plan-only commit: Plan 024 requires
its `PLAN023_SHA` to equal handoff `HEAD`. Never claim a receipt edit as part of
the implementation commit.

- **Implementation status**: `PENDING`
- **Implementation source SHA**: `PENDING`
- **Verification summary**: `PENDING`
- **Pinned real-tool evidence (local versions or exact-SHA CI run/job)**: `PENDING`
- **Exact-SHA Node SEA CI evidence (run URL and `node-sea` job)**: `PENDING`
- **Allowed plan-only handoff changes**:
  `plans/023-establish-core-artifact-lifecycle.md`, `plans/README.md`

After replacing every `PENDING`, verify the handoff mechanically:

```sh
IMPLEMENTATION_SHA="$(sed -n 's/^- \*\*Implementation source SHA\*\*: `\([0-9a-f]\{40\}\)`$/\1/p' plans/023-establish-core-artifact-lifecycle.md)"
test "$IMPLEMENTATION_SHA" = "$(git rev-parse HEAD)"
test "$(git status --short)" = " M plans/023-establish-core-artifact-lifecycle.md
 M plans/README.md"
git diff --check
```

Expected: the receipt names exact handoff `HEAD`; no source/config/test or
untracked file remains; only the two named plan files are dirty.
