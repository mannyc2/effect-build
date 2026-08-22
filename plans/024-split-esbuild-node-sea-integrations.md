# Plan 024: Split Esbuild and Node SEA into independent granular integrations

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Stop
> on any condition in **STOP conditions**; do not improvise a compatibility
> facade, sibling dependency, duplicated implementation, or generic bundler.
> This is the feature-growth/public-API plan. Plan 023 must be `DONE`, and no
> package may be published between these plans. Update the status row in
> `plans/README.md` when complete unless a reviewer owns the index.
>
> **Drift check (run first)**:
>
> ```sh
> test "$(bun --version)" = "1.3.14"
> rg -Fx -- '- Architecture generation: `granular-integration-migration-v2`.' AGENTS.md
> PLAN023_SHA="$(sed -n 's/^- \*\*Implementation source SHA\*\*: `\([0-9a-f]\{40\}\)`$/\1/p' plans/023-establish-core-artifact-lifecycle.md)"
> test "${#PLAN023_SHA}" -eq 40
> test "$(git rev-parse HEAD)" = "$PLAN023_SHA"
> git diff --exit-code HEAD -- . \
>   ':(exclude)plans/023-establish-core-artifact-lifecycle.md' \
>   ':(exclude)plans/README.md'
> test -z "$(git ls-files --others --exclude-standard)"
> git diff --stat 60259f98a460b3d9b25b95221ca71b56c17d9d78..HEAD -- \
>   package.json bun.lock tsconfig.packages.json tsconfig.examples.json \
>   packages examples test typetest scripts tooling docs AGENTS.md \
>   .github/workflows
> ```
>
> The expected source diff at entry is exactly completed Plan 023. Read Plan
> 023's `Implementation source SHA`, require it to equal `HEAD`, and allow only
> its two named plan-only handoff changes to remain dirty. Every source,
> config, test, workflow, and untracked non-plan path must be clean. Any other
> change is a STOP. The implementation baseline must descend from current main
> `60259f9`.

When committing Plan 024's implementation, include Plan 023's already-recorded
plan-only handoff edits: they name the parent implementation SHA and are not
self-referential. Do not include Plan 024's own receipt; record that afterward
as the plan-only handoff to Plan 025.

## Status

- **Priority**: P1
- **Effort**: XL
- **Risk**: HIGH
- **Depends on**: Plan 023
- **Category**: feature / migration / architecture
- **Planned at**: commit `60259f9`, 2026-08-14
- **Initial state**: TODO

## Why this matters

The current Node SEA package owns two independent technologies behind one
source-to-executable facade. That makes standalone Esbuild bundling impossible,
forces Node SEA to choose a bundler, flattens useful errors, and puts exact
esbuild/Node versions back into core provider contracts. The implemented code
has now proved a narrower and more useful boundary: one scoped Node-compatible
bundle producer and one bundle-consuming executable assembler.

This plan performs one atomic, unpublished cut to the five-package star graph.
Esbuild and Node SEA are split by external integration, not by an invented
generic pipeline stage. Application Effect code owns their composition. Plan
025 then exercises the same core bundle capability with Bun before the surface
is certified; this Plan 024 state is not a release point.

## Current state after Plan 023

Before editing, confirm Plan 023 produced the exact core contract documented in
`plans/023-establish-core-artifact-lifecycle.md`: durable Artifact bases,
System/Resolution targets, a scoped nominal JavaScript bundle, and one
integration-author executable publication operation. If not, stop.

At the planning baseline, the coupling to remove is explicit.

`packages/effect-build-node-sea/package.json:25-30`:

```json
"dependencies": {
  "effect-build": "workspace:^",
  "esbuild": "0.28.2"
}
```

`packages/effect-build-node-sea/src/Adapter.ts:117-146` constructs both the
Esbuild and Node services, bundles an entrypoint, and passes the temporary main
to the Node candidate producer. `src/index.ts:7-32` then presents the whole
thing as `Compiler`, `Target`, `compileExecutable`,
`compileExecutableMatrix`, and `layer`.

`internal/Esbuild.ts:27-45,98-105` already contains the independently useful
request/continuation shape:

```ts
interface JavaScriptBundleInput {
  readonly entrypoint: string
  readonly format: "esm" | "cjs"
  readonly cwd?: string
}

interface EsbuildService {
  readonly withJavaScriptBundle: <A, E, R>(
    input: JavaScriptBundleInput,
    use: (bundle: JavaScriptBundleArtifact) => Effect.Effect<A, E, R>
  ) => Effect.Effect<A, EsbuildBundleError | E, Exclude<R, Scope.Scope>>
}
```

`internal/NodeSea.ts:41-47,126-135` already contains the independent consumer,
but it is candidate-level and imports the Esbuild-owned type/liveness check:

```ts
interface NodeSeaCandidateInput {
  readonly main: JavaScriptBundleArtifact
  readonly stagedOutfile: string
  readonly resolvedDestination: string
  readonly cwd?: string
  readonly assets?: readonly NodeSeaAssetInput[]
}
```

Plan 023 must already have replaced that cross-internal type ownership with the
core capability. Plan 024 promotes the two real operations and deletes the
opaque wrapper.

## Final package graph and API

The graph is exact and machine-checked:

```text
effect-build-bun --------> effect-build
effect-build-deno -------> effect-build
effect-build-esbuild ----> effect-build
effect-build-esbuild ----> esbuild@0.28.2
effect-build-node-sea ---> effect-build
```

No integration package may import or declare another integration package.
Root development dependencies may contain all workspace packages for tests and
examples; that is not a package-edge exception.

Freeze the final neutral core namespace allowlists as part of this hard cut:

- `Artifact` runtime/declaration keys are exactly `AbsolutePath`, `ByteCount`,
  `Digest`, `ExecutableArtifact`, `FileArtifact`, `StageObservation`, and
  `ToolObservation`;
- `Target` runtime/declaration keys are exactly `ResolutionTarget` and
  `SystemTarget`;
- `MatrixError` runtime/declaration keys are exactly `CellFailure`,
  `InvalidMatrixInput`, `MatrixError`, `MatrixFailed`, and `MatrixIssue`;
- `BuildError` retains exactly its current names—`BuildError`, `Diagnostic`,
  `DiagnosticChannel`, `InvalidDriverOptions`, `OutputInvalid`, `OutputLocked`,
  `OutputMissing`, `PublicationFailed`, `TargetUnsupported`, `ToolFailed`,
  `ToolNotFound`, and `ToolProbeFailed`—while each applicable `tool` field uses
  core `NonEmptyString` and integration schemas refine their literal.

Delete the temporary Plan 023 `Artifact.Artifact`, `Artifact.ToolName`,
`ArtifactFor`, `StagesFor`, and `Target.Target` compatibility declarations.
Do not retain aliases under new names or re-export provider-specific roots.

### `effect-build-esbuild`

Create `packages/effect-build-esbuild` at lockstep version `0.3.0` with only:

- runtime dependencies `effect-build: workspace:^` and exact
  `esbuild: 0.28.2`;
- Effect peer `>=4.0.0-beta.104 <4.1.0-0` and exact rc.108 development pin;
- one `.` export from built `dist`;
- one public entry point. Its primary operation keys are `Esbuild`,
  `withJavaScriptBundle`, and `layer`; it also exports the exact runtime
  diagnostic/error schemas/classes listed below. Freeze the complete sorted key
  set in `tooling/public-api.json` and architecture tests.

Public type-only declarations are exactly `JavaScriptBundleInput`, `Service`,
`EsbuildLayerError`, and `EsbuildBundleError`; schema values/classes also
supply their same-named `.Type` declarations. `Service.withJavaScriptBundle`
preserves the exact one-element Esbuild stage tuple in the core generic handle
and returns `Effect<A, EsbuildBundleError | E, Exclude<R, Scope.Scope>>`.
The exact tagged error classes already implemented are:

- `EsbuildVersionMismatch { expected: "0.28.2", observed }` (Layer error);
- `InvalidBundleInput { reason }`;
- `EsbuildFailed { diagnostics, truncated }`;
- `JavaScriptBundleInvalid { reason }`;
- `BundleMaterializationFailed { path, operation, reason }`, where
  `BundleMaterializationOperation` is exactly
  `make-temp | write | realpath | stat | read | digest` after adopting core content
  identity.

Give every new public tagged error a package-qualified Schema identifier while
retaining its short `_tag`. Use a private `Schema.Literals` for the finite
`InvalidBundleInput.reason` inventory. Define the
`JavaScriptBundleInvalid.reason` Schema as a union of core
`JavaScriptBundle.InvalidReason` plus one private Esbuild-specific
`Schema.Literals`; never copy the core members into this package. Do not leave
machine-consumed codes as unconstrained strings. The exact
`InvalidBundleInput` codes are `expected-object`, `unknown-field`,
`missing-field`, `invalid-entrypoint`, `invalid-format`, `invalid-cwd`,
`unsupported-entrypoint-extension`, and `entrypoint-not-regular`. The exact
`JavaScriptBundleInvalid` codes are `expected-one-output-file`,
`output-file-path-mismatch`, `missing-metafile`,
`expected-one-metafile-output`, `metafile-output-mismatch`,
`entrypoint-mismatch`, `css-output-not-supported`,
`invalid-input-metafile-record`, `invalid-input-import`,
`runtime-import-not-supported`, `require-resolve-not-supported`,
`unknown-input-import-kind`, `invalid-output-imports`,
`invalid-output-import`, and `unsupported-output-import`. Core
`invalid-byte-count` and every other core artifact code enter through the
single imported `JavaScriptBundle.InvalidReason` authority. Infrastructure
`reason` fields remain `Schema.String` because they preserve external messages.
Entrypoint `NotFound` or a non-file observation maps to
`entrypoint-not-regular`; any other entrypoint stat failure is
`BundleMaterializationFailed { path: resolvedEntrypoint, operation: "stat",
reason }`, never an arbitrary platform message inside `InvalidBundleInput`.
Implement `InvalidBundleInput` classification as a total field-by-field
`Result` decoder: explicit record/key/presence checks own the three shape
codes, and each field's `Schema.decodeUnknownResult` failure maps directly to
its named field code. Never derive a reason by formatting or parsing
`SchemaError`; assert every reason at beta.104 and rc.108.

The complete runtime export set is exactly
`BundleMaterializationFailed`, `BundleMaterializationOperation`, `Esbuild`,
`EsbuildDiagnostic`, `EsbuildFailed`, `EsbuildVersionMismatch`,
`InvalidBundleInput`, `JavaScriptBundleInvalid`, `layer`, and
`withJavaScriptBundle`. Type aliases/interfaces add no runtime keys.

The public Context service identifier is exactly
`effect-build-esbuild/Esbuild`; delete the current private
`effect-build/internal/Esbuild` identifier during the move. `layer` provides
that service directly, has no caller options in this first slice, and requires
core `FileSystem | Path | Crypto` services while failing only with
`EsbuildLayerError`. The top-level continuation requires `Esbuild` plus
`Exclude<R, Scope.Scope>`; it does not silently capture platform services.
Use the supported-range `Context.Service<Self, Shape>()(key)` API exactly.
`ServiceMap.Service` is not exported by either Effect beta.104 or rc.108.
Keep the package-qualified service key above unique and verify at the type
boundary that the service method leaks none of `FileSystem`, `Path`, `Crypto`,
or `ChildProcessSpawner`; its only non-service environment is the callback's
`Exclude<R, Scope.Scope>`.

`withJavaScriptBundle` returns its result only through the callback and uses
the core `JavaScriptBundle.Artifact` type. Do not expose `bundleScoped`, a raw
returned Artifact, `EsbuildApi`, `BundleContext`, service constructors, raw
BuildOptions, metafile, plugins, watch/rebuild, or global `esbuild.stop()`.

Move the existing implementation with history; do not copy it. Preserve its
exact first-slice semantics:

- one regular `.js/.jsx/.mjs/.cjs/.ts/.tsx/.mts/.cts` entry;
- one JS output; ESM or CJS; `bundle: true`; `splitting: false`;
- `platform: "node"`, `packages: "bundle"`, explicit `node26.7` syntax;
- `write: false`, metafile on, plugins empty, warnings rejected;
- structured esbuild-observed runtime/require/dynamic edges rejected;
- observed external imports sorted, with no claim that eval/Function or every
  arbitrary JavaScript construction is closed;
- core-owned temporary-root claim/deletion plus Esbuild context cancel/dispose,
  liveness registration, and callback Scope cleanup on
  success/failure/defect/interruption; the claim releases only after context
  teardown and physical deletion;
- no claim that the JavaScript API is purely in-process: esbuild manages a
  package-global unref'd native service process.

Esbuild's `target: "node26.7"` remains a fixed integration option and tested
producer invariant, not a neutral bundle field. Do not retain the former
singular `syntaxTarget` field or manufacture a core syntax/provenance tag.

### `effect-build-node-sea`

Replace the current provider facade with one public entry point. Its primary
operation keys are `NodeSea`, `createExecutable`, and `layer`; it also exports
the runtime tagged error/operation schemas listed below. Freeze the complete
sorted key set in `tooling/public-api.json` and architecture tests.

Public input:

```ts
interface CreateExecutableInput<MainStages extends readonly StageObservation[] = readonly StageObservation[]> {
  readonly main: JavaScriptBundle.Artifact<MainStages>
  readonly outfile: string
  readonly cwd?: string
  readonly digest?: boolean
  readonly assets?: readonly {
    readonly key: string
    readonly path: string
  }[]
}
```

The operation has no `entrypoint`, `format`, bundler options, `target`, matrix,
snapshot/code-cache switch, signing flag, download, or raw argv. `main.format`
maps exactly to SEA `mainFormat`; snapshot and code cache remain false. The
selected Node is exact 26.7.0 and exact inspected `linux-x64-gnu`; the produced
native target must equal it.

Freeze these type-only exports: `Artifact`, `CreateExecutableInput`, `Service`,
`LayerOptions`, `NodeSeaStage`, `NodeSeaLayerError`, and
`NodeSeaCreateError`. `NodeSeaStage` is exactly the Node 26.7.0 assembly stage;
the artifact keeps the literal current-host target and the main's exact stage
tuple:

```ts
interface NodeSeaStage {
  readonly operation: "assemble-node-sea"
  readonly tool: {
    readonly name: "node"
    readonly version: "26.7.0"
    readonly path: FileArtifact["path"]
  }
}

type Artifact<MainStages extends readonly StageObservation[] = readonly StageObservation[]> =
  Readonly<Omit<ExecutableArtifact, "target" | "stages"> & {
    readonly provider: "node-sea"
    readonly target: "linux-x64-gnu"
    readonly stages: readonly [...MainStages, NodeSeaStage]
  }>
```

The service API is generic so an empty borrowed main yields exactly one Node
stage and an Esbuild main yields the ordered Esbuild-then-Node tuple:

```ts
interface Service {
  readonly createExecutable: <const MainStages extends readonly StageObservation[]>(
    input: CreateExecutableInput<MainStages>
  ) => Effect.Effect<Artifact<MainStages>, NodeSeaCreateError>
}

class NodeSea extends Context.Service<NodeSea, Service>()(
  "effect-build-node-sea/NodeSea"
) {}

const createExecutable = <const MainStages extends readonly StageObservation[]>(
  input: CreateExecutableInput<MainStages>
) =>
  NodeSea.use((service) => service.createExecutable(input))
```

`layer({ executable? })` captures official Effect FileSystem/Path/Crypto /
ChildProcessSpawner services. Layer failures are exactly
`NodeSeaToolNotFound | NodeSeaProbeFailed`. Method failures are exactly:

```ts
type NodeSeaCreateError =
  | InvalidNodeSeaInput
  | NodeSeaPreparationFailed
  | NodeSeaSpawnFailed
  | NodeSeaSyntaxCheckFailed
  | NodeSeaFailed
  | BuildError.OutputMissing
  | BuildError.OutputInvalid
  | BuildError.OutputLocked
  | BuildError.PublicationFailed
```

Keep the current exact non-reason fields on each Node-owned error. Extend
`NodeSeaPreparationOperation` deliberately to exactly `realpath | stat |
read-main | digest-main | make-config | write-config | copy-main |
digest-main-copy | decode-stages`; the new values account for core handle
access, private-main stabilization, and the shared lifecycle's stage decode.
Do not flatten them to
`ToolFailed`; Esbuild errors compose outside and never appear in this union.

Do not carry the current unconstrained `InvalidNodeSeaInput.reason` string into
the public granular package. Define one private reason Schema as the union of:

- exact literals `expected-object`, `unknown-field`, `missing-field`,
  `invalid-outfile`, `invalid-cwd`, `invalid-digest`, `invalid-assets`,
  `invalid-asset`, `invalid-asset-key`, `asset-key-too-long`,
  `duplicate-asset-key`, `invalid-asset-path`, `main-artifact-not-live`,
  `main-artifact-not-regular`, `main-artifact-invalid-byte-count`,
  `main-artifact-changed`, `main-resolution-target-mismatch`,
  `cwd-not-directory`, `asset-not-regular`, and
  `destination-aliases-input`; and
- `Schema.TemplateLiteral(["external-import-not-builtin:",
  Schema.NonEmptyString])` for the selected-Node builtin failure.

Use that private Schema as the error field, so arbitrary strings cannot be
constructed or decoded while valid dynamic builtin specifiers remain typed.
Give every Node-owned error the package-qualified Schema identifier
`effect-build-node-sea/<ClassName>` while retaining its short `_tag`.
Delete the old `invalid-input`, `main-path-not-absolute`,
`cwd-not-absolute`, `asset-path-not-absolute`, `destination-not-absolute`,
`staged-outfile-not-absolute`, `candidate-must-not-be-destination`, and
`destination-inside-bundle-scope` reason branches: the total public decoder,
nominal core handle, resolved paths, hidden candidate, and core cleanup-root
claim make those states impossible or assign them to core `OutputInvalid`.
This list is the complete first-slice Node input vocabulary; adding a reason is
an API decision, not a fallback to `Schema.String`.
Use the same deterministic decoder discipline for `CreateExecutableInput`:
explicit record/key/presence checks own the shape codes, field decoders map to
their named codes with `Result`, and no branch parses `SchemaError` messages.

The complete runtime export set is exactly `InvalidNodeSeaInput`, `NodeSea`,
`NodeSeaFailed`, `NodeSeaPreparationFailed`, `NodeSeaPreparationOperation`,
`NodeSeaProbeFailed`, `NodeSeaSpawnFailed`, `NodeSeaSyntaxCheckFailed`,
`NodeSeaToolNotFound`, `createExecutable`, and `layer`. Type aliases/interfaces
add no runtime keys. `NodeSeaSyntaxCheckFailed` has the same bounded `exitCode`
and `diagnostics` fields as `NodeSeaFailed`, but a distinct tag because syntax
rejection happens before candidate acquisition while SEA assembly failure
happens after it.
The public Context key is exactly `effect-build-node-sea/NodeSea`.
`LayerOptions` contains only optional `executable`; `layer` returns
`Layer<NodeSea, NodeSeaLayerError, FileSystem | Path | Crypto |
ChildProcessSpawner>`, while the top-level `createExecutable` Effect requires
only `NodeSea`. Its service method itself requires `never`; the Layer captures
all platform services and the selected/probed Node exactly once per built
Layer. Use `Layer.effect`, not `Layer.scoped`: contexts, configuration files,
and child processes are operation resources, not service-lifetime resources.

Node SEA's `Integration.produceExecutable.prepare` callback, which core runs
before candidate acquisition/spawn, must:

- authenticate the live core handle and re-stat/rehash its path, bytes, and
  required digest, rejecting same-length rewrites;
- require `resolutionTarget === "node"`;
- validate every observed external against the exact selected Node builtin
  authority;
- copy the authenticated main through Effect `FileSystem.copyFile` into the
  operation-private SEA staging directory using the format-correct `.mjs` or
  `.cjs` suffix, hash that private copy, and require exact equality with the
  authenticated handle digest. Use only the private copy for every subsequent
  Node read. A copy or post-copy digest platform failure is
  `NodeSeaPreparationFailed`; a digest mismatch is
  `InvalidNodeSeaInput("main-artifact-changed")`;
- run exact selected Node 26.7.0 as `node --check <private-main-copy>` after
  live-handle, format-suffix, digest, resolution, external validation, and
  copy authentication but before any executable candidate is acquired. Run
  this for every accepted producer so Esbuild and Bun are checked by the same
  consumer-owned acceptance criterion. A
  nonzero check is `NodeSeaSyntaxCheckFailed`; a platform start/wait/drain
  failure remains `NodeSeaSpawnFailed`; interruption remains interruption;
- normalize `cwd`, assets, and final destination;
- reject the destination if it aliases selected Node, main, or any asset;
- rely on core `Integration.produceExecutable` to claim the resolved
  destination before this callback and perform canonical containment whenever
  an active producer cleanup root exists; do not duplicate or weaken that lifetime guard
  in Node-specific preflight;
- validate asset count/keys/regular paths and all known incompatible
  combinations before Node runs.

The preparation result is a continuation-local validated Node request; the
`produce` callback writes only its staged path and returns `main.stages`
followed by the exact Node stage. Core validates stages/native output/digest
and atomically publishes. The result refines core `ExecutableArtifact` with
`provider: "node-sea"`. No parallel exported `PreparedNodeSeaInput` exists.

Make the generic/runtime correlation explicit. `prepare` retains a frozen
canonical copy of the authenticated `main.stages` and the exact selected-Node
stage in its private prepared value. The Node integration supplies
`Integration.produceExecutable.decodeStages(prepared, value)`. That callback
first decodes `value` as an excess-property-rejecting array of core
`StageObservation`, then requires exactly `prepared.mainStages.length + 1`
entries, exact field equality with every prepared prefix stage in order, and
exact equality of the suffix with `prepared.nodeStage`. It returns the frozen
canonical tuple `[...prepared.mainStages, prepared.nodeStage]`, not the
untrusted decoded array. Missing, extra, reordered, or changed stages map to
`NodeSeaPreparationFailed { path: main.path, operation: "decode-stages",
reason }` and cannot publish. This runtime closure is what preserves arbitrary
`MainStages`; do not attempt to reify the caller's generic as a fixed Schema,
use a broad non-empty-stage cast, or special-case an Esbuild prefix.
Implement the synchronous decode with `Schema.decodeUnknownResult(..., {
onExcessProperty: "error" })` followed by `Result.mapError`/`Result.flatMap`.
Do not use `decodeUnknownSync`, exception wrapping, or a cast where the
callback's contract already returns `Result`.

Map core bundle errors exhaustively and by core error identity, not merely by
their `_tag`: forged/stale becomes
`InvalidNodeSeaInput("main-artifact-not-live")`; missing/non-regular becomes
`InvalidNodeSeaInput("main-artifact-not-regular")`; an unsafe bigint size
becomes `InvalidNodeSeaInput("main-artifact-invalid-byte-count")`; byte-count
or digest drift becomes `InvalidNodeSeaInput("main-artifact-changed")`; platform
`realpath | stat | read | digest` failures become
`NodeSeaPreparationFailed` operations
`realpath | stat | read-main | digest-main` with
the same path/reason. A private-main `copyFile` failure maps to `copy-main`,
and hashing that copy maps to `digest-main-copy`; both retain the attempted
private path and platform reason. Map an impossible returned-stage decode to
`NodeSeaPreparationFailed { path: main.path, operation: "decode-stages",
reason }`. Esbuild maps core invalidity to `JavaScriptBundleInvalid` and core
access failures to `BundleMaterializationFailed` with the corresponding
`realpath | stat | read | digest` operation. It maps
`JavaScriptBundleTemporaryDirectoryFailed { prefix, reason }` to the existing
`BundleMaterializationFailed { path: resolvedCwd, operation: "make-temp",
reason }`; the prefix is fixed integration policy, not another public Esbuild
field. Core `invalid-byte-count` maps to the exact Esbuild
`JavaScriptBundleInvalid("invalid-byte-count")` reason. The resolution
preflight failure is exactly
`InvalidNodeSeaInput("main-resolution-target-mismatch")`.
Selected-Node syntax incompatibility is the separate
`NodeSeaSyntaxCheckFailed`, not a fabricated input reason. Neither package
exposes a core error in an undeclared public union.

Allocate the existing scoped SEA config directory during `prepare`, before
candidate acquisition. Place `sea-main.mjs` or `sea-main.cjs` beside the
eventual config, call the installed Effect `FileSystem.copyFile(from, to)`,
then hash that copied file and compare it with the authenticated Artifact
digest. Retain only the private main/config paths in the prepared value; write
the SEA config during `produce` after the staged executable path exists, and
set its `main` to the private copy. Both `--check` and `--build-sea` must read
that copy. The scoped directory is removed on typed failure, defect,
interruption, and success. This closes the ordinary authenticate-to-embed
window without claiming sandbox protection against an actor that can mutate
the operation's private temporary directory.

This API is source-verified at both supported endpoints:
`effect/src/FileSystem.ts:111-114` in beta.104 and rc.108 exposes
`copyFile(fromPath, toPath): Effect<void, PlatformError>`. Use that abstract
service; do not import `node:fs`, buffer the entire main through ad hoc
`readFile`/`writeFile`, or add another copy abstraction.

The syntax check is grounded in exact Node source, not in an inferred SEA
side-effect: Node v26.7.0 commit
`b4f23d3619c98bed09af93a21192f6080197a8c6` documents `--check` as “syntax
check the script without executing” in `doc/api/cli.md:567-579`, while
`doc/api/single-executable-applications.md:102-137,387-408` identifies the
input as one bundled CommonJS/ESM script and keeps `mainFormat` separate. The
core `.mjs`/`.cjs` invariant supplies the format to `--check`; do not add stdin
to the shared command function. The private copied main is an operation-owned
staging input, not a second Artifact or caller-visible peer file.
For Esbuild especially, do not put `Effect.catchTags` around the complete
higher-order result: caller-controlled `E` can legally contain the same `_tag`
as a core error. Use the core classes' static family-marker guards with
`Effect.catchIf`, or isolate/map the core acquisition error before the caller
effect. A structurally identical caller error without the marker must pass
through unchanged.

Use stable named `Effect.fn` boundaries for `Esbuild.withJavaScriptBundle`,
`NodeSea.createExecutable`, and the core Integration operations they invoke.
The command-provider factory likewise names its generated methods
`effect-build/<provider>.compileExecutable` and
`effect-build/<provider>.compileExecutableMatrix`; Bun and Deno therefore gain
uniform traced public-operation boundaries without a new observer API.
The top-level `Context.Service.use` accessors stay one-line delegators and are
not double-wrapped. Use `Effect.gen` inside the genuinely sequential bodies;
do not wrap pure decoders ceremonially. Span names and attributes must not
contain argv, raw diagnostics, entrypoint/output/asset paths, or other
potentially sensitive caller data.

### Existing compile facades

- `effect-build-bun` and `effect-build-deno` retain `Compiler`, `Target`,
  `compileExecutable`, `compileExecutableMatrix`, and `layer`, with unchanged
  runtime inputs/results/errors.
- Delete Node SEA's `Compiler`, `Target`, `compileExecutable`,
  `compileExecutableMatrix`, `Adapter.ts`, composed Provider definition, and
  one-cell matrix. A source-to-SEA convenience would have to choose a sibling
  bundler. The application owns the ten-line composition instead.
- `Provider.define` becomes command-only and data-driven. Its two current
  consumers supply provider ID, exact target schema/table, and exact stage
  schema. Delete the core closed Node SEA target/stage/catalog case and all
  `Name extends "node-sea"` branches/casts. Do not add esbuild as a provider.

Freeze the command-author SPI before Step 1's red type tests. In conceptual
TypeScript (the executor may adjust only mechanical Effect `Schema` generic
parameters required by beta.104/rc.108):

```ts
type NonEmptyProviderName<Name extends string> = Name extends "" ? never : Name
type ProviderStage<Name extends string> = StageObservation & {
  readonly tool: ToolObservation & { readonly name: Name }
}
type ProviderStages<Name extends string> = readonly [ProviderStage<Name>]

interface CompilerService<
  Name extends string,
  Options,
  Target extends SystemTarget,
  Stages extends ProviderStages<Name>
> {
  readonly compileExecutable: (input: CompileExecutableInput<Options, Target>) =>
    Effect.Effect<ProviderArtifact<Name, Target, Stages>, BuildError>
  readonly compileExecutableMatrix: (input: CompileExecutableMatrixInput<Target, Options>) =>
    Effect.Effect<
      readonly ProviderArtifact<Name, Target, Stages>[],
      ProviderMatrixError<Name, Target, Stages>
    >
}

interface CommandDefinition<
  Self,
  Name extends string,
  TargetEntries extends readonly [
    readonly [SystemTarget, string],
    ...Array<readonly [SystemTarget, string]>
  ],
  Stages extends ProviderStages<Name>,
  Options,
  Validated
> {
  readonly name: NonEmptyProviderName<Name>
  readonly service: Context.Service<
    Self,
    CompilerService<Name, Options, TargetEntries[number][0], Stages>
  >
  readonly targetEntries: TargetEntries
  readonly Stages: Schema.ConstraintDecoder<Stages, never>
  readonly defaultTarget?: TargetEntries[number][0]
  readonly validateOptions: (input: unknown) => Result.Result<Validated, string>
  readonly probeArgv: readonly string[]
  readonly renderArgv: (context: {
    readonly input: PreparedCommandInput<Validated, TargetEntries[number][0]>
    readonly nativeTarget?: string
    readonly stagedOutfile: string
  }) => readonly string[]
  readonly interpretFailure: (completion: CommandCompletion) => readonly Diagnostic[]
}

type ProviderArtifact<Name extends string, Target extends SystemTarget, Stages extends ProviderStages<Name>> =
  Readonly<ExecutableArtifact & { readonly provider: Name; readonly target: Target; readonly stages: Stages }>

type NarrowToolError<Error, Name extends string> =
  Error extends { readonly tool: string }
    ? Error & { readonly tool: Name }
    : Error

type BuildErrorFor<Name extends string> = NarrowToolError<BuildError, Name>

type ProviderMatrixError<Name extends string, Target extends SystemTarget, Stages extends ProviderStages<Name>> =
  | InvalidMatrixInput
  | (MatrixFailed & {
      readonly artifacts: readonly ProviderArtifact<Name, Target, Stages>[]
      readonly failures: readonly [{
        readonly provider: Name
        readonly target: Target
        readonly path: string
        readonly error: BuildErrorFor<Name>
      }, ...Array<{
        readonly provider: Name
        readonly target: Target
        readonly path: string
        readonly error: BuildErrorFor<Name>
      }>]
    })

type TargetsOf<Entries extends readonly [readonly [SystemTarget, string], ...Array<readonly [SystemTarget, string]>]> = {
  readonly [Index in keyof Entries]: Entries[Index] extends readonly [infer Target extends SystemTarget, string]
    ? Target
    : never
}

interface Defined<Self, Name extends string, TargetEntries extends readonly [readonly [SystemTarget, string], ...Array<readonly [SystemTarget, string]>], Stages extends ProviderStages<Name>, Options> {
  readonly Target: Schema.Literals<TargetsOf<TargetEntries>>
  readonly Artifact: Schema.Schema<ProviderArtifact<Name, TargetEntries[number][0], Stages>>
  readonly MatrixError: Schema.Schema<ProviderMatrixError<Name, TargetEntries[number][0], Stages>>
  readonly compileExecutable: (input: CompileExecutableInput<Options, TargetEntries[number][0]>) =>
    Effect.Effect<ProviderArtifact<Name, TargetEntries[number][0], Stages>, BuildError, Self>
  readonly compileExecutableMatrix: (input: CompileExecutableMatrixInput<TargetEntries[number][0], Options>) =>
    Effect.Effect<
      readonly ProviderArtifact<Name, TargetEntries[number][0], Stages>[],
      ProviderMatrixError<Name, TargetEntries[number][0], Stages>,
      Self
    >
  readonly layer: (options?: LayerOptions) =>
    Layer.Layer<Self, ToolNotFound | ToolProbeFailed, ProviderLayerRequirements>
}

declare function define<
  Self,
  const Name extends string,
  const TargetEntries extends readonly [
    readonly [SystemTarget, string],
    ...Array<readonly [SystemTarget, string]>
  ],
  Stages extends ProviderStages<Name>,
  Options,
  Validated
>(definition: CommandDefinition<Self, Name, TargetEntries, Stages, Options, Validated>):
  Defined<Self, Name, TargetEntries, Stages, Options>
```

`define` first validates `name` with core `Schema.NonEmptyString` and throws the
exact author-configuration defect `provider name must be non-empty` before
constructing a service; the conditional type rejects a literal empty name.
This error cannot surface later as a build failure. It then derives `Target`
and native-token lookup from the one canonical,
ordered, non-empty `targetEntries` tuple; it rejects duplicate/unknown targets,
empty native tokens, and a cast/JavaScript `defaultTarget` absent from that
table. Freeze the remaining author-defect messages as `provider targetEntries
must be non-empty`, `provider target must be a known SystemTarget`, `provider
targetEntries must not contain duplicate targets`, `provider native target
token must be non-empty`, and `provider default target must appear in
targetEntries`. It constructs the provider-
literal Artifact and homogeneous MatrixError schemas from the supplied exact
`Stages`, maps invalid stage decoding through the existing provider-attributed
`ToolFailed`, and requires exactly one decoded command stage whose
`stage.tool.name === name` before publication even if an integration author
defeated the static constraint. A multi-stage schema is rejected statically;
a cast/JavaScript schema returning zero or multiple stages fails the exact
tuple decoder. The command factory has no multi-stage producer, so accepting a
larger tuple would create a permanently failing definition rather than useful
generality. It
uses `Result.match` to translate `Result.fail(reason)` into the existing
provider-attributed `InvalidDriverOptions`, and preserves the existing
homogeneous-provider/unique-target/path
matrix checks and ordered partial results, and delegates publication to
`Integration.produceExecutable`.
Bun/Deno indices derive their type-only `Artifact` and `MatrixError` from the
returned schemas but continue exporting exactly the same five runtime keys.
Define each Adapter's `targetEntries` and `Stages` first; use their inferred
element/`.Type` types to parameterize the existing public `Compiler` service,
then pass that service into `define`. This avoids a circular type assertion and
requires no cast.

Delete rather than deprecate `ProviderName`, `ProviderTargets`, `TargetFor`,
`CommandProviderName`, `ComposedDefinition`, `ComposedProducer`,
`ComposedCandidateInput`, `ComposedProviderRequirements`, closed
`ArtifactFor`/`StagesFor`, and every
unsafe cast used only by the Node composed branch. Do not retain compatibility
aliases beside the inferred definition types. `Provider` still exports only
the runtime key `define`. Freeze its exact sorted type-only declaration set as
`BuildError`, `CommandDefinition`, `CompileExecutableInput`,
`CompileExecutableMatrixInput`, `CompilerService`, `Defined`, `LayerOptions`,
`PreparedCommandInput`, `ProviderArtifact`, `ProviderLayerRequirements`,
`ProviderMatrixError`, `ProviderStage`, `ProviderStages`, `ToolNotFound`,
and `ToolProbeFailed`. `NonEmptyProviderName`, `NarrowToolError`,
`BuildErrorFor`, and `TargetsOf` are declaration-private helpers, not public
exports. Delete
Provider-owned `ExecuteCommand`, `CommandOutput`, `CommandCompletion`, and
`Diagnostic` aliases; integration authors import the one command contract from
`effect-build/Integration` and the one diagnostic type from core BuildError.

### Application composition

The public example and type tests must compile this exact shape:

```ts
const nodeSeaLayer = NodeSea.layer({
  executable: "/opt/node-26.7.0/bin/node"
})

const buildToolsLayer = Layer.mergeAll(
  Esbuild.layer,
  nodeSeaLayer
).pipe(
  Layer.provide(NodeServices.layer)
)

const build = Esbuild.withJavaScriptBundle(
  {
    entrypoint: "src/main.ts",
    format: "esm"
  },
  (main) => NodeSea.createExecutable({
    main,
    outfile: "dist/app"
  })
).pipe(
  Effect.provide(buildToolsLayer)
)
```

`Layer.provide` deliberately hides platform implementation services after
constructing both integrations. If the surrounding application also consumes
those services, use `Layer.provideMerge(NodeServices.layer)` instead. Reuse a
parameterized Layer value when the same selected tool participates in multiple
programs; do not turn runtime executable selection into a module-global
constant merely for memoization.

The Node SEA package and its tests must also consume a bundle borrowed through
core `JavaScriptBundle.withFile` with no Esbuild package installed. This proves
the boundary is not merely a type moved between siblings.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| update workspace lock | edit manifests, then `bun install` | exit 0; one reviewed `bun.lock` update |
| frozen install | `bun install --frozen-lockfile` | exit 0 after lock update |
| build/check | `bun run build && bun run check` | five packages and all examples compile |
| Esbuild unit | `bun x vitest run test/unit/esbuild-bundle.test.ts` | all exact producer/cleanup cases pass |
| Node SEA unit | `bun x vitest run test/unit/node-sea.test.ts test/unit/esbuild-node-sea-pipeline.test.ts` | granular and public composition cases pass |
| architecture | `bun run build && bun run test:architecture` | exact graph/API/import rules pass |
| type contract | `bun run test:types` | all TSTyche assertions pass |
| packed consumers | `node scripts/test-built-consumer.mjs --built` | five isolated npm/Bun pairs plus composed pairs pass |
| complete local | `bun run verify` | exit 0 |
| Effect endpoints | `bun run verify:effect` | beta.104 and rc.108 pass the Result SPI, Context services, static error guards, deterministic reason mapping, finite Node reason Schema, checked bigint size conversion, and named Effect functions |
| formatting | `git diff --check` | no output, exit 0 |

Use Bun for package/workspace commands. Do not run `pnpm`, `npm install` in the
repository, or `bun add`; edit exact manifests and let `bun install` update the
authoritative `bun.lock`.

## Scope

**In scope** (only these files/directories may change):

- `packages/effect-build-esbuild/**` (new package)
- `packages/effect-build-node-sea/**`
- `packages/effect-build/src/Provider.ts`
- `packages/effect-build/src/Integration.ts`
- `packages/effect-build/src/JavaScriptBundle.ts`
- `packages/effect-build/src/standalone/Artifact.ts`
- `packages/effect-build/src/standalone/BuildError.ts`
- `packages/effect-build/src/standalone/CompileExecutable.ts`
- `packages/effect-build/src/standalone/CompileExecutableMatrix.ts`
- `packages/effect-build/src/standalone/Driver.ts`
- `packages/effect-build/src/standalone/MatrixError.ts`
- `packages/effect-build/src/standalone/Target.ts`
- `packages/effect-build/src/standalone/internal/CompilerAdapter.ts`
- `packages/effect-build/src/standalone/internal/CompilerEngine.ts`
- `packages/effect-build/src/standalone/internal/TargetTable.ts`
- `packages/effect-build/src/standalone/internal/ToolDiscovery.ts`
- `packages/effect-build/src/internal/ProviderContracts.ts` (delete or reduce
  to no integration catalog)
- `packages/effect-build/src/index.ts`
- `packages/effect-build/package.json`
- `packages/effect-build-bun/src/Adapter.ts`
- `packages/effect-build-bun/src/index.ts`
- `packages/effect-build-deno/src/Adapter.ts`
- `packages/effect-build-deno/src/index.ts`
- `package.json`
- `bun.lock`
- `tsconfig.packages.json`
- `tsconfig.examples.json`
- `examples/esbuild/**` (new)
- `examples/node-sea/**`
- `scripts/clean-dist.mjs`
- `scripts/read-tooling.mjs`
- `scripts/test-built-consumer.mjs`
- `scripts/verify-candidate.mjs` (new, private release-candidate verifier)
- `scripts/verify-effect-compatibility.mjs`
- `tooling/public-api.json`
- `test/unit/esbuild-bundle.test.ts`
- `test/unit/node-sea.test.ts`
- `test/unit/esbuild-node-sea-pipeline.test.ts`
- `test/unit/core-artifact.test.ts`
- `test/unit/standalone-publication.test.ts`
- `test/unit/standalone-contract.test.ts`
- `test/unit/standalone-matrix.test.ts`
- `test/architecture/import-boundaries.test.ts`
- `test/architecture/public-api.test.ts`
- `test/architecture/workspace-topology.test.ts`
- `test/architecture/provider-spi.test.ts`
- `test/architecture/generated-and-ci.test.ts`
- `test/architecture/docs-contract.test.ts`
- `test/integration/node-sea.test.ts`
- `test/testkit/standaloneDriverContract.ts`
- `typetest/integration-contract.tst.ts` (new)
- `typetest/core-artifact.tst.ts`
- `typetest/standalone-contract.tst.ts`
- `typetest/provider-definition.tst.ts`
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `README.md`
- `docs/README.md`
- `docs/api.md`
- `docs/architecture.md`
- `docs/drivers.md`
- `docs/errors.md`
- `examples/README.md`
- all five `packages/*/README.md` and copied `LICENSE` files
- `AGENTS.md` (replace the migration generation with the final generation in
  the same atomic cut)
- `plans/023-establish-core-artifact-lifecycle.md` — freeze and include only
  its pre-existing implementation handoff receipt when committing this plan;
- `plans/README.md` and this plan for status/receipt only

**Out of scope**:

- any change to Bun/Deno supported targets, compiler versions, input/options,
  public operation names, matrix semantics, or runtime result values;
- restoring published v0.2 core subpaths as facades; the selected v0.3 package
  split is a documented hard import migration;
- a combined Esbuild+SEA package or convenience operation;
- a generic `JavaScriptBundler`, `ExecutablePackager`, Build service, request,
  plan, executor, registry, fallback, or automatic tool selection;
- durable bundle publication, caller-configured/optional bundle digest,
  watch/rebuild, plugins, arbitrary
  esbuild options, source maps, CSS/assets from esbuild, multiple entries,
  splitting, or browser/Bun resolution targets;
- Node download, postject, macOS signing, Windows/macOS SEA, cross-target SEA,
  snapshots, code cache, caller-facing raw argv, or matrix;
- Artifact manifest/store, receipt/provenance/reproducibility, cache/CAS,
  remote/container execution, deployment, or npm packaging;
- actual npm publication, tag, GitHub Release, trusted-publisher mutation, or
  release-tool adoption (Plan 026/blocked Plan 021 own evidence/authority).

## Git workflow

- Branch from the exact clean Plan 023 receipt SHA:
  `codex/024-esbuild-node-sea-integrations`.
- Use reviewable conventional commits such as
  `feat!: split Esbuild and Node SEA integrations`.
- A commit may temporarily be red while files move, but the branch must be
  green at every pushed review point. Never commit duplicate Esbuild
  implementations as an intermediate fallback.
- Do not push, dispatch workflows, open a PR, tag, or publish unless the
  operator explicitly requests it.

## Steps

### Step 1: Make the five-package/public-contract tests red

Before moving source, update architecture and TSTyche contracts to require:

- exactly five lockstep packages and the exact star graph;
- Node SEA installs with no Esbuild package or raw `esbuild` dependency;
- Esbuild installs with no Node SEA dependency;
- exact runtime/declaration exports for core, Bun, Deno, Esbuild, and Node SEA;
- unchanged Bun/Deno surfaces;
- absence of the old Node SEA provider/facade/matrix symbols;
- no core provider name/version case for Node SEA or Esbuild;
- public composition and borrowed-pre-existing-bundle typing;
- `Result.Result<Validated, string>` as the sole Provider option-validation
  ADT, with no exported bespoke `Validation` union;
- class-preserving provider error intersections, including the yieldable,
  `pipe`, and `toJSON` surface of narrowed `BuildError` and `MatrixFailed`;
- exact service environments: Node SEA's service method requires `never`,
  Esbuild leaks no platform service and preserves only callback
  `Exclude<R, Scope.Scope>`, and top-level accessors add exactly their service
  key;
- the supported `Context.Service`/`Schema.TaggedError` APIs and stable named
  `Effect.fn` implementation boundaries at beta.104 and rc.108;
- identity-safe Esbuild mapping: a caller error structurally matching a core
  bundle-error `_tag` but lacking its non-exported family marker passes through
  unchanged;
- deterministic Esbuild/Node shape and field reason mapping at both Effect
  endpoints without parsing `SchemaError` text; arbitrary Node reason strings
  fail construction/decoding while a non-empty
  `external-import-not-builtin:<specifier>` reason succeeds;
- checked bigint-to-`ByteCount` conversion and the exact Esbuild/Node unsafe
  size mappings;
- no raw internal factory, BuildOptions, candidate, process handle, native
  executable inspector, bundle-registry primitive, receipt, manifest, plan, or
  executor export. The required authenticated
  `Integration.inspectLiveJavaScriptBundle` author operation is not prohibited
  by this assertion.

Register `typetest/integration-contract.tst.ts` via the existing TSTyche glob.
Keep Plan 023's core/liveness tests. Initial failures must be limited to the
selected hard-cut axes: the not-yet-created package, not-yet-cut Node API,
still-closed integration catalog, and old Provider declarations.

**Verify**:

```sh
bun run build && bun run test:architecture
bun run test:types
```

Expected: red only on those selected graph/API/neutrality assertions. Existing
Bun/Deno behavioral characterization must remain green; any unrelated failure
before source movement is a STOP.

### Step 2: Atomically move Esbuild and hard-cut Node SEA

Create the manifest, tsconfig, index, README, and LICENSE. Use `git mv` for the
implementation from Node SEA into the new package, then adjust only imports /
public exports and the Plan 023 core capability call. Move its tests' imports
to the new package; keep package-private factory seams importable only by unit
tests through source-relative paths, not the export map.

Add the package to root development dependencies, TypeScript references,
cleaning, Effect compatibility copies, public tooling, and the new independent
example. Move exact raw `esbuild: 0.28.2` ownership from Node SEA to Esbuild.
Run `bun install` once and review `bun.lock`: there must be one raw esbuild
version and no pnpm lock/migration.

The new example must consume a bundle inside the continuation (for example,
stat/copy it through Effect FileSystem); it must not retain a stale handle or
present a durable public bundle claim.

In the same working-tree transaction, delete
`packages/effect-build-node-sea/src/Adapter.ts` and replace the public
index/factory with the exact `NodeSea`, `createExecutable`, and `layer` API
above. Keep raw selected-tool/runtime factories package-private for tests.
Remove raw esbuild from its manifest and import graph. There is deliberately no
compile-green point after the `git mv` and before this facade deletion: the
retained Adapter imports the moved file. Do not add a sibling import, copy,
shim, or compatibility facade to manufacture one.

Implement total input/preflight through the required
`Integration.produceExecutable.prepare` callback. Reuse the exact current Node
26.7 metadata/help/native inspection. Core's private active-root/destination
claims perform cleanup containment before this callback; Node neither receives
a cleanup root nor reimplements that check. Preserve bundle digest/liveness,
alias, asset, builtin, format, host, and target tests. Map
`main.format` to `commonjs`/`module` and keep `useSnapshot`/`useCodeCache`
literal false.

Return `main.stages` followed by the Node stage; do not require an Esbuild
stage. That permits a borrowed or future producer. Return the provider-refined
durable Artifact only after core publication succeeds.

Preserve Plan 023's owned-source call shape during the move: Esbuild supplies
only `temporaryPrefix: "effect-build-esbuild-"` and performs context
acquisition/rebuild/materialization inside the core-root-indexed producer
callback. Core remains the sole temporary-root allocator, claimant, and
deletion owner. Do not restore `makeTempDirectoryScoped` or an Esbuild-owned
root deletion finalizer. Keep the contested-allocation and
delayed-dispose/delayed-delete concurrent-publication regressions green after
imports move to the new package.

**Verify**:

```sh
bun install
bun install --frozen-lockfile
bun run build
bun x vitest run test/unit/esbuild-bundle.test.ts test/unit/core-artifact.test.ts test/unit/node-sea.test.ts test/unit/standalone-publication.test.ts
```

Expected: exit 0; `rg 'from "esbuild"' packages` reports production imports
only under `packages/effect-build-esbuild`; no Esbuild implementation remains
in Node SEA. `rg -n 'Esbuild|esbuild|compileExecutableMatrix|Composed'
packages/effect-build-node-sea/src` finds no bundler dependency or old provider
facade (README prose is checked separately).

### Step 3: Delete the composed provider topology from core

Make `Provider.define` command-only and provider-supplied. Bun/Deno definitions
must provide their exact provider ID, target table/schema, and one-stage
schema. `Provider.define` returns exactly `Target`, `Artifact`, `MatrixError`,
`compileExecutable`, `compileExecutableMatrix`, and `layer`; provider indices
use the first three for type derivation but continue exporting only the existing
five runtime keys. Generate each provider-specific Artifact and MatrixError
schema from those inputs. Remove Node SEA from `ProviderContracts`, root closed Artifact /
MatrixError unions, `ComposedDefinition`, `ComposedProviderRequirements`, and
all Node-specific conditional/cast branches.

Complete the deferred neutral-core cut, not merely the Node deletion:

- `standalone/Artifact.ts` deletes `ToolName`, the closed provider `Artifact`
  union, Bun/Deno/Node stage schemas, `ArtifactFor`, and `StagesFor`; it retains
  only `AbsolutePath`, `Digest`, `ByteCount`, `FileArtifact`,
  `ToolObservation`, `StageObservation`, and `ExecutableArtifact`;
- `standalone/MatrixError.ts` retains provider-neutral `MatrixIssue`,
  `InvalidMatrixInput`, broad structural `CellFailure`/`MatrixFailed` bases,
  and their broad `MatrixError` union, but contains no integration literal,
  target subset, or provider-specific Artifact refinement;
- `Provider.define` constructs the exact provider-literal Artifact and refined
  homogeneous MatrixError schemas returned to Bun/Deno from the common bases;
- delete `internal/ProviderContracts.ts` outright if no non-catalog value
  remains. Do not leave Bun/Deno literals behind merely because only the Node
  facade forced the timing of this cut.

Retarget `typetest/core-artifact.tst.ts` in the same cut: delete assertions for
the temporary Plan 023 `Artifact.Artifact`, `ToolName`, `ArtifactFor`,
`StagesFor`, and `Target.Target` compatibility declarations; freeze the final
neutral root allowlists and continue asserting the nominal scoped-bundle and
Integration signatures. Do not leave a stale type-only compatibility surface
after the runtime catalog is removed.

Do not create a registry. A provider is selected by importing its package and
providing its Layer exactly as today. The factory may remain a documented
integration-author SPI with two real command-provider consumers; Esbuild and
Node SEA do not implement it.

Assert current Bun/Deno values and matrix ordering/errors are unchanged.
Add type/runtime tests that reject an empty provider name, empty/duplicate/
unknown target entries, an empty native token, a default target outside the
table, a statically multi-stage or provider-mismatched tuple, and a
cast/JavaScript zero- or multi-stage decoder. A cast/JavaScript definition
whose one decoded stage name mismatches the provider must fail as the existing
provider-attributed `ToolFailed` before publication. Definition-shape failures
are author defects, not operation errors.
TSTyche must also prove the provider-refined failure branch still extends the
core `MatrixFailed` tagged-error instance (including its Effect/yieldable,
`pipe`, and `toJSON` surface), while only `artifacts` and `failures` narrow.
Rewrite `standalone-publication.test.ts` so its command-provider fakes use the
exact one-stage SPI and its former two-stage `"node-sea"` candidate coverage
targets `Integration.produceExecutable`/the public Node SEA tests instead. Do
not retain `CandidateProducer`, `StagesFor`, or a composed-provider type solely
for that test.

**Verify**:

```sh
bun run build
bun x vitest run test/unit/standalone-bun.test.ts test/unit/standalone-deno.test.ts test/unit/standalone-matrix.test.ts test/unit/standalone-contract.test.ts test/unit/standalone-publication.test.ts
bun run test:types
```

Expected: all pass; repository search finds no `bun`, `deno`, `node-sea`, or
`esbuild` integration literal/version/target branch in core Artifact,
MatrixError, Provider, or a surviving ProviderContracts module. The only
provider identities are supplied from integration packages.

### Step 4: Prove public composition and package independence

Rewrite `test/unit/esbuild-node-sea-pipeline.test.ts` to import only public
operations/types for the main composition cases. Keep package-private factory
tests in the individual unit suites. Cover:

- ESM and CJS Esbuild -> Node SEA stage order and format equality;
- bundle callback success, typed failure, defect, and interruption cleanup;
- Node failure leaves no executable and still cleans Esbuild temporary bytes;
- stale/copied/forged handle fails before Node;
- Node `--check` and the SEA config both name the authenticated private main
  copy; mutating the original after copy cannot change consumed bytes, while a
  mutation captured during copy fails digest comparison before candidate;
- destination under the core-owned Esbuild-production temp root fails before
  candidate/Node;
- from inside an Esbuild callback, re-borrowing the main, a symlink/hard-link
  alias, or copied bytes may enter its nested callback, but attempting to
  publish any of them under the active cleanup root still fails with the exact
  core `OutputInvalid` before Node, candidate allocation, or publication;
- while a prospective executable destination claim is held, trying to
  establish an owned cleanup root that contains it fails before the owned
  producer callback;
- borrowed pre-existing bundle in the same directory as its chosen outfile is
  allowed when it does not alias the file;
- a borrowed bundle with empty stages produces an Artifact whose only stage is
  Node assembly;
- external non-builtins, syntax-check rejection, wrong resolution, missing/changed main, asset
  aliases, selected-Node alias, unsafe bigint size, and wrong native output all
  fail pre-publication with their exact finite reason codes;
- no caller-configured fail-fast, rollback, or publish mode.

Update the real integration test to compose the public operations under exact
Node 26.7.0/Linux x64 GNU. It must run both ESM and CJS executables.

**Verify**:

```sh
bun run build
bun x vitest run test/unit/esbuild-bundle.test.ts test/unit/node-sea.test.ts test/unit/esbuild-node-sea-pipeline.test.ts
```

Expected: all deterministic tests pass. On an approved Linux host with the
exact producer:

```sh
EFFECT_BUILD_NODE_SEA_BIN=/absolute/path/to/node-26.7.0 bun run test:integration:node-sea
```

Expected: both executable formats run successfully. On other hosts, do not
fake or skip this evidence; Plan 026 requires the exact CI lane.

### Step 5: Update workspace consumers, workflows, and public documentation

Update all explicit package inventories, build references, test registration,
packed-manifest logic, Effect compatibility copies, CI, and the candidate
workflow to five packages. `scripts/test-built-consumer.mjs` must pack once and
exercise:

- ten isolated consumers: npm and Bun for core, Bun, Deno, Esbuild, Node SEA;
- two composed consumers: npm and Bun declaring core, Esbuild, and Node SEA
  tarballs directly.

The isolated Node SEA consumer must prove no installed/resolved
`effect-build-esbuild` or raw `esbuild`. The isolated Esbuild consumer must
prove no Node SEA. Packed workspace dependencies rewrite to `^0.3.0`; only the
Esbuild tarball retains exact raw esbuild.

Extend the generated candidate manifest to include exact source SHA and each
tarball's filename/name/version/byte-size/SHA-256/dependency fields. Add
`scripts/verify-candidate.mjs` with the exact CLI
`--directory <absolute-path> --source <40-lowercase-hex-sha>`. It must perform
an independent read-only check of the six-file inventory, manifest schema and
source, recomputed sizes/hashes, tarball package identities, export targets,
and exact dependency graph. It must never pack, install, publish, write a
receipt, or accept extra files. Add deterministic architecture tests for
missing/extra/changed/wrong-source candidates. This is private candidate
integrity tooling, not a public build receipt protocol.

Update CI so the exact Node producer is captured under Node 26.7.0, ambient
orchestration is restored to Node 24.14.1, and the composed public integration
test receives only the captured absolute path. Preserve all current real-tool,
12-target, Effect-endpoint, and three-publication-host axes. Add an independent
public Esbuild/packed-composition assertion; do not treat Node SEA alone as
Esbuild evidence.

Update root/docs/package READMEs and examples to the selected contract. The
transitional governance explicitly authorizes this atomic cut, but Plan 025 is
now the selected second-producer pressure test. Keep `AGENTS.md` on the exact
migration generation and retain the Plan 025 clause; do not restamp final
governance or certify this intermediate surface here:

```md
# effect-build execution rules

- Architecture generation: `granular-integration-migration-v2`.
- Plans 023 and 024 are completed, unpublished migration steps. Plan 025 must add the selected Bun bundle producer, prove both bundle producers against Node SEA, and restamp this file to `granular-integration-v2`. No tag, package, release candidate, or publication may be produced before Plan 025 completes.
- Keep Bun and Deno's existing public scalar `compileExecutable` and homogeneous-provider `compileExecutableMatrix` operations and behavior. Their provider packages remain explicit; there is no registry, fallback, retry, caller-facing raw argv, or automatic installation.
- Keep exactly five lockstep public packages: `effect-build`, `effect-build-bun`, `effect-build-deno`, `effect-build-esbuild`, and `effect-build-node-sea`. Every integration depends one way on core and never on an integration sibling.
- `effect-build` owns only provider-neutral Artifact/Target semantics plus the narrow `./Integration` and command-only `./Provider` author boundaries earned by current consumers. Do not add a generic builder, bundler, packager, plan, executor, store, cache, transport, or backend registry.
- `effect-build-esbuild` exposes one scoped continuation that produces a compatible JavaScript bundle. `effect-build-node-sea` consumes the core bundle capability and exposes granular executable creation. Application Effect code composes them; do not restore an opaque combined facade or package.
- Shared lifecycle code exclusively owns sibling staging, scoped child processes, candidate identity, executable validation, optional hashing, lifetime-safe publication claims, and atomic replacement. Integrations own tool discovery/probing, native invocation, semantic input validation, and diagnostics.
- `effect-build/Provider.define` is a command-provider author SPI with Bun and Deno as its consumers. It may build a provider-specific service from one selected command so Bun compilation and Bun bundling cannot discover different tools; it does not expose that bound command to end users or define a generic bundler. Esbuild and Node SEA do not implement a guessed common provider protocol.
- Plan 025 may add only `Bun.withJavaScriptBundle(input, use)` to the existing Bun service. Bun fixes Node resolution and exposes its pinned producer-default bundle behavior; exact Node syntax acceptance remains owned by `NodeSea.createExecutable`. Deno remains scalar/matrix only until a separately evidenced bundle operation exists.
- `effect-build/Integration.executeCommand` is the one bounded/scoped integration-author command function. Do not expose a process handle, replaceable process service, candidate, commit, raw native inspector, or publication mutation capability.
- Keep package manager, orchestrator runtime, build tool, and artifact target independent. Applications provide one official Effect platform Layer at composition time.
- Library source uses Effect platform-neutral services. Do not import `node:*` or call `Effect.runPromise` under `packages/*/src/`.
- Preserve compiler CLI project/environment behavior and Bun/Deno operation semantics unless a dedicated public decision explicitly changes them.
- Interruption closes Scope and terminates active children. Do not translate interruption into a build error. Atomic rename remains the publication point of no return.
- Run `bun run verify` before handing off a complete implementation.
```

Replace the Step 0 form exactly rather than editing individual clauses in
place. Verify the completed Plan 023 exceptions are gone and Plan 025 remains
authorized:

```sh
rg -Fx -- '- Architecture generation: `granular-integration-migration-v2`.' AGENTS.md
rg -Fx -- '- Plans 023 and 024 are completed, unpublished migration steps. Plan 025 must add the selected Bun bundle producer, prove both bundle producers against Node SEA, and restamp this file to `granular-integration-v2`. No tag, package, release candidate, or publication may be produced before Plan 025 completes.' AGENTS.md
rg -Fx -- '- Plan 025 may add only `Bun.withJavaScriptBundle(input, use)` to the existing Bun service. Bun fixes Node resolution and exposes its pinned producer-default bundle behavior; exact Node syntax acceptance remains owned by `NodeSea.createExecutable`. Deno remains scalar/matrix only until a separately evidenced bundle operation exists.' AGENTS.md
! rg -n 'granular-integration-v1|During Plan 023 only|Plan 023 may temporarily retain' AGENTS.md
```

Document the deliberate v0.2 -> v0.3 import migration:

```text
effect-build/bun  -> effect-build-bun
effect-build/deno -> effect-build-deno
```

Preserve operation/type behavior; do not add core facade subpaths. Describe the
Node SEA candidate API as unreleased and superseded, not as a supported legacy
surface. State positively that stages are observations and bundles are scoped;
do not claim manifests, receipts, closure, hermeticity, or reproducibility.

**Verify**:

```sh
bun run build && bun run test:architecture
bun run check
bun run test:types
node scripts/test-built-consumer.mjs --built
```

Expected: all pass; built-declaration consumers see the selected APIs. Do not
generate a source-stamped tarball candidate yet: the Plan 024 implementation
commit does not exist until Step 6.

### Step 6: Commit and verify one exact implementation candidate

First run the full suite and Effect endpoints as a pre-commit gate. Verify the
final dependency graph from manifests rather than trusting documentation.

**Verify**:

```sh
test "$(bun --version)" = "1.3.14"
bun install --frozen-lockfile
node scripts/read-tooling.mjs
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
  echo "UNAVAILABLE: pinned real-tool assets require Linux-x86_64; Plan 026 exact-SHA CI real-tools is mandatory"
fi
if command -v deno >/dev/null 2>&1; then
  bun run test:host:extra
else
  echo "UNAVAILABLE: optional Deno-host smoke (deno not installed)"
fi
git diff --check
```

The pinned real-tool archives are Linux x64 only. On another host, the explicit
`UNAVAILABLE` result is truthful local evidence, not a pass; Plan 026's
exact-SHA `real-tools` CI job is mandatory. Never fall back to PATH or use
package-manager Bun 1.3.14 as the compiler expected to be 1.3.9. The Node SEA
positive lane likewise remains conditional on exact Linux Node 26.7 locally
and mandatory in Plan 026 CI.

Cold-review the declaration exports, packed manifests, bundle lifetime, native
publication owner, and absence of sibling dependencies. Confirm every dirty
path is in this plan's scope. Include Plan 023's frozen incoming receipt and
README status in the implementation commit because they identify the parent
SHA; exclude Plan 024's still-`PENDING` receipt. Create one reviewable
implementation commit, then bind and verify its identity:

```sh
IMPLEMENTATION_SHA="$(git rev-parse HEAD)"
test "${#IMPLEMENTATION_SHA}" -eq 40
test -z "$(git status --porcelain=v1)"
git merge-base --is-ancestor 60259f98a460b3d9b25b95221ca71b56c17d9d78 "$IMPLEMENTATION_SHA"

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
  echo "UNAVAILABLE: pinned real-tool assets require Linux-x86_64; Plan 026 exact-SHA CI real-tools is mandatory"
fi
CANDIDATE_DIR="$(mktemp -d -t effect-build-024-candidate.XXXXXX)"
node scripts/test-built-consumer.mjs --candidate-dir "$CANDIDATE_DIR"
node scripts/verify-candidate.mjs --directory "$CANDIDATE_DIR" --source "$IMPLEMENTATION_SHA"
test -z "$(git status --porcelain=v1)"
```

Expected: the complete deterministic/compatibility gates pass from a clean
committed HEAD; exactly five tarballs plus one manifest are present; all twelve
consumers pass; and the independent verifier accepts the exact
source/content/dependency graph. If any post-commit gate fails, fix it in a new
implementation commit and restart this entire exact-SHA block with a fresh
candidate directory. Never relabel dirty bytes with the previous SHA.

Only after all non-receipt criteria pass, write that final SHA, commands,
counts, and host-conditional evidence into this plan's handoff receipt and
update README. Leave those two plan-only edits uncommitted for Plan 025; do not
change the implementation SHA they observe. Do not mark `DONE` on focused
tests alone.

## Test plan

- Existing Esbuild characterization migrates intact, with public API/type and
  core-owned lifetime assertions added.
- Existing Node SEA tests retain exact discovery/probe/host/builtin/asset /
  alias/target/error behavior and add public `createExecutable` tests. Use a
  deterministic command recorder to prove Esbuild-produced and borrowed mains
  are copied, digest-checked, and run through selected Node `--check` before candidate acquisition,
  nonzero syntax exits retain bounded diagnostics, spawn failure is distinct,
  and interruption remains interruption.
- Deterministically mutate the original main after its private copy is
  authenticated and prove both `--check` and the SEA config still name the
  unchanged copy. Mutate before/during copy and prove digest mismatch fails
  before candidate acquisition. Cover `copy-main` and `digest-main-copy`
  failures and cleanup of the private staging directory on every exit path.
- Public pipeline tests cover both formats and every success/failure/defect /
  interruption cleanup transition.
- Core/Bun/Deno tests prove the public feature cut did not change their scalar
  or matrix behavior.
- Architecture tests freeze five exact packages, one-way dependencies, no raw
  esbuild outside its package, no provider sibling imports, no combined facade,
  and exact public runtime/declaration keys.
- TSTyche proves the callback environment, service/Layer errors, granular
  Node error union, Result-based Provider validation, class-preserving narrowed
  errors, absence of source-level Node compile/matrix, and that a plain object
  cannot satisfy the nominal main type.
- Twelve packed consumers prove both isolation and application composition.
- Exact Linux integration runs ESM and CJS executables produced by the public
  pipeline under independent Node 24 orchestrator / Node 26 producer axes.

## Done criteria

- [ ] The final graph contains exactly five lockstep packages and no
      integration sibling dependency.
- [ ] Only `effect-build-esbuild` imports/depends on raw `esbuild@0.28.2`.
- [ ] Esbuild exposes only the three primary operation keys plus the named
      exact diagnostic/error runtime values and type-only declarations.
- [ ] Node SEA exposes only the three primary operation keys plus the named
      exact error/operation runtime values and type-only declarations.
- [ ] Node SEA can consume a borrowed core bundle with Esbuild absent; Esbuild
      can bundle with Node SEA absent.
- [ ] Node SEA copies and authenticates every main, then runs exact selected
      Node `--check` against that private copy before candidate acquisition and
      preserves syntax-check failure, interruption, and bounded diagnostics
      exactly.
- [ ] Bun/Deno operation names, target tables, input behavior, output values,
      matrix ordering/partials, errors, cleanup, and publication remain green.
- [ ] Provider option validation uses Effect `Result` with no parallel
      `Validation` export, and narrowed provider/matrix errors retain their
      Schema error class/yieldable surface.
- [ ] Service methods leak no captured platform dependencies, stable
      `Effect.fn` boundaries exist exactly once per reusable operation, and
      same-tag caller errors are not intercepted by Esbuild's core mapping.
- [ ] Esbuild and Node input/descriptor reason codes are produced by explicit
      `Result` mappings, not `SchemaError` text; Node rejects arbitrary reason
      strings and accepts only the frozen literals or builtin template.
- [ ] Every bigint file size is checked before Number conversion; unsafe sizes
      produce the exact core, Esbuild, and Node invalidity codes.
- [ ] Core contains no Node SEA/Esbuild provider catalog case, composed
      provider topology, unsafe Node target cast, or integration version tuple.
- [ ] The current Node SEA combined compile/matrix facade and Adapter are
      deleted with no alias/fallback.
- [ ] `AGENTS.md` still carries `granular-integration-migration-v2`, has removed
      only the Plan 023 compatibility exceptions completed here, and retains
      the exact Plan 025 Bun-bundle authorization.
- [ ] `bun run verify`, `bun run verify:effect`, and `git diff --check` pass;
      pinned `verify:real` passes locally on Linux x64 or is explicitly
      unavailable and assigned to Plan 026's mandatory exact-SHA `real-tools`
      job; optional extra-host evidence is recorded truthfully; the exact Linux
      Node lane is likewise assigned to Plan 026 when unavailable locally.
- [ ] Five tarballs and twelve built-consumer cases pass locally.
- [ ] The independent candidate verifier accepts exact source, six-file
      inventory, sizes, hashes, packed identities/exports, and dependencies.
- [ ] No out-of-scope concept or file is added; this plan and README contain an
      exact implementation receipt.

## STOP conditions

Stop and report without improvising if:

- Plan 023 is not complete/clean, its migration governance marker is absent,
  or its live core contract differs materially;
- package-manager Bun is not the repository-pinned `1.3.14`; stop before any
  Bun install/build command and obtain that exact tool externally;
- moving Esbuild requires a copy, a Node SEA -> Esbuild dependency, or a core
  import of either integration;
- Node SEA cannot consume a core-borrowed bundle without Esbuild installed;
- Node `--check` or `--build-sea` rereads the caller/producer bundle path after
  private-copy authentication, or the private copy is not removed on every
  exit path;
- the final destination can be published under a core-owned producer cleanup
  root and then deleted during core teardown;
- an alternate borrowed handle can bypass the core active-root/destination
  guard, or a new cleanup root can capture an active destination;
- a borrowed caller-owned bundle is deleted or rejected merely because output
  is in the same directory and does not alias it;
- preserving Node SEA's old source facade is required; that conflicts with the
  selected no-sibling graph and needs a maintainer to change one constraint;
- Bun/Deno public behavior or target evidence changes;
- the implementation starts expanding target vocabularies, plugins, watch,
  cross-target SEA, downloads, signing, manifests, receipts, or executors;
- the raw Esbuild implementation or executable publication path has two owners;
- a verification command fails twice after a bounded fix attempt;
- any out-of-scope file must change.

## Maintenance notes

- A second real bundler may later justify comparing a generic bundler service;
  this plan deliberately exposes only a common Artifact contract.
- A second executable packager does not automatically justify a common service:
  Bun/Deno consume source while Node SEA consumes a bundle.
- If Node changes its exact direct-SEA contract, update the pin, Esbuild syntax target,
  native/builtin evidence, CI producer, and docs in one dedicated change.
- If a durable standalone bundle output becomes a named product, design its own
  outfile/atomic-publication/lifetime contract. Do not pretend this scoped
  handle is durable.
- Reviewers should scrutinize symmetric cleanup-root/destination claims, stale-handle defense,
  package manifests, and whether error translation accidentally loses the
  granular integration failures.

## Compression ledger

| Added | Deleted/merged | Why it pays rent |
|---|---|---|
| `effect-build-esbuild` package | Esbuild implementation/dependency inside Node SEA | independent install/use and correct tool ownership |
| public Esbuild continuation | private operation with the same semantics | named standalone consumer plus Node composition |
| public Node SEA assembly operation | opaque source compiler, one-cell matrix, Adapter error flattening | API now matches actual bundle input |
| five-package tooling/tests | four-package closed inventories | mechanically enforces the selected star graph |
| public application composition | hidden in provider factory | caller selects transformation policy using Effect |
| provider-supplied command schemas | core Node SEA/provider catalog branches | core no longer changes for integration facts |

The plan fails its compression goal if an old combined API, a second bundle
representation, a sibling dependency, or a generic framework remains beside
the selected operations.

## Implementation handoff receipt

The executor fills this section only after every non-receipt done criterion
passes and the
source/config/test/workflow changes are committed as one exact implementation
commit. Record that commit, then leave this receipt and the matching
`plans/README.md` status edit as plan-only handoff changes for Plan 025. This
keeps the candidate source SHA non-circular: the receipt observes the source
commit; it is not part of the source commit it names.

- **Implementation status**: `DONE`
- **Implementation source SHA**: `e3dfece1ac92fdf215abf6670195b86bb7f475c6`
- **Verification summary**: exact Bun `1.3.14`; clean exact-SHA
  `bun install --frozen-lockfile`, `bun run verify`, `bun run verify:effect`,
  optional `bun run test:host:extra`, and `git diff --check` passed. The
  deterministic suites reported 148 unit tests passed with one intentional
  skip, 41 architecture tests passed, four TSTyche files passed, and all twelve
  npm/Bun packed consumers passed at both Effect `4.0.0-beta.104` and
  `4.0.0-rc.108`.
- **Pinned real-tool local evidence / Plan 026 CI assignment**: local host was
  `Darwin-arm64`, so pinned Linux-x86_64 Bun/Deno assets and exact Node 26.7.0
  Linux SEA execution were `UNAVAILABLE`; Plan 026's exact-SHA `real-tools`
  and `node-sea` jobs remain mandatory. Optional Bun/Deno host smoke passed
  with local Deno `2.9.5`.
- **Authorized local integrity fixture**: the source task explicitly authorized
  one disposable, non-promoted six-file fixture solely for this frozen gate;
  no upload, publication, tag, release, or trusted-publisher mutation was
  permitted or performed. `scripts/test-built-consumer.mjs` passed `12/12` and
  `scripts/verify-candidate.mjs` accepted exact source and five packages at
  `/private/tmp/effect-build-024-candidate.1AHWvb`. Tarball SHA-256 values were
  `effect-build` `2a86adf71e68eaf3550b286ebc5fc26bc5e147165be6f5851e595f9f1f849246`,
  `effect-build-bun` `303a2a877b18e8be1cf644f430a6df97464543ba78bf39f3f54e0c984d4faca5`,
  `effect-build-deno` `d55fde9fb27ed555ce1685529d84d314c6312b4c18054cffc53aca099f436db6`,
  `effect-build-esbuild` `3731347d4c509858cf747ca928641a902f6d71b3699dbda344683a0eef0b7994`,
  and `effect-build-node-sea`
  `efb0c811dd0abd2c66f75006922e65ede1d57881600647a46a84b95d93c0deb5`.
- **Allowed plan-only handoff changes**:
  `plans/024-split-esbuild-node-sea-integrations.md`, `plans/README.md`
