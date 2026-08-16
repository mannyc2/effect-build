# Post-0.3 native-capability architecture

Status: final selected architecture for review. This document is prescriptive.
It does not authorize production implementation, publication, tagging, release,
or merge.

Baseline:

- released source: `v0.3.0` at
  `f06f96ca88b6278e5f23a898d758b99fa9322108`;
- release-line base: `codex/granular-integration-program` at
  `15c811bb9904142a33d119766b62082f3c689f13`;
- implementation must descend from that release line, not stale `main`.

Companion evidence:

- [`POST-0.3-PROVIDER-CAPABILITY-MATRIX.md`](./POST-0.3-PROVIDER-CAPABILITY-MATRIX.md)
- [`POST-0.3-API-CANDIDATES.md`](./POST-0.3-API-CANDIDATES.md)

## Decision

Adopt this 0.4 product architecture:

```text
provider-native Effect APIs
  + explicit host-API and selected-command lanes
  + precise core integration-author capabilities
  + durable output observations
  + optional portable profiles
  + provider-neutral recipes
```

Provider-native capability is primary. Portable profiles are first-class but
narrow. The selected model is Candidate C in the API comparison.

## Product thesis

> `effect-build` provides rich, Effect-native access to the real build
> capabilities of Bun, Deno, Esbuild, Node SEA, and future integrations, while
> adding portable composition only where it preserves provider semantics.

Consequences:

- Bun browser/Bun/Node builds, plugins, virtual files, HTML, CSS, assets,
  output sets, and Bun-runtime executables remain Bun capabilities.
- Deno bundles, declarations, permissions, project compilation, runtime
  acquisition, engine choice, and Deno-runtime executables remain Deno
  capabilities.
- Esbuild build, transform, plugins, loaders, metafiles, rebuild, watch, and
  serve remain Esbuild capabilities.
- Node SEA remains an assembler over one already-bundled main.
- A valid portable profile does not replace richer direct operations.
- Similar output kinds do not justify a universal `ExecutableBuilder`.

0.4 is not a build graph engine, provider registry, fallback selector, plugin
standard, remote executor, CAS, cache coordinator, serializable plan language,
provenance system, or release coordinator.

## Diagnosis of 0.3

0.3 proved valuable mechanics:

- five one-way packages;
- Effect host, selected tool, and target are independent;
- tool discovery/probing;
- typed failure channels;
- child interruption/reaping;
- continuation-owned temporary output;
- ELF/Mach-O/PE inspection;
- same-parent executable staging and atomic rename;
- Bun/Esbuild -> Node SEA composition;
- exact callback Fail/Interrupt/Die Cause preservation.

Its public ontology is narrower than the intended product:

- Bun is mainly a command compiler plus one fixed Node profile;
- Deno exposes only a compile subset;
- Esbuild exposes only a fixed Node profile;
- Node SEA directly requires the current live-bundle representation;
- `Integration` mixes command, temporary ownership, validation, and
  publication;
- `Provider` names a command source-compiler factory as though it described all
  integrations;
- `JavaScriptBundle.Artifact` gives durable language to a borrowed resource.

0.4 preserves the mechanics and corrects those boundaries.

## Domain model

### Provider-native operations

A provider-native operation preserves the provider's real input authority,
output topology, options, diagnostics, and resource semantics.

Examples:

```text
Bun BuildConfig          -> Bun BuildOutput
Deno bundle options      -> Deno bundle result
Esbuild BuildOptions     -> BuildResult
Esbuild TransformOptions -> TransformResult
Esbuild BuildOptions     -> scoped BuildContext
Deno command compile     -> Deno executable
Node SEA main/config     -> Node executable
```

Core does not force these into one request or generic output-set type.

### Durable output observations

A durable `Artifact` describes bytes that remain after the producing Effect
completes.

```ts
export namespace HostPath {
  export type Absolute = string & {
    readonly "~effect-build/HostPath/Absolute": unique symbol
  }

  export const existing: (
    input: string
  ) => Effect.Effect<
    Absolute,
    ObservationFailed,
    FileSystem.FileSystem | Path.Path
  >
}

export namespace Artifact {
  export const Digest: Schema.Schema<`sha256:${string}`>
  export type Digest = typeof Digest.Type

  export interface File {
    readonly path: HostPath.Absolute
    readonly bytes: number
    readonly digest?: Digest
  }

  export interface Executable<
    Steps extends readonly [
      BuildStepObservation,
      ...BuildStepObservation[]
    ] = readonly [
      BuildStepObservation,
      ...BuildStepObservation[]
    ]
  > extends File {
    readonly systemTarget: SystemTarget
    readonly steps: Steps
  }
}
```

`HostPath.Absolute` means a canonical existing path observed by the active host
Path/FileSystem implementation. It is not a remote identity, plan coordinate,
or proof that a later deserialized string still exists. `HostPath.existing`
performs the observation. No syntax-only Schema is named as though it established
host existence.

Provider-written output sets may contain `Artifact.File` observations, but the
provider result remains provider-specific. Multi-file command builds do not
inherit the executable operation's atomic publication guarantee.

### Borrowed resources

A borrowed output is valid only while its producer continuation is open. It is
not an `Artifact`. Integration-author machinery may expose borrowed files or
directories; portable profiles wrap that authority in role-specific values.

### Build step observations

```ts
export interface BuildStepObservation {
  readonly operation: string
  readonly tool: {
    readonly name: string
    readonly version: string
    readonly path?: HostPath.Absolute
  }
}
```

A step observation is not a dependency graph, runtime span, cache key, complete
input manifest, provenance receipt, or reproducibility claim.

## Effect architecture principles

The design follows official Effect patterns:

- portable services are introduced only for stable application-visible roles;
- provider packages may extend portable contracts with richer direct services;
- Layers select implementations and retain provider construction requirements;
- Scope owns processes, temporary roots, Esbuild contexts, and other handles;
- typed provider failures remain recoverable;
- native Effect spans/logging are exporter-neutral.

The pattern applies to the restricted SingleNodeProgram role. It does not apply
to the complete Bun, Deno, Esbuild, and Node SEA APIs.

## Package topology

Keep exactly five lockstep packages:

```text
effect-build
effect-build-bun
effect-build-deno
effect-build-esbuild
effect-build-node-sea
```

Every integration depends one way on core. No integration imports a sibling.
Future integrations follow the same rule.

## Exact intended 0.4 subpaths

### `effect-build`

```text
.
./Author/Command
./Author/TemporaryOutput
./Author/Executable
./Author/CommandCompiler
./Profile/SingleNodeProgram
```

Root runtime namespaces/values:

```text
Artifact
BuildError
HostPath
MatrixError
SystemTarget
```

Root type-only exports:

```text
BuildStepObservation
Diagnostic
```

### `effect-build-bun`

```text
.
./Api
./Command
./Profile/SingleNodeProgram
```

### `effect-build-deno`

```text
.
./Api
./Command
```

### `effect-build-esbuild`

```text
.
./Api
./Profile/SingleNodeProgram
```

### `effect-build-node-sea`

```text
.
./Command
./Recipe/SingleNodeProgram
```

Package roots are namespace-only discovery facades. Explicit subpaths are
canonical in documentation. Root facades do not duplicate callable aliases.

## Public integration-author capabilities

The audience is named as `Author/*`; `unstable/*` is not used as a substitute
for authority. These are supported pre-1.0 contracts, subject to semver.

### `Author/Command`

Owns selected executable observation, discovery/probing, bounded one-shot
execution, scoped long-lived execution, stdout/stderr and exit observation,
explicit cwd/environment policy, interruption, termination, reaping, and
force-kill policy.

It exposes no shell strings, automatic installation, global executor registry,
or runtime-specific process object.

### `Author/TemporaryOutput`

Owns temporary acquisition, cleanup-root claims, borrowed capability
construction, liveness/mutation/digest checks, cleanup for every Exit, and
protection against durable publication beneath an active cleanup root.

It never makes a temporary value durable.

### `Author/Executable`

Owns the validated single-file lifecycle:

```text
resolve destination
-> claim destination
-> allocate same-parent staging
-> producer writes candidate
-> verify regular/executable file
-> inspect ELF/Mach-O/PE
-> resolve SystemTarget
-> optional digest
-> atomic rename
```

The rename remains the durable point of no return. Candidate IDs, claim maps,
native parser internals, and rename machinery remain package-private. This
module does not promise transactionality for arbitrary multi-file output sets.

### `Author/CommandCompiler`

Owns only the selected-command source-to-executable pattern shared by Bun and
Deno. It replaces `Provider.define` with an explicit Effectful service
constructor. Requirements appear in Layer types; option validation remains a
pure `Result` run before staging or child work; no method reflection remains.

Esbuild, Node SEA, and host API lanes do not implement this contract.

## Provider contract

Every provider may expose:

### `Api`

Effect wrappers over an official in-process API.

- preserve provider requests/results and exact diagnostics;
- state required host runtime;
- Scope owns provider handles;
- do not claim cancellation without a provider handle;
- never fall back to `Command`.

### `Command`

Effect wrappers over one selected executable.

- preserve provider CLI/config/project behavior;
- use core author capabilities where their guarantees apply;
- expose provider-specific requests and diagnostics;
- interruption terminates active child work;
- never fall back to `Api` or another provider.

### `Profile/*`

An adapter for one portable role. The name describes exact semantics and
exclusions. Direct provider APIs remain canonical for richer behavior.

### `Recipe/*`

Plain Effect composition over services/profiles. A recipe selects no producer,
imports no sibling producer, and creates no second execution algebra.

## Provider surfaces

### Bun

`effect-build-bun/Api` exposes one direct `build(BuildConfig)` operation and
preserves `BuildOutput`. Bun executable compile remains provider compile mode
inside `BuildConfig`; 0.4 does not add a second API-lane compile wrapper without
an output/write/cancellation probe.

`effect-build-bun/Command` exposes typed command `build`,
`compileExecutable`, and homogeneous `compileExecutableMatrix`.

Bun source -> Bun executable remains independently valuable. It produces a
Bun-runtime executable with Bun and Node built-ins. Source -> SingleNodeProgram
-> Node SEA produces a Node-runtime executable and complements rather than
replaces it.

### Deno

`effect-build-deno/Api` wraps unstable `Deno.bundle()` under a Deno host. The
package owns an isolated structural declaration matching the pinned official
surface if ambient Deno globals would pollute unrelated consumers. The Layer
checks presence but does not grant permissions or enable unstable flags.

`effect-build-deno/Command` exposes typed bundle, compile, and compile matrix.
Bundle includes declaration generation. Compile retains permissions, includes,
workers, project/framework behavior, engine/runtime selection, target runtime,
and explicit environment authority such as `DENORT_BIN`.

The API lane is part of the intended 0.4 surface but has a hard type-isolation
and runtime gate. Failure stops for maintainer decision; it never permits a
command-backed fake API.

### Esbuild

`effect-build-esbuild/Api` exposes build, transform, and scoped context.
The context exposes rebuild, watch start, serve start, and cancel. `dispose` is
hidden because Scope owns release and calls cancel then dispose exactly once.
One-shot build/transform make no cancellation claim. Plugins, output files,
metafiles, and provider diagnostics remain native.

No Esbuild CLI lane is part of 0.4.

### Node SEA

`effect-build-node-sea/Command` remains an assembler. It accepts a bundled file
or bytes plus CJS/ESM format, assets, builder Node selected by Layer, optional
base/target Node, snapshot/code cache, runtime arguments, output, and digest.
It privately copies/materializes and authenticates the main before Node reads
it, validates version/target restrictions, and publishes through
`Author/Executable`. Signing remains separate.

## Portable profile: `SingleNodeProgram`

The earlier root `NodeProgramBundler` survives only as this exact profile:

> produce one borrowed JavaScript main, ESM or CJS, with Node module resolution,
> no provider-owned side-output graph, and continuation-owned lifetime.

Canonical core path:

```text
effect-build/Profile/SingleNodeProgram
```

Provider implementations:

```text
effect-build-bun/Profile/SingleNodeProgram
effect-build-esbuild/Profile/SingleNodeProgram
```

The Bun adapter initially uses the selected-command lane to preserve child
termination. The Esbuild adapter uses a scoped context.

The profile excludes multiple entries, splitting, CSS/assets/HTML, browser/Bun/
Deno targets, declarations, provider plugins/loaders in the portable request,
watch/incremental contexts, raw provider options, and durable ownership.

### Borrowed authority

`SingleNodeProgram.Borrowed` contains metadata and a closure-owned `withFile`
capability. The temporary path exists only inside the nested callback. Returning
the borrowed value does not extend ownership; later use fails with a typed expiry
error. The closure carries a protocol version and does not rely on the consuming
core module's WeakSet. This is lifecycle interoperability, not a sandbox against
malicious provider code.

### Failure contract

Portable failures contain provider name, normalized kind, portable diagnostics,
and the exact in-memory provider error. Provider adapters map only
identity-proven provider failures. Callback typed failures, defects,
interruptions, and mixed Causes pass through unchanged. Direct provider profile
functions keep exact provider error unions; generic provider Layers normalize
construction and operation failures to the profile family.

## Node SEA recipe

`effect-build-node-sea/Recipe/SingleNodeProgram` requests the core profile,
borrows the file, and invokes Node SEA direct assembly. It selects no producer;
the application provides Bun or Esbuild's profile Layer.

## Names and boundaries

| Name | 0.4 decision |
|---|---|
| `compileExecutable` | Keep under Bun/Deno `Command` |
| `compileExecutableMatrix` | Keep under Bun/Deno `Command`; scalar is primitive |
| `withJavaScriptBundle` | Delete; misleading for full provider outputs and narrow profile |
| `withSingleNodeProgram` | Direct provider profile operation |
| root `NodeProgramBundler` | Do not add; use `Profile/SingleNodeProgram.Bundler` |
| `NodeProgram.Lease` | Do not add at root; use `SingleNodeProgram.Borrowed` |
| `JavaScriptBundle.Artifact` | Delete; borrowed output is not durable |
| `Artifact` | Keep for durable observations only |
| `Integration` | Delete; replace with precise `Author/*` modules |
| `Provider` | Delete; replace with `Author/CommandCompiler` |
| provider `Compiler` service | Replace with explicit Api/Command services |
| `StageObservation` / `stages` | Rename to `BuildStepObservation` / `steps` |
| executable `target` | Rename to `systemTarget` |
| `AbsolutePath` | Replace with `HostPath.Absolute` |

## Source and platform abstractions

Do not add a universal `SourceLocator`. `entrypoint` plus `cwd` adds no
invariant and excludes URLs, packages, project directories, stdin/bytes,
virtual files, HTML roots, and plugin modules. Provider requests own source
inputs; profiles own their narrow requests.

Use Effect Path, FileSystem, process, Scope, Layer, tracing, and logging for
platform mechanics. Add a domain type only for real ownership/authority, such as
an observed host path, in-memory source, or borrowed versus durable output.

## Observability

Three concerns stay separate.

### Runtime tracing

Each public operation has one stable root span:

```text
effect-build.<provider>.<lane>.<operation>
```

Core author boundaries use child spans such as:

```text
effect-build.command.discover
effect-build.command.run
effect-build.temporary-output.acquire
effect-build.executable.inspect
effect-build.executable.publish
```

Stable keys:

```text
effect_build.provider
effect_build.lane
effect_build.operation
effect_build.artifact.kind
effect_build.tool.name
effect_build.tool.version
effect_build.target.system
effect_build.output.count
effect_build.output.bytes
effect_build.interruption.contract
```

Categorical values must be bounded; count/bytes are numeric measurements.
Unknown fields are omitted. Paths, argv, environment values, URLs, asset keys,
plugins, source snippets, and full diagnostics are not attached by default.
Warnings/errors may emit safe summary logs. Instrumentation never changes typed
values or Cause topology. The library depends only on Effect observability;
applications provide OTLP/OpenTelemetry or another exporter Layer.

### Source/dependency graph

Bun/Deno/Esbuild/Rolldown graph and metafile values remain provider-native.
0.4 defines no universal graph. The portable profile may expose sorted
provider-reported external import observations, explicitly not a complete graph.

### Durable lineage

Steps, bytes, digest, provider, and system target are lightweight observations,
not runtime spans or provenance receipts. A durable receipt would require closed
input/config/environment/toolchain identity and is outside 0.4.

## Interruption and ownership

| Operation | Guarantee |
|---|---|
| One-shot host API without cancel | Fiber stops awaiting; provider work/direct writes may continue |
| Scoped provider context | Scope invokes provider cancel/release exactly once |
| One-shot selected command | Interruption terminates/reaps child and cleans core-owned staging |
| Command watch if exposed | Scope owns child and release terminates/reaps it |
| Single-file executable | Atomic rename is publication point of no return |
| Provider multi-output direct write | Provider semantics; no false transactionality claim |
| Borrowed profile callback | Root closes after every Exit; callback Cause remains exact |

## Goal-weighted comparison

Scores: 1 poor, 5 strong. Higher complexity scores mean lower cost. Excluded
provider capability counts as a cost.

| Criterion | Weight | Native only | Narrow profile ontology | Native + profiles/recipes | Structural operations | Transform algebra |
|---|---:|---:|---:|---:|---:|---:|
| Provider capability coverage | 5 | 5 | 1 | 5 | 4 | 4 |
| Provider fidelity | 5 | 5 | 2 | 5 | 4 | 3 |
| Portable composition | 4 | 1 | 5 | 4 | 3 | 5 |
| Host independence | 4 | 3 | 4 | 4 | 4 | 4 |
| Effect idiomaticity | 4 | 4 | 4 | 5 | 3 | 2 |
| Resource ownership | 4 | 4 | 5 | 5 | 4 | 4 |
| Error fidelity | 4 | 5 | 3 | 5 | 5 | 4 |
| Observability | 3 | 4 | 3 | 5 | 3 | 3 |
| Discoverability | 3 | 4 | 4 | 4 | 2 | 2 |
| Extension cost | 3 | 4 | 2 | 5 | 4 | 5 |
| Public stability | 3 | 4 | 2 | 4 | 4 | 2 |
| Low conceptual cost | 3 | 4 | 4 | 3 | 3 | 1 |
| Low implementation cost | 2 | 4 | 3 | 2 | 3 | 1 |
| **Weighted total / 235** | | **186** | **150** | **209** | **170** | **152** |

## Rejected alternatives

### Provider-native APIs only

Strongest rejected alternative. It has excellent fidelity and lower initial
cost. It loses because Bun and Esbuild already demonstrate a truthful
application-level substitution contract; omitting it would force reusable code
to choose a provider even when it depends only on the shared role.

### Narrow Node-program architecture as the whole product

The profile is valid; the ontology is not. It excludes browser output, Bun
runtime output, Deno bundle/declarations, Esbuild transform/context, plugins,
HTML/CSS/assets, and multi-output builds.

### Universal `ExecutableBuilder`

Semantically invalid. Bun/Deno compile source/projects into runtime-specific
executables; Node SEA consumes a bundled main; `pkg` consumes a project graph.
A type parameter or union hides rather than removes the topology.

### Structural-only protocol

Useful internally but incomplete for the intended Layer-substitution
application model and weak in discovery.

### General transformation algebra

Rejected because Effect already supplies functions, services, Layers, Scope,
Stream, and `Effect.gen`. A second algebra duplicates every provider operation
and erases role names.

### `unstable/*` author namespace

Rejected. The issue is authority naming, not a stability adjective. `Author/*`
states audience/capability; pre-1.0 semver governs breaking changes.

## Hard breaking changes from 0.3

Delete without aliases:

```text
effect-build/Integration
effect-build/Provider
JavaScriptBundle.Artifact
withJavaScriptBundle
ambiguous Bun/Deno Compiler service names
```

Rename:

```text
StageObservation -> BuildStepObservation
stages           -> steps
target           -> systemTarget
AbsolutePath     -> HostPath.Absolute
```

Move Bun/Deno compile operations under provider `Command` subpaths. Broaden
Esbuild, Bun, Deno, and Node SEA direct surfaces. Add `Author/*`,
SingleNodeProgram provider Layers, and a Node SEA recipe. Ship no compatibility
aliases or parallel advanced tier.

## Implementation dependency graph

```text
039 core Author/* capabilities and observability
  |\
  | +--> 040 Esbuild Api
  | +--> 041 Bun Api + Command
  | +--> 042 Deno Api + Command
  |
  +----> 043 Node SEA Command + SingleNodeProgram profile/recipe
           depends on 040 and 041, not 042

039-043 -> 044 hard cut and certify unpublished 0.4 candidate
```

Plans 040, 041, and 042 may proceed independently after 039. Plan 043 does not
depend on Deno because Deno does not implement the profile.

## Verification policy

Every advertised capability receives non-skipping evidence at its real host/tool
boundary:

- exact runtime/declaration export locks;
- Node-host command consumers;
- Bun-host API consumers using packaged `bun-types` declarations;
- Deno-host API consumers with unstable flag and permissions;
- real Esbuild build/transform/context;
- provider plugins, multiple entries/outputs, CSS/assets, and Deno declarations
  where advertised;
- context/watch Scope release;
- host API interruption tests that make no cancellation claim;
- command interruption/reaping;
- native target inspection/publication;
- unchanged profile program under Bun and Esbuild Layers;
- exact callback failure/defect/interruption Cause;
- packed isolated/composed consumers from once-packed bytes.

## Empirical gates

Architecture is selected; these facts still gate implementation:

1. Bun API compile result/write timing.
2. Deno API type isolation and unstable/permission/compiled-binary errors.
3. Bun/Deno command-watch event contracts.
4. Provider multi-output behavior under interruption.
5. Closure-owned borrowed authority across compatible duplicate core copies.
6. Node SEA builder/base Node and cross-platform cache/snapshot restrictions.
7. Effect span/log assertions over the supported Effect range.

A failed probe narrows or stops the affected lane; it never permits silent
fallback.

## Maintainer authority required

1. Approve the pre-1.0 0.4 hard cut with no compatibility aliases.
2. If the Deno API gate fails, choose between amending 0.4 to omit `/Api` or
   delaying the full cut.
3. Approve provider dependency/version expansion discovered by probes.
4. Separately authorize publication, tag, or release after Plan 044 certifies an
   unpublished candidate.

This architecture PR authorizes none of those release mutations.
