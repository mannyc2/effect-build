# Plan 044: Hard cut and certify the unpublished 0.4 surface

## Status

- Priority: P0 public API cut and certification
- Effort: XL
- Risk: CRITICAL breaking declarations, consumers, and package bytes
- Depends on: Plans 039, 040, 041, 042, and 043
- Architecture commit: `e23722e81fa651c1540c8aa72e2703ff62ac609b`
- Status: TODO
- Publication authority: NONE

## Objective

Perform one pre-1.0 hard cut from the released 0.3 surface to the selected
0.4 architecture, then certify one unpublished five-package candidate.

This plan may:

- change production exports;
- delete 0.3 aliases;
- update docs/examples/tests;
- pack and verify local candidate tarballs.

It may not:

- publish npm packages;
- create tags or releases;
- modify trusted publishing;
- change branch protections;
- merge itself.

## Preconditions

Before implementation:

1. every dependency plan has a completion receipt and passing exact-SHA CI;
2. the implementation lineage descends from `v0.3.0`;
3. the Deno API hard gate passed, or the maintainer explicitly amended the
   architecture before this plan;
4. no provider lane silently falls back to another lane;
5. the SingleNodeProgram profile passed Bun/Esbuild substitution and
   duplicate-core tests;
6. the exact Effect version range and provider versions are recorded.

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

Root runtime namespaces/types:

```text
Artifact
BuildError
BuildStepObservation
Diagnostic
MatrixError
SystemTarget
```

### `effect-build-bun`

```text
.
./Api
./Command
./Profile/SingleNodeProgram
```

Root namespaces only:

```text
Api
Command
SingleNodeProgram
```

### `effect-build-deno`

```text
.
./Api
./Command
```

Root namespaces only:

```text
Api
Command
```

### `effect-build-esbuild`

```text
.
./Api
./Profile/SingleNodeProgram
```

Root namespaces only:

```text
Api
SingleNodeProgram
```

### `effect-build-node-sea`

```text
.
./Command
./Recipe/SingleNodeProgram
```

Root namespaces only:

```text
Command
SingleNodeProgramRecipe
```

Explicit subpaths are canonical. Roots do not add flat callable aliases.

## Required deletions and renames

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
AbsolutePath     -> Artifact.LocalPath
```

Move:

```text
Bun.compileExecutable       -> effect-build-bun/Command
Bun.compileExecutableMatrix -> effect-build-bun/Command
Deno.compileExecutable      -> effect-build-deno/Command
Deno.compileExecutableMatrix-> effect-build-deno/Command
```

Do not ship compatibility wrappers, deprecated aliases, legacy subpaths, or a
parallel "advanced" API.

## Migration examples

### 0.3 Bun compile

```ts
import * as Bun from "effect-build-bun"

Bun.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app"
}).pipe(Effect.provide(Bun.layer()))
```

### 0.4 Bun command compile

```ts
import * as BunCommand from "effect-build-bun/Command"

BunCommand.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app"
}).pipe(Effect.provide(BunCommand.layer()))
```

### 0.3 Esbuild -> Node SEA

```ts
Esbuild.withJavaScriptBundle(
  { entrypoint: "src/main.ts", format: "esm" },
  (main) =>
    NodeSea.createExecutable({
      main,
      outfile: "dist/app"
    })
)
```

### 0.4 portable recipe

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

### 0.4 direct Esbuild build

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

### 0.4 direct Node SEA bytes

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

Rewrite:

- root README product thesis;
- install guidance by lane;
- API reference;
- architecture;
- integration author guide;
- errors;
- examples;
- changelog;
- migration guide.

Docs must explicitly state:

- host API versus command requirements;
- no fallback;
- interruption guarantee per operation;
- provider direct-write versus atomic executable publication;
- profile exclusions;
- source graph versus trace versus step observation;
- exporter-neutral observability;
- Deno unstable flag/permissions;
- Node SEA builder/base Node restrictions;
- no SourceLocator;
- no universal ExecutableBuilder.

## Certification matrix

### Static and architecture

- exact runtime export allowlist;
- exact declaration export allowlist;
- one-way dependencies;
- no sibling imports;
- no raw runtime process/filesystem imports;
- no old subpaths/names;
- no `unstable/*` author namespace;
- no provider registry/fallback;
- no transformation algebra;
- no generic executable builder.

### Host matrix

- Node-host command consumers;
- Bun-host API consumers;
- Deno-host API consumers with required flags/permissions;
- supported Effect compatibility endpoints.

### Provider breadth

Bun:

- API build: virtual files, plugins, multi-entry, HTML/CSS/assets, targets,
  splitting, logs, compile mode;
- Command build and every advertised executable target;
- scalar/matrix behavior.

Deno:

- API bundle memory/written output and failures;
- Command bundle including declarations;
- project compile, permissions/includes/workers/engine/targets;
- scalar/matrix behavior.

Esbuild:

- build, transform, context, rebuild, watch, serve, cancel/dispose;
- plugins, multi-output, CSS/assets, metafile, diagnostics.

Node SEA:

- file/bytes, ESM/CJS, assets, args, cache/snapshot, target/base Node,
  current/cross targets advertised.

Profile/recipe:

- unchanged program under Bun and Esbuild Layers;
- exact callback Cause;
- expiry, mutation, cleanup, duplicate core;
- real Bun/Esbuild -> Node SEA.

### Publication/platform

- executable staging/publication on Linux, macOS, Windows;
- destination unchanged before rename;
- point-of-no-return semantics after rename;
- provider multi-file output documented without atomicity claim.

### Observability

- exact stable span names;
- stable low-cardinality attributes;
- no path/argv/env/plugin/diagnostic payload by default;
- warning/error summary logs;
- no direct OpenTelemetry dependency;
- application-supplied exporter fixture.

### Packed consumers

Pack all five packages once from one exact SHA. Install those exact tarballs in
isolated consumers covering every public subpath and the composed recipes.

## Steps

1. Verify preconditions and exact parent SHA.
2. Apply final export maps.
3. Delete 0.3 paths and names.
4. Apply durable observation renames.
5. Update all provider roots to namespace-only discovery facades.
6. Update docs/examples/changelog/migration.
7. Update exact public API locks.
8. Run full static/host/provider/platform/profile/telemetry matrix.
9. Pack five packages once.
10. Run isolated/composed consumers from exact tarballs.
11. Produce an unpublished candidate manifest with package hashes.
12. Record CI workflow/run/job conclusions.
13. Leave the PR unmerged and candidate unpublished.

## Invariants

- Exactly five public packages remain.
- No integration imports a sibling.
- No 0.3 compatibility alias remains.
- No lane silently falls back.
- Provider-native types/results remain available.
- SingleNodeProgram remains narrow and borrowed.
- Bun compile remains Bun-runtime specific.
- Deno compile remains Deno-runtime specific.
- Node SEA remains an assembler.
- All advertised cells have non-skipping evidence.
- Candidate bytes are not published, tagged, or released.

## STOP conditions

Stop and report if:

- any dependency plan lacks exact-SHA passing evidence;
- Deno `/Api` gate is unresolved without maintainer amendment;
- a final declaration requires incompatible ambient host globals;
- an old alias is needed to make consumers pass;
- a provider capability is flattened to satisfy the profile;
- API/Command fallback appears;
- any advertised host/tool/target cell is skipped;
- packed bytes differ between certification stages;
- a workflow attempts publication, tag, release, or trusted-publisher mutation;
- branch ancestry no longer includes the released source.

## Completion receipt

Completion means:

- one exact unpublished candidate SHA;
- five once-packed tarballs and hashes;
- full observed GitHub Actions matrix;
- updated plan receipt;
- no publication or release side effect.

Publication requires a separate explicitly authorized task.
