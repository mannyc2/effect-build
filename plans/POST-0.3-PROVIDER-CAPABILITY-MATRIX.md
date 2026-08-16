# Post-0.3 provider capability matrix

Status: architecture evidence for the post-0.3 product decision. This document
records provider capabilities and the architectural pressure they create. It
changes no production export and does not supersede the historical record in
Plans 001-038.

Repository baseline:

- released source: `v0.3.0` at
  `f06f96ca88b6278e5f23a898d758b99fa9322108`;
- release-line base for this study:
  `codex/granular-integration-program` at
  `15c811bb9904142a33d119766b62082f3c689f13`;
- default `main` is not the release lineage and is not an architectural base.

The product question is not whether every provider can be hidden behind one
operation. It is which provider capabilities should receive first-class
Effect-native APIs, and which narrower profiles are truthful enough to support
portable application composition.

## Independent axes

Every API and example must keep these choices independent:

1. **Effect orchestrator runtime**: Node, Bun, Deno, a browser, or another host
   that can provide the required Effect platform services.
2. **Selected build tool**: Bun, Deno, Esbuild, Node SEA, Rolldown, or a future
   integration.
3. **Artifact runtime or target**: browser JavaScript, Node JavaScript, Bun
   JavaScript, Deno JavaScript, a Bun executable, a Deno executable, or a Node
   SEA executable for a native system target.

Importing a Bun integration must not imply that the Effect program itself is
hosted by Bun. Calling the `Bun.build()` TypeScript API, however, necessarily
does require a Bun host. Invoking the Bun executable as a child process does
not. The same distinction applies to Deno's runtime API versus its CLI.

## Integration lanes

The architecture must name two lanes instead of treating them as invisible
implementation details.

### Host API lane

The provider package calls a provider's JavaScript or TypeScript API in the
current process.

Benefits:

- exposes provider-native options, plugins, virtual inputs, in-memory outputs,
  structured diagnostics, and long-lived contexts where the provider has them;
- avoids serializing rich API values through command-line arguments;
- can preserve exact provider result types.

Costs and requirements:

- may constrain the Effect orchestrator runtime;
- provider promises without cancellation may continue after an Effect fiber is
  interrupted;
- process-global or long-lived provider resources need explicit Scope ownership;
- native provider objects are not portable plans or durable artifacts.

### Command lane

The provider package invokes a selected executable through Effect's process,
filesystem, path, crypto, Scope, and Layer services.

Benefits:

- keeps the orchestrator runtime independent from the build tool;
- gives Effect ownership of child-process interruption, bounded output,
  environment policy, and cleanup;
- can support a provider whose only stable public interface is a CLI.

Costs:

- exposes only capabilities representable by the CLI or an explicit helper
  protocol;
- may lose structured values unless the CLI emits machine-readable metadata;
- command discovery, version probing, environment, and exit diagnostics become
  part of the integration contract.

A provider package may expose both lanes. They are not fallback implementations
of one service unless their request, output, failure, and interruption semantics
are demonstrably the same.

## Operation topology matrix

| Provider operation | Lane | Input topology | Output topology | Host requirement | Resource and interruption semantics |
|---|---|---|---|---|---|
| `Bun.build()` | Host API | One or many filesystem or virtual entrypoints plus Bun build options | Provider-native output set containing JavaScript, CSS, HTML, assets, and logs; can write or retain output objects | Bun runtime | One-shot Promise. No documented per-build cancel handle. Fiber interruption can stop waiting, but the integration cannot claim underlying cancellation without a Bun API guarantee. |
| `bun build` | Command | One or many filesystem entrypoints plus CLI options | Written provider-native output set and command diagnostics | Any Effect runtime with a process implementation and Bun executable | Scoped child process can be terminated on interruption. Machine-readable output requires explicit Bun metadata flags or a helper protocol. |
| `Bun.build({ compile })` | Host API | Source entrypoint and Bun executable options | Bun-runtime native executable | Bun runtime | One-shot Promise with the same cancellation limitation as `Bun.build()`. |
| `bun build --compile` | Command | Source entrypoint and Bun executable CLI options | Bun-runtime native executable | Any process-capable Effect runtime with Bun executable | Scoped child termination, staged output validation, and atomic publication can remain core-owned. |
| `Deno.bundle()` | Host API | One or many module specifiers plus Deno bundle options and runtime permission context | In-memory or written JavaScript/CSS/HTML/asset output set with structured errors and warnings | Deno runtime; unavailable in `deno compile` binaries | One-shot Promise without a public cancellation handle. Permission checks and Deno module resolution are part of the operation. |
| `deno bundle` | Command | One or many filesystem, URL, package, or HTML entrypoints plus CLI/workspace configuration | Written output set; may type-check first; supports one-shot or watch operation | Any process-capable Effect runtime with Deno executable | Scoped child termination is available. Watch is a long-lived process resource. Deno may acquire its Esbuild implementation as part of the command. |
| `deno compile` | Command | Module specifier or project directory plus permissions, includes, runtime, engine, and target policy | Deno-runtime native executable with virtual or self-extracting filesystem | Any process-capable Effect runtime with Deno executable; target runtime may be downloaded or overridden | Scoped child termination is available. Remote runtime acquisition and cache behavior are provider semantics, not generic publication mechanics. |
| `esbuild.build()` | Host API | Filesystem or stdin input, one or many entries, plugins, loaders, and build options | In-memory or written output set plus structured diagnostics and optional metafile | Node or browser Esbuild API | One-shot API backed by Esbuild's service process or WASM implementation. Exact cancellation is not represented by the one-shot result. |
| `esbuild.transform()` | Host API | One in-memory string or byte buffer plus transform options | One code/map result and structured warnings | Node or browser Esbuild API | One-shot operation; it is not a module-graph build and should not be forced into a bundler service. |
| `esbuild.context()` | Host API | Full Esbuild build options | Scoped context supporting rebuild, watch, serve, cancel, and dispose | Node Esbuild API | A real long-lived resource. Effect Scope should own `cancel()` and `dispose()`. Interruption can call the provider cancellation API before release. |
| Esbuild CLI | Command | CLI-representable build or transform options | Written output set or stdout plus process diagnostics | Any process-capable Effect runtime with Esbuild executable | Scoped child termination. Plugins and arbitrary JavaScript callbacks require a helper process, not raw argv. |
| `node --build-sea` | Command | One already-bundled CommonJS or ESM main plus Node SEA config and assets | One Node-runtime native executable | Any process-capable Effect runtime with a compatible Node executable | Scoped command with selected-Node constraints. Snapshot/code-cache behavior and signing are Node/platform semantics. |
| `rolldown()` / `RolldownBuild` | Host API | Rollup-compatible input options, plugins, and one or many entries | Reusable build object that can generate multiple in-memory or written output sets | Supported Rolldown host/binding | Explicit `close()` / async disposal. The build object is scoped and may generate more than one output configuration. |
| `@yao-pkg/pkg` | Command or package API | Node project/package graph, configuration, assets, native addons, target set | One or many Node executables with a snapshot filesystem or SEA mode | Node/tool-specific host requirements | Project traversal, runtime acquisition, executable mode, and virtual filesystem are provider semantics that do not match Node SEA's one-main input. |

## Capability coverage

Legend: `Yes` is a first-class provider capability; `Profile` means the current
0.3 integration exposes only a deliberate narrower profile; `No` means the
provider operation does not represent that capability; `N/A` means the axis
does not apply.

| Capability | Bun build | Bun compile | Deno bundle | Deno compile | Esbuild | Node SEA | Rolldown | `@yao-pkg/pkg` |
|---|---|---|---|---|---|---|---|---|
| Single entrypoint | Yes | Yes | Yes | Yes | Yes | Yes, already bundled | Yes | Yes/project |
| Multiple entrypoints | Yes | No as one executable | Yes | No as one executable | Yes | No | Yes | Project dependent |
| Multiple outputs | Yes | One executable plus embedded resources | Yes | One executable | Yes | One executable | Yes | One per target |
| Browser target | Yes | No | Yes | No | Yes | No | Yes | No |
| Node target | Yes | Node APIs under Bun resolution profile | No dedicated Node platform | Node compatibility through Deno runtime where supported | Yes | Yes | Yes | Yes |
| Bun target/runtime | Yes | Yes | No | No | No | No | No | No |
| Deno target/runtime | No | No | Yes | Yes | No dedicated Deno platform | No | Provider/plugin dependent | No |
| JavaScript/TypeScript | Yes | Yes | Yes | Yes | Yes | Main must already be JavaScript | Yes | JavaScript project |
| HTML | Yes | Embedded/provider specific | Yes | Framework/project specific | Loader/plugin based | Asset only | Plugin based | Asset/project specific |
| CSS and assets | Yes | Embedded | Yes | Included or project generated | Yes | Explicit assets; no source graph | Yes | Yes |
| Declaration generation | No; Bun explicitly does not replace `tsc` | No | Type checking is separate; no declaration bundle result | No general declaration output | No TypeScript declarations | No | Plugin ecosystem, not core build result | No |
| Plugins/loaders | Yes in API | Build options provider specific | Deno bundler internals/plugins are not one portable Bun/Esbuild API | Framework/build scripts and Deno config | Yes | No source plugins | Yes, Rollup-compatible | Provider configuration/hooks |
| Code splitting | Yes | Not a multi-file executable contract | Yes | Bundled executable manages its own graph | Yes | No | Yes | Provider mode dependent |
| Watch/incremental | CLI watch; API is one-shot | No stable incremental executable context | CLI watch | CLI watch | Context rebuild/watch | No | Reusable build/watch APIs | No common incremental API |
| In-memory outputs | Yes in API | No durable executable is returned as bytes by the current product | Yes when `write: false` | No | Yes with `write: false`; transform is memory-first | No | Yes with `generate` | No common in-memory result |
| Written outputs | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Cross-target executable | N/A | Yes, Bun target/version/CPU/libc semantics | N/A | Yes, Deno target/runtime/engine semantics | N/A | Constrained by selected Node and SEA options | N/A | Yes |
| Structured diagnostics | Yes | Yes in API; CLI needs mapping | Yes | CLI mapping | Rich message IDs, locations, notes, details | CLI diagnostics | Provider-native errors/logs | Provider-specific |
| Dependency graph/metadata | Bun metafile and output records | Build graph is internal | Deno module graph and bundle output metadata | Compile graph/internal virtual filesystem | Metafile with input/output edges | No source graph | Rollup-compatible graph/output metadata | Project detector/walker |
| Explicit resource lifetime | Output values only; no build context in documented API | One-shot | One-shot runtime API; watch command is long-lived | Watch command is long-lived | `BuildContext.cancel/dispose` and global service `stop` | Command scope | `RolldownBuild.close` | Provider process/temp/cache lifecycle |

## Provider-specific conclusions

### Bun

`Bun.build()` is substantially broader than the 0.3
`withJavaScriptBundle` profile. It supports multiple and virtual entrypoints,
HTML, CSS, assets, plugins, browser/Bun/Node targets, in-memory output objects,
and executable compilation. A future Effect-native Bun package should expose a
Bun-host API lane without deleting the process lane.

The current command-backed Node program profile remains useful, but it is not
the canonical representation of Bun build capability.

Bun source to Bun executable must not be replaced by Bun source to Node program
to Node SEA. Bun compile embeds the Bun runtime, supports Bun APIs, and has Bun
runtime version, CPU baseline, libc, and target semantics. Node SEA embeds Node
and validates a Node CommonJS or ESM main. The two executables have different
runtime contracts even when they start from the same source.

### Deno

Deno has two separate build products:

- `Deno.bundle()` / `deno bundle` produce provider-native output sets under
  Deno module resolution and permission rules;
- `deno compile` creates a Deno-runtime executable with permissions, includes,
  workers, framework detection, virtual filesystem behavior, engine selection,
  and possible `denort` acquisition.

The 0.3 Deno integration covers only a narrow compile subset. A provider-native
architecture should eventually expose `Deno.bundle()` and the richer command
surface rather than making Deno conform to a Node-program profile.

### Esbuild

Esbuild has at least three distinct public roles:

1. build a provider-native output set;
2. transform one in-memory source value;
3. own a long-lived build context with rebuild, watch, serve, cancel, and
   dispose.

The current package implements only a fixed single-output Node program profile.
The provider package should expose the full API lane, while the existing profile
can remain as an optional portable adapter over that richer service.

### Node SEA

Node SEA is an assembler. It consumes one already-bundled CommonJS or ESM main
and optional assets, then produces one Node executable. Its snapshot, code
cache, execution argument, signing, host, and selected-Node restrictions must
remain visible on its direct API.

It is not a general source compiler and should not be grouped with Bun or Deno
compile under a universal `ExecutableBuilder`.

### Future providers

Rolldown stresses multi-output and scoped-resource design: one build object can
generate several output configurations and must be closed. It can implement a
narrow single-Node-program profile, but the profile must not replace its direct
Rollup-compatible API.

`@yao-pkg/pkg` stresses executable topology: it consumes a project/package
graph and owns dependency walking, assets, native addons, target selection,
and executable mode. Matching its output kind to Node SEA does not create a
shared truthful input contract.

## Architecture pressure on the 0.3 names

| Current or proposed name | Actual role | Decision pressure |
|---|---|---|
| `compileExecutable` | Provider-specific command-backed source-to-runtime-executable convenience | Keep the verb inside provider packages, but lane-qualify the service/export ownership. It is not a portable compiler contract. |
| `compileExecutableMatrix` | Homogeneous-provider orchestration over scalar compilation | Keep as provider convenience until a separate orchestration design removes real duplication. Do not make matrix the primitive. |
| `withJavaScriptBundle` | Narrow one-entry, one-file, Node-resolution borrowed-output profile | Rename when the profile is redesigned; it does not describe provider-native bundle output sets. |
| `NodeProgramBundler` | Candidate portable Context service for the narrow profile | May survive only as an optional named profile. It must not become the root ontology for Bun, Deno, or Esbuild. |
| `NodeProgram.Lease` | Candidate borrowed resource for one temporary Node program | Useful inside the profile if it prevents durable/borrowed confusion. It is not the representation for provider-native output sets. |
| `Artifact` | Durable output observation namespace | Retain for durable files/output sets/executables; do not use it for live contexts or borrowed temporary outputs. |
| `Integration` | Shared process, temporary ownership, validation, staging, publication, and inspection mechanisms | Split by authority. The name is too broad to define a stable author API. |
| `Provider` | Command-backed source-to-executable compiler author SPI | Rename to the exact role, such as `CommandCompiler`; it does not describe all integrations. |

## Source and path conclusions

A public `SourceLocator` containing only `entrypoint` and `cwd` establishes no
new invariant. It excludes URLs, package/module specifiers, stdin, virtual
files, HTML roots, project directories, and provider-native input maps while
adding a second name for fields the provider already owns. Do not add it to
portable core.

Use Effect `Path` and `FileSystem` services for platform mechanics. Introduce a
domain input type only for a real sum of source authorities, for example a
provider API that accepts filesystem paths, module specifiers, stdin bytes, or
virtual modules and can validate each case.

A host-local absolute path brand may be useful on observed durable outputs, but
it must mean only "absolute under the Path implementation that produced this
value." It must not imply cross-host portability, remote identity, or a
serializable execution plan.

## Evidence index

All upstream claims above are based on official source or documentation at an
exact ref:

- Bun build API/CLI, entrypoints, targets, formats, watch, content types,
  assets, plugins, and virtual files:
  [oven-sh/bun `22494bc`, `docs/bundler/index.mdx`](https://github.com/oven-sh/bun/blob/22494bc820c794b322e6eee05ae09617b676a29e/docs/bundler/index.mdx).
- Bun executable API/CLI, embedded Bun runtime, and cross targets:
  [oven-sh/bun `22494bc`, `docs/bundler/executables.mdx`](https://github.com/oven-sh/bun/blob/22494bc820c794b322e6eee05ae09617b676a29e/docs/bundler/executables.mdx).
- Deno runtime bundle options, platforms, formats, write/in-memory outputs,
  diagnostics, and compiled-binary limitation:
  [denoland/deno `89f33cb`, `ext/bundle/src/lib.rs`](https://github.com/denoland/deno/blob/89f33cbef296a2b287f323d42de54c871fa69c77/ext/bundle/src/lib.rs) and
  [`ext/bundle/bundle.ts`](https://github.com/denoland/deno/blob/89f33cbef296a2b287f323d42de54c871fa69c77/ext/bundle/bundle.ts).
- Deno bundle module graph, HTML, permissions, type-check, watch, and selected
  Esbuild service:
  [denoland/deno `89f33cb`, `cli/tools/bundle/mod.rs`](https://github.com/denoland/deno/blob/89f33cbef296a2b287f323d42de54c871fa69c77/cli/tools/bundle/mod.rs).
- Deno compile permissions, framework detection, watch, cross-target runtime
  acquisition, engines, includes, workers, bundling, and virtual filesystem:
  [denoland/docs `aa772cf`, `runtime/reference/cli/compile.md`](https://github.com/denoland/docs/blob/aa772cfbe4455e2a3ef86e9f4df584d41523c0f9/runtime/reference/cli/compile.md).
- Esbuild build, transform, inputs, outputs, plugins, loaders, diagnostics, and
  metafile types:
  [evanw/esbuild `f6058f8`, `lib/shared/types.ts`](https://github.com/evanw/esbuild/blob/f6058f8364fe7ab91ca57a83e02577ed74c9cae4/lib/shared/types.ts).
- Esbuild context rebuild/watch/serve/cancel/dispose and process stop:
  [the same file, `BuildContext` and API declarations](https://github.com/evanw/esbuild/blob/f6058f8364fe7ab91ca57a83e02577ed74c9cae4/lib/shared/types.ts#L500-L640).
- Node SEA one-main topology and config:
  [nodejs/node `d099639`, `doc/api/single-executable-applications.md`](https://github.com/nodejs/node/blob/d099639740a2269131fd1ec9cb211c1286822885/doc/api/single-executable-applications.md).
- Rolldown reusable build object and close semantics:
  [rolldown/rolldown `f34f328`, `rolldown-build.ts`](https://github.com/rolldown/rolldown/blob/f34f3289548e418e548726557e96dda4faf27174/packages/rolldown/src/api/rolldown/rolldown-build.ts).
- `@yao-pkg/pkg` project graph and cross-target executable product:
  [yao-pkg/pkg `8d3d7af`, `README.md`](https://github.com/yao-pkg/pkg/blob/8d3d7af9fe9cbb02ec60c78c4c71de343e259c0a/README.md).
- Effect child-process Scope, service Layer, `Effect.fn`, and span annotation
  patterns:
  [Effect-TS/effect `189b003`, child-process guide](https://github.com/Effect-TS/effect/blob/189b003a2367fa44dd4b8544aa62979f0345d179/ai-docs/src/60_child-process/10_working-with-child-processes.ts).
- Optional application-provided OTLP export over native Effect tracing/logging:
  [Effect-TS/effect `189b003`, OTLP tracing guide](https://github.com/Effect-TS/effect/blob/189b003a2367fa44dd4b8544aa62979f0345d179/ai-docs/src/08_observability/20_otlp-tracing.ts).
