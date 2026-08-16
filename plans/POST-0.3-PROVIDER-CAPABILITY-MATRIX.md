# Post-0.3 provider capability matrix

Status: architecture evidence for the post-0.3 public API decision. This file
changes no production API.

Repository baseline:

- released source: `v0.3.0` at
  `f06f96ca88b6278e5f23a898d758b99fa9322108`;
- release-line base: `codex/granular-integration-program` at
  `15c811bb9904142a33d119766b62082f3c689f13`;
- research branch: `codex/post-0.3-native-capability-architecture`;
- the default `main` branch is stale relative to the released source and is not
  an implementation base.

## Evidence labels

This report keeps five kinds of statement separate:

- **Upstream**: documented or declared by an official provider repository at
  the exact ref in the evidence index.
- **Repository**: demonstrated by released `effect-build` source or tests.
- **Inference**: an architecture conclusion derived from those facts.
- **Probe**: a fact that must be established by a later implementation
  experiment.
- **Decision**: the selected product contract.

A provider capability is not considered portable merely because two tools use
similar option names. Portability requires the same input authority, output
topology, lifetime, target meaning, failure boundary, and interruption contract.

## Independent axes

Every public API keeps these choices independent:

1. **Effect orchestrator host**: the runtime executing the Effect program.
2. **Selected build tool**: Bun, Deno, Esbuild, Node, or another integration.
3. **Produced runtime or deployment target**: browser, Node, Bun, Deno, or a
   native system.
4. **Integration lane**: in-process provider API or selected command.

Calling `Bun.build()` requires a Bun host. Invoking a selected Bun executable
through Effect process services does not. The same distinction applies to
`Deno.bundle()` versus `deno bundle`. Esbuild's Node API can run under a Node
host, while its browser/WASM API has different initialization and context
support. Importing a provider package never chooses the Effect host by itself.

## Lane contract

### Host API lane

A host API lane calls the provider's JavaScript or TypeScript API in the current
process.

It preserves:

- provider option and result objects;
- callbacks, plugins, loaders, virtual inputs, and in-memory outputs;
- structured diagnostics;
- long-lived provider handles where the provider exposes them.

It also inherits provider constraints:

- the orchestrator host may be fixed;
- a one-shot Promise may have no per-operation cancellation handle;
- direct writes may continue after an Effect fiber stops awaiting;
- process-global or native resources require explicit Scope ownership.

A host API lane must never silently fall back to a command.

### Selected-command lane

A command lane discovers or accepts one exact executable, probes it, and invokes
it through Effect process services.

It provides:

- orchestrator-host independence;
- scoped child interruption and reaping;
- bounded stdout and stderr;
- explicit environment and working-directory policy;
- core-owned staging and atomic publication where the output topology supports
  that guarantee.

It is limited to CLI-representable behavior. Provider callbacks, plugin
functions, virtual file maps, and rich in-memory values are not reconstructed
from argv. A command lane must never silently fall back to a host API.

### Same provider, different semantics

An API lane and a command lane are not implementations of one service merely
because they select the same tool. They may differ in:

- request and result types;
- cancellation;
- output ownership;
- plugin and callback support;
- diagnostics;
- host portability;
- direct-write behavior.

The product names the lanes instead of hiding those differences.

## Transformation topology

| Operation | Input authority | Output topology | Lifetime | Runtime contract |
|---|---|---|---|---|
| Bun API build | Filesystem entries and/or virtual files plus `Bun.BuildConfig` | `Bun.BuildOutput` containing one or many provider output artifacts and logs | Provider values; written files follow Bun behavior | Browser, Bun, or Node target selected by Bun |
| Bun command build | Filesystem entries plus CLI-representable options | One or many written files and optional provider metadata | Durable provider-written files; interruption may leave provider-written partial output unless the operation stages an owned root | Browser, Bun, or Node target selected by Bun |
| Bun API/command compile | Source entry plus Bun compile configuration | One Bun-runtime executable | Durable file | Bun runtime, Bun and Node built-ins, Bun version/CPU/libc/system target |
| Deno API bundle | Module specifiers plus unstable `Deno.bundle.Options` and Deno permission context | In-memory or written JS/CSS/HTML/asset outputs | Provider values or written files | Browser or Deno bundle platform |
| Deno command bundle | Local, URL, package, or HTML entries plus CLI/workspace configuration | One or many written outputs; optional declaration files | Durable provider-written files; watch is a long-lived command | Browser or Deno platform |
| Deno command compile | Module specifier or project directory plus permissions/includes/runtime/engine/target policy | One Deno-runtime executable with embedded or self-extracting filesystem behavior | Durable file | Deno runtime and selected engine/runtime binary |
| Esbuild API build | Filesystem or stdin input, plugins/loaders, one or many entries | In-memory or written output set plus warnings/errors and optional metafile | Provider values or written files | Browser, Node, or neutral platform |
| Esbuild API transform | One in-memory source value | One code/map result plus warnings | Value | No module graph |
| Esbuild API context | Full build options | Rebuild results; optional watch and serve state | Scoped provider context | Node API only for `context()` |
| Node SEA command | One already-bundled CommonJS or ESM main, assets, selected Node binaries and SEA config | One Node executable | Durable file | Node runtime and selected native system target |
| Rolldown build | Rollup-compatible input and plugins | Reusable build object that can generate or write multiple output configurations | Scoped `RolldownBuild`; explicit `close()` | Provider output formats and plugin semantics |
| `@yao-pkg/pkg` | Node project/package graph, assets, native addons, config, target set | One or many Node executables, traditional or SEA mode | Provider process/cache/temp lifecycle | Node executable with provider snapshot/filesystem semantics |

## Capability matrix

`Yes` means the upstream operation exposes the capability. `Profile` means
released `effect-build` deliberately exposes a narrower operation. `No` means
the operation does not represent the capability. `Probe` means the upstream
surface exists but the 0.4 wrapper contract needs an implementation experiment.

| Capability | Bun API build | Bun command | Deno API bundle | Deno command bundle | Deno compile | Esbuild API | Node SEA | Rolldown | `@yao-pkg/pkg` |
|---|---|---|---|---|---|---|---|---|---|
| Single entry | Yes | Yes | Yes | Yes | Yes | Yes | One pre-bundled main | Yes | Yes/project |
| Multiple entries | Yes | Yes | Yes | Yes | No single executable | Yes | No | Yes | Project-dependent |
| Multiple outputs | Yes | Yes | Yes | Yes | One executable | Yes | One executable | Yes | One per target/mode |
| Browser target | Yes | Yes | Yes | Yes | No | Yes | No | Yes | No |
| Bun target/runtime | Yes | Yes | No | No | No | No | No | No | No |
| Deno target/runtime | No | No | Yes | Yes | Yes | No dedicated Deno platform | No | Plugin/provider-dependent | No |
| Node target/runtime | Node build target | Node build target | No dedicated Node platform | No dedicated Node platform | Node compatibility under Deno where supported | Node platform | Yes | Yes | Yes |
| JS/TS/JSX/TSX | Yes | Yes | Yes | Yes | Yes | Yes | Main is already JavaScript | Yes | Node project |
| HTML | Yes | Yes | Yes | Yes | Framework/project behavior | Loader/plugin-dependent | Asset only | Plugin-dependent | Project/asset-dependent |
| CSS/assets | Yes | Yes | Yes | Yes | Includes/framework output | Yes | Explicit assets only | Yes | Yes |
| Type declarations | No | No | No runtime API option | **Yes, `--declaration`** | No general declaration product | No | No | Plugin ecosystem, not core | No |
| Plugins/loaders | Yes | CLI subset; no JS callbacks | No plugin callback surface in the unstable API | Deno/provider CLI behavior | Framework scripts/config | Yes | No source plugins | Yes, Rollup-compatible | Provider hooks/config |
| Splitting | Yes | Yes | Yes | Yes | Internal executable graph | Yes | No | Yes | Mode-dependent |
| In-memory output | Yes | No rich CLI value | Yes with `write: false` | stdout/specific command modes, otherwise written | No | Yes with `write: false`; transform is memory-first | Bytes can be privately materialized, but Node reads a file | Yes with `generate()` | No common value result |
| Written output | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes with `write()` | Yes |
| Watch/incremental | CLI watch; no documented BuildContext-style API | Long-lived `--watch` command | One-shot Promise | Long-lived `--watch` command | Long-lived command modes | `BuildContext.rebuild/watch/serve` | No | Reusable build and watch APIs | No shared incremental API |
| Native executable | Bun compile mode | `--compile` | No | No | Yes | No | Yes | No | Yes |
| Cross-target executable | Bun target/version/CPU/libc policy | Same | N/A | N/A | Deno target/runtime/engine policy | N/A | By selecting a compatible target Node binary; cache/snapshot restrictions apply | N/A | Yes |
| Structured diagnostics | `BuildOutput.logs` and provider values | Command output plus optional metadata | `errors`, `warnings`, output records | CLI diagnostics | CLI diagnostics | IDs, plugin names, locations, notes, details | CLI diagnostics | Provider errors/logs | Provider errors |
| Graph/dependency metadata | Metafile/output records | Metafile where requested | Output records, not a universal graph | Provider output/CLI evidence | Internal compile graph | Metafile input/output edges | No source graph | Rollup-compatible graph/output metadata | Project traversal/provider metadata |
| Per-operation cancel | No documented build cancel handle | Child termination | No public cancel handle | Child termination | Child termination | One-shot build/transform: no handle; context: `cancel()` | Child termination | Close/dispose; watch has provider lifecycle | Provider-specific |
| Required host | Bun | Any process-capable Effect host plus Bun binary | Deno with `--unstable-bundle` and permissions | Any process-capable Effect host plus Deno binary | Same | Supported Esbuild JS host; `context()` is Node-only | Any process-capable Effect host plus suitable Node binary | Supported Node/native binding host | Node/tool-specific |

## Provider conclusions

### Bun

**Upstream.** `Bun.build()` is a broad build API: multiple and virtual entries,
browser/Bun/Node targets, HTML, CSS, assets, plugins, loaders, splitting, output
objects, logs, and compile mode. Bun executable compilation embeds the Bun
runtime and supports Bun and Node built-ins. Cross-target tokens encode system,
architecture, libc, Bun version compatibility, and CPU baseline/modern
semantics.

**Repository.** 0.3 exposes a selected-command source-to-Bun-executable
operation and a fixed command-backed one-file Node-resolution profile.

**Decision.**

- Ship both `effect-build-bun/Api` and `effect-build-bun/Command`.
- `Api.build` is the provider-native operation and includes Bun compile mode
  through `Bun.BuildConfig`.
- Keep command `compileExecutable` and `compileExecutableMatrix` as
  provider-specific durable-executable conveniences.
- Do not replace Bun compile with Bun-to-Node-program-to-Node-SEA. The former
  produces a Bun-runtime executable; the latter produces a Node-runtime
  executable.
- The portable SingleNodeProgram adapter uses the command lane initially,
  because that lane can satisfy the profile's child-termination contract.

**Probe.** Determine exactly what `Bun.build({ compile })` reports in
`BuildOutput`, when bytes are written, and whether a core-owned durable
`Artifact.Executable` wrapper can be added without claiming cancellation or
atomic publication that the native API does not provide. The 0.4 architecture
does not require such a wrapper: `Api.build` already exposes compile mode.

### Deno

**Upstream.** `Deno.bundle()` is an experimental API requiring
`--unstable-bundle` and Deno read/import/write permissions. It supports multiple
entries, browser/Deno platforms, ESM/CJS/IIFE, splitting, package handling,
externals, source maps, and in-memory or written outputs. It is unavailable in
`deno compile` binaries because `denort` installs the no-op bundle provider.
`deno bundle` additionally exposes HTML roots, watch mode, and
`--declaration`. `deno compile` owns permissions, includes, workers, dynamic
imports, project/framework detection, engine/runtime selection, target-runtime
acquisition, and native targets.

**Repository.** 0.3 exposes only a selected-command compile subset.

**Decision.**

- `effect-build-deno/Command` is mandatory for 0.4 and exposes command bundle,
  scalar compile, and homogeneous compile matrices.
- `effect-build-deno/Api` is also the target 0.4 surface, but Plan 042 has a
  hard type-isolation and runtime gate. Failure of that gate stops the 0.4 API
  cut for maintainer decision; it does not permit a command-backed fake API.
- Deno does not implement SingleNodeProgram merely for symmetry.

**Probe.**

1. Prove a declaration strategy for `Deno.bundle.Options` and
   `Deno.bundle.Result` that does not require unrelated Node/Bun consumers to
   install global Deno libs.
2. Characterize the exact rejection type for permission denial, missing
   `--unstable-bundle`, and compiled-binary unavailability.
3. Characterize `deno bundle --watch` output before publishing a typed watcher.
   If no stable event contract exists, 0.4 documents watch as unsupported by
   the wrapper instead of exposing a raw process.

### Esbuild

**Upstream.** Esbuild separates:

1. `build()` over a module graph and output set;
2. `transform()` over one in-memory source;
3. `context()` as a Node-only scoped handle with `rebuild()`, `watch()`,
   `serve()`, `cancel()`, and `dispose()`.

`watch()` starts watch state and returns; it is not itself the long-running
Effect. `serve()` starts a server and returns provider data. The context remains
the resource whose Scope must be closed.

**Repository.** 0.3 exposes only one fixed Esbuild-to-single-Node-program
profile, but it already uses a scoped context and proves cancel/dispose cleanup.

**Decision.**

- Ship `effect-build-esbuild/Api` with distinct `build`, `transform`, and
  scoped `context` operations.
- Expose `cancel` on the scoped context because it is a provider operation;
  hide `dispose` because Effect Scope owns final release.
- The finalizer calls `cancel()` and then `dispose()` exactly once.
- Keep plugins, loaders, output files, metafiles, and diagnostics provider
  native.
- Add SingleNodeProgram as an adapter, not as Esbuild's primary API.
- Do not add an Esbuild CLI lane in 0.4; it would omit the provider's most
  important callback and context capabilities without adding a current
  product requirement.

### Node SEA

**Upstream.** Node SEA consumes one already-bundled CommonJS or ESM main and
optional assets. The selected Node configuration controls the base executable,
output, code cache, snapshots, runtime arguments, and argument-extension policy.
The Node version used to generate the blob must match the injected executable.
Cross-platform generation requires code cache and snapshots to be disabled.
Signing remains a separate platform concern.

**Repository.** 0.3 consumes the live core bundle, privately copies and rehashes
it, checks syntax with the selected Node, validates builtin externals, and
publishes one inspected executable.

**Decision.**

- Keep Node SEA as a command assembler, not a source compiler.
- Broaden its direct input to a file or bytes plus explicit module format.
- Keep selected build-Node and target/base-Node authority visible.
- Keep signing outside core and outside the initial command result.
- Add a provider-neutral recipe over SingleNodeProgram; the recipe selects no
  producer.

### Future bundler: Rolldown

**Upstream.** `RolldownBuild` can generate or write multiple output
configurations and must be closed even when generation fails. It supports async
disposal and provider plugin semantics.

**Inference.** A Rolldown integration should expose its direct scoped build
object first. It may additionally implement SingleNodeProgram by constraining
input and output, but that profile cannot replace its direct API.

### Future assembler/compiler: `@yao-pkg/pkg`

**Upstream.** `pkg` consumes a project/package graph, assets, native addons,
runtime and target configuration, and supports traditional and SEA modes.

**Inference.** Sharing the output kind "executable" with Bun, Deno, or Node SEA
does not create one truthful `ExecutableBuilder`. The input authority and
runtime contract remain provider-specific.

## Host API versus command tradeoff table

| Question | Host API | Command |
|---|---|---|
| Orchestrator portability | Often restricted | Process-capable Effect hosts |
| Plugins/callbacks | Preserved | Usually unavailable without helper protocol |
| In-memory values | Preserved | Usually serialized or written |
| Structured diagnostics | Usually strongest | Depends on CLI metadata |
| One-shot cancellation | Only if provider supplies a handle | Child can be terminated |
| Long-lived resources | Provider handle must be scoped | Child process must be scoped |
| Output ownership | Provider behavior; direct writes may be partial | Can stage simple file outputs; output-set atomicity is provider-specific |
| Tool identity | In-process package/runtime version | Selected path plus probe |
| Fallback | Forbidden | Forbidden |

## Transformation conclusions

- Source -> Bun executable remains first-class and complements Node SEA.
- Source -> Deno executable remains first-class.
- Source -> provider-native output set is not one shared result type.
- Source -> SingleNodeProgram is a truthful portable profile for Bun and
  Esbuild only under its exact restrictions.
- SingleNodeProgram -> Node SEA executable is a recipe over an assembler.
- Source -> incremental context is provider-specific because resource and event
  semantics differ.
- A universal `ExecutableBuilder` is semantically invalid.
- A generic transformation algebra is unnecessary because Effect functions,
  services, Layers, Scope, and `Effect.gen` already compose operations.

## Name audit

| Name | Classification | 0.4 decision |
|---|---|---|
| `compileExecutable` | Provider-specific command convenience | Keep under Bun/Deno `Command` |
| `compileExecutableMatrix` | Homogeneous-provider orchestration | Keep under Bun/Deno `Command`; scalar remains primitive |
| `withJavaScriptBundle` | Misleading narrow portable profile name | Remove; direct adapters use `withSingleNodeProgram` |
| `NodeProgramBundler` | Semantically valid but too broad as root ontology | Replace with `Profile/SingleNodeProgram.Bundler` |
| `NodeProgram.Lease` | Correct lifetime direction but overbroad root name | Use `SingleNodeProgram.Borrowed` |
| `Artifact` | Durable output observation | Keep; never use for borrowed or live contexts |
| `Integration` | Mixed implementation authorities | Remove |
| `Provider` | Command compiler author factory with an overbroad name | Replace with `Author/CommandCompiler` |
| `Compiler` service | Ambiguous when a package has API and command lanes | Replace with explicit `BunCommand`, `DenoCommand`, etc. |

## Source and path decisions

Do not add a universal `SourceLocator`. An `entrypoint` plus `cwd` wrapper adds
no authority or invariant and excludes URLs, package references, project
directories, stdin, virtual files, HTML roots, and plugin-provided modules.

Provider-native requests own their source inputs. Portable profiles own their
restricted requests.

Use Effect `Path`, `FileSystem`, process, Scope, Layer, tracing, and logging for
platform mechanics. Add a domain type only when it captures a real distinction,
such as:

- provider module specifier versus filesystem path;
- virtual or in-memory source;
- borrowed versus durable output;
- a canonical local path observed by a specific host implementation.

`Artifact.LocalPath` means only "canonical absolute path observed by the active
Path/FileSystem implementation." It is not a remote identity, portable plan
coordinate, or proof that a decoded path exists. 0.4 should expose constructor
functions and avoid a universal decoding Schema unless the Schema's weaker
syntax-only meaning is explicit.

## Empirical gates retained for implementation

The architecture is selected. These facts still require executable probes:

1. Bun API compile output and write timing.
2. Deno API type isolation and exact unstable/permission/compiled-binary
   failures.
3. Bun and Deno command-watch event contracts.
4. Provider-written multi-output behavior under interruption.
5. Same-version duplicate-core interoperability for a closure-owned borrowed
   program capability.
6. Cross-platform Node SEA generation with separate builder and base Node
   binaries.
7. Effect span/log assertions under the supported Effect version range.

A failed probe stops or narrows the affected lane. It does not justify silently
substituting another lane.

## Evidence index

### Repository

- [`v0.3.0` public API lock](https://github.com/mannyc2/effect-build/blob/f06f96ca88b6278e5f23a898d758b99fa9322108/tooling/public-api.json)
- [Bun profile implementation](https://github.com/mannyc2/effect-build/blob/f06f96ca88b6278e5f23a898d758b99fa9322108/packages/effect-build-bun/src/Bundle.ts)
- [Esbuild profile implementation](https://github.com/mannyc2/effect-build/blob/f06f96ca88b6278e5f23a898d758b99fa9322108/packages/effect-build-esbuild/src/internal/Esbuild.ts)
- [Node SEA implementation](https://github.com/mannyc2/effect-build/blob/f06f96ca88b6278e5f23a898d758b99fa9322108/packages/effect-build-node-sea/src/internal/NodeSea.ts)
- [Bun -> Node SEA tests](https://github.com/mannyc2/effect-build/blob/f06f96ca88b6278e5f23a898d758b99fa9322108/test/unit/bun-node-sea-pipeline.test.ts)
- [Esbuild -> Node SEA tests](https://github.com/mannyc2/effect-build/blob/f06f96ca88b6278e5f23a898d758b99fa9322108/test/unit/esbuild-node-sea-pipeline.test.ts)
- [Plan 038 historical substitution receipt](https://github.com/mannyc2/effect-build/blob/15c811bb9904142a33d119766b62082f3c689f13/plans/038-evaluate-generic-build-services.md)

### Official upstream

- Effect main at [`ee06c9c`](https://github.com/Effect-TS/effect/tree/ee06c9c1eed73ebcf282541ceb1615ff1ba1730d)
- Effect portable [`FileSystem`](https://github.com/Effect-TS/effect/blob/ee06c9c1eed73ebcf282541ceb1615ff1ba1730d/packages/effect/src/FileSystem.ts)
- Effect native OTLP adapter supplied by application Layer:
  [`OtlpTracer`](https://github.com/Effect-TS/effect/blob/ee06c9c1eed73ebcf282541ceb1615ff1ba1730d/packages/effect/src/unstable/observability/OtlpTracer.ts)
- Bun main at [`75fad5b`](https://github.com/oven-sh/bun/tree/75fad5b142d5bb73f985ffe745d718acc874a85c)
- Bun [`BuildConfig` and compile declarations](https://github.com/oven-sh/bun/blob/75fad5b142d5bb73f985ffe745d718acc874a85c/packages/bun-types/bun.d.ts)
- Bun [bundler documentation](https://github.com/oven-sh/bun/blob/75fad5b142d5bb73f985ffe745d718acc874a85c/docs/bundler/index.mdx)
- Bun [executable documentation](https://github.com/oven-sh/bun/blob/75fad5b142d5bb73f985ffe745d718acc874a85c/docs/bundler/executables.mdx)
- Deno main at [`89f33cb`](https://github.com/denoland/deno/tree/89f33cbef296a2b287f323d42de54c871fa69c77)
- Deno unstable [`Deno.bundle` declarations](https://github.com/denoland/deno/blob/89f33cbef296a2b287f323d42de54c871fa69c77/cli/tsc/dts/lib.deno.unstable.d.ts)
- Deno [`BundleProvider` and compiled-binary behavior](https://github.com/denoland/deno/blob/89f33cbef296a2b287f323d42de54c871fa69c77/ext/bundle/src/lib.rs)
- Deno [bundle CLI and declaration documentation](https://github.com/denoland/docs/blob/aa772cfbe4455e2a3ef86e9f4df584d41523c0f9/runtime/reference/bundling.md)
- Deno [compile documentation](https://github.com/denoland/docs/blob/aa772cfbe4455e2a3ef86e9f4df584d41523c0f9/runtime/reference/cli/compile.md)
- Esbuild [`BuildContext` and API declarations](https://github.com/evanw/esbuild/blob/f6058f8364fe7ab91ca57a83e02577ed74c9cae4/lib/shared/types.ts)
- Node SEA documentation at [`04a0c27`](https://github.com/nodejs/node/blob/04a0c270bea9903d823fdc21c6ae3b0ccbe302fa/doc/api/single-executable-applications.md)
- Rolldown [`RolldownBuild`](https://github.com/rolldown/rolldown/blob/f34f3289548e418e548726557e96dda4faf27174/packages/rolldown/src/api/rolldown/rolldown-build.ts)
- `@yao-pkg/pkg` at [`8d3d7af`](https://github.com/yao-pkg/pkg/tree/8d3d7af9fe9cbb02ec60c78c4c71de343e259c0a)
