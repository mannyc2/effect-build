# Plan 042: Publish permanent Deno API and command lanes

## Status

- Priority: P1 permanent provider API
- Effort: XL
- Risk: HIGH unstable host API, declaration isolation, permissions, and runtime acquisition
- Depends on: Plan 039
- Research evidence: Deno command 2.9.3/2.9.5 and host API 2.9.3
- Status: TODO
- Publication authority: NONE

## Objective

Expand `effect-build-deno` into two permanent, canonical provider surfaces:

```text
effect-build-deno/Api
effect-build-deno/Command
```

`Api` wraps unstable `Deno.bundle()` under a Deno host. `Command` exposes typed
Deno bundle, compile, and compile matrix over one selected Deno executable.

Provider-native semantics remain visible: module specifiers, HTML, declarations,
workspace/config behavior, permissions, includes, workers, dynamic imports,
framework/project detection, runtime/engine selection, target runtime
acquisition, and provider diagnostics.

Do not publish `BrowserModuleApplication` in this plan; Plan 043 adds the adapter
after both direct lanes are green.

Do not publish, tag, release, merge, or perform the final 0.4 export cut.

## Baseline and drift check

Before editing:

1. verify ancestry from Plan 039 completion and released 0.3;
2. record exact parent SHA, host Deno version, selected command path/version,
   official unstable declarations, and `denort` source/version;
3. freeze 0.3 scalar/matrix behavior;
4. reproduce command capability probes at Deno 2.9.3 and 2.9.5;
5. reproduce host API in-memory/write/compiled-binary/permission behavior at
   both intended boundaries;
6. stop if the official declaration or runtime shape materially changed.

## Permanent `Api` lane

Canonical path:

```text
effect-build-deno/Api
```

The package owns an isolated structural declaration matching the supported
unstable API. Importing unrelated packages does not require ambient Deno global
types.

```ts
export interface Service {
  readonly bundle: (
    options: BundleOptions
  ) => Effect.Effect<BundleResult, DenoBundleApiError>
}

export class DenoApi extends Context.Service<
  DenoApi,
  Service
>()("effect-build-deno/Api") {}

export interface LayerOptions {
  readonly allowUntestedVersion?: boolean
}

export const layerCurrent: (
  options?: LayerOptions
) => Layer.Layer<
  DenoApi,
  DenoApiUnavailable | ToolVersionUnsupported
>
```

The Layer checks:

- Deno host presence;
- exact runtime version;
- `Deno.bundle` presence;
- supported unstable API shape.

It does not enable `--unstable-bundle`, grant permissions, spawn the CLI, or
fallback to `Command`.

## Permission evidence correction

Official declaration comments state that bundle requires local read/import and
write permissions. Real Deno 2.9.3 research succeeded for local read and write
without explicit grants, and `write: false` also succeeded without explicit
read permission.

Therefore:

- the architecture records official permission comments and observed runtime
  behavior separately;
- `Api` must not normalize failures into a promised `DenoPermissionDenied`
  family until both range boundaries demonstrate stable enforcement;
- exact provider exceptions/errors remain available;
- documentation states the observed version-specific behavior rather than
  claiming stronger authority;
- contradiction between docs/source/runtime is a hard release gate, not a reason
  to invent a permission model.

Compiled Deno 2.9.3 output exposed no `Deno.bundle` function and failed with a
plain `TypeError`. Do not depend on a friendly provider error string from newer
source unless the selected release proves it.

## Permanent `Command` lane

Canonical path:

```text
effect-build-deno/Command
```

```ts
export interface Service {
  readonly bundle: (
    input: BundleInput
  ) => Effect.Effect<WrittenOutput, DenoBundleCommandError>

  readonly compileExecutable: (
    input: CompileExecutableInput
  ) => Effect.Effect<
    Artifact.Executable<{
      readonly name: "deno"
      readonly version?: string
    }>,
    DenoCompileError
  >

  readonly compileExecutableMatrix: (
    input: CompileExecutableMatrixInput
  ) => Effect.Effect<
    readonly Artifact.Executable<{
      readonly name: "deno"
      readonly version?: string
    }>[],
    DenoMatrixError
  >
}
```

Bundle input must represent the stable selected CLI subset, including:

- file, URL, package, project, or HTML entry;
- output file or directory;
- browser/Deno platform;
- ESM/CJS/IIFE;
- splitting, externals, packages, minification, source maps, keep names;
- declaration output;
- type-check/config/workspace controls where supported.

Compile input retains:

- permission policy;
- includes/include-as-is;
- workers/dynamic imports;
- project/framework directory behavior;
- virtual/self-extracting filesystem options;
- icon and embedded arguments;
- engine/runtime selection;
- canonical system target;
- explicit `DENORT_BIN`/runtime authority where provider supports it.

No public command-watch method ships in 0.4. Research proved rebuild and child
termination, but not a stable machine-readable readiness/rebuild protocol.

## Compatibility policy

Initial evidence:

```text
Command minimum: 2.9.3
Command maximum/current: 2.9.5
Host evidence: 2.9.3; both-boundary host execution required before release
```

Host and command compatibility are independent:

- `Api` observes `Deno.version.deno`, unstable API presence, and declaration
  shape;
- `Command` observes selected executable path/version and probes required flags;
- generated/owned structural types are conformance-checked against official
  declarations at both boundaries;
- known-incompatible and missing-capability versions cannot be overridden;
- untested capable versions require explicit Layer override;
- override emits a structured warning and marks observations
  `untested-override`;
- no runtime installation, fallback, or command/API substitution occurs;
- future range widening releases only `effect-build-deno` unless a core
  contract changes.

## Lifecycle and interruption

### Host API bundle

Shape:

```ts
Effect.Effect<BundleResult, DenoBundleApiError>
```

There is no public per-bundle cancellation handle. Fiber interruption stops
waiting/downstream use but cannot claim underlying cancellation. Provider direct
writes may already exist.

### Command bundle

One selected child is scoped. Interruption terminates/reaps it. Provider-written
multi-file output may be partial after failure/interruption and is not described
as transactional.

### Command compile

Validation/tool compatibility precede staging. Single-file candidate validation
and atomic publication use Plan 039 `Author/Executable`.

Deno runtime acquisition/cache/network failure remains provider-specific and is
separate from core publication failure.

### Matrix

Scalar compile remains the primitive. Whole-request preflight precedes bounded
cells. Each successful artifact commits independently. Failure reports
committed artifacts; interruption cleans active staging without rollback.

## Error model

Separate:

- host unavailable/unsupported API;
- exact provider host API exception/result errors;
- selected tool discovery/probe/version/capability;
- command spawn/completion/bounded output;
- module graph/config/type-check/bundle diagnostics;
- declaration generation/output validation;
- compile permissions/includes/workers/project/runtime acquisition;
- target mapping/native inspection/publication.

Do not normalize Deno permissions into an incomplete cross-provider permission
schema. Do not hide runtime acquisition inside generic publication errors.

## Scope

- Add permanent `Api` and `Command` modules/services/Layers.
- Add isolated API declarations and boundary conformance fixtures.
- Add command bundle over the stable CLI subset.
- Move scalar/matrix compile behavior behind `Command` unchanged.
- Expand compile request to the selected provider-native 0.4 subset.
- Add provider-owned compatibility ranges/probes/warnings.
- Add Plan 039 telemetry.
- Keep 0.3 root compile exports as thin no-publish delegates until Plan 044.
- Preserve internal browser-profile building blocks for Plan 043.

Out of scope:

- public browser profile adapter;
- command watch;
- Node-main profile;
- universal permissions/source graph/output schema;
- automatic `denort` installation beyond explicit provider behavior;
- release mutation.

## Steps

1. Pin official unstable declarations/source at both range boundaries.
2. Generate/author isolated package declarations and prove non-Deno imports stay
   clean.
3. Run API presence/result/write/permission/compiled-binary probes at both
   boundaries.
4. Define exact API and command error classes without invented permission
   guarantees.
5. Implement `DenoApi.layerCurrent` and direct `bundle` if the hard gate passes.
6. Implement command bundle with provider-owned output observation.
7. Move/expand scalar/matrix compile through `Author/Tool` and
   `Author/Executable`.
8. Add strict/override compatibility behavior.
9. Add provider spans, runtime/tool observations, and safe logs.
10. Keep 0.3 delegates thin and unchanged.
11. Add host API, command bundle, declarations, project compile, and cross-target
    examples.
12. Run oldest/newest/current hosts/tools, platform publication, Effect
    endpoints, architecture, and packed consumers.
13. Record exact completion receipt and any docs/runtime contradiction.

## Invariants

- `Api` and `Command` are permanent canonical product surfaces.
- `Api` requires Deno and never spawns/falls back.
- `Command` never reads global Deno API.
- Host version and selected command version are separate observations.
- Deno executable artifacts record runtime `deno`.
- Permission/project/runtime behavior remains provider-specific.
- API declarations do not pollute unrelated consumers.
- API interruption makes no false cancellation claim.
- Command interruption terminates/reaps active children.
- Provider direct multi-output writes are not described as atomic.
- Runtime acquisition/cache behavior is observed, not reimplemented in core.
- Scalar remains matrix primitive; committed cells remain committed.
- No command watch exists without stable provider events.
- No profile is treated as Deno's canonical API.

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

Required evidence at Deno 2.9.3, 2.9.5, and current upstream:

- API declaration shape and import isolation;
- API in-memory/written bundle;
- exact local read/write permission behavior;
- missing unstable flag/API behavior;
- compiled-binary absence behavior;
- command bundle file/HTML entries;
- declaration output and unresolved-reference validation;
- command platform/format/splitting/package/external/source-map options;
- command watch remains unexported, with research receipt retained;
- project compile, permissions/includes/workers/dynamic imports/framework;
- engine/runtime selection and current/foreign targets;
- runtime acquisition failure separated from publication failure;
- strict unsupported error and explicit untested override warning/observation;
- scalar/matrix 0.3 behavior unchanged;
- packed Api and Command consumers.

## STOP conditions

Stop and report if:

- isolated API types force Deno globals on unrelated consumers;
- `Deno.bundle` is absent/materially changed at a boundary;
- permission behavior cannot be documented without pretending the official
  comments match runtime observation;
- the implementation invents a friendly compiled-binary error not provided by
  the selected release;
- command output discovery guesses files outside a provider-owned output root;
- provider runtime acquisition is mistaken for core installation policy;
- an unsupported version reaches mutation without strict acceptance or explicit
  override;
- command watch is exposed by parsing human terminal strings;
- Deno is forced into the Node-main profile for symmetry;
- scalar/matrix target evidence regresses;
- Plan 043 browser-profile work begins before direct lanes are independently
  green.

## Completion receipt

Record exact source SHA, Deno host/command/denort versions, official and owned
declaration hashes, permission/compiled-binary observations, compatibility
ranges/probes, runtime/declaration keys, all workflow/job conclusions, packed
consumers, and confirmation that no profile, publish, tag, release, or merge
occurred.
