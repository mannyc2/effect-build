# Post-0.3 provider capability matrix

Status: final architecture evidence for the post-0.3 public API decision. This
file changes no production API.

Repository baseline:

- released source: `v0.3.0` at
  `f06f96ca88b6278e5f23a898d758b99fa9322108`;
- release-line base: `codex/granular-integration-program` at
  `15c811bb9904142a33d119766b62082f3c689f13`;
- research branch: `codex/post-0.3-native-capability-architecture`;
- stale `main` is not an implementation base.

## Evidence labels

- **Upstream**: official provider documentation or declarations at the exact
  ref in the evidence index.
- **Repository**: released `effect-build` source or tests.
- **Inference**: architecture conclusion derived from those facts.
- **Probe**: a fact that a later implementation must establish empirically.
- **Decision**: selected public contract.

A capability is not portable merely because two providers use similar option
names. Portability requires the same input authority, output topology, target
meaning, lifetime, failure boundary, and interruption contract.

## Independent axes

The API keeps four choices independent:

1. Effect orchestrator host;
2. selected build tool;
3. artifact runtime or deployment target;
4. host API or selected-command lane.

Calling `Bun.build()` requires a Bun host. Invoking a selected Bun binary does
not. Calling unstable `Deno.bundle()` requires a Deno host, flag, and Deno
permissions. Invoking `deno bundle` requires a process-capable Effect host and a
Deno binary. Esbuild's advanced context API is Node-hosted. Importing an
integration never selects the output runtime by itself.

## Lane semantics

### Host API

Preserves provider values, callbacks, plugins, virtual inputs, in-memory
outputs, structured diagnostics, and provider handles. It inherits host and
provider limitations. A one-shot Promise with no cancellation handle must not be
advertised as cancellable merely because the Effect fiber stops awaiting it.

### Selected command

Discovers or accepts one exact executable and invokes it through Effect process
services. It supports host independence, scoped child interruption/reaping,
bounded output, and explicit cwd/environment policy. It only exposes
CLI-representable capability. It never reconstructs plugin callbacks or
silently falls back to a host API.

The two lanes are separate public services even for the same provider.

## Transformation topology

| Operation | Input authority | Output topology | Lifetime and runtime |
|---|---|---|---|
| Bun API build | Filesystem and/or virtual files plus `BuildConfig` | `BuildOutput`: one or many provider output artifacts and logs | Provider values or direct writes; browser, Bun, Node, or Bun executable mode |
| Bun command build | Filesystem entries and CLI options | One or many written files and optional metafile | Durable provider-written set; interruption can leave partial output unless an owned staging root is proved |
| Bun command compile | Source plus Bun compile policy | One Bun-runtime executable | Core-staged durable file; Bun/Node built-ins and Bun target semantics |
| Deno API bundle | Module specifiers plus unstable bundle options and Deno permission authority | In-memory or written JS/CSS/HTML/asset outputs | Provider values/direct writes; browser or Deno platform |
| Deno command bundle | File, URL, package, project, or HTML roots plus CLI/workspace policy | One or many written outputs, optionally declarations | Provider-written set; watch is a long-lived command |
| Deno command compile | Module specifier or project directory plus permissions/includes/runtime policy | One Deno-runtime executable | Durable file with Deno runtime/engine and embedded or self-extracting filesystem behavior |
| Esbuild API build | Filesystem/stdin, plugins/loaders, one or many entries | In-memory or written output set, diagnostics, optional metafile | Provider result or direct writes; browser, Node, or neutral |
| Esbuild API transform | One in-memory source | One code/map result and warnings | Value; no module graph |
| Esbuild API context | Full build options | Rebuild results plus watch/serve state | Scoped provider context with cancel/dispose |
| Node SEA command | One already-bundled CJS/ESM main, assets, builder/base Node configuration | One Node executable | Core-staged durable file; Node runtime and native system target |
| Rolldown build | Rollup-compatible inputs/plugins | Reusable build object generating/writing multiple configurations | Scoped provider build object with explicit close |
| `@yao-pkg/pkg` | Node project/package graph, assets, native addons, config, targets | One or many Node executables | Provider cache/temp/process lifecycle and snapshot filesystem semantics |

## Capability matrix

`Yes` means upstream support. `Profile` means a deliberate `effect-build`
restriction. `Probe` means the upstream surface exists but the wrapper contract
still needs executable evidence.

| Capability | Bun API | Bun command | Deno API bundle | Deno command bundle | Deno compile | Esbuild API | Node SEA | Rolldown | `pkg` |
|---|---|---|---|---|---|---|---|---|---|
| Multiple entries | Yes | Yes | Yes | Yes | No single binary | Yes | No | Yes | Project-defined |
| Multiple outputs | Yes | Yes | Yes | Yes | One executable | Yes | One executable | Yes | Per target/mode |
| Browser target | Yes | Yes | Yes | Yes | No | Yes | No | Yes | No |
| Bun target/runtime | Yes | Yes | No | No | No | No | No | No | No |
| Deno target/runtime | No | No | Yes | Yes | Yes | No dedicated platform | No | Provider/plugin dependent | No |
| Node target/runtime | Node target | Node target | No dedicated Node platform | No dedicated Node platform | Deno Node compatibility | Node platform | Yes | Yes | Yes |
| JS/TS/JSX/TSX | Yes | Yes | Yes | Yes | Yes | Yes | Main already JS | Yes | Node project |
| HTML/CSS/assets | Yes | Yes | Yes | Yes | Includes/framework behavior | Loaders/plugins | Explicit SEA assets | Plugins/native output | Yes |
| Declarations | No | No | No API option | **Yes, `--declaration`** | No general declaration product | No | No | Plugin ecosystem | No |
| Plugins/loaders | Yes | CLI subset, no JS callbacks | No provider callback surface | Provider CLI/config behavior | Framework scripts/config | Yes | No | Rollup-compatible | Provider hooks/config |
| Splitting | Yes | Yes | Yes | Yes | Internal graph | Yes | No | Yes | Mode-dependent |
| In-memory output | Yes | No rich value | Yes with `write: false` | Limited CLI modes | No | Yes; transform is memory-first | Private materialization only | Yes with `generate()` | No common value |
| Written output | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Watch/incremental | CLI watch; no documented context-like JS handle | Long-lived command | One-shot Promise | Long-lived command | Long-lived command modes | `BuildContext` | No | Build/watch APIs | No common API |
| Native executable | Compile mode | `--compile` | No | No | Yes | No | Yes | No | Yes |
| Cross-target executable | Bun system/version/CPU/libc policy | Same | N/A | N/A | Deno runtime/engine/target policy | N/A | Selected target Node; cache/snapshot limits | N/A | Yes |
| Structured diagnostics | `BuildOutput.logs` | Command output/metafile | Errors/warnings/output records | CLI diagnostics | CLI diagnostics | IDs, plugin, locations, notes, detail | CLI diagnostics | Provider errors/logs | Provider errors |
| Graph metadata | Metafile/output records | Metafile | Output records, not universal graph | Provider output evidence | Internal graph | Metafile input/output edges | No source graph | Rollup graph/output metadata | Project traversal metadata |
| Per-operation cancel | No documented build handle | Child termination | No public handle | Child termination | Child termination | Context only; one-shot has no handle | Child termination | Scoped close/watch lifecycle | Provider-specific |
| Required host | Bun | Process-capable host plus Bun | Deno + unstable flag/permissions | Process-capable host plus Deno | Same | Supported Esbuild host; context is Node-only | Process-capable host plus suitable Node | Supported Node/native binding host | Node/tool-specific |

## Provider decisions

### Bun

**Upstream.** `Bun.build()` is a broad build API: virtual and multiple entries,
browser/Bun/Node targets, HTML, CSS, assets, plugins, loaders, splitting, output
objects, logs, and compile mode. Compile embeds the Bun runtime and supports Bun
and Node built-ins. Cross-target tokens encode system, architecture, libc, Bun
compatibility, and CPU baseline/modern policy.

**Repository.** 0.3 exposes selected-command source-to-Bun-executable and a
fixed one-file Node profile.

**Decision.** Ship both `effect-build-bun/Api` and `/Command`. `Api.build`
preserves `BuildConfig`/`BuildOutput` and includes compile mode. Command
`compileExecutable` and its homogeneous matrix remain first-class durable Bun
executable conveniences. Do not replace Bun compile with Node SEA.

**Probe.** Establish exact API compile output/write timing before adding any
higher-level `Artifact.Executable` wrapper. The 0.4 API lane does not require
that wrapper.

### Deno

**Upstream.** `Deno.bundle()` is experimental, requires `--unstable-bundle` and
Deno read/import/write authority, and supports multiple entries, browser/Deno
platforms, formats, splitting, package handling, externals, source maps, and
memory/written outputs. It is unavailable inside compiled `denort` binaries.
`deno bundle` additionally supports HTML, watch, and declaration output.
`deno compile` owns permissions, includes, workers, dynamic imports,
project/framework detection, runtime/engine selection, and target-runtime
acquisition.

**Decision.** `effect-build-deno/Command` exposes typed bundle, compile, and
compile matrix. `effect-build-deno/Api` is intended for 0.4 but has a hard type
isolation/runtime gate. A failed gate stops for maintainer decision; it never
permits a command-backed fake API. Deno does not implement the Node profile by
symmetry.

**Probes.** Prove isolated official-compatible types, distinguish missing
unstable flag/permissions/compiled-binary unavailability, and establish a stable
watch event/lifetime contract before publishing watch.

### Esbuild

**Upstream.** Esbuild separates `build`, `transform`, and Node-only `context`.
`BuildContext` exposes `rebuild`, `watch`, `serve`, `cancel`, and `dispose`.
`watch()` and `serve()` start state and return; the context remains the resource.

**Decision.** Ship `effect-build-esbuild/Api` with distinct one-shot build and
transform plus scoped context. Expose `cancel`; Scope owns `dispose` and calls
cancel then dispose exactly once. Preserve plugins, output files, metafiles, and
provider diagnostics. Add the Node profile only as an adapter. Do not add an
Esbuild CLI lane in 0.4.

### Node SEA

**Upstream.** Node SEA consumes one bundled CJS or ESM main plus optional
assets. Builder/base Node identity, output, snapshots, code cache, runtime
arguments, and argument-extension policy are configuration. Versions must match;
cross-platform cache/snapshot restrictions apply.

**Decision.** Keep it a command assembler, broaden direct input to file or
bytes, keep builder/base Node authority visible, and keep signing separate. Add
a producer-neutral recipe over the portable Node profile.

### Future providers

Rolldown should expose its direct scoped build object before optionally adapting
to the one-file Node profile. `@yao-pkg/pkg` demonstrates why sharing the output
kind `executable` does not create one truthful `ExecutableBuilder`: its input is
a project graph with different runtime and filesystem semantics.

## Host API versus command tradeoff

| Question | Host API | Command |
|---|---|---|
| Orchestrator portability | Often restricted | Process-capable Effect hosts |
| Plugins/callbacks | Preserved | Usually unavailable |
| In-memory values | Preserved | Serialized or written |
| Structured diagnostics | Usually strongest | Depends on CLI metadata |
| One-shot cancellation | Only with provider handle | Child can be terminated |
| Long-lived resources | Provider handle in Scope | Child process in Scope |
| Output ownership | Provider direct-write semantics | Simple file outputs may be core-staged; output-set atomicity remains provider-specific |
| Tool identity | In-process package/runtime | Selected path plus probe |
| Fallback | Forbidden | Forbidden |

## Name audit

| Name | Classification | 0.4 decision |
|---|---|---|
| `compileExecutable` | Provider-specific command convenience | Keep under Bun/Deno `Command` |
| `compileExecutableMatrix` | Homogeneous-provider orchestration | Keep under Bun/Deno `Command`; scalar is primitive |
| `withJavaScriptBundle` | Misleading narrow profile name | Remove; direct adapters use `withSingleNodeProgram` |
| root `NodeProgramBundler` | Valid role but overbroad root ontology | Publish `Profile/SingleNodeProgram.Bundler` |
| `NodeProgram.Lease` | Correct lifetime direction but overbroad root name | Use `SingleNodeProgram.Borrowed` |
| `Artifact` | Durable output observation | Keep; never use for borrowed resources |
| `Integration` | Mixed mechanisms/authorities | Replace with precise `Author/*` modules |
| `Provider` | Command compiler factory with overbroad name | Replace with `Author/CommandCompiler` |
| provider `Compiler` service | Ambiguous after lane expansion | Replace with explicit Api/Command services |

## Source and path decisions

Do not add a universal `SourceLocator`. `entrypoint` plus `cwd` establishes no
new authority and excludes URLs, packages, project directories, stdin, virtual
files, HTML roots, and plugin modules. Provider requests own source inputs;
portable profiles own their restrictions.

Use Effect `Path`, `FileSystem`, process, Scope, Layer, tracing, and logging for
platform mechanics. `HostPath.Absolute` means a canonical existing path observed
by the active host services. It is not a remote identity or serializable input
coordinate. `HostPath.existing` performs the observation; no syntax-only Schema
pretends a decoded string exists.

## Empirical gates

1. Bun API compile output and write timing.
2. Deno API type isolation and unstable/permission/compiled-binary failures.
3. Bun and Deno command-watch event contracts.
4. Provider multi-output state under interruption.
5. Closure-owned borrowed profile capability across compatible duplicate core
   copies.
6. Node SEA builder/base Node and cross-platform cache/snapshot behavior.
7. Stable Effect span/log behavior across the supported Effect range.

A failed probe stops or narrows that lane. It never authorizes silent fallback.

## Evidence index

### Repository

- [`v0.3.0` public API lock](https://github.com/mannyc2/effect-build/blob/f06f96ca88b6278e5f23a898d758b99fa9322108/tooling/public-api.json)
- [Bun profile](https://github.com/mannyc2/effect-build/blob/f06f96ca88b6278e5f23a898d758b99fa9322108/packages/effect-build-bun/src/Bundle.ts)
- [Esbuild profile](https://github.com/mannyc2/effect-build/blob/f06f96ca88b6278e5f23a898d758b99fa9322108/packages/effect-build-esbuild/src/internal/Esbuild.ts)
- [Node SEA](https://github.com/mannyc2/effect-build/blob/f06f96ca88b6278e5f23a898d758b99fa9322108/packages/effect-build-node-sea/src/internal/NodeSea.ts)
- [Bun -> Node SEA tests](https://github.com/mannyc2/effect-build/blob/f06f96ca88b6278e5f23a898d758b99fa9322108/test/unit/bun-node-sea-pipeline.test.ts)
- [Esbuild -> Node SEA tests](https://github.com/mannyc2/effect-build/blob/f06f96ca88b6278e5f23a898d758b99fa9322108/test/unit/esbuild-node-sea-pipeline.test.ts)
- [Plan 038 historical substitution receipt](https://github.com/mannyc2/effect-build/blob/15c811bb9904142a33d119766b62082f3c689f13/plans/038-evaluate-generic-build-services.md)

### Official upstream

- [Effect `ee06c9c`](https://github.com/Effect-TS/effect/tree/ee06c9c1eed73ebcf282541ceb1615ff1ba1730d)
- [Bun `1726b14`](https://github.com/oven-sh/bun/tree/1726b144a06de8f4eeacbc9ebcb3448cc1b51b87)
- [Bun declarations](https://github.com/oven-sh/bun/blob/1726b144a06de8f4eeacbc9ebcb3448cc1b51b87/packages/bun-types/bun.d.ts)
- [Deno `89f33cb`](https://github.com/denoland/deno/tree/89f33cbef296a2b287f323d42de54c871fa69c77)
- [Deno unstable bundle declarations](https://github.com/denoland/deno/blob/89f33cbef296a2b287f323d42de54c871fa69c77/cli/tsc/dts/lib.deno.unstable.d.ts)
- [Deno bundle provider](https://github.com/denoland/deno/blob/89f33cbef296a2b287f323d42de54c871fa69c77/ext/bundle/src/lib.rs)
- [Deno bundle docs](https://github.com/denoland/docs/blob/aa772cfbe4455e2a3ef86e9f4df584d41523c0f9/runtime/reference/bundling.md)
- [Deno compile docs](https://github.com/denoland/docs/blob/aa772cfbe4455e2a3ef86e9f4df584d41523c0f9/runtime/reference/cli/compile.md)
- [Esbuild API declarations](https://github.com/evanw/esbuild/blob/f6058f8364fe7ab91ca57a83e02577ed74c9cae4/lib/shared/types.ts)
- [Node SEA `ad7a5b8`](https://github.com/nodejs/node/blob/ad7a5b8302ae54b6e6dc77e03eabc5a3218dfb85/doc/api/single-executable-applications.md)
- [Rolldown build object](https://github.com/rolldown/rolldown/blob/f85ef4448d6966eab8f9d6ea60062afd8d8b31a2/packages/rolldown/src/api/rolldown/rolldown-build.ts)
- [`@yao-pkg/pkg` `8d3d7af`](https://github.com/yao-pkg/pkg/tree/8d3d7af9fe9cbb02ec60c78c4c71de343e259c0a)
