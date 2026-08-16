# Plan 044: Hard cut and certify the unpublished C2 0.4 surface

## Status

- Priority: P0 public API cut and certification
- Effort: XL
- Risk: CRITICAL declarations, consumers, package/version policy, candidate bytes
- Depends on: completed Plans 039, 040, 041, 042, and 043
- Status: TODO
- Publication authority: NONE

## Objective

Perform one coordinated pre-1.0 hard cut from released 0.3 to the revised C2
architecture, then certify one exact unpublished five-package 0.4 candidate.

This plan may:

- replace export maps and declaration allowlists;
- delete old aliases and names;
- update docs/examples/tests/governance;
- set provider/core peer ranges for independent post-0.4 releases;
- pack and test candidate tarballs.

It may not:

- publish npm packages;
- tag a commit;
- create a GitHub Release;
- change trusted publishers or branch protection;
- merge itself.

Release activation requires a separately approved plan.

## Preconditions

1. Every dependency plan has an exact-SHA completion receipt and passing CI.
2. The lineage descends from `v0.3.0`.
3. Direct provider `Api`/`Command` modules are independently usable.
4. Deno host API permission/declaration gates are explicitly resolved.
5. Node SEA builder/target mismatch policy is explicitly resolved.
6. All three profiles passed real two-implementation conformance or retained an
   explicit research-only second adapter where documented.
7. Generic Node and browser applications pass Layer-only substitution.
8. No lane silently falls back or auto-installs a tool.
9. Maintainer explicitly approves the breaking public cut and independent
   post-0.4 provider release cadence.

## Exact 0.4 export maps

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

Root namespaces:

```text
Api
Command
NodeMainProgram
BrowserModuleApplication
```

### `effect-build-deno`

```text
.
./Api
./Command
./Profile/BrowserModuleApplication
```

Root namespaces:

```text
Api
Command
BrowserModuleApplication
```

### `effect-build-esbuild`

```text
.
./Api
./Profile/NodeMainProgram
```

Root namespaces:

```text
Api
NodeMainProgram
```

### `effect-build-node-sea`

```text
.
./Command
./Profile/NodeMainExecutable
```

Root namespaces:

```text
Command
NodeMainExecutable
```

Explicit subpaths are canonical. Roots add no flat callable aliases.

## Required deletions and non-additions

Delete without aliases:

```text
effect-build/Integration
effect-build/Provider
JavaScriptBundle.Artifact
withJavaScriptBundle
ambiguous Bun/Deno Compiler services
```

Do not add the earlier research proposal paths:

```text
effect-build/Author/Command
effect-build/Author/CommandCompiler
effect-build/Profile/SingleNodeProgram
effect-build-node-sea/Recipe/SingleNodeProgram
```

Do not add:

```text
universal ExecutableBuilder
generic command-watch events
durable multi-file Artifact.Bundle
rolled-up declaration profile
IncrementalNodeMain public export
pkg product package
provider registry/fallback
transformation algebra
unstable/* author namespace
```

## Renames and moves

```text
StageObservation            -> BuildStepObservation
stages                      -> steps
target                      -> systemTarget
AbsolutePath                -> HostPath.Observed
TemporaryOutput author role -> BorrowedOutput
SingleNodeProgram           -> NodeMainProgram
```

Move:

```text
Bun compileExecutable       -> effect-build-bun/Command
Bun compileExecutableMatrix -> effect-build-bun/Command
Deno compileExecutable      -> effect-build-deno/Command
Deno compileExecutableMatrix-> effect-build-deno/Command
```

Provider-native roots remain namespace discovery facades only.

## Migration examples

### Bun command compile

```ts
// 0.3
import * as Bun from "effect-build-bun"

Bun.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app"
}).pipe(Effect.provide(Bun.layer()))

// 0.4
import * as BunCommand from "effect-build-bun/Command"

BunCommand.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app"
}).pipe(Effect.provide(BunCommand.layer()))
```

### Direct permanent Esbuild API

```ts
import * as EsbuildApi from "effect-build-esbuild/Api"

EsbuildApi.build({
  entryPoints: ["src/client.tsx", "src/worker.ts"],
  outdir: "dist",
  splitting: true,
  format: "esm",
  platform: "browser",
  plugins: [plugin],
  metafile: true
})
```

### Node-main profile

```ts
// 0.3
Esbuild.withJavaScriptBundle(request, use)

// 0.4 direct profile adapter
import * as EsbuildNodeMain from
  "effect-build-esbuild/Profile/NodeMainProgram"

EsbuildNodeMain.withProgram(request, (program) =>
  Effect.flatMap(program.file, use)
)
```

There is one callback. `program.file` is a closure-owned Effect.

### Provider-neutral Node source executable

```ts
import * as BunNodeMain from
  "effect-build-bun/Profile/NodeMainProgram"
import * as NodeSeaAssembler from
  "effect-build-node-sea/Profile/NodeMainExecutable"
import * as NodeSourceExecutable from
  "effect-build/Recipe/NodeSourceExecutable"

NodeSourceExecutable.createExecutable({
  program: {
    entrypoint: "src/main.ts",
    format: "esm"
  },
  outfile: "dist/app"
}).pipe(
  Effect.provide(BunNodeMain.layer()),
  Effect.provide(NodeSeaAssembler.layer())
)
```

### Direct Node SEA

```ts
import * as NodeSeaCommand from "effect-build-node-sea/Command"

NodeSeaCommand.createExecutable({
  main: {
    _tag: "Bytes",
    contents,
    format: "module",
    sourceName: "main.mjs"
  },
  outfile: "dist/app",
  assets: {
    "config.json": "config.json"
  }
})
```

### Browser module application

```ts
import * as BrowserApplication from
  "effect-build/Profile/BrowserModuleApplication"
import * as DenoBrowser from
  "effect-build-deno/Profile/BrowserModuleApplication"

BrowserApplication.Builder.use((builder) =>
  builder.withApplication(
    { entryHtml: "src/index.html", minify: true },
    (application) =>
      Effect.flatMap(application.files, deployTree)
  )
).pipe(Effect.provide(DenoBrowser.layer()))
```

### Strict and override compatibility

```ts
// Strict default: unsupported version fails at Layer construction.
BunCommand.layer({ executable: "/opt/bun-1.4.0/bin/bun" })

// Explicit untested-but-capable override: warning + observation marker.
BunCommand.layer({
  executable: "/opt/bun-1.4.0/bin/bun",
  allowUntestedVersion: true
})
```

The migration guide explains that known-incompatible or incapable versions
cannot be overridden.

## Provider permanence documentation

Every package README and API reference must state:

- provider `Api`/`Command` modules are permanent canonical surfaces;
- profiles are additive roles for applications that do not depend on provider
  distinctions;
- direct provider use is not a temporary escape hatch;
- a provider may implement no profile without being incomplete;
- compatibility ranges and host/command versions are lane-specific;
- no fallback, installation, or hidden provider selection occurs.

## Package version policy

The 0.4 migration is coordinated: all five candidate packages use 0.4.0 for the
hard cut.

After 0.4:

- provider packages may release independently;
- each provider package declares a bounded peer range on `effect-build`;
- core profile protocol strings govern runtime adapter compatibility;
- widening a provider tool/runtime range normally requires only that provider
  release;
- recipes depend on core profile services, not equal provider npm versions;
- incompatible future core versions are rejected by strict peer resolution.

Plan 044 updates repository release assumptions and tests but performs no
external release mutation.

## Documentation cut

Rewrite documentation around this order:

1. product thesis and permanent provider-native modules;
2. host API versus selected command;
3. tool-version compatibility and strict/override behavior;
4. provider-specific build/compile breadth;
5. durable single-file artifacts and runtime observations;
6. optional portable profiles;
7. provider-neutral recipes;
8. integration authoring with Tool/BorrowedOutput/Executable;
9. lifecycle and interruption per operation family;
10. observability versus provider graphs versus build-step observations;
11. exact support/version evidence;
12. 0.3 to 0.4 migration.

Docs explicitly state:

- no command-watch typed event protocol;
- no multi-file transaction claim;
- Deno permission docs/runtime discrepancy;
- Node SEA builder/target policy;
- no universal SourceLocator or ExecutableBuilder;
- signing must produce a new artifact rather than mutate an observed input;
- valid-but-deferred `IncrementalNodeMain` is deferred for sequencing, not
  invalidity or lack of adopters.

## Certification matrix

### Static and architecture

- exact runtime/declaration allowlists for every subpath;
- root namespace-only facades;
- no old paths/names or proposed rejected paths;
- one-way dependencies and no sibling imports;
- no raw runtime platform imports in reusable source;
- no provider registry/fallback/installation;
- no public process wrapper or command-compiler factory;
- no universal executable/declaration/watch abstraction;
- provider/core peer-range and independent-versioning fixtures.

### Effect platform and compatibility

- supported Effect endpoint consumers;
- official Effect process ownership remains authoritative;
- strict tool-version errors before mutation;
- explicit untested override warning/telemetry/build-step observation;
- known-incompatible and missing-capability override rejection;
- provider host and command versions observed separately.

### Bun

- host API at oldest/newest/current supported versions;
- command at oldest/newest/current;
- virtual inputs, plugins, multiple entries, HTML/CSS/assets, targets,
  splitting, logs, compile mode;
- command build, scalar, matrix, every advertised executable target;
- no command watch export;
- direct Bun executable runtime observation.

### Deno

- host API declarations/presence/result at oldest/newest/current;
- exact read/write permission behavior at each boundary;
- compiled-binary absence behavior;
- command bundle including HTML and declarations;
- declarations validated for unresolved local references;
- project compile, permissions/includes/workers/engine/runtime/targets;
- no command watch export;
- direct Deno executable runtime observation.

### Esbuild

- 0.28.1/0.28.2/current build, transform, context, rebuild, watch, serve,
  cancel/dispose;
- plugins, multiple outputs, CSS/assets, metafile, structured diagnostics;
- no global stop interference;
- no command lane.

### Node SEA

- file/bytes and CJS/ESM;
- assets/snapshot/cache/exec arguments on direct path;
- same-version Node 25.5.0 and 26.7.0;
- builder/target mismatch execution and validation;
- every advertised target;
- selected builder/target observations;
- atomic publication and locked-destination behavior.

### Profiles and recipe

- NodeMainProgram under Bun/Esbuild;
- main execution equivalence and imported-module negative fixture;
- BrowserModuleApplication under Bun/Deno;
- module-owned HTML/JS/CSS/assets and linked-resource negative fixture;
- NodeMainExecutable through Node SEA plus retained research `pkg` adapter;
- NodeSourceExecutable under every supported producer/assembler Layer
  combination;
- one-continuation expiry/mutation/root containment/duplicate-core laws;
- exact callback failure/defect/interruption/mixed Causes;
- no provider imports in generic applications.

### Lifecycle and publication

- one-shot host API interruption without false cancellation;
- selected-command interruption/reaping;
- context cancel/release exactly once;
- provider direct multi-output partial-outcome characterization;
- Linux/macOS/Windows borrowed-tree cleanup;
- Linux/macOS/Windows executable staging/atomic replacement;
- pre-rename interruption leaves destination unchanged;
- post-rename point-of-no-return behavior;
- matrix committed partial artifacts;
- signing/post-production mutation remains unexported.

### Observability

- exact root/child span names;
- bounded categorical attributes and numeric measurements;
- host/command tool compatibility attributes;
- structured untested override warning;
- no path/argv/env/source/plugin/full-diagnostic leakage;
- unchanged typed results and Cause topology;
- exporter-neutral in-memory tests at every Effect endpoint.

### Packed consumers

Pack all five packages once from one exact source SHA. Install with npm and Bun:

```text
core root
each core Author subpath
each core Profile subpath
core NodeSourceExecutable recipe
Bun Api
Bun Command
Bun NodeMainProgram
Bun BrowserModuleApplication
Deno Api
Deno Command
Deno BrowserModuleApplication
Esbuild Api
Esbuild NodeMainProgram
Node SEA Command
Node SEA NodeMainExecutable
generic Bun -> Node SEA recipe
generic Esbuild -> Node SEA recipe
generic Bun browser application
generic Deno browser application
all direct compiler matrices
strict unsupported-version consumer
untested-override consumer
independent provider/core peer-range fixtures
```

Candidate tests must use the exact once-packed bytes later eligible for release.

## Steps

1. Require explicit maintainer approval for the C2 hard cut and post-0.4
   independent provider cadence.
2. Freeze one exact descendant SHA with Plans 039-043 complete and green.
3. Resolve Deno permission/API and Node SEA mismatch gates.
4. Replace all package export maps and root facades atomically.
5. Delete 0.3 delegates, aliases, names, and stale examples.
6. Apply all artifact/path/runtime/step renames.
7. Update package versions/peer ranges and independent-versioning tests.
8. Rewrite root/package docs, author guide, lifecycle, observability, support,
   errors, migration, changelog, and examples.
9. Update exact public API, declarations, import boundaries, and docs fixtures.
10. Add complete certification matrix and non-skipping host/tool cells.
11. Pack all five packages once from the exact source SHA.
12. Install/run every isolated/composed consumer from those tarballs.
13. Observe all required GitHub Actions on the exact SHA.
14. Record candidate manifest and tarball hashes without publishing.
15. Present the unpublished candidate for separate release approval.

## Invariants

- Exactly five coordinated 0.4 packages remain; later releases may be
  independent.
- Provider direct modules are permanent and richer than profiles.
- Portable profiles remain optional and exact.
- No integration imports a sibling.
- No old/new canonical paths coexist after the cut.
- No automatic provider/tool fallback or installation exists.
- Every advertised host/tool/profile/version cell has ordinary non-skipping
  evidence.
- Artifact runtime identity remains visible.
- Borrowed values are never durable artifacts.
- Provider direct multi-output is never described as transactional.
- No generic typed command-watch event API appears.
- The exact candidate tarballs tested are the only bytes eligible for later
  release.
- This plan performs no external publication mutation.

## Required verification

```sh
bun run build
bun run check
bun run test:types
bun run test:unit
bun run test:architecture
bun run verify
bun run verify:effect
bun run verify:real
node --test research/post-0.3/*.test.mjs
git diff --check
```

Also require exact-source candidate and packed-consumer workflows. Record run,
workflow, job conclusions, candidate archive hash, tarball hashes, and every
consumer result.

## STOP conditions

Stop before the cut if:

- any dependency plan is incomplete or not green;
- maintainer approval for the hard cut or versioning policy is absent;
- Deno `/Api` is exported with unresolved boundary behavior;
- Node SEA ordinary support permits unverified builder/target mismatch;
- an advertised profile has only a weakened or silently ignored field;
- provider direct APIs are demoted to escape hatches;
- rejected Author/Command or CommandCompiler paths reappear;
- old aliases are proposed as a shipped compatibility tier;
- independent versioning permits incompatible core/provider installation;
- exact packed consumers do not use once-packed candidate bytes;
- any tag/publish/release/trust/merge mutation would be required.

## Completion receipt

Record:

- exact source SHA;
- exact public runtime/declaration keys and protocol strings;
- removed, renamed, and added import paths;
- package versions and peer ranges;
- Effect/provider/tool/type versions and compatibility ranges;
- all workflow runs/jobs;
- profile/falsifier law results;
- candidate archive and tarball hashes;
- packed consumer count/results;
- unresolved release-only decisions;
- confirmation that no publish, tag, release, trusted-publisher, branch
  protection, or merge mutation occurred.

`DONE` means a certified unpublished C2 0.4 candidate, not a release.
