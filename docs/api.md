# API

The authoritative scope is `effect-build/research-complete-contract@1` in
[`tooling/research-complete-contract.json`](../tooling/research-complete-contract.json).
The generated candidate export snapshot is
[`tooling/public-api.json`](../tooling/public-api.json).

This is a hard cut. There are no compatibility aliases, provider registries,
automatic provider selection, raw-argv public operations, retries, or automatic
tool installation.

## Admission policy

Research dispositions determine publication:

- `mandatory` and `positive-proof-gated` rows with a selected export are public
  candidate operations;
- `conditional-gate` rows are fully implemented and tested package-private
  candidates until every part of their named gate is closed;
- `rejected` and `superseded-direct-sea` rows have no public implementation.

An open evidence gate blocks certification and release. It does not make an
implemented positive selection disappear, and implementation alone never
closes the gate.

## Core

`effect-build` has exactly six public subpaths:

| Subpath                              | Owner                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `effect-build/Artifact`              | Absolute paths, hashed or unhashed file/executable observations, runtime format and architecture observations |
| `effect-build/SystemTarget`          | Closed OS/architecture/ABI target vocabulary and descriptions                                                 |
| `effect-build/Matrix`                | Provider-neutral deterministic cell fan-out and aggregate reports                                             |
| `effect-build/Author/Tool`           | Exact executable selection, capability observation, admission, and content reauthentication                   |
| `effect-build/Author/BorrowedOutput` | Scoped hashed or unhashed file/tree leases with cleanup reporting                                             |
| `effect-build/Author/Executable`     | Private candidate staging, executable inspection, and atomic single-file replacement                          |

All six are also re-exported as root namespaces.

The hard cut removes `BuildError`, `Target`, `Generation`, `DurableFile`,
`BorrowedContent`, `TreeSnapshot`, and `StaticBrowserApplication`. Durable-file
publication may exist internally, but it is not public authority.

### Package-private profile candidates

The private `Author/NodeMain.assemble` candidate asks the assembler for an offer before invoking the
producer. The core validates the offer, produced protocol, provider identity,
format, and content identity. `acquire` exposes the main only inside its scoped
continuation; the sealed value has no recoverable public transport path.

### Browser module payload

The private `Profile/BrowserModulePayload.withPayload` candidate validates explicit entries and
provider-declared files, roles, media types, associations, and internal/external
edges against a hashed borrowed tree. `IncrementalNodeMain` and the typed-watch
protocol are likewise implemented and tested privately. None is a package
export until its complete provider, lifecycle, browser, resource, and five-host
gate is earned.

## Provider lanes

An `Api` lane calls a provider's in-process host API. A `Command` lane owns an
authenticated exact-version executable and uses the official Effect process
service. Command stdout/stderr capture is bounded, the selected tool is
reauthenticated immediately before invocation, and lifecycle behavior remains
operation-specific.

Provider package manifests expose only `.`, `./Api`, and/or `./Command` as
selected below. Operation modules are namespaces inside those lanes. The former
provider `Build`, `Bundle`, `CompileExecutable`, `Context`, `Profile`, `Raw`, and
`Watch` package subpaths are absent.

### Bun 1.3.14

```ts
import * as BunApi from "effect-build-bun/Api";
import * as BunCommand from "effect-build-bun/Command";
```

| Lane module                 | Public operations                                           |
| --------------------------- | ----------------------------------------------------------- |
| `Api.Transpiler`            | `make`, `transform`, `transformSync`, `scan`, `scanImports` |
| `Api.Build`                 | `build`, `buildToDirectory`                                 |
| `Api.CompileExecutable`     | `compileExecutableDirect`                                   |
| `Command.Build`             | `build`, `buildToDirectory`                                 |
| `Command.Watch`             | `watch`                                                     |
| `Command.CompileExecutable` | `compileExecutable`                                         |

`BunApi.layer` supplies the exact Bun host capabilities. `BunCommand.layer`
selects and authenticates the executable. The host API and command operations
remain different semantic owners even where their native names overlap.

### Deno 2.9.5

```ts
import * as DenoCommand from "effect-build-deno/Command";
```

| Lane module                 | Public operations                                       |
| --------------------------- | ------------------------------------------------------- |
| `Command.Transpile`         | `transpile`, `transpileToDirectory`, `emitDeclarations` |
| `Command.CompileExecutable` | `compileExecutable`                                     |

No Deno `./Api` export exists: M8 forbids an empty or synthetic twin. API
bundle, command bundle, and compile-watch implementations remain package-private
conditional candidates. Deno declaration emission is
the provider's transpile/tsc-backed operation, not a bundle declaration roll-up.

### esbuild 0.28.2

```ts
import * as EsbuildApi from "effect-build-esbuild/Api";
import * as EsbuildCommand from "effect-build-esbuild/Command";
```

| Lane module                | Public operations  |
| -------------------------- | ------------------ |
| `Api.Build`                | `build`            |
| `Api.BuildToDirectory`     | `buildToDirectory` |
| `Api.Transform`            | `transform`        |
| `Api.AnalyzeMetafile`      | `analyzeMetafile`  |
| `Api.FormatMessages`       | `formatMessages`   |
| `Api.Context`              | `make`             |
| `Api.ContextToDirectory`   | `make`             |
| `Command.Build`            | `build`            |
| `Command.BuildToDirectory` | `buildToDirectory` |
| `Command.Watch`            | `watch`            |

Context owners are scoped and drain active work before one close. Command serve
is implemented package-private; its conditional gate has not admitted an
export. The rejected synchronous and shared-service controls are absent.

### Node SEA

```ts
import * as NodeSeaCommand from "effect-build-node-sea/Command";
```

`Command.AssembleExecutable.assembleDirect` is the sole public Node SEA
operation. It accepts CommonJS or ESM file/byte mains and file-backed assets,
then delegates single-file publication to `Author/Executable`. It deliberately
has no public target assertion, snapshot, code-cache, injector, or raw-argv
field. The admitted default is the exact Node 26.7.0 `linux-x64-gnu` direct SEA
cell with a same-version builder/base relation. The explicit untested-version
layer override is local experimentation, never portable evidence.

Cross-target construction belongs to the private authenticated repository
finalizer matrix and does not widen this public operation. Its exact coordinate
count is generated from the five construction hosts rather than documented as
an inherited constant.

### Rolldown 1.2.5

`effect-build-rolldown` is a private package because R6 did not admit it; it has
no public lane roots. Its API build/watch/transform/parse/minify/resolve/scan/dev-engine/
declaration/config modules and command bundle/bundle-to-directory/watch modules
are implemented and tested package-private candidates. Every R1 Rolldown row is
conditional, so exposing any one of them before its complete named gate closes
would be a false promotion.

## Publication and interruption

In-memory results remain caller-owned values. Scoped contexts and watchers own
one close. Provider-direct directory operations truthfully report direct durable
publication: failure or interruption may leave partial files, caches, or mixed
destinations. They do not claim atomic rollback.

`Author/Executable.publish` is the separate single-file authority. It creates a
same-parent private candidate, checks that candidate, inspects native format and
architecture, optionally hashes it, and atomically replaces the destination.

Interruption remains an Effect Cause event; it is not translated into a typed
provider error. A native host callback that exposes no cancellation primitive
may stop being awaited without claiming native work was cancelled. Command
operations close their scoped child process. Broader descendant-tree guarantees
are claimed only by the schema-bound private workflow that proves them.

## Apple distribution

`effect-build-apple` remains a separate direct Developer ID family with exactly
nine public modules: `Artifact`, `CodeSign`, `AppBundle`, `Zip`, `DiskImage`,
`InstallerPackage`, `Notary`, `Staple`, and `Assess`. It is not a provider
profile, generic deployer, Mac App Store API, or universal-binary constructor.

Its local implementation and tool tests do not earn credential-backed signing,
notarization, stapling, Gatekeeper, or clean-host evidence. Consult
[Apple distribution](apple-distribution.md) and the canonical contract for the
open A and G gates.

## Matrix composition

Portable fan-out is ordinary Effect composition through `effect-build/Matrix`.
A consumer supplies a cell evaluator and explicit provider layer; the core has
no provider registry or provider-name branch. Executed, digest-bound receipts,
not workflow topology or a local sample, determine whether a matrix gate is
closed.
