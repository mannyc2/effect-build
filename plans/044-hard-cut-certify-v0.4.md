# Plan 044: Hard cut and certify the unpublished 0.4 surface

## Status

- Priority: P0 public API cut and certification
- Effort: XL
- Risk: CRITICAL breaking declarations, consumers, package bytes
- Depends on: Plans 039, 040, 041, 042, and 043
- Architecture commit: `e23722e81fa651c1540c8aa72e2703ff62ac609b`
- Status: TODO
- Publication authority: NONE

## Objective

Perform one pre-1.0 hard cut from 0.3 to the selected 0.4 architecture, then
certify one unpublished five-package candidate.

This plan may change exports, delete aliases, update docs/examples/tests, and
pack local candidate tarballs. It may not publish, tag, release, modify trusted
publishing, change branch protection, or merge itself.

## Preconditions

1. Every dependency plan has an exact-SHA completion receipt and passing CI.
2. The lineage descends from `v0.3.0`.
3. The Deno API hard gate passed, or the maintainer explicitly amended the
   architecture.
4. No lane silently falls back.
5. SingleNodeProgram passed Bun/Esbuild substitution and duplicate-core tests.
6. Exact Effect/provider versions are recorded.

## Exact 0.4 export maps

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

Root namespaces: `Api`, `Command`, `SingleNodeProgram`.

### `effect-build-deno`

```text
.
./Api
./Command
```

Root namespaces: `Api`, `Command`.

### `effect-build-esbuild`

```text
.
./Api
./Profile/SingleNodeProgram
```

Root namespaces: `Api`, `SingleNodeProgram`.

### `effect-build-node-sea`

```text
.
./Command
./Recipe/SingleNodeProgram
```

Root namespaces: `Command`, `SingleNodeProgramRecipe`.

Explicit subpaths are canonical. Roots add no flat callable aliases.

## Deletions and renames

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

Move Bun/Deno scalar and matrix compile under provider `Command`. Ship no
compatibility wrappers, deprecated aliases, legacy subpaths, or parallel
advanced tier.

## Migration examples

### Bun compile

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

### Portable Esbuild -> Node SEA recipe

```ts
import * as EsbuildProfile from
  "effect-build-esbuild/Profile/SingleNodeProgram"
import * as NodeSeaCommand from
  "effect-build-node-sea/Command"
import * as NodeSeaRecipe from
  "effect-build-node-sea/Recipe/SingleNodeProgram"

NodeSeaRecipe.createExecutable({
  program: {
    entrypoint: "src/main.ts",
    format: "esm"
  },
  outfile: "dist/app"
}).pipe(
  Effect.provide(EsbuildProfile.layer),
  Effect.provide(NodeSeaCommand.layer())
)
```

### Direct provider breadth

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

```ts
import * as NodeSeaCommand from "effect-build-node-sea/Command"

NodeSeaCommand.createExecutable({
  main: {
    _tag: "Bytes",
    contents,
    format: "module",
    sourceName: "main.mjs"
  },
  outfile: "dist/app"
})
```

## Documentation requirements

Rewrite root product thesis, install guidance by lane, API reference,
architecture, author guide, errors, examples, changelog, and migration guide.
Docs explicitly state host requirements, no fallback, interruption per operation,
provider direct-write versus atomic executable publication, profile exclusions,
graph/trace/step distinction, exporter-neutral observability, Deno unstable and
permission authority, Node SEA builder/base restrictions, no SourceLocator, and
no universal ExecutableBuilder.

## Certification matrix

### Static/architecture

- exact runtime and declaration allowlists;
- `HostPath.existing` behavior on supported hosts;
- one-way dependencies and no sibling imports;
- no raw runtime platform imports;
- no old paths/names;
- no `unstable/*` author namespace;
- no registry/fallback, transformation algebra, or generic executable builder.

### Host matrix

- Node-host command consumers;
- Bun-host API consumers using packaged `bun-types`;
- Deno-host API consumers with required flag/permissions;
- supported Effect compatibility endpoints.

### Provider breadth

Bun: virtual files, plugins, multiple entries, HTML/CSS/assets, targets,
splitting, logs, API compile mode, command build, every advertised executable
target, scalar/matrix behavior.

Deno: API memory/written bundle and failures; command bundle including
declarations; project compile, permissions/includes/workers/engine/targets;
scalar/matrix behavior.

Esbuild: build, transform, context, rebuild, watch, serve, cancel/dispose,
plugins, multiple outputs, CSS/assets, metafile, diagnostics.

Node SEA: file/bytes, ESM/CJS, assets, args, cache/snapshot, builder/base Node,
and every advertised current/cross target.

Profile/recipe: unchanged program under Bun/Esbuild Layers; exact callback
Cause; expiry, mutation, cleanup, duplicate core; real pipelines.

### Publication/platform

- executable staging/publication on Linux, macOS, Windows;
- destination unchanged before rename;
- point-of-no-return after rename;
- provider multi-file output documented without atomicity claim.

### Observability

- exact stable span names;
- stable bounded categorical attributes and numeric measurements;
- no path/argv/env/plugin/diagnostic payload by default;
- warning/error summary logs;
- no direct OpenTelemetry dependency;
- application-supplied exporter fixture.

### Packed consumers

Pack all five packages once from one exact SHA. Install those exact tarballs in
isolated consumers covering every public subpath and composed recipe.

## Steps

1. Verify preconditions and parent SHA.
2. Apply final export maps.
3. Delete 0.3 paths/names and apply durable vocabulary renames.
4. Make provider roots namespace-only facades.
5. Update docs/examples/changelog/migration.
6. Update exact public API locks.
7. Run static, host, provider, platform, profile, and telemetry matrices.
8. Pack five packages once.
9. Run isolated/composed consumers from exact tarballs.
10. Produce an unpublished candidate manifest with hashes.
11. Record CI workflow/run/job conclusions.
12. Leave the PR unmerged and candidate unpublished.

## Invariants

- Exactly five public packages remain.
- No integration imports a sibling.
- No 0.3 alias remains.
- No lane silently falls back.
- Provider-native values remain available.
- SingleNodeProgram remains narrow and borrowed.
- Bun/Deno compile remain runtime-specific.
- Node SEA remains an assembler.
- Every advertised cell has non-skipping evidence.
- Candidate bytes are not published, tagged, or released.

## STOP conditions

Stop if any dependency plan lacks exact-SHA evidence; Deno `/Api` is unresolved
without maintainer amendment; declarations require incompatible ambient globals;
old aliases are needed; provider capability is flattened for the profile;
fallback appears; an advertised cell is skipped; packed bytes differ; a workflow
attempts release mutation; or ancestry loses the released source.

## Completion receipt

Completion means one exact unpublished candidate SHA, five once-packed tarballs
and hashes, full observed CI, updated receipt, and no publication/release side
effect. Publication requires separate authorization.
