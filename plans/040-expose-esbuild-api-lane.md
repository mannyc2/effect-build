# Plan 040: Expose the Esbuild host API lane

## Status

- Priority: P1 provider-native API
- Effort: L
- Risk: HIGH scoped native context and public provider types
- Depends on: Plan 039
- Architecture commit: `e23722e81fa651c1540c8aa72e2703ff62ac609b`
- Status: TODO

## Objective

Publish `effect-build-esbuild/Api` as an Effect-native wrapper over Esbuild's
actual programmatic API:

```text
build
transform
scoped context
  rebuild
  watch
  serve
  cancel
```

Preserve Esbuild options/results, plugins, diagnostics, output files, and
metafiles. Keep the one-main Node behavior package-private for Plan 043; do not
publish the portable profile here.

## Upstream contract

At
[`evanw/esbuild@f6058f8`](https://github.com/evanw/esbuild/blob/f6058f8364fe7ab91ca57a83e02577ed74c9cae4/lib/shared/types.ts):

- `build()` returns `BuildResult` and rejects with provider failure;
- `transform()` is a separate one-input operation;
- Node-only `context()` exposes `rebuild`, `watch`, `serve`, `cancel`, and
  `dispose`;
- `watch()` starts watch state and returns `Promise<void>`;
- `serve()` starts a server and returns `ServeResult`;
- one-shot build/transform have no per-call cancellation handle.

## Public contract

Canonical path:

```text
effect-build-esbuild/Api
```

```ts
import type * as esbuild from "esbuild"

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

export class EsbuildApi extends Context.Service<
  EsbuildApi,
  Service
>()("effect-build-esbuild/Api") {}

export const layer: Layer.Layer<
  EsbuildApi,
  EsbuildVersionMismatch
>
```

`dispose()` is hidden; Scope owns release. `cancel()` stays public because it
cancels active work without releasing the context.

## Errors and interruption

Direct errors retain message IDs, plugin names, text, locations, notes,
warnings/errors, safe detail, version/init failure, and exact provider object
where useful. They are not converted to command `ToolFailed`.

One-shot interruption means only that the fiber stops awaiting and downstream
Effect use stops. It does not claim to cancel Esbuild work or direct writes.

Context release is stronger: finalization invokes `cancel()` then `dispose()`
exactly once, uninterruptibly after it starts. Caller failures, defects, and
interruptions are never converted to Esbuild errors.

## Scope

In scope: build, transform, scoped context, rebuild/watch/serve/cancel,
provider-native outputs/diagnostics/plugins/loaders, multiple entries/outputs,
telemetry, and package-private support for the future profile.

Out of scope: Esbuild CLI, public SingleNodeProgram, generic output schemas,
shared plugins, declarations, cache/remote execution.

## Steps

1. Pin exact Esbuild package/declarations.
2. Define provider errors and guards.
3. Implement build and transform.
4. Implement scoped context and handle.
5. Finalize with cancel then dispose exactly once.
6. Prove two contexts do not use global `esbuild.stop()` or interfere.
7. Preserve the existing one-main characterization in package-private support;
   Plan 043 supplies FileSystem/Path/Crypto requirements.
8. Add lane telemetry without logging paths/options/plugins.
9. Add provider-native examples and run the full gate.

## Invariants

- Provider types remain recognizable.
- Build, transform, and context remain distinct.
- Watch/serve are start operations; context Scope owns lifetime.
- `cancel` is public; `dispose` is Scope-owned.
- Release occurs exactly once after every Exit.
- One-shot operations make no false cancellation claim.
- Plugins, output files, and metafiles are preserved.
- The direct Api Layer has no Effect FileSystem/Path/Crypto requirement solely
  for a profile adapter.
- No sibling integration dependency is introduced.

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

Required provider evidence: memory/disk outputs; multiple entries; supported
formats/platforms; CSS/assets/splitting; plugin lifecycle; structured
errors/warnings/notes/locations/details; transform; context rebuild/watch/serve;
manual cancel; cancel/dispose ordering under interruption; concurrent contexts;
one-shot interruption without cancellation claims; unchanged profile
characterization.

## STOP conditions

Stop if provider types require `unknown`; context release cannot safely
cancel/dispose once; cleanup requires global stop; watch/serve cannot be tied to
Scope; one-shot calls are represented as cancellable; provider output or
metadata is dropped; or existing profile lifetime/Cause behavior regresses.

## Completion receipt

Completion requires one Esbuild-focused implementation PR with exact source SHA,
provider version, and observed CI. Do not combine it with Bun, Deno, profile
publication, or the final hard cut.
