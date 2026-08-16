# Post-0.3 native-capability architecture after executable falsification

Status: final selected architecture for review. This document is prescriptive.
It does not authorize production implementation, publication, tagging, release,
or merge.

Baseline:

- released source: `v0.3.0` at
  `f06f96ca88b6278e5f23a898d758b99fa9322108`;
- release-line base: `codex/granular-integration-program` at
  `15c811bb9904142a33d119766b62082f3c689f13`;
- implementation must descend from that release line, not stale `main`;
- executable research lives under `research/post-0.3/` and is run by
  `.github/workflows/architecture-research.yml`.

Companion evidence:

- [`POST-0.3-PROVIDER-CAPABILITY-MATRIX.md`](./POST-0.3-PROVIDER-CAPABILITY-MATRIX.md)
- [`POST-0.3-API-CANDIDATES.md`](./POST-0.3-API-CANDIDATES.md)

## Decision

Candidate C survives only in a revised and narrower form, called Candidate C2:

```text
permanent provider-native Effect APIs
  + explicit host-API and selected-command lanes
  + a smaller public integration-author core
  + durable output observations
  + law-tested portable role profiles
  + provider-neutral recipes
  + provider-owned compatibility policies
```

The executable research changed the earlier proposal in five material ways:

1. `SingleNodeProgram` is renamed to `NodeMainProgram`. Real Bun and Esbuild
   output agreed when executed as a main and disagreed when imported.
2. `NodeMainExecutable` becomes a second 0.4 profile. Node SEA and a research
   `@yao-pkg/pkg` adapter both produced a runnable Node executable from one
   bundled main.
3. `BrowserModuleApplication` becomes a third 0.4 profile. Bun and Deno both
   produced a self-contained borrowed HTML module tree after the request was
   narrowed to module-reachable CSS/assets.
4. `Author/Command` and `Author/CommandCompiler` are removed from the public
   proposal. Effect already owns process handles, streams, Scope, kill, and
   force-kill; the compiler factory adds no invariant beyond smaller
   authorities.
5. The double continuation is removed. One producer continuation plus a
   closure-owned file Effect preserves expiry, mutation checks, duplicate-core
   interoperability, exact Cause behavior, and cleanup with fewer states.

Provider-native operations remain primary and canonical. Profiles are additive
application roles, never a replacement tier.

## Product thesis

> `effect-build` provides permanent, rich, Effect-native access to provider
> capabilities and adds portable roles only when executable conformance proves
> that the same application-visible request, output, target, ownership,
> interruption, and failure laws can be preserved.

This means:

- Bun browser/Bun/Node builds, plugins, virtual files, HTML, CSS, assets,
  output sets, and Bun-runtime executables remain permanent Bun capabilities.
- Deno bundles, declarations, permissions, project compilation, runtime
  acquisition, engine choice, and Deno-runtime executables remain permanent Deno
  capabilities.
- Esbuild build, transform, plugins, loaders, metafiles, rebuild, watch, and
  serve remain permanent Esbuild capabilities.
- Node SEA remains a permanent Node assembler over one already-bundled main.
- Profiles describe independent application roles. They do not imply that
  provider-native distinctions are accidental.
- Similar durable file shapes do not justify similar producer requests.

0.4 is not a build graph engine, provider registry, fallback selector, plugin
standard, remote executor, CAS, cache coordinator, serializable plan language,
provenance system, universal event protocol, or release coordinator.

## Long-term provider versus profile policy

### Provider modules are permanent

Every supported provider package may expose permanent `Api` and `Command`
subpaths.

`Api` means an official in-process API in the current host. It preserves native
request/result types, callbacks, plugins, diagnostics, and handles. It never
falls back to a command.

`Command` means one selected executable invoked through Effect process services.
It preserves provider CLI/project/config behavior, exact selected-tool identity,
and command interruption. It never falls back to a host API or another provider.

These modules are canonical even when a profile exists. Documentation for a
provider starts with direct provider operations and then lists profiles that the
provider can satisfy.

### Profiles are additive roles

A profile lives in core only when:

- the role has provider-independent application meaning;
- the request authority is exact and finite;
- output topology and runtime/target meaning are the same;
- implementations satisfy the same ownership and interruption laws;
- normalized failures remain useful while retaining exact provider errors;
- at least two implementations have been exercised or a proposed implementation
  has been falsified honestly.

A provider may implement zero, one, or many profiles. Direct provider capability
is not judged by profile count.

### Recipes are composition, not a second executor

A recipe combines services/profiles with ordinary Effects. It selects no
provider, imports no sibling provider package, and creates no serializable build
plan or transformation algebra.

## Diagnosis of 0.3

0.3 proved valuable mechanics:

- five one-way packages;
- independent host, selected tool, runtime, and system target axes;
- selected-tool probing;
- typed failure channels;
- child interruption/reaping;
- continuation-owned temporary output;
- digest mutation checks;
- ELF/Mach-O/PE inspection;
- same-parent executable staging and atomic rename;
- Bun/Esbuild to Node SEA composition;
- exact callback Fail/Interrupt/Die Cause preservation.

Its public ontology remains narrower and less precise than the intended
product:

- Bun is represented mainly by command compile and one fixed Node-main path;
- Deno exposes only a compile subset;
- Esbuild exposes only a fixed Node-main path;
- Node SEA directly requires the current live-bundle representation;
- `Integration` combines tool execution, borrowed ownership, validation, and
  publication;
- `Provider` names one Bun/Deno factory as though it described all providers;
- `JavaScriptBundle.Artifact` uses durable language for a borrowed value;
- exact tool versions are recorded without a complete compatibility policy.

C2 preserves the proven implementation laws while replacing those public
boundaries.

## Domain model

### Host paths

```ts
export namespace HostPath {
  export type Observed = string & {
    readonly "~effect-build/HostPath/Observed": unique symbol
  }

  export const observe: (
    input: string
  ) => Effect.Effect<
    Observed,
    ObservationFailed,
    FileSystem.FileSystem | Path.Path
  >
}
```

`HostPath.Observed` means that active host services canonicalized an absolute
path at a specific operation boundary. It does not promise continuing
existence, remote identity, portability, or reproducibility. There is no Schema
decoder that can recreate the observation from arbitrary JSON.

### Tool observations and compatibility

```ts
export type ToolCompatibility = "tested" | "untested-override"

export interface ToolObservation<Name extends string = string> {
  readonly name: Name
  readonly version: string
  readonly path?: HostPath.Observed
  readonly compatibility: ToolCompatibility
  readonly testedRange: {
    readonly minimum: string
    readonly maximum: string
  }
}
```

Host API observations omit `path`. Command observations include the canonical
selected executable. Node SEA records builder Node and target/base Node
separately.

### Durable artifacts

```ts
export namespace Artifact {
  export type Digest = `sha256:${string}`

  export interface File {
    readonly path: HostPath.Observed
    readonly bytes: number
    readonly digest?: Digest
  }

  export interface RuntimeObservation {
    readonly name: "node" | "bun" | "deno" | string
    readonly version?: string
  }

  export interface Executable<
    Runtime extends RuntimeObservation = RuntimeObservation,
    Steps extends readonly [
      BuildStepObservation,
      ...BuildStepObservation[]
    ] = readonly [
      BuildStepObservation,
      ...BuildStepObservation[]
    ]
  > extends File {
    readonly runtime: Runtime
    readonly systemTarget: SystemTarget
    readonly steps: Steps
  }
}
```

`Artifact.Executable` is a common durable observation. It is not a common
producer request or a claim that runtimes are substitutable.

### Build-step observations

```ts
export interface BuildStepObservation {
  readonly operation: string
  readonly tool: ToolObservation
}
```

A build step is not a runtime span, dependency graph, input closure, provenance
receipt, or reproducibility claim.

### Borrowed values

Borrowed values are available only inside a producer continuation. A returned
object cannot extend cleanup ownership. Closure-owned Effects recheck liveness,
root containment, byte count, and digest when the consumer requests a file or
tree.

## Exact intended 0.4 package topology

Keep five packages for the coordinated 0.4 migration:

```text
effect-build
effect-build-bun
effect-build-deno
effect-build-esbuild
effect-build-node-sea
```

No integration imports a sibling. After the coordinated 0.4 cut, provider
packages may version and release independently within bounded core peer ranges.

## Exact intended 0.4 subpaths

### `effect-build`

```text
.
./Author/Tool
./Author/BorrowedOutput
./Author/Executable
./Profile/NodeMainProgram
./Profile/NodeMainExecutable
./Profile/BrowserModuleApplication
./Recipe/NodeSourceExecutable
```

Root runtime namespaces/values:

```text
Artifact
BuildError
HostPath
MatrixError
SystemTarget
ToolVersionUnsupported
```

Root type-only exports:

```text
BuildStepObservation
Diagnostic
ToolCompatibility
ToolObservation
ToolVersionUntestedOverride
```

### `effect-build-bun`

```text
.
./Api
./Command
./Profile/NodeMainProgram
./Profile/BrowserModuleApplication
```

### `effect-build-deno`

```text
.
./Api
./Command
./Profile/BrowserModuleApplication
```

### `effect-build-esbuild`

```text
.
./Api
./Profile/NodeMainProgram
```

### `effect-build-node-sea`

```text
.
./Command
./Profile/NodeMainExecutable
```

Package roots are namespace-only discovery facades. Explicit subpaths are
canonical. Roots add no duplicate callable aliases.

## Public integration-author capabilities

The audience is named `Author/*`. An `unstable` prefix is not used as a
substitute for precise authority. The contracts are supported pre-1.0 APIs and
may evolve through semver.

### `Author/Tool`

Owns:

- explicit executable selection or PATH discovery;
- canonical selected-path observation;
- exact version probing;
- provider-owned tested ranges and known-incompatible versions;
- lightweight operation capability probes;
- strict versus explicit untested override;
- stable `ToolObservation` construction;
- no automatic installation, fallback, or hidden substitution.

It does not own child-process execution, stdout/stderr, Scope, watch sessions,
or force-kill. Provider authors use official Effect `ChildProcess` APIs for
those responsibilities.

### `Author/BorrowedOutput`

Owns:

- temporary file and tree acquisition;
- cleanup-root claims;
- destination/cleanup overlap checks;
- root containment;
- closure-owned borrowed capabilities;
- file/tree liveness and mutation/digest checks;
- cleanup after every success, typed failure, defect, and interruption;
- deterministic expiry after continuation exit.

Scope alone does not provide these laws. It cannot prevent raw value escape,
destination overlap, or stale metadata use.

### `Author/Executable`

Owns one durable single-file lifecycle:

```text
resolve destination
-> claim destination
-> allocate same-parent staging
-> producer writes candidate
-> verify regular/executable file
-> inspect ELF/Mach-O/PE
-> resolve SystemTarget and runtime observation
-> optional digest
-> atomic rename
```

The atomic rename is the durable point of no return. Candidate IDs, claim maps,
parser range requests, and mutation operations remain package-private. This API
does not imply transactionality for multi-file output sets.

### Removed public proposals

`Author/Command` is rejected because official Effect already owns command
construction, process handles, streams, Scope, environment/cwd policy, signals,
and force-kill. A public wrapper would duplicate that API and create another
lifecycle abstraction.

`Author/CommandCompiler` is rejected because it combines Bun/Deno-specific
convenience policy: source validation, target tables, argv rendering, scalar
compilation, matrix naming, service construction, and error interpretation. Its
actual reusable laws are `Author/Tool`, provider validation, and
`Author/Executable`. A package-private helper may remove code duplication, but
it is not a durable public author contract.

## Permanent provider surfaces

### Bun

`effect-build-bun/Api` permanently exposes `Bun.build()` with provider-native
`BuildConfig` and `BuildOutput`. Compile remains a mode inside the native build
request. The API does not manufacture stronger cancellation or rollback
semantics.

`effect-build-bun/Command` permanently exposes provider command build,
`compileExecutable`, and homogeneous `compileExecutableMatrix`. Command compile
returns a Bun-runtime executable and retains Bun target/version/CPU/libc
semantics.

Bun source to Bun executable is not replaced by the Node recipe. The products
embed different runtimes.

Compatibility is provider-owned. Initial command evidence spans Bun 1.3.9 to
1.3.14; host API evidence currently includes 1.3.14 and must cover both range
boundaries before release.

### Deno

`effect-build-deno/Api` permanently wraps unstable `Deno.bundle()` when the host
provides it. The package owns isolated declarations conformance-checked against
the supported Deno range. The Layer does not grant permissions or enable the
unstable flag.

The implementation must not promise permission failures merely because the
official comments describe permission authority. Deno 2.9.3 executable research
performed local read and write without explicit grants. The exact current
behavior at both range boundaries is a release gate.

`effect-build-deno/Command` permanently exposes bundle, compile, and compile
matrix. It retains project/framework behavior, permissions, includes, workers,
engine/runtime selection, target-runtime acquisition, declaration flags, and
provider diagnostics.

Initial command evidence spans Deno 2.9.3 to 2.9.5.

### Esbuild

`effect-build-esbuild/Api` permanently exposes build, transform, and scoped
context. The context exposes rebuild, watch start, serve start, and explicit
cancel. Scope owns hidden dispose and calls cancel then dispose exactly once.
One-shot build/transform make no cancellation claim.

Initial API evidence spans Esbuild 0.28.1 to 0.28.2.

No Esbuild command lane is part of 0.4.

### Node SEA

`effect-build-node-sea/Command` permanently exposes direct Node SEA assembly
from file or bytes with full supported Node configuration. It records builder
and target/base Node separately, privately copies/authenticates the main,
validates output, and publishes through `Author/Executable`.

Same-version Node 25.5.0 and 26.7.0 builds ran successfully. A mismatched builder
and target request was accepted by Node despite official matching guidance;
until execution/inspection proves a safe rule, the normal Layer requires equal
versions.

## Portable profiles selected for 0.4

### `NodeMainProgram`

The profile means:

> Produce one borrowed JavaScript main entry, ESM or CJS, with Node resolution,
> no provider-owned side-output graph, and continuation-owned lifetime.

It does not promise general importability. Real Bun and Esbuild bundles behaved
differently when imported, so `main` is part of the public role.

```ts
export interface Borrowed {
  readonly protocol: "effect-build/NodeMainProgram@1"
  readonly executionRole: "main"
  readonly format: "esm" | "cjs"
  readonly resolutionTarget: "node"
  readonly externalImportObservations: readonly string[]
  readonly steps: readonly BuildStepObservation[]
  readonly file: Effect.Effect<
    BorrowedOutput.File,
    Expired | Changed
  >
}
```

One outer continuation owns cleanup. There is no nested `withFile` callback.
The `file` Effect is closure-owned and rechecks liveness/mutation at use time.
Compatible duplicate core copies can call it because authority lives in the
producer closure, not a consumer-global registry.

Bun and Esbuild provide adapters. Direct provider APIs remain canonical for
richer behavior.

### `NodeMainExecutable`

The profile means:

> Assemble one already-bundled CommonJS or ESM main into one validated durable
> Node-runtime executable.

It excludes assets, snapshots, code cache, signing, project traversal, automatic
runtime acquisition, and arbitrary provider controls from the portable request.
Those remain direct-provider features.

```ts
export interface Request {
  readonly main:
    | {
        readonly _tag: "File"
        readonly path: string
        readonly format: "commonjs" | "module"
      }
    | {
        readonly _tag: "Bytes"
        readonly contents: Uint8Array
        readonly format: "commonjs" | "module"
        readonly sourceName?: string
      }
  readonly outfile: string
  readonly cwd?: string
  readonly systemTarget?: SystemTarget
  readonly digest?: boolean
}
```

The result runtime name is `node`. Node SEA provides the shipped 0.4 adapter.
A research `@yao-pkg/pkg` adapter proved the transformation topology with a
second implementation, but no `pkg` product package is added in 0.4.

### `BrowserModuleApplication`

The profile means:

> Produce one borrowed browser HTML module application whose module-reachable
> JavaScript, CSS, and assets are all present in a validated output-tree
> manifest.

```ts
export interface Request {
  readonly entryHtml: string
  readonly cwd?: string
  readonly minify?: boolean
}
```

The contract deliberately excludes arbitrary top-level linked resources. Deno
dropped a linked stylesheet in the adversarial broad fixture, while both Bun
and Deno preserved CSS imported through the module graph.

The borrowed value exposes entry HTML, a manifest, build steps, and a
closure-owned files Effect. Every local emitted reference must resolve inside
the manifest. Bun and Deno command lanes provide adapters so interruption has
child-termination semantics.

The profile is borrowed, not a durable directory artifact. Cross-platform
atomic replacement of a multi-file application tree has not been established.

## Provider-neutral Node recipe

Core publishes:

```text
effect-build/Recipe/NodeSourceExecutable
```

It composes:

```text
NodeMainProgram.Bundler
  -> NodeMainExecutable.Assembler
  -> Artifact.Executable<runtime=node>
```

The recipe chooses neither producer nor assembler. Applications can vary Bun
versus Esbuild and Node SEA versus any future conforming assembler through
Layers. Direct provider options remain available outside the recipe.

## Valid but deferred roles

### `IncrementalNodeMain`

Esbuild and Rolldown both satisfied:

- scoped context/build-object acquisition;
- repeated rebuild/generate after source mutation;
- updated Node-main output;
- explicit cancel/dispose or close;
- failure after release.

The role is architecturally valid. It is deferred from 0.4 because the release
would ship only an Esbuild adapter and no Rolldown integration package. This is
product sequencing, not an architectural rejection or experimental label.

### `BrowserModuleOutputSet`

Bun and Deno both produced JavaScript and CSS from a browser module entry. The
role is coherent, but it overlaps the selected HTML application profile. 0.4
ships one browser role instead of two near-duplicates. The output-set role can
be added later if it supports a distinct application workflow.

## Rejected profiles

### Runtime-neutral executable producer

Rejected by execution. Bun and Deno artifacts shared path/bytes/target fields
but ran different embedded runtimes. Permissions, project authority, runtime
version, and target semantics are not implementation details.

Named direct products remain:

```text
Bun source -> Bun executable
Deno project -> Deno executable
Node main -> Node executable
```

### Generic declaration output set

Rejected because Deno and `tsc` produced different topology: one entry
`index.d.ts` versus a module declaration tree.

### Rolled-up declaration file for current providers

Rejected for the tested Deno/Rolldown comparison. Rolldown produced one
self-contained declaration; Deno 2.9.3 and 2.9.5 emitted an unresolved local
import. The role may be reconsidered after Deno behavior changes or another
provider pair conforms.

### Durable multi-file bundle

Rejected for 0.4 because no honest common commit law was found. Direct provider
writes may leave partial durable output under failure/interruption, and directory
replacement semantics differ across hosts. `BrowserModuleApplication` remains
borrowed.

### Typed command-watch event protocol

Rejected. Bun and Deno exposed human logs, not stable machine-readable readiness
or rebuild events. Parsing terminal prose would be a dishonest public protocol.

### Universal signing profile

Not established. Signing identity, trust authority, credentials, platform
mutation, verification, and timestamping differ. A future signing adapter must
copy an input artifact, sign the private candidate, verify, then publish a new
artifact; it must never mutate the observed input in place.

## Lifecycle API family

The architecture uses the smallest set of shapes that makes ownership explicit.

### One-shot host API without cancellation

```ts
Effect.Effect<Result, ProviderError>
```

The fiber may stop waiting. Underlying provider work or direct writes may
continue. No child-termination or rollback claim is made.

### One-shot selected command

```ts
Effect.Effect<Result, CommandOrProviderError>
```

Scope is internal. Interruption terminates/reaps the selected child and removes
core-owned staging. No app-visible raw handle is needed.

### Scoped provider context

```ts
Effect.Effect<ProviderContext, ProviderError, Scope.Scope>
```

The handle exposes provider-native rebuild/watch/serve/cancel methods. Scope
owns final release.

### Long-running command/watch

No generic provider API is exported in 0.4. Official Effect process APIs already
represent raw logs, exit, signals, Scope, and backpressure. A provider may add a
scoped typed handle later only with stable readiness/rebuild evidence.

### Borrowed file/tree

```ts
withRole(request, (borrowed) => Effect<A, E, R>)
```

One continuation owns cleanup. The borrowed value exposes closure-owned Effects
for files/tree data. Returning it cannot retain valid authority after callback
exit.

### Durable single-file publication and assembly

```ts
Effect.Effect<Artifact.File | Artifact.Executable, Error>
```

Staging and validation precede atomic rename. Before rename, interruption leaves
the destination unchanged. After rename, the durable result is not rolled back.

### Provider direct multi-output writes

```ts
Effect.Effect<ProviderResult, ProviderError>
```

Files may become durable before success. Failure/interruption may leave a
partial provider-owned outcome. The wrapper does not invent transactionality.

### Matrix

One Effect owns whole-request preflight and bounded scalar cells. Each cell has
its own atomic publication. Failure reports committed artifacts. The matrix is
not a transaction.

### Post-production mutation

Signing or similar mutation operates on a private copy and returns a new
artifact. The original observation remains valid and unchanged.

## Command versus author process machinery

These responsibilities remain distinct:

- provider `/Command` is an app-facing provider API;
- `Author/Tool` is integration-author selection/compatibility machinery;
- Effect `ChildProcess` is process ownership and streaming;
- telemetry records runtime operations for operators;
- no telemetry event is automatically an application event.

For command watch in particular:

- startup failure is child exit before any provider-defined ready condition;
- unexpected exit remains observable through the Effect process handle;
- stdout/stderr remain raw provider streams with Effect backpressure;
- Scope owns termination and force-kill;
- no stable cross-provider readiness/rebuild/diagnostic parser is claimed;
- therefore no Bun/Deno `Command.watch` ships in 0.4.

## Tool-version compatibility contract

### Provider-owned hybrid policy

Each provider lane publishes:

- tested semantic range;
- known-incompatible versions;
- required capability probes per operation;
- strict default behavior;
- explicit untested override behavior;
- exact observed-version telemetry and build-step metadata.

Normal Layer construction rejects an unknown version before output mutation:

```ts
export interface LayerOptions {
  readonly executable?: string
  readonly allowUntestedVersion?: boolean
}
```

```ts
export class ToolVersionUnsupported extends Data.TaggedError(
  "ToolVersionUnsupported"
)<{
  readonly provider: string
  readonly lane: "api" | "command"
  readonly observed: string
  readonly testedRange: {
    readonly minimum: string
    readonly maximum: string
  }
  readonly knownIncompatible: boolean
  readonly missingCapabilities: readonly string[]
  readonly remediation:
    | "select-supported-version"
    | "enable-untested-version-override"
}> {}
```

The explicit override:

- is configured on the Layer, not per operation;
- emits `ToolVersionUntestedOverride` as a structured warning;
- records `compatibility: "untested-override"` on tool/build-step observations;
- cannot bypass known-incompatible or missing-capability failures;
- retains all output validation, cleanup, target, and publication laws;
- performs no installation, fallback, or substitution.

### Version authority by lane

- Bun `Api`: `Bun.version` plus package `bun-types` conformance.
- Bun `Command`: selected executable probe.
- Deno `Api`: `Deno.version.deno`, unstable API presence, and isolated
  declaration conformance.
- Deno `Command`: selected executable probe.
- Esbuild `Api`: imported package `version` and exact package declarations.
- Node SEA: builder Node and target/base Node independently observed.

Support belongs to a provider package release and operation capability, not to
core. A provider package can widen its range independently after CI passes.

### Initial evidence ranges

```text
Bun Command:   1.3.9  .. 1.3.14
Deno Command:  2.9.3  .. 2.9.5
Esbuild Api:   0.28.1 .. 0.28.2
Node SEA:      25.5.0 and 26.7.0 same-version builds
```

Bun and Deno host APIs require both-boundary execution before release. Deno
permission behavior and Node builder/target mismatch remain hard gates.

## Type declaration policy

Provider TypeScript declarations must track the supported runtime/tool range:

- Bun `Api` imports packaged Bun types tested against both supported host
  boundaries. Consumers do not need a Bun runtime to import other packages.
- Deno `Api` owns isolated structural declarations generated/checked against
  official unstable declarations at both boundaries. Ambient Deno globals do
  not leak into unrelated consumers.
- Esbuild `Api` uses the installed package declarations and tests oldest/newest
  package versions.
- command lanes define package-owned request/result types because CLI contracts
  are not JavaScript API declarations.

A provider release that widens runtime support also updates and verifies its
provider declarations. Core is unchanged unless a shared profile changes.

## Package release cadence

All five packages make the coordinated breaking 0.4 cut together. After 0.4:

- provider packages version independently;
- each provider declares a bounded core peer range;
- profile protocol strings provide runtime compatibility independent of npm
  version equality;
- core recipes depend only on core profiles;
- widening Bun/Deno/Esbuild/Node support normally releases only that provider;
- a core major/minor change can be rejected by provider peer ranges until the
  provider is updated.

Executable packed consumers proved the peer-range mechanism. Whether the
maintainer wants independent publication cadence is still a product authority
decision, but permanent lockstep is no longer the recommended architecture.

## Observability

Three concerns remain separate.

### Runtime tracing

Each public operation has one stable root span:

```text
effect-build.<provider>.<lane>.<operation>
```

Author child spans include:

```text
effect-build.tool.select
effect-build.tool.probe
effect-build.borrowed-output.acquire
effect-build.borrowed-output.observe
effect-build.executable.inspect
effect-build.executable.publish
```

Stable keys:

```text
effect_build.provider
effect_build.lane
effect_build.operation
effect_build.artifact.kind
effect_build.runtime.name
effect_build.runtime.version
effect_build.tool.name
effect_build.tool.version
effect_build.tool.compatibility
effect_build.target.system
effect_build.output.count
effect_build.output.bytes
effect_build.interruption.contract
```

Categorical values are bounded; counts/bytes are numeric. Unknowns are omitted.
Paths, argv, environment values, URLs, asset keys, plugins, source snippets, and
full diagnostics are not attached by default. Safe summary logs may be emitted.
Instrumentation never changes values or Cause topology.

The library depends only on Effect tracing/logging. Applications choose OTLP,
OpenTelemetry, console, in-memory, or another exporter Layer.

### Provider source/dependency data

Bun/Deno/Esbuild/Rolldown graph and metafile values remain provider-native. 0.4
defines no universal graph.

### Durable observations

Build steps, runtime, target, bytes, and digest are lightweight observations.
They do not establish closed inputs, provenance, hermeticity, or
reproducibility.

## Hard breaking changes from 0.3

Delete without aliases:

```text
effect-build/Integration
effect-build/Provider
JavaScriptBundle.Artifact
withJavaScriptBundle
ambiguous Bun/Deno Compiler service names
```

Do not publish the earlier proposed paths:

```text
effect-build/Author/Command
effect-build/Author/CommandCompiler
effect-build/Profile/SingleNodeProgram
```

Rename:

```text
StageObservation            -> BuildStepObservation
stages                      -> steps
target                      -> systemTarget
AbsolutePath                -> HostPath.Observed
SingleNodeProgram           -> NodeMainProgram
TemporaryOutput author role -> BorrowedOutput
```

Move Bun/Deno scalar and matrix compile under provider `Command` subpaths. Ship
no compatibility aliases, deprecated subpaths, or parallel advanced tier.

## Rejected architectural alternatives

### Provider-native APIs only

Still the strongest rejected alternative. It has lower implementation cost and
excellent fidelity. It loses because executable evidence established three
truthful application roles: Node main production, Node main assembly, and
browser module application. Reusable applications should not choose a provider
when they depend only on one of those roles.

### Earlier Candidate C unchanged

Rejected by the research:

- `SingleNodeProgram` overstated importable-module semantics;
- the nested callback did not add ownership enforcement;
- `Author/Command` duplicated Effect process APIs;
- `Author/CommandCompiler` packaged convenience policy as a general SPI;
- it missed valid Node-main executable and browser application profiles.

### Narrow Node-main ontology as the whole product

The Node-main role is valid but cannot represent browser applications,
provider-native multi-output builds, Bun/Deno executables, declaration output,
or incremental contexts.

### Universal executable builder

Rejected by embedded-runtime execution and incompatible request authority.

### Structural-only operation values

Useful internally, but incomplete for the intended application Layer
substitution and weaker in discovery. Profiles use Context services; direct
provider APIs remain ordinary Effects/services.

### General transformation algebra

Rejected because Effect functions, services, Layers, Scope, Stream, and
`Effect.gen` already provide composition. A second algebra duplicates provider
operations and erases domain roles.

### `unstable/*` public author namespace

Rejected. The issue is precise authority, not a stability adjective. `Author/*`
states the audience; pre-1.0 semver governs change.

## Revised implementation dependency graph

```text
039 core Tool + BorrowedOutput + Executable + compatibility + observability
  |\
  | +--> 040 permanent Esbuild Api
  | +--> 041 permanent Bun Api + Command
  | +--> 042 permanent Deno Api + Command
  |
  +----> 043 portable profiles and recipe
           NodeMainProgram:        depends on 040 + 041
           BrowserModuleApplication: depends on 041 + 042
           NodeMainExecutable:     depends on 039 + Node SEA direct work
           NodeSourceExecutable:   depends on NodeMainProgram + NodeMainExecutable

039-043 -> 044 hard cut, independent-versioning policy, and unpublished 0.4 certification
```

Plans 040, 041, and 042 may proceed independently after 039. Plan 043 has
internal dependency-ordered slices and must not begin a slice before its direct
provider services exist.

## Verification policy

Every advertised capability receives non-skipping evidence at its real host or
tool boundary:

- exact runtime/declaration export locks;
- official Effect endpoint compatibility;
- Bun host API at oldest/newest supported versions;
- Deno host API at oldest/newest with exact unstable and permission behavior;
- Bun/Deno commands at oldest/newest/current plus capability probes;
- Esbuild package API at oldest/newest/current;
- Node SEA same-version and mismatch tests;
- provider plugins, multiple entries/outputs, CSS/assets, and native diagnostics;
- context rebuild/watch/serve/cancel/dispose;
- command interruption/reaping;
- executable staging/inspection/publication on Linux, macOS, and Windows;
- one unchanged Node recipe under Bun/Esbuild and assembler Layers;
- one unchanged browser application under Bun/Deno profile Layers;
- borrowed expiry, mutation, duplicate-core, exact Cause, and cleanup;
- packed isolated/composed consumers from once-packed bytes;
- strict and untested-override compatibility examples;
- stable Effect spans, attributes, warnings, and redaction.

## Remaining maintainer authority

1. Approve the revised 0.4 public cut, including the three profiles and removed
   author paths.
2. Approve independent provider package release cadence after the coordinated
   0.4 migration.
3. Decide whether the Deno host API ships if boundary probes continue to
   contradict official permission documentation.
4. Approve any provider dependency expansion required for Bun types, Deno
   declaration generation, or comparison adapters.
5. Separately authorize merge, npm publication, tags, GitHub Releases, or
   trusted-publisher changes after Plan 044 certifies an unpublished candidate.

This research PR authorizes none of those mutations.

## Facts still requiring later implementation

The following cannot be closed truthfully by architecture-only prototypes:

- exact provider direct-write remnants after real fiber interruption on every
  supported host;
- cross-platform borrowed-tree containment and cleanup under Windows locking;
- telemetry behavior in the production implementation across the full Effect
  peer range;
- execution and inspection of mismatched Node builder/target SEAs;
- real signing with platform credentials and trust verification;
- production `pkg` provisioning without hidden network acquisition;
- final package export/declaration bytes and once-packed consumer installation.
