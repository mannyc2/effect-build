# Plan 041: Publish permanent Bun API and command lanes

## Status

- Priority: P1 permanent provider API
- Effort: XL
- Risk: HIGH dual-lane semantics, host typing, and executable compatibility
- Depends on: Plan 039
- Research evidence: Bun command 1.3.9/1.3.14 and Bun host 1.3.14
- Status: TODO
- Publication authority: NONE

## Objective

Expand `effect-build-bun` into two permanent, canonical provider surfaces:

```text
effect-build-bun/Api
effect-build-bun/Command
```

`Api` wraps `Bun.build()` in a Bun host and preserves `BuildConfig` and
`BuildOutput`. `Command` invokes one selected Bun executable under any supported
process-capable Effect host.

Retain Bun source-to-Bun-executable as an independent product. It is not
replaced by the Node recipe because the output embeds the Bun runtime.

Do not publish the `NodeMainProgram` or `BrowserModuleApplication` adapters in
this plan; Plan 043 adds them after both direct lanes are green.

Do not publish, tag, release, merge, or perform the final 0.4 export cut.

## Baseline and drift check

Before editing:

1. verify ancestry from Plan 039 completion and released 0.3;
2. record exact parent SHA, Bun host version, selected command path/version, and
   packaged Bun type version;
3. freeze 0.3 scalar, matrix, and `withJavaScriptBundle` behavior;
4. reproduce research command evidence at Bun 1.3.9 and 1.3.14;
5. add Bun host evidence at both selected range boundaries;
6. stop if provider types or compile/write behavior materially differ from the
   research sketches.

## Permanent `Api` lane

Canonical path:

```text
effect-build-bun/Api
```

```ts
export interface Service {
  readonly build: (
    options: Bun.BuildConfig
  ) => Effect.Effect<Bun.BuildOutput, BunBuildError>
}

export class BunApi extends Context.Service<
  BunApi,
  Service
>()("effect-build-bun/Api") {}

export interface LayerOptions {
  readonly allowUntestedVersion?: boolean
}

export const layerCurrent: (
  options?: LayerOptions
) => Layer.Layer<
  BunApi,
  BunApiUnavailable | ToolVersionUnsupported
>
```

`Bun.build({ compile })` remains a provider-native mode. The API lane does not
add a second `compileExecutable` method unless implementation evidence proves a
truthful stronger durable-publication wrapper. Native compile output, logs, and
write timing remain `BuildOutput` semantics.

The operation requires a Bun host. It never spawns or installs Bun and never
falls back to the command lane.

## Permanent `Command` lane

Canonical path:

```text
effect-build-bun/Command
```

```ts
export interface Service {
  readonly build: (
    input: BuildInput
  ) => Effect.Effect<WrittenOutput, BunCommandBuildError>

  readonly compileExecutable: (
    input: CompileExecutableInput
  ) => Effect.Effect<
    Artifact.Executable<{
      readonly name: "bun"
      readonly version?: string
    }>,
    BunCompileError
  >

  readonly compileExecutableMatrix: (
    input: CompileExecutableMatrixInput
  ) => Effect.Effect<
    readonly Artifact.Executable<{
      readonly name: "bun"
      readonly version?: string
    }>[],
    BunMatrixError
  >
}
```

Command build exposes the broad stable CLI-representable subset. Plugin
callbacks and virtual input maps remain API-only capabilities.

Command compile retains provider-specific Bun runtime target/version/CPU/libc
semantics and uses Plan 039 `Author/Executable` for the single-file durable
lifecycle.

No public command-watch method ships in 0.4. Research proved rebuild and process
termination but not a stable machine-readable readiness/rebuild protocol.

## Provider capability coverage

The direct lanes must cover provider-native breadth rather than the current
narrow pipeline.

### API lane

- one/multiple entrypoints;
- filesystem and virtual files;
- browser, Bun, and Node targets;
- ESM/CJS and supported IIFE behavior;
- JavaScript, TypeScript, JSX/TSX, HTML, CSS, and assets;
- plugins/loaders;
- splitting;
- in-memory output objects and provider writes;
- structured logs;
- compile mode and cross targets.

### Command lane

- CLI-representable multiple entries/outputs;
- browser/Bun/Node targets;
- formats, splitting, minification, source maps, externals;
- output tree and optional metafile observation;
- scalar and matrix Bun executable compilation;
- current supported target table and native validation.

## Compatibility policy

Initial evidence:

```text
Command minimum: 1.3.9
Command maximum/current: 1.3.14
Host evidence: 1.3.14; both-boundary host execution required before release
```

Layer options:

```ts
export interface LayerOptions {
  readonly executable?: string
  readonly allowUntestedVersion?: boolean
}
```

Host and command compatibility are independent facts:

- `Api` observes `Bun.version` and verifies required `Bun.build` capabilities;
- `Command` observes the selected executable path/version and probes required
  flags/modes;
- packaged Bun declarations must type-check consumers across the supported host
  range;
- known-incompatible or missing-capability versions cannot be overridden;
- untested capable versions require explicit Layer override;
- override emits a structured warning and marks tool/build steps
  `untested-override`;
- no installation, fallback, or binary substitution occurs;
- future range widening releases only `effect-build-bun` unless a core contract
  changes.

## Lifecycle and interruption

### API build

Shape:

```ts
Effect.Effect<Bun.BuildOutput, BunBuildError>
```

`Bun.build()` exposes no per-build cancellation handle. Fiber interruption stops
waiting/downstream use. Underlying work or provider direct writes may continue.
The wrapper makes no child-termination or rollback claim.

### Command build

One selected child is scoped. Interruption terminates/reaps the child. For
direct multi-output writes, partial provider output may remain and must be
documented. Do not route arbitrary output sets through the single-file
executable publisher.

### Command executable

Provider validation and tool selection precede staging. Interruption before
atomic rename removes staging and leaves destination unchanged. After rename,
the durable output is not rolled back.

### Matrix

Whole-request collision/target preflight occurs before cells start. Scalar
compile remains the primitive. Each successful cell commits independently;
failure reports committed artifacts. Matrix is not a transaction.

## Error model

API errors retain Bun logs and provider values.

Command build errors distinguish:

- tool discovery/probe/version/capability;
- spawn/completion;
- bounded stdout/stderr;
- provider invalid request/diagnostics;
- output manifest/metafile validation;
- host I/O.

Compile errors additionally distinguish target mapping, native output
inspection, and publication.

Do not merge API and command errors merely because both use Bun.

## Scope

- Add permanent `Api` and `Command` subpaths/services/Layers.
- Move existing scalar/matrix behavior behind `Command` without semantic change.
- Add command build over the selected CLI subset.
- Add host API build over native Bun types/results.
- Add provider-owned compatibility ranges/probes/warnings.
- Add Plan 039 telemetry.
- Keep 0.3 root exports and narrow bundle path as no-publish migration
  delegates until Plan 044.
- Preserve internal fixed Node-main and browser-profile building blocks for Plan
  043.

Out of scope:

- public profile adapters;
- command watch;
- automatic API/command fallback;
- universal output schema/plugin API;
- durable directory transaction;
- Deno, Esbuild, or Node SEA behavior;
- release mutation.

## Steps

1. Pin/characterize Bun host types and API/CLI at both range boundaries.
2. Define separate API and command errors.
3. Implement `BunApi.layerCurrent` and native `build`.
4. Prove API compile mode result/write timing without adding a false durable
   wrapper.
5. Move scalar/matrix compilation to `BunCommand` using `Author/Tool` and
   `Author/Executable`.
6. Implement command build and provider output observation.
7. Add strict/override compatibility behavior for host and command lanes.
8. Add provider spans, runtime/tool compatibility observations, and safe logs.
9. Keep narrow 0.3 delegates thin and unchanged.
10. Add direct API/command examples.
11. Run boundary/current hosts/tools, platform publication, Effect endpoints,
    architecture, and packed consumers.
12. Record exact completion receipt.

## Invariants

- `Api` and `Command` are permanent canonical product surfaces.
- `Api` runs only under Bun and never spawns/falls back.
- `Command` uses the selected executable and never reads global Bun API.
- Host runtime version and selected command version are separate observations.
- Bun executable artifacts record runtime `bun`.
- Browser/Bun/Node targets remain provider-native distinctions.
- API output sets are not flattened into core artifacts.
- Command multi-output direct writes are not described as atomic.
- API interruption makes no false cancellation claim.
- Command interruption terminates/reaps active children.
- Scalar remains matrix primitive; committed cells remain committed.
- No public command watch exists without a stable event protocol.
- No profile is treated as Bun's canonical API.

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
git diff --check
```

Required evidence at Bun 1.3.9, 1.3.14, and current upstream:

- host `Bun.build` at both boundaries;
- command build at both boundaries;
- API multiple entries, virtual files, plugins, HTML/CSS/assets, splitting,
  browser/Bun/Node targets, outputs/logs;
- API compile mode current-host and foreign target result/write timing;
- command build under Node Effect services;
- command scalar/matrix behavior and every advertised target;
- explicit API unavailable under Node;
- no cross-lane fallback;
- strict unsupported error and explicit untested override warning/observation;
- API interruption downstream suppression without false underlying cancellation;
- command interruption/reaping;
- provider direct-write partial-outcome characterization;
- 0.3 delegates and Bun-to-Node-SEA pipeline unchanged;
- packed Api and Command consumers.

## STOP conditions

Stop and report if:

- packaged Bun types cannot cover the supported host range without polluting all
  package consumers;
- native output/log/plugin values must be flattened;
- API compile is wrapped as atomic/cancellable without evidence;
- command build output cannot be observed without guessing outside a
  provider-owned root;
- a host/command version reaches mutation without strict acceptance or explicit
  override;
- the implementation tries automatic lane fallback;
- command watch is exposed by parsing human terminal strings;
- scalar/matrix lifecycle or target evidence regresses;
- profile work begins before both direct lanes are independently green.

## Completion receipt

Record exact source SHA, Bun host/type/command versions, compatibility ranges and
probes, runtime/declaration keys, API/command lifecycle observations, all
workflow/job conclusions, packed consumers, and confirmation that no profile,
publish, tag, release, or merge occurred.
