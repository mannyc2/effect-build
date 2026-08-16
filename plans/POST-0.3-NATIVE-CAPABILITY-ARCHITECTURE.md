# Post-0.3 native-capability architecture

Status: selected architecture for review. This document is prescriptive but is
not an implementation authorization. Production changes are split into the
follow-up plans listed at the end.

Baseline: `codex/granular-integration-program` at
`15c811bb9904142a33d119766b62082f3c689f13`, containing released `v0.3.0`
source plus the post-release documentation receipts.

Companion documents:

- [`POST-0.3-PROVIDER-CAPABILITY-MATRIX.md`](./POST-0.3-PROVIDER-CAPABILITY-MATRIX.md)
- [`POST-0.3-API-CANDIDATES.md`](./POST-0.3-API-CANDIDATES.md)

## Decision

Adopt this product architecture for 0.4:

```text
provider-native Effect APIs
  + precise shared lifecycle and durable-output primitives
  + optional named portable profiles
  + provider-neutral composition recipes
```

This is a correction to both extremes considered after 0.3.

- Provider-specific APIs alone understate the generic-library product and leave
  useful substitution unavailable.
- A narrow `NodeProgramBundler` as the ontology of the whole library excludes
  most real Bun, Deno, Esbuild, and future-provider capability.
- A generalized transformation algebra duplicates Effect's own composition
  model and erases useful role names.

The selected design makes provider-native capability primary. Portable
abstractions are additional profiles with explicit semantic limits, not the
lowest-common-denominator replacement for direct APIs.

## Product boundary

`effect-build` is an Effect-native integration library for build tools and
artifact-producing runtimes. It is not currently:

- a build graph engine;
- a remote executor;
- a content-addressed store;
- a cache coordinator;
- a package release system;
- a provider registry;
- a universal plugin API;
- a serializable plan language.

The library adds value in four places:

1. provider APIs expressed as typed Effects and scoped resources;
2. platform-neutral command, temporary-output, validation, and publication
   mechanics;
3. durable output observations shared across integrations;
4. narrowly specified portable profiles where providers are genuinely
   substitutable.

## Diagnosis of 0.3

0.3 established several durable strengths:

- five independent packages with one-way dependencies on core;
- separation of Effect orchestrator runtime, build tool, and artifact target;
- continuation-owned temporary JavaScript output;
- selected-tool probing;
- typed failures and exact interruption behavior;
- native executable inspection;
- staged, atomic publication;
- Bun and Esbuild to Node SEA composition without integration sibling imports.

Its public model is nevertheless too narrow for the intended product:

- Bun is represented primarily as a command compiler plus one fixed Node
  bundle profile, not as `Bun.build()`;
- Deno is represented only as a compile command subset, not `Deno.bundle()` or
  the current compile product;
- Esbuild is represented only as one fixed bundle profile, not build,
  transform, context, rebuild, or watch;
- `Integration` groups unrelated author authorities;
- `Provider` names a command-compiler factory as though it described every
  integration;
- `JavaScriptBundle.Artifact` uses durable-artifact language for a temporary
  borrowed resource.

The architecture must preserve the implementation evidence without freezing
those accidental public boundaries.

## Effect architecture principles applied

The decision follows three transferable Effect patterns.

### Portable service plus runtime Layer

Effect defines `FileSystem` in portable core while Node supplies a Layer for
that service. The application depends on the portable operation; the Layer
chooses the implementation. This pattern applies only when observable
semantics are stable across implementations.

Source:
[Effect core `FileSystem`](https://github.com/Effect-TS/effect/blob/189b003a2367fa44dd4b8544aa62979f0345d179/packages/effect/src/FileSystem.ts) and
[Node `FileSystem.layer`](https://github.com/Effect-TS/effect/blob/189b003a2367fa44dd4b8544aa62979f0345d179/packages/platform/node/src/NodeFileSystem.ts).

### Portable service plus provider-specific extensions

Effect SQL providers extend the portable SQL client rather than hiding
provider-specific capability. Effect AI providers satisfy portable model
services while retaining provider options, metadata, clients, and tools. The
lesson is not to flatten rich providers. It is to expose a common role and a
richer direct role together.

### Scope and native tracing

Effect child processes and long-lived resources carry Scope. `Effect.fn`,
`Effect.withSpan`, span annotations, and Effect logging provide native runtime
observability; the application may provide an OTLP exporter Layer at the edge.
The library should emit Effect telemetry without depending directly on an
OpenTelemetry SDK.

Sources:
[Effect child-process guide](https://github.com/Effect-TS/effect/blob/189b003a2367fa44dd4b8544aa62979f0345d179/ai-docs/src/60_child-process/10_working-with-child-processes.ts) and
[application-provided OTLP layers](https://github.com/Effect-TS/effect/blob/189b003a2367fa44dd4b8544aa62979f0345d179/ai-docs/src/08_observability/20_otlp-tracing.ts).

## Target package topology

Keep the five lockstep packages:

```text
effect-build
effect-build-bun
effect-build-deno
effect-build-esbuild
effect-build-node-sea
```

Every integration continues to depend one way on core. No integration imports
another integration.

A future provider follows the same package rule:

```text
effect-build-rolldown -> effect-build
effect-build-pkg      -> effect-build
```

Portable profiles live in core because integrations implement them without
importing siblings. Recipes may live in a consuming integration only when they
depend on core profiles, not on a producer package.

## Portable core

### Application-facing durable values

Core retains an `Artifact` namespace for durable observed outputs:

```ts
export namespace Artifact {
  export type Digest = `sha256:${string}`
  export type LocalPath = string & Brand.Brand<"effect-build/Artifact/LocalPath">

  export interface File {
    readonly path: LocalPath
    readonly bytes: number
    readonly digest?: Digest
  }

  export interface Executable extends File {
    readonly systemTarget: SystemTarget
    readonly steps: readonly BuildStepObservation[]
  }
}
```

`LocalPath` means only that the producing `Path` implementation observed an
absolute canonical host path. It does not claim cross-host portability, remote
identity, reproducibility, or plan serialization.

Core should not define one universal provider output set. Bun, Deno, Esbuild,
and Rolldown output records carry different chunk, asset, plugin, and graph
semantics. Provider packages compose core `Artifact.File` values into their own
written-output results where useful and return provider-native in-memory values
on API lanes.

### Build step observations

Rename `StageObservation` to `BuildStepObservation` and `stages` to `steps`.
The value records an ordered tool operation that contributed to a durable
output:

```ts
export interface BuildStepObservation {
  readonly operation: string
  readonly tool: {
    readonly name: string
    readonly version: string
    readonly path?: Artifact.LocalPath
  }
}
```

It is deliberately not:

- a dependency graph;
- a runtime span;
- a cache key;
- a complete input manifest;
- a provenance receipt;
- a reproducibility claim.

### Precise integration-author subpaths

Replace broad `Integration` and `Provider` names with authority-specific public
subpaths:

```text
effect-build/Command
effect-build/TemporaryOutput
effect-build/Executable
effect-build/CommandCompiler
effect-build/Profile/SingleNodeProgram
```

These are public author APIs because third-party integrations are part of the
product. They are not hidden under `unstable/*`: the entire project is pre-1.0,
and an `unstable` prefix does not repair an inaccurate authority name.

#### `Command`

Owns:

- selected executable observations;
- scoped child invocation;
- bounded stdout/stderr collection;
- environment and working-directory policy;
- typed spawn and completion results.

It does not expose a global executor registry, shell string, or automatic tool
installation.

#### `TemporaryOutput`

Owns:

- temporary directory/file acquisition;
- cleanup-root claims;
- borrowed file/directory handles;
- liveness checks;
- cleanup on success, typed failure, defect, and interruption;
- protection against publishing durable output beneath an active cleanup root.

Borrowed values are not `Artifact` values.

#### `Executable`

Owns:

- destination resolution;
- sibling staging;
- native-format inspection;
- expected-system-target validation;
- optional digesting;
- atomic publication;
- publication point-of-no-return semantics.

#### `CommandCompiler`

Owns only the command-backed source-to-executable author pattern currently
shared by Bun and Deno. It replaces `Provider.define` and removes reflective
wrapping of arbitrary service methods. Provider-specific additional services
are built through an explicit Effectful constructor with declared
requirements.

## Provider package contract

Every provider package may expose up to four explicit surfaces.

### `Api`

Effect wrappers over the provider's official TypeScript/JavaScript API.

Rules:

- preserve provider-native option and result types where practical;
- retain provider-specific error and diagnostic information;
- own long-lived native handles through Scope;
- document the required host runtime;
- do not claim underlying cancellation where the provider API has no cancel
  mechanism.

### `Command`

Effect wrappers over the selected provider executable.

Rules:

- use core `Command`, `TemporaryOutput`, and `Executable` mechanics;
- preserve CLI project/config/environment behavior unless the API says
  otherwise;
- expose provider-specific command options and diagnostics;
- make interruption terminate active child work;
- never silently fall back to the host API or another provider.

### `Profile/*`

Adapters that satisfy a portable core service with a deliberately restricted
provider configuration.

Rules:

- profile names describe the actual result and target semantics;
- direct provider APIs remain available;
- excluded provider capabilities are documented;
- a provider cannot satisfy a profile by silently ignoring fields or weakening
  lifetime/interruption guarantees.

### `Recipe/*`

Pure Effect composition helpers. A recipe may combine a core profile with the
current integration, but it must not import a sibling provider package or
choose a provider implicitly.

## Provider surfaces selected for 0.4

### Bun

```text
effect-build-bun/Api
effect-build-bun/Command
effect-build-bun/Profile/SingleNodeProgram
```

`Api` exposes Bun build and executable compilation through `Bun.build()` and
requires a Bun host. `Command` exposes CLI build and compile under any Effect
runtime that supplies process services. The portable profile initially uses
the command lane because it has the strongest interruption guarantee.

### Deno

```text
effect-build-deno/Api
effect-build-deno/Command
```

`Api` exposes `Deno.bundle()` and requires a Deno host with a permission
context. `Command` exposes `deno bundle`, `deno compile`, scalar compilation,
and homogeneous matrices. Deno does not implement the Node-program profile
unless a later provider analysis proves a truthful Node-target contract.

### Esbuild

```text
effect-build-esbuild/Api
effect-build-esbuild/Profile/SingleNodeProgram
```

`Api` exposes build, transform, and a scoped context. Context release calls
cancel then dispose. The portable profile is an adapter over a fixed subset of
that API. A command lane may be added later if a command-only host use case
justifies it; it is not required to expose the native Esbuild product.

### Node SEA

```text
effect-build-node-sea/Command
effect-build-node-sea/Recipe/SingleNodeProgram
```

The direct command API accepts an existing bundled main file, format, assets,
and supported Node SEA options. It is not restricted to a bundle produced by
this workspace. The recipe adapts the core borrowed single-Node-program profile
to the direct command.

## Optional portable profile: `SingleNodeProgram`

The prior `NodeProgramBundler` proposal survives only as this named profile:

> Build one borrowed JavaScript main file, in ESM or CommonJS form, with Node
> module-resolution semantics and no provider-owned side-output graph.

The profile is useful for Node SEA and other one-main consumers. It excludes:

- multiple entrypoints;
- code splitting;
- CSS and asset side outputs;
- browser, Bun, or Deno runtime targets;
- declaration generation;
- provider plugin APIs from the portable request;
- watch and incremental contexts;
- durable output ownership.

Provider-specific defaults and options may be configured on the provider
Layer, while direct provider calls expose per-call provider options.

The borrowed value is called `SingleNodeProgram.Borrowed`, not `Artifact` and
not a general `NodeProgram.Lease` root concept. It exposes metadata plus a
scoped `withFile` capability; the temporary path is available only within that
nested callback. Returning the borrowed handle is harmless because later
access fails with a typed expired error.

The profile's Context service supports application Layer substitution. Bun and
Esbuild also expose their direct profile functions with exact provider errors.

## Native API and command interruption semantics

Interruption guarantees are part of each operation's documentation and tests.

| Lane | Required guarantee |
|---|---|
| Command one-shot | interrupting the Effect terminates the active child, closes streams, removes temporary output, and preserves interruption Cause; publication that already crossed atomic rename is not rolled back. |
| Command watch | the watch process is a scoped resource; release requests termination and drains/reaps according to the command contract. |
| Esbuild context | release calls provider `cancel()` and `dispose()`; rebuild/watch operations preserve typed errors, defects, and interruption. |
| Bun/Deno one-shot host API | interruption stops the Effect consumer and suppresses downstream publication/callback use; unless the provider adds a cancel API, documentation must state that underlying provider work may continue. |
| Borrowed profile callback | callback success, failure, defect, or interruption always closes the borrowed output; callback Cause is not normalized into a provider error. |

The generic profile may require a stronger interruption contract than a
provider's native one-shot API. In that case only the command lane or a
cancellable native context implements the profile.

## Error model

Direct provider APIs retain exact provider failures.

Command integrations combine:

- core command/spawn failures;
- core temporary-output and publication failures;
- provider-specific invalid request, tool, target, and diagnostic failures.

Portable profiles expose one useful normalized family:

```ts
export class Failure extends Data.TaggedError("SingleNodeProgramFailure")<{
  readonly provider: string
  readonly kind:
    | "invalid-request"
    | "tool-unavailable"
    | "build-failed"
    | "invalid-output"
    | "host-io"
  readonly diagnostics: readonly Diagnostic[]
  readonly providerError: unknown
}> {}
```

The normalized fields must be actionable without inspecting `providerError`.
Provider packages export narrowing guards for callers that installed and chose
that provider. Adapters map only identity-proven provider failures. Caller
failures, defects, and interruption retain their original Cause.

## Observability model

Three concerns remain separate.

### 1. Runtime execution tracing

Every public Effect operation uses a stable `Effect.fn` name and creates or
annotates spans with fields such as:

```text
effect_build.provider
effect_build.lane
effect_build.operation
effect_build.tool.version
effect_build.target.system
effect_build.output.count
effect_build.output.bytes
effect_build.interruption.guarantee
```

Command discovery, command execution, validation, and publication may be child
spans. Logs carry provider diagnostics at an appropriate level without
changing typed failures.

Core depends only on Effect telemetry. The application decides whether spans
stay in memory, go to console, or are exported through OTLP/OpenTelemetry.

### 2. Source and dependency graph information

Bun metafiles, Deno's module graph, Esbuild metafiles, and Rolldown/Rollup
output graphs are provider-native values. They differ in edge kinds,
completeness, path normalization, generated runtime edges, assets, and plugin
semantics.

0.4 defines no universal dependency graph. Provider result types retain their
native graph data. The `SingleNodeProgram` profile may expose only a narrowly
named observation such as sorted provider-reported external import specifiers,
with no completeness claim.

A shared graph projection may be added later only if at least two provider
adapters can state the same completeness and edge semantics.

### 3. Durable artifact lineage or provenance

`BuildStepObservation`, file size, digest, provider, and system target are
lightweight observations attached to durable artifacts. They do not establish
closed inputs or reproducibility.

A future provenance receipt requires a separate design with input identity,
toolchain identity, configuration, environment policy, and commitment
semantics. It is outside 0.4.

## Input and path decisions

### No universal `SourceLocator`

Do not add a core wrapper around `entrypoint` and `cwd`. Provider-native inputs
include:

- filesystem paths;
- URLs and module specifiers;
- package references;
- project directories;
- stdin bytes;
- virtual file maps;
- HTML roots;
- provider plugin values.

Each provider owns its truthful input type. Portable profiles own their much
narrower request types.

### Use Effect platform services for mechanics

`Path`, `FileSystem`, process services, Scope, Layer, Tracer, and logging remain
the platform abstractions. A new domain type is introduced only when it captures
an ownership or authority distinction that those services do not, such as:

- durable observed artifact path;
- borrowed temporary file;
- in-memory source;
- module specifier versus filesystem path.

## Public author API decision

Do not put the author APIs under `unstable/*` merely because they may change.
The package major version already communicates pre-1.0 instability.

Use precise public subpaths when third-party integrations should be supported:

```text
Command
TemporaryOutput
Executable
CommandCompiler
```

Keep an operation package-private when no integration outside its package
needs the authority. In particular, raw native-header parsers, publication
candidate tokens, claim registries, and provider process handles remain
private behind the precise author functions.

## Goal-weighted comparison

Scores use 1 (poor) through 5 (strong). Complexity criteria score higher when
the public and implementation cost is lower. The weights reflect the stated
product goal, so provider coverage and fidelity carry the most weight.

| Criterion | Weight | Provider-native only | Narrow Node-program ontology | Native plus profiles/recipes | Structural protocols | Transformation algebra |
|---|---:|---:|---:|---:|---:|---:|
| Provider capability coverage | 5 | 5 | 1 | 5 | 4 | 4 |
| Provider fidelity | 5 | 5 | 2 | 5 | 4 | 3 |
| Portable composition | 4 | 1 | 5 | 4 | 3 | 5 |
| Orchestrator-runtime independence | 4 | 3 | 4 | 4 | 4 | 4 |
| Effect idiomaticity | 4 | 4 | 4 | 5 | 3 | 2 |
| Resource ownership | 4 | 4 | 5 | 5 | 4 | 4 |
| Error fidelity | 4 | 5 | 3 | 5 | 5 | 4 |
| Observability | 3 | 4 | 3 | 5 | 3 | 3 |
| Discoverability | 3 | 4 | 4 | 4 | 2 | 2 |
| Extension cost | 3 | 4 | 2 | 5 | 4 | 5 |
| Stability of public commitment | 3 | 4 | 2 | 4 | 4 | 2 |
| Low conceptual cost | 3 | 4 | 4 | 3 | 3 | 1 |
| Low implementation cost | 2 | 4 | 3 | 2 | 3 | 1 |
| **Weighted total / 235** |  | **186** | **150** | **209** | **170** | **152** |

The selected architecture wins because it covers provider capability without
requiring application code to surrender portable composition. Its extra cost
is explicit package/module surface and two provider adapters for each portable
profile. That cost is lower than either omitting native capabilities or
maintaining a generic transformation language.

## Exact 0.4 export direction

### Core

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./Command": "./dist/Command.js",
    "./TemporaryOutput": "./dist/TemporaryOutput.js",
    "./Executable": "./dist/Executable.js",
    "./CommandCompiler": "./dist/CommandCompiler.js",
    "./Profile/SingleNodeProgram": "./dist/Profile/SingleNodeProgram.js"
  }
}
```

Root exports durable application vocabulary only:

```text
Artifact
BuildError
BuildStepObservation
Diagnostic
MatrixError
SystemTarget
```

### Bun

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./Api": "./dist/Api.js",
    "./Command": "./dist/Command.js",
    "./Profile/SingleNodeProgram": "./dist/Profile/SingleNodeProgram.js"
  }
}
```

### Deno

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./Api": "./dist/Api.js",
    "./Command": "./dist/Command.js"
  }
}
```

### Esbuild

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./Api": "./dist/Api.js",
    "./Profile/SingleNodeProgram": "./dist/Profile/SingleNodeProgram.js"
  }
}
```

### Node SEA

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./Command": "./dist/Command.js",
    "./Recipe/SingleNodeProgram": "./dist/Recipe/SingleNodeProgram.js"
  }
}
```

Package roots re-export namespaces for discovery. The explicit subpaths are the
canonical documentation locations.

## Breaking changes from 0.3

The 0.4 implementation should make one hard cut, with no legacy aliases:

| 0.3 surface | 0.4 decision |
|---|---|
| `effect-build/Integration` | Delete. Replace with precise `Command`, `TemporaryOutput`, and `Executable` author subpaths. |
| `effect-build/Provider` | Delete. Replace with `effect-build/CommandCompiler`. |
| `JavaScriptBundle.Artifact` | Delete. Portable profile uses `SingleNodeProgram.Borrowed`; provider-native outputs use provider result types or durable artifacts. |
| `withJavaScriptBundle` | Delete. Direct profile operations become `withSingleNodeProgram`; full provider build operations live under provider `Api`/`Command`. |
| proposed root `NodeProgramBundler` | Do not add at root. Add `Profile/SingleNodeProgram.Bundler`. |
| `Compiler` service name in Bun | Split into `BunApi` and `BunCommand`; package root no longer implies one lane. |
| `Compiler` service name in Deno | Split into `DenoApi` and `DenoCommand`. |
| Esbuild fixed bundle-only `Service` | Replace with full `EsbuildApi`; expose profile adapter separately. |
| Node SEA input restricted to core live bundle | Direct command accepts a validated existing main file; recipe accepts the borrowed profile. |
| `StageObservation` / `stages` | Rename to `BuildStepObservation` / `steps`. |
| generic artifact `target` field | Rename to `systemTarget` where the value is a native system target. |
| handwritten broad absolute-path schema | Replace with `Artifact.LocalPath` constructed using the active Effect `Path` service for observed durable outputs. |

`compileExecutable` and `compileExecutableMatrix` remain as provider-command
verbs, but move under explicit provider `Command` ownership.

## Rejected alternatives

### Provider-native APIs only

Valid but incomplete. It covers rich providers while leaving the already-proven
single-Node-program substitution unavailable to generic application/library
code.

### Narrow Node-program architecture as the whole product

Rejected because it makes a deliberately restricted Node SEA input profile the
ontology for providers that also build browser applications, HTML, CSS, assets,
Deno programs, Bun executables, transforms, and incremental contexts.

### Universal `ExecutableBuilder`

Semantically invalid. Bun and Deno consume source/project inputs and select a
runtime. Node SEA consumes one already-bundled main. `@yao-pkg/pkg` consumes a
project/package graph. A union input or generic type parameter hides rather than
removes those differences.

### Structural protocol as the only generic API

Coherent for integration helpers, but insufficient for application Layer
substitution and weak in discoverability. Structural helper types may remain
private implementation tools.

### General transformation or capability algebra

Rejected because Effect functions, services, Layers, Scope, and `Effect.gen`
already form the composition algebra. A second `Transform<I, O, E, R>` object
model adds type parameters and wrappers while erasing domain roles.

### Plans, CAS, remote execution, and caching

Not required by provider capability access. Current source requests do not close
over project configuration, environment, plugins, dynamic loading, or provider
runtime acquisition. Adding serializable plans now would overstate identity and
reproducibility.

## Maintainer judgment still required

The architecture decision does not depend on these questions, but implementation
needs explicit choices:

1. Whether Bun's first 0.4 `Api` lane is a required part of the initial cut or a
   dependency-ordered second PR after command author APIs stabilize.
2. Whether Deno's unstable `Deno.bundle()` API should ship in 0.4 or remain a
   planned API lane until its upstream stability and type packaging are
   acceptable.
3. Whether provider package roots should re-export all lane namespaces or only
   documentation links, forcing explicit subpath imports.
4. Whether `Artifact.LocalPath` should be nominal at compile time only or also
   expose a Schema for external decoding.
5. Whether the profile's normalized `providerError` should retain the exact
   in-memory object or only provider metadata suitable for serialization. The
   recommendation is exact in-memory identity; it is not a receipt.

## Implementation sequence

The dependency-ordered Plan 039+ series is maintained in separate plan files.
The intended order is:

1. precise core author boundaries and observability;
2. provider-native API and command lanes;
3. portable single-Node-program profile and Node SEA recipe;
4. 0.4 hard cut, packed consumers, and certification.

No implementation PR should combine all four phases. The first implementation
PR should establish core `Command`, `TemporaryOutput`, `Executable`, and
`CommandCompiler` authorities while preserving 0.3 runtime behavior behind the
old exports until the final cut PR.
