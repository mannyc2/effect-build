# Plan 040: Expose the full Esbuild API lane

## Status

- Priority: P1 provider-native API
- Effort: L
- Risk: HIGH public provider surface and scoped native context
- Depends on: Plan 039
- Planned at: `3c318072cec6debd7c5eae6de14b20c8df4b1842`
- Status: TODO

## Objective

Make `effect-build-esbuild` an Effect-native integration for Esbuild's actual
programmatic API rather than only a fixed one-file Node bundle profile.

Expose:

```text
build
transform
scoped context
rebuild
watch
serve
```

Retain exact provider result and diagnostic information. Keep the existing
single-Node-program behavior as a private/direct adapter for Plan 043; do not
publish the portable profile in this plan.

## Upstream contract

The pinned Esbuild API distinguishes:

- `build()` over filesystem or stdin inputs, one or many entrypoints, in-memory
  or written outputs, plugins, loaders, splitting, and metafiles;
- `transform()` over one in-memory source value;
- `context()` as a long-lived resource supporting rebuild, watch, serve,
  cancel, and dispose.

Plan 040 must preserve those distinctions. It must not define one broad
`bundle()` method that loses transform or context semantics.

## Public surface

Add canonical subpath:

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
  ) => Effect.Effect<void, EsbuildBuildError>
  readonly serve: (
    options: esbuild.ServeOptions
  ) => Effect.Effect<esbuild.ServeResult, EsbuildBuildError>
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
    EsbuildBuildError,
    Scope.Scope
  >
}
```

The scoped handle does not expose `dispose()`. Its finalizer calls provider
`cancel()` then `dispose()` exactly once. Release is uninterruptible after it
begins, while the use region remains interruptible.

## Error model

Direct API failures retain:

- Esbuild message IDs;
- plugin names;
- text;
- locations;
- notes;
- provider detail values where safe to retain;
- warnings separately from errors;
- version mismatch and API initialization failures.

Do not normalize direct API errors into the core command `ToolFailed` family.
The later portable profile may project them into profile diagnostics while
retaining the provider error.

## Scope

- Add `Api` module and Layer.
- Preserve exact Esbuild dependency/version policy unless a dedicated dependency
  change is required and explicitly reviewed.
- Add build, transform, and scoped-context unit and integration tests.
- Add in-memory and written output characterization.
- Add multi-entry, multi-output, splitting, asset, CSS, plugin, and metafile
  cases.
- Add rebuild, watch setup, serve setup, cancellation, and disposal tests.
- Instrument operations with Plan 039 telemetry attributes.
- Keep 0.3 root `withJavaScriptBundle` as a temporary delegate during the
  no-publish migration.

Out of scope:

- Esbuild CLI lane;
- portable profile publication;
- generic output-set schema;
- shared plugin API;
- remote execution or caching;
- TypeScript declaration generation.

## Steps

1. Pin and characterize the exact Esbuild API declarations used by the package.
2. Define direct provider error classes without flattening message structure.
3. Implement one-shot `build` with full option/result typing.
4. Implement one-shot `transform` as a separate operation.
5. Implement scoped `context`; capture `cancel`/`dispose` and hide manual release
   from callers.
6. Prove concurrent contexts do not call global `esbuild.stop()` and do not
   interfere with each other.
7. Adapt the current fixed bundle implementation to the new service internally
   without widening its profile contract.
8. Add telemetry spans and provider fields.
9. Add examples for in-memory build, written build, transform, and watch.
10. Run deterministic, real Esbuild, Effect endpoint, architecture, and packed
    consumer verification.

## Invariants

- Provider-native API types remain recognizable to Esbuild users.
- `build`, `transform`, and `context` are distinct operations.
- Context resources are released exactly once on success, failure, defect, and
  interruption.
- A context callback Cause is never converted to `EsbuildBuildError`.
- Plugins remain Esbuild plugins, not a core abstraction.
- Provider-native multi-output results are not forced into one core artifact.
- The fixed one-file profile remains available internally for Plan 043.

## Verification

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

Required focused evidence:

- `write: false` output files and `write: true` disk output;
- one and multiple entrypoints;
- ESM/CJS and browser/node/neutral platforms;
- CSS and file-loader side outputs;
- plugin resolve/load/dispose;
- structured errors, warnings, notes, locations, and IDs;
- transform success/failure;
- context rebuild;
- watch start and scoped release;
- cancel/dispose ordering under interruption;
- two concurrent contexts;
- current single-Node-program tests unchanged.

## STOP conditions

Stop and report if:

- full API typing requires replacing provider types with `unknown` or a guessed
  generic option model;
- context release cannot call cancel/dispose safely exactly once;
- the implementation needs global `esbuild.stop()` for per-context cleanup;
- provider plugins or output files are silently discarded;
- a one-shot API is represented as cancellable when Esbuild provides no such
  operation;
- the existing profile's lifetime or Cause behavior regresses.
