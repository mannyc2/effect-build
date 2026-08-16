# Plan 040: Publish the permanent Esbuild API lane

## Status

- Priority: P1 permanent provider API
- Effort: L
- Risk: HIGH provider typing, diagnostics, and scoped native context
- Depends on: Plan 039
- Research evidence: Esbuild 0.28.1 and 0.28.2 plus scoped-context fixtures
- Status: TODO
- Publication authority: NONE

## Objective

Make `effect-build-esbuild/Api` a permanent, canonical Effect-native wrapper for
the real Esbuild package API:

```text
build
transform
scoped context
rebuild
watch start
serve start
cancel
```

Preserve provider-native options, results, plugins, output files, metafiles, and
diagnostics. Do not publish portable profiles in this plan; Plan 043 adds the
`NodeMainProgram` adapter after the direct API is independently usable.

Do not add an Esbuild command lane, package publication, tag, release, merge, or
final 0.4 export cut.

## Baseline and drift check

Before editing:

1. verify ancestry from Plan 039 completion and released 0.3;
2. record exact parent SHA and installed Esbuild version;
3. freeze current `withJavaScriptBundle` behavior as a migration delegate;
4. reproduce the research context lifecycle under Esbuild 0.28.1 and 0.28.2;
5. stop if the selected Esbuild package declarations differ materially from the
   research contract.

## Permanent public surface

Canonical path:

```text
effect-build-esbuild/Api
```

Sketch:

```ts
export interface ContextHandle<
  Options extends esbuild.BuildOptions
> {
  readonly rebuild: Effect.Effect<
    esbuild.BuildResult<Options>,
    EsbuildBuildError
  >
  readonly watch: (
    options?: esbuild.WatchOptions
  ) => Effect.Effect<void, EsbuildContextError>
  readonly serve: (
    options?: esbuild.ServeOptions
  ) => Effect.Effect<esbuild.ServeResult, EsbuildContextError>
  readonly cancel: Effect.Effect<void, EsbuildContextError>
}

export interface Service {
  readonly build: <Options extends esbuild.BuildOptions>(
    options: Options
  ) => Effect.Effect<
    esbuild.BuildResult<Options>,
    EsbuildBuildError
  >

  readonly transform: <Options extends esbuild.TransformOptions>(
    input: string | Uint8Array,
    options?: Options
  ) => Effect.Effect<
    esbuild.TransformResult<Options>,
    EsbuildTransformError
  >

  readonly context: <Options extends esbuild.BuildOptions>(
    options: Options
  ) => Effect.Effect<
    ContextHandle<Options>,
    EsbuildContextError,
    Scope.Scope
  >
}
```

`dispose` is hidden because Scope owns release. The finalizer calls `cancel()`
then `dispose()` exactly once. The handle's `cancel` remains public because it is
an operation during the context lifetime, not manual ownership release.

`watch()` and `serve()` start provider state and return. The context remains the
long-lived resource.

## Compatibility policy

Initial evidence range:

```text
minimum: 0.28.1
maximum: 0.28.2
current: 0.28.2
```

Layer options:

```ts
export interface LayerOptions {
  readonly allowUntestedVersion?: boolean
}
```

Rules:

- observe `esbuild.version` at Layer construction;
- reject known-incompatible or missing-context-capability versions;
- reject untested versions by default;
- explicit override emits `ToolVersionUntestedOverride` and marks all Esbuild
  steps `untested-override`;
- use the installed Esbuild package declarations;
- no automatic package installation or runtime fallback;
- range widening is an independent Esbuild-provider package release after
  oldest/newest/current CI passes.

## Error model

Direct errors retain:

- message IDs;
- plugin names;
- text;
- source locations;
- notes;
- provider `detail` values where safe;
- warnings separately from errors;
- API initialization/version failures;
- context operation (`rebuild`, `watch`, `serve`, `cancel`, `dispose`) identity.

Do not normalize direct API errors into command-tool failures. Do not catch
caller callback failures as Esbuild errors.

## Lifecycle contract

### One-shot `build` and `transform`

Shape:

```ts
Effect.Effect<Result, ProviderError>
```

There is no per-operation Esbuild cancellation handle. Fiber interruption stops
the Effect consumer, but the implementation does not claim that underlying
work stopped. Provider direct writes may already exist.

### Scoped context

State machine:

```text
requested
-> validated
-> context started
-> ready
-> rebuild/watch/serve/cancel operations
-> Scope release: cancel -> dispose
```

Release is exactly once and uninterruptible after it begins. A context method's
provider failure does not release the context prematurely. Concurrent contexts
must not call global `esbuild.stop()` or interfere with one another.

## Scope

- Add `Api` module, service tag, operations, errors, and Layer.
- Preserve exact provider generic result typing.
- Add compatibility selection and telemetry from Plan 039.
- Add build, transform, context, rebuild, watch-start, serve-start, cancel, and
  release tests.
- Add provider-native multi-entry/output, browser/node/neutral, plugins,
  loaders, CSS/assets, splitting, in-memory/written output, and metafile tests.
- Keep the 0.3 root `withJavaScriptBundle` as a thin no-publish delegate until
  Plan 044.
- Keep the internal fixed Node-main implementation available for Plan 043.

Out of scope:

- Esbuild CLI lane;
- `NodeMainProgram` public adapter;
- `IncrementalNodeMain` public profile;
- generic output set or dependency graph;
- durable multi-file publication;
- declaration generation;
- release mutation.

## Steps

1. Pin the exact Esbuild package/declarations and record version.
2. Implement provider-native build and transform wrappers.
3. Implement scoped context with explicit operation errors.
4. Implement release as cancel then dispose exactly once.
5. Add strict and untested-override compatibility behavior.
6. Add stable provider root spans and safe diagnostics logs.
7. Adapt the existing fixed Node-main implementation internally without
   widening its profile semantics.
8. Add examples for in-memory build, written build, transform, watch, and serve.
9. Run boundary/current Esbuild versions, current repository verification, and
   packed consumers.
10. Record exact completion receipt.

## Invariants

- `Api` is a permanent canonical provider surface.
- Provider-native types remain recognizable to Esbuild users.
- Build, transform, and context are distinct operations.
- One-shot operations make no cancellation or rollback claim.
- Context release is exactly once on success, failure, defect, and interruption.
- Context callback Causes are never converted to Esbuild errors.
- Plugins remain Esbuild plugins.
- Provider output files/metafiles are not flattened into a core schema.
- Direct writes do not inherit atomic executable-publication semantics.
- Concurrent contexts never depend on global `esbuild.stop()` for cleanup.
- No profile becomes the canonical Esbuild API.

## Required verification

```sh
bun run build
bun run check
bun run test:types
bun run test:unit
bun run test:architecture
bun run verify
bun run verify:effect
git diff --check
```

Required real evidence at 0.28.1, 0.28.2, and current upstream:

- `write: false` output files and `write: true` direct writes;
- single/multiple entrypoints;
- ESM/CJS, browser/node/neutral;
- CSS and asset outputs;
- plugin resolve/load/dispose and provider details;
- structured errors, warnings, IDs, notes, locations;
- transform success/failure;
- context rebuild after source mutation;
- watch and serve start;
- explicit cancel;
- cancel/dispose ordering under interruption;
- release after method failure;
- two concurrent contexts;
- no global stop interference;
- current 0.3 Node-main delegate unchanged;
- packed direct API consumer.

## STOP conditions

Stop and report if:

- exact provider typing requires guessed generic types or `unknown` replacement;
- one-shot wrappers would claim provider cancellation;
- scoped release cannot safely call cancel/dispose exactly once;
- global `esbuild.stop()` is required for per-context release;
- provider plugins, output files, warnings, or metafiles are discarded;
- an untested version reaches operation execution without strict failure or
  explicit override;
- direct writes are described as transactional;
- Plan 043 profile work begins before this direct API is independently green;
- 0.3 delegate behavior regresses.

## Completion receipt

Record exact source SHA, Esbuild versions/declarations, runtime/declaration keys,
compatibility policy, context lifecycle observations, all workflow/job
conclusions, packed consumer result, and confirmation that no profile, publish,
tag, release, or merge occurred.
