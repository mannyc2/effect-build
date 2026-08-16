# Post-0.3 native-capability architecture

Status: selected architecture for review. This document is prescriptive. It
does not authorize production implementation, publication, or a 0.4 release.

Baseline:

- released source: `v0.3.0` at
  `f06f96ca88b6278e5f23a898d758b99fa9322108`;
- release-line base:
  `codex/granular-integration-program` at
  `15c811bb9904142a33d119766b62082f3c689f13`;
- implementation work must descend from that release line, not stale `main`.

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
narrow. They are not the ontology of every build tool.

The selected model is Candidate C in the companion API comparison.

## Governing product thesis

> `effect-build` provides rich, Effect-native access to the real build
> capabilities of Bun, Deno, Esbuild, Node SEA, and future integrations, while
> adding portable composition only where it preserves provider semantics.

This implies all of the following:

- Bun browser builds, Bun-runtime executables, plugins, virtual files, HTML,
  CSS, assets, and output sets remain Bun capabilities.
- Deno bundle, declarations, permissions, project compilation, runtime
  acquisition, engine choice, and Deno-runtime executables remain Deno
  capabilities.
- Esbuild build, transform, plugins, metafiles, rebuild, watch, and serve remain
  Esbuild capabilities.
- Node SEA remains an assembler for one already-bundled main.
- One valid portable profile does not erase these richer roles.
- Similar output kinds do not justify a universal `ExecutableBuilder`.

## Product boundary

0.4 is an integration and composition library. It is not:

- a build graph engine;
- a provider registry;
- a fallback selector;
- a universal plugin API;
- a remote executor;
- a content-addressed store;
- a cache coordinator;
- a serializable plan language;
- a reproducibility or provenance system;
- a release coordinator.

No CAS, remote execution, cache, plan, or durable receipt is required to expose
provider capabilities truthfully.

## Diagnosis of 0.3

0.3 proved important mechanics:

- five one-way packages;
- Effect host, selected tool, and output target are independent;
- selected command discovery and probing;
- exact typed failures;
- child interruption and reaping;
- continuation-owned temporary JavaScript output;
- native ELF/Mach-O/PE inspection;
- staged single-file publication and atomic rename;
- Bun and Esbuild composition with Node SEA;
- caller failure, defect, and mixed Cause preservation.

Its public model is narrower than the intended product:

- Bun is mainly a command compiler plus one fixed Node profile;
- Deno is only a compile-command subset;
- Esbuild is only a fixed Node profile;
- Node SEA directly requires the current core live-bundle representation;
- `Integration` mixes command, temporary ownership, validation, and
  publication;
- `Provider` means a command source-compiler factory, not every provider;
- `JavaScriptBundle.Artifact` uses durable language for a borrowed resource.

0.4 preserves the mechanics and replaces the accidental boundaries.

## Domain model

### Provider-native operations

A provider-native operation preserves the provider's actual input authority,
output topology, options, diagnostics, and resource semantics.

Examples:

```text
Bun.BuildConfig -> Bun.BuildOutput
Deno.bundle.Options -> Deno.bundle.Result
esbuild.BuildOptions -> esbuild.BuildResult
esbuild.TransformOptions -> esbuild.TransformResult
esbuild.BuildOptions -> scoped Esbuild context
Deno command compile request -> Deno executable
Node SEA main/config -> Node executable
```

Core does not force these values into one generic request or output-set type.

### Durable output observations

A durable observation describes bytes that remain after the producing Effect
completes.

```ts
export namespace Artifact {
  export type Digest = `sha256:${string}`

  export type LocalPath = string & {
    readonly "~effect-build/Artifact/LocalPath": unique symbol
  }

  export interface File {
    readonly path: LocalPath
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

`Artifact.LocalPath` means only:

> a canonical absolute path observed by the active Effect Path/FileSystem
> implementation on the current host.

It does not mean portable path, remote identity, input coordinate, or proof that
a deserialized path still exists. 0.4 exposes constructors from observed host
state and does not expose a general decoding Schema whose name would imply
stronger authority.

Provider-native written output sets may contain `Artifact.File` observations,
but the provider result remains provider-specific. A multi-file command build
does not inherit the executable operation's all-or-nothing atomic publication
guarantee. Provider-written partial-output semantics must be documented.

### Borrowed resources

A borrowed output is valid only while its producer-owned continuation is open.
It is not an `Artifact`.

Core integration-author machinery may expose borrowed files and directories.
Portable profiles wrap that authority in profile-specific values.

### Build step observations

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

A build-step observation is intentionally not:

- a dependency graph;
- a runtime span;
- a cache key;
- a complete input manifest;
- a provenance receipt;
- a reproducibility claim.

## Effect architecture principles

The model follows current Effect patterns at
[`Effect-TS/effect@ee06c9c`](https://github.com/Effect-TS/effect/tree/ee06c9c1eed73ebcf282541ceb1615ff1ba1730d).

### Portable services only for stable roles

Effect puts `FileSystem` in portable core and supplies runtime-specific Layers.
That pattern applies when application-visible semantics survive implementation
substitution.

It applies to the deliberately restricted SingleNodeProgram role. It does not
apply to the full Bun, Deno, Esbuild, and Node SEA APIs.

### Portable role plus provider extension

Effect SQL and AI expose portable services while provider packages retain
provider-specific clients, options, metadata, tools, and operations.

`effect-build` therefore exposes:

- direct provider services with exact capabilities;
- optional provider Layers for a portable profile;
- provider-specific failure narrowing and direct escape hatches.

### Scope owns resources

Effect Scope owns child processes, temporary outputs, Esbuild contexts, and
other provider handles. An operation that has no provider cancellation handle
must not claim cancellation merely because the Effect fiber stopped awaiting.

### Native observability, exporter at the edge

The library emits Effect spans, annotations, and logs. The application may
provide Effect's OTLP/OpenTelemetry integration or another tracer/logger Layer.
Core has no direct OpenTelemetry SDK dependency.

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

A future provider follows the same rule:

```text
effect-build-rolldown -> effect-build
effect-build-pkg      -> effect-build
```

## Exact 0.4 export surface

Package roots are discovery facades. They re-export lane/profile namespaces
only; they do not duplicate callable operations as flat aliases. Explicit
subpaths are canonical in documentation.

### `effect-build`

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./Author/Command": {
      "types": "./dist/Author/Command.d.ts",
      "import": "./dist/Author/Command.js"
    },
    "./Author/TemporaryOutput": {
      "types": "./dist/Author/TemporaryOutput.d.ts",
      "import": "./dist/Author/TemporaryOutput.js"
    },
    "./Author/Executable": {
      "types": "./dist/Author/Executable.d.ts",
      "import": "./dist/Author/Executable.js"
    },
    "./Author/CommandCompiler": {
      "types": "./dist/Author/CommandCompiler.d.ts",
      "import": "./dist/Author/CommandCompiler.js"
    },
    "./Profile/SingleNodeProgram": {
      "types": "./dist/Profile/SingleNodeProgram.d.ts",
      "import": "./dist/Profile/SingleNodeProgram.js"
    }
  }
}
```

Root exports:

```text
Artifact
BuildError
BuildStepObservation
Diagnostic
MatrixError
SystemTarget
```

The `Author/*` namespace makes the audience explicit without using
`unstable/*` as a substitute for authority. These are supported third-party
integration contracts under pre-1.0 semver. Raw native parsers, claim maps,
candidate tokens, and process handles remain package-private.

### `effect-build-bun`

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./Api": {
      "types": "./dist/Api.d.ts",
      "import": "./dist/Api.js"
    },
    "./Command": {
      "types": "./dist/Command.d.ts",
      "import": "./dist/Command.js"
    },
    "./Profile/SingleNodeProgram": {
      "types": "./dist/Profile/SingleNodeProgram.d.ts",
      "import": "./dist/Profile/SingleNodeProgram.js"
    }
  }
}
```

Root namespaces:

```text
Api
Command
SingleNodeProgram
```

### `effect-build-deno`

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./Api": {
      "types": "./dist/Api.d.ts",
      "import": "./dist/Api.js"
    },
    "./Command": {
      "types": "./dist/Command.d.ts",
      "import": "./dist/Command.js"
    }
  }
}
```

Root namespaces:

```text
Api
Command
```

`Api` is part of the intended 0.4 surface. Plan 042 has a hard implementation
gate for Deno global-type isolation and unstable runtime behavior. If that gate
fails, Plan 044 stops for an explicit architecture amendment; it does not ship
a command-backed fake API.

### `effect-build-esbuild`

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./Api": {
      "types": "./dist/Api.d.ts",
      "import": "./dist/Api.js"
    },
    "./Profile/SingleNodeProgram": {
      "types": "./dist/Profile/SingleNodeProgram.d.ts",
      "import": "./dist/Profile/SingleNodeProgram.js"
    }
  }
}
```

Root namespaces:

```text
Api
SingleNodeProgram
```

### `effect-build-node-sea`

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./Command": {
      "types": "./dist/Command.d.ts",
      "import": "./dist/Command.js"
    },
    "./Recipe/SingleNodeProgram": {
      "types": "./dist/Recipe/SingleNodeProgram.d.ts",
      "import": "./dist/Recipe/SingleNodeProgram.js"
    }
  }
}
```

Root namespaces:

```text
Command
SingleNodeProgramRecipe
```

## Integration-author capabilities

### `Author/Command`

Owns:

- selected executable observation;
- discovery and exact probing;
- one-shot bounded command execution;
- scoped long-lived command execution for provider watch lanes;
- stdout/stderr streams and exit observation;
- environment and working-directory policy;
- interruption, termination, reaping, and force-kill policy.

It does not expose shell strings, automatic installation, a global executor
registry, or runtime-specific process objects.

### `Author/TemporaryOutput`

Owns:

- temporary directory/file acquisition;
- cleanup-root claims;
- borrowed file and directory capability construction;
- liveness and mutation checks;
- cleanup on success, typed failure, defect, and interruption;
- protection against durable publication beneath an active cleanup root.

It does not make a temporary value durable.

### `Author/Executable`

Owns the validated single-executable lifecycle:

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

The rename remains the publication point of no return.

It does not generalize transactional publication for arbitrary multi-file output
sets. Provider command builds must document their own partial-output behavior.

### `Author/CommandCompiler`

Owns only the selected-command source-to-executable pattern shared by Bun and
Deno.

It replaces `Provider.define` and uses an explicit Effectful service
constructor whose requirements appear in the Layer type. It never reflectively
wraps arbitrary service methods.

Esbuild, Node SEA, and host API lanes do not implement this contract.

## Provider contract

Every provider package may expose four kinds of module.

### `Api`

Effect wrappers over an official in-process API.

Rules:

- preserve provider request and result types where practical;
- preserve provider errors and diagnostics;
- state required host runtime;
- Scope owns provider handles;
- do not claim cancellation without a provider cancellation mechanism;
- no automatic fallback to `Command`.

### `Command`

Effect wrappers over one selected executable.

Rules:

- preserve provider CLI configuration and project behavior;
- use core author capabilities where their guarantees apply;
- expose provider-specific request and diagnostic types;
- interruption terminates active child work;
- no automatic fallback to `Api` or another provider.

### `Profile/*`

A provider adapter for one portable role.

Rules:

- the profile name describes its exact semantic result;
- excluded provider capabilities are explicit;
- direct provider APIs remain canonical for provider-specific behavior;
- a provider may not silently ignore profile fields or weaken its lifetime and
  interruption contract.

### `Recipe/*`

Plain Effect composition over services and profiles.

Rules:

- a recipe selects no producer implicitly;
- it imports no sibling producer package;
- application Layers choose the provider;
- it does not create a second execution algebra.

## Provider surfaces

### Bun

#### `effect-build-bun/Api`

```ts
export interface Service {
  readonly build: (
    options: Bun.BuildConfig
  ) => Effect.Effect<Bun.BuildOutput, BunBuildError>
}
```

`Bun.BuildConfig.compile` already exposes Bun executable compilation. 0.4 does
not add a second API-lane `compileExecutable` wrapper until an implementation
probe can state output, cancellation, validation, and publication semantics
without contradicting `Bun.build()`.

The API service requires a Bun host. Its one-shot Promise has no documented
per-build cancel handle. Fiber interruption stops downstream Effect use but may
not stop underlying Bun work or provider direct writes.

#### `effect-build-bun/Command`

```text
build
compileExecutable
compileExecutableMatrix
```

The command lane remains usable under any supported process-capable Effect host.

`compileExecutable` and `compileExecutableMatrix` remain first-class because
they produce Bun-runtime executables. They are not replaced by Node SEA.

A command `build` returns a provider-specific written output set. Unless a
specific operation stages an owned root, it does not claim atomic multi-file
publication.

### Deno

#### `effect-build-deno/Api`

Wraps unstable `Deno.bundle()` under a Deno host. The Layer verifies the API is
present. The operation documents required `--unstable-bundle` and Deno
permissions and preserves the provider result.

The package owns an isolated structural declaration of the exact supported
Deno bundle API if directly referring to global Deno declarations would pollute
other consumers. It must be checked against the pinned official declaration.

#### `effect-build-deno/Command`

```text
bundle
compileExecutable
compileExecutableMatrix
```

The command bundle request includes the selected 0.4 CLI surface, including
declaration output. The compile request remains provider-specific for
permissions, includes, workers, framework/project behavior, runtime acquisition,
engine, arguments, and system target.

A public typed watch operation is added only if Plan 042 establishes a stable
provider event and lifetime contract. Otherwise watch remains an explicitly
documented excluded 0.4 capability, not a raw process escape hatch.

### Esbuild

#### `effect-build-esbuild/Api`

```text
build
transform
scoped context
  rebuild
  watch
  serve
  cancel
```

`build` and `transform` are one-shot. They do not claim cancellation.

`context` returns a scoped Effect wrapper around `esbuild.BuildContext`.
`watch()` starts provider watch state and returns. `serve()` starts the server
and returns `ServeResult`. The context's Scope owns their lifetime. `cancel()`
remains visible because it is an operational provider capability. `dispose()`
is hidden because release belongs to Scope. The finalizer calls `cancel()` and
then `dispose()` exactly once.

No Esbuild command lane is part of 0.4. It would lose plugins and in-process
context capabilities without satisfying a current product requirement.

### Node SEA

#### `effect-build-node-sea/Command`

Node SEA remains a command assembler. Its direct operation accepts:

- a bundled main file or bytes;
- CommonJS or ESM format;
- assets;
- builder Node selection through the Layer;
- optional target/base Node executable;
- snapshots and code cache;
- execution arguments and extension policy;
- output path and optional digest.

Bytes are privately materialized before Node reads them. File input is
canonicalized, privately copied, and rehashed before syntax check and assembly.

The operation validates version and target restrictions. It does not sign the
binary. Signing is a separate platform/provider step.

## Portable profile: `SingleNodeProgram`

The earlier root `NodeProgramBundler` proposal survives as one optional profile:

> Produce one borrowed JavaScript main file, ESM or CommonJS, with Node module
> resolution, no provider-owned side-output graph, and continuation-owned
> lifetime.

Canonical subpath:

```text
effect-build/Profile/SingleNodeProgram
```

Implementations:

```text
effect-build-bun/Profile/SingleNodeProgram
effect-build-esbuild/Profile/SingleNodeProgram
```

The Bun adapter uses the selected-command lane initially, preserving child
termination. The Esbuild adapter uses a scoped context with cancel/dispose.

The profile excludes:

- multiple entrypoints;
- splitting;
- CSS or asset side outputs;
- browser/Bun/Deno targets;
- declarations;
- provider plugins/loaders in the portable request;
- incremental/watch context;
- durable program ownership;
- raw provider options.

Provider defaults may be configured on the provider Layer. Per-call
provider-specific control uses the direct provider API.

### Borrowed authority

The profile returns `SingleNodeProgram.Borrowed`, not an `Artifact`.

It contains metadata and a closure-owned `withFile` capability. The temporary
path is visible only inside the nested callback. Returning the borrowed value
does not extend the producer root; later use fails with a typed expiry error.

The capability carries a protocol version and its own closure-owned authority,
so a compatible duplicate core instance does not depend on finding the value in
its own module-global WeakSet.

This is lifecycle interoperability, not a sandbox against malicious provider
code.

### Failure contract

The portable failure provides:

```text
provider
normalized kind
portable diagnostics
exact in-memory provider error
```

Provider adapters map only identity-proven provider failures. Callback typed
failures, defects, interruptions, and mixed Causes pass through unchanged.
Provider packages export narrowing guards for the exact provider error.

The failure is intentionally an in-memory runtime value, not a serializable
receipt.

## Node SEA recipe

Canonical subpath:

```text
effect-build-node-sea/Recipe/SingleNodeProgram
```

The recipe:

1. asks the core profile service for a borrowed main;
2. passes it to Node SEA direct command assembly;
3. selects no producer;
4. requires the application to provide Bun or Esbuild's profile Layer.

The recipe is convenience composition, not a combined package or hidden
provider selection.

## Names and boundaries

| 0.3 or proposed name | 0.4 decision |
|---|---|
| `compileExecutable` | Keep under Bun/Deno `Command`; provider-specific source-to-runtime-executable verb |
| `compileExecutableMatrix` | Keep under Bun/Deno `Command`; homogeneous orchestration over scalar compilation |
| `withJavaScriptBundle` | Delete; misleading for both full provider output sets and the narrow profile |
| `withSingleNodeProgram` | Keep on direct Bun/Esbuild profile adapters |
| root `NodeProgramBundler` | Do not add; publish `Profile/SingleNodeProgram.Bundler` |
| `NodeProgram.Lease` | Do not add at root; use `SingleNodeProgram.Borrowed` |
| `JavaScriptBundle.Artifact` | Delete; borrowed output is not a durable artifact |
| `Artifact` | Keep for durable observed output only |
| `Integration` | Delete; replace with precise `Author/*` modules |
| `Provider` | Delete; replace with `Author/CommandCompiler` |
| Bun/Deno `Compiler` service | Replace with explicit `Api` and `Command` services |
| `StageObservation` / `stages` | Rename to `BuildStepObservation` / `steps` |
| executable `target` | Rename to `systemTarget` |

## Source and platform abstractions

### No universal `SourceLocator`

Do not add a two-field wrapper around `entrypoint` and `cwd`.

Provider inputs include:

- paths;
- URLs and module specifiers;
- package references;
- project directories;
- stdin or bytes;
- virtual files;
- HTML roots;
- provider plugin values.

A universal wrapper would exclude valid provider authority while adding no
invariant. Provider modules own their requests. Portable profiles own their
narrow requests.

### Effect services own platform mechanics

Use Effect `Path`, `FileSystem`, process, Scope, Layer, Tracer, and logging.

Add a domain type only for a real ownership or authority distinction, such as:

- durable local output path;
- borrowed temporary output;
- in-memory source;
- provider module specifier.

## Observability

Observability has three separate models.

### Runtime execution tracing

Every public operation has one stable root span:

```text
effect-build.<provider>.<lane>.<operation>
```

Examples:

```text
effect-build.bun.api.build
effect-build.bun.command.compile-executable
effect-build.esbuild.api.context.rebuild
effect-build.node-sea.command.create-executable
effect-build.single-node-program.with-program
```

Core author operations create child spans when they represent meaningful
latency or failure boundaries:

```text
effect-build.command.discover
effect-build.command.run
effect-build.temporary-output.acquire
effect-build.executable.inspect
effect-build.executable.publish
```

Stable low-cardinality attributes:

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

Rules:

- omit an attribute when unknown;
- do not attach source path, output path, argv, environment values, URLs, asset
  keys, plugin objects, or full diagnostics by default;
- provider packages may add namespaced low-cardinality attributes;
- typed failures remain authoritative;
- warnings and errors may emit summary log events without logging source or
  secret-bearing provider payloads;
- a context lifetime is represented by setup/release and operation child spans,
  not one unbounded watch span;
- span/log instrumentation must not alter typed values or Cause topology.

The library depends only on Effect observability. Exporters are application
Layers. No direct OpenTelemetry dependency is added.

### Source/dependency graph information

Bun metafiles, Deno bundle output information, Esbuild metafiles, and
Rolldown/Rollup graphs remain provider-native. Their edges, completeness,
generated-runtime records, plugins, assets, and path semantics differ.

0.4 defines no universal graph.

SingleNodeProgram may expose sorted provider-reported external import
observations. The name must state that they are observations, not a complete
dependency graph.

### Durable lineage

`BuildStepObservation`, bytes, digest, provider, and `systemTarget` are
lightweight observations. They are not spans and not provenance.

A durable receipt would require closed input identity, configuration,
environment policy, and toolchain identity. It is outside 0.4.

## Interruption and output ownership

| Operation kind | 0.4 guarantee |
|---|---|
| One-shot host API without provider cancel | Fiber interruption stops awaiting and suppresses downstream Effect use. Underlying provider work or direct writes may continue. |
| Scoped provider context | Scope release invokes provider cancellation/release exactly once. |
| One-shot selected command | Interruption terminates/reaps the child and cleans core-owned staging. |
| Command watch | If exposed, Scope owns the child and release terminates/reaps it. |
| Single-file executable publication | Atomic rename is the durable point of no return. |
| Provider-native multi-output direct write | Provider semantics; no false all-or-nothing claim. |
| Borrowed profile callback | Output root closes after success, failure, defect, or interruption; callback Cause remains exact. |

## Goal-weighted comparison

Scores are 1 (poor) through 5 (strong). A higher complexity score means lower
cost. Excluded provider capabilities count as costs.

| Criterion | Weight | Provider-native only | Narrow Node-program ontology | Native + profiles/recipes | Structural operations | Transformation algebra |
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
| **Weighted total / 235** |  | **186** | **150** | **209** | **170** | **152** |

The selected model has more modules than provider-native-only, but those modules
name real lanes, author authorities, and one validated portable role. The
narrow-profile model appears smaller only because it omits most provider
capability.

## Rejected alternatives

### Provider-native APIs only

This is the strongest rejected alternative.

It has excellent fidelity and lower initial implementation cost. It loses
because Bun and Esbuild have already demonstrated one truthful application-level
substitution contract. Omitting that profile would force reusable application
code to choose a provider even when the program does not depend on
provider-specific behavior.

### Narrow Node-program architecture as the whole product

The profile is valid. The ontology is not. It excludes browser output, Bun
runtime output, Deno bundling and declarations, Esbuild transform and context,
plugins, assets, HTML, CSS, and multi-output builds.

### Universal `ExecutableBuilder`

Semantically invalid. Bun/Deno compile source or projects into runtime-specific
executables. Node SEA consumes one bundled main. `pkg` consumes a project graph.
A union or generic type parameter hides rather than removes the topology.

### Structural protocol as the only generic API

Useful internally but incomplete for Effect application Layer substitution and
weak in discoverability. It also spreads provider errors and requirements
through generic helper signatures.

### General transformation algebra

Rejected because Effect already supplies functions, services, Layers, Scope,
Stream, and `Effect.gen`. A `Transformation<I, O, E, R>` layer duplicates that
algebra and erases domain role names.

### `unstable/*` author namespace

Rejected. The problem is authority naming, not a stability adjective.
`Author/*` states the audience and capability. Pre-1.0 semver governs breaking
changes.

## Hard breaking changes from 0.3

Delete without aliases:

```text
effect-build/Integration
effect-build/Provider
JavaScriptBundle.Artifact
withJavaScriptBundle
ambiguous provider Compiler service names
```

Rename:

```text
StageObservation -> BuildStepObservation
stages           -> steps
target           -> systemTarget (for native system target)
AbsolutePath     -> Artifact.LocalPath (observed durable outputs only)
```

Move:

```text
Bun.compileExecutable       -> effect-build-bun/Command
Bun.compileExecutableMatrix -> effect-build-bun/Command
Deno.compileExecutable      -> effect-build-deno/Command
Deno.compileExecutableMatrix-> effect-build-deno/Command
```

Broaden:

```text
Esbuild -> full Api build/transform/scoped context
Bun     -> Api build plus Command build/compile
Deno    -> Api bundle plus Command bundle/compile
Node SEA-> direct file/bytes main plus full supported SEA config
```

Add:

```text
effect-build/Author/*
Profile/SingleNodeProgram
Bun and Esbuild profile Layers
Node SEA SingleNodeProgram recipe
native Effect observability
```

No 0.3 compatibility aliases ship in 0.4.

## Implementation dependency graph

```text
Plan 039: core Author/* capabilities and observability
  |\
  | +--> Plan 040: Esbuild Api
  | +--> Plan 041: Bun Api + Command
  | +--> Plan 042: Deno Api + Command
  |
  +----> Plan 043: Node SEA Command + SingleNodeProgram profile/recipe
           depends on 040 and 041, not 042

Plans 039-043
  -> Plan 044: hard cut and certify unpublished 0.4 candidate
```

Plans 040, 041, and 042 may proceed in parallel after Plan 039. Plan 043 does
not depend on Deno because Deno does not implement the profile.

## Verification policy

Every advertised capability receives a non-skipping test at its real host/tool
boundary.

Required classes:

- exact declaration/runtime export locks;
- Node-host command consumers;
- Bun-host API consumers;
- Deno-host API consumers with unstable flag and permissions;
- real Esbuild build/transform/context;
- provider plugins, multi-entry, multi-output, CSS/assets, and declarations
  where advertised;
- context and watch Scope release;
- API interruption tests that do not claim provider cancellation;
- command interruption/reaping;
- executable target inspection and publication on supported platforms;
- unchanged portable profile program under Bun and Esbuild Layers;
- exact callback failure/defect/interruption Cause;
- packed isolated and composed consumers from once-packed bytes.

No check may claim local execution unless it actually ran.

## Empirical gates

Architecture conclusions are not deferred, but implementation must stop on
these named facts:

1. **Bun API compile observation.** Determine whether a high-level
   `Artifact.Executable` API wrapper can add truthful validation/publication.
   It is not required for 0.4.
2. **Deno API isolation.** Prove types and runtime behavior without polluting
   unrelated consumers. Failure requires explicit maintainer choice to amend
   the 0.4 surface or defer the entire cut.
3. **Command watch contracts.** Publish Bun/Deno watch only if a stable event and
   Scope contract is demonstrated.
4. **Multi-output interruption.** Document provider partial-write behavior; do
   not infer transactionality.
5. **Duplicate core.** Prove closure-owned borrowed authority across compatible
   duplicate core copies.
6. **Node SEA cross-platform.** Prove builder/base Node version and cache/snapshot
   constraints for every advertised cross target.
7. **Telemetry.** Assert stable spans/attributes/log summaries using the
   supported Effect version range.

## Maintainer authority required

Only these decisions remain outside the research conclusion:

1. Approval to make the pre-1.0 0.4 hard cut with no compatibility aliases.
2. If Plan 042's Deno API gate fails, choice between:
   - amend 0.4 to omit `effect-build-deno/Api`; or
   - delay the complete 0.4 cut until it can be supported.
3. Approval of any provider dependency/version expansion discovered by the
   implementation probes.
4. Separate authorization to publish, tag, or release after Plan 044 certifies
   an unpublished candidate.

No publication, tag, release, trusted-publisher, or branch-protection mutation
is authorized by this architecture PR.
