# Plan 040: Expose the Esbuild host API lane

## Status

- Priority: P1 provider-native API
- Effort: L
- Risk: HIGH scoped native context and public provider types
- Depends on: Plan 039
- Architecture commit: `e23722e81fa651c1540c8aa72e2703ff62ac609b`
- Status: TODO

## Objective

Make `effect-build-esbuild/Api` an Effect-native integration for Esbuild's
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

Preserve Esbuild options, result values, plugins, diagnostics, output files, and
metafiles. Keep the existing fixed one-main Node behavior as a private/direct
adapter for Plan 043. Do not publish the portable profile here.

## Upstream contract

At Esbuild ref
[`f6058f8`](https://github.com/evanw/esbuild/blob/f6058f8364fe7ab91ca57a83e02577ed74c9cae4/lib/shared/types.ts):

- `build()` returns a Promise of `BuildResult` and rejects with provider build
  failure;
- `transform()` is a separate one-input operation;
- `context()` is the advanced Node-only API;
- `BuildContext` exposes `rebuild()`, `watch()`, `serve()`, `cancel()`, and
  `dispose()`;
- `watch()` starts watch state and returns `Promise<void>`;
- `serve()` starts a server and returns `ServeResult`;
- one-shot build/transform expose no per-call cancellation handle.

The wrapper must preserve these distinctions.

## Canonical public module

```text
effect-build-esbuild/Api
```

Root `effect-build-esbuild` re-exports the `Api` namespace only; direct subpath
imports remain canonical.

## Target declarations

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
  ) => Effect.Effect<
    esbuild.ServeResult,
    EsbuildContextError
  >

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
  EsbuildVersionMismatch,
  FileSystem.FileSystem | Path.Path
>
```

`dispose()` is not public. Scope owns release. `cancel()` remains public because
it is an operational provider capability and does not release the context.

## Error contract

Direct provider errors retain:

- Esbuild message IDs;
- plugin names;
- text;
- source locations;
- notes;
- warnings separately from errors;
- provider detail values where safe;
- version mismatch and initialization failure;
- the exact provider failure object where identity is useful.

Do not convert direct Esbuild failures into command `ToolFailed`.

One-shot Promise interruption semantics are explicit:

> Fiber interruption stops awaiting and prevents downstream Effect use. It does
> not claim to cancel the underlying Esbuild build/transform or provider direct
> writes.

Context semantics are stronger:

- `rebuild` may be canceled through `cancel`;
- Scope finalization invokes `cancel()` then `dispose()` exactly once;
- finalization is uninterruptible after it begins;
- callback failures/defects/interruption are not converted to Esbuild errors.

## Scope

In scope:

- exact `Api` module and Layer;
- build and transform;
- scoped context;
- rebuild, watch setup, serve setup, cancel;
- provider result/diagnostic preservation;
- in-memory and written outputs;
- multiple entries and side outputs;
- plugins/loaders;
- telemetry from Plan 039;
- internal adaptation of the current fixed profile.

Out of scope:

- Esbuild CLI lane;
- SingleNodeProgram public exports;
- generic output-set schema;
- shared plugin API;
- declaration generation;
- remote execution/caching.

## Steps

1. Pin the exact Esbuild package and declarations.
2. Define provider error wrappers and identity guards.
3. Implement one-shot `build`.
4. Implement one-shot `transform`.
5. Implement scoped `context`.
6. Expose rebuild/watch/serve/cancel on the handle.
7. Finalize with cancel then dispose exactly once.
8. Prove two concurrent contexts do not call global `esbuild.stop()` and do not
   interfere.
9. Adapt the existing one-main implementation internally.
10. Add root and child telemetry spans without logging paths/options/plugins.
11. Add provider-native examples.
12. Run full verification and record actual jobs.

## Invariants

- Provider types remain recognizable to Esbuild users.
- Build, transform, and context remain distinct.
- `watch()` is a start operation, not represented as a never-ending Effect.
- The context Scope, not the watch call, owns watch/server lifetime.
- `cancel` is public; `dispose` is Scope-owned.
- Context release happens exactly once after every Exit.
- One-shot operations make no false cancellation claim.
- Plugins and output files are never flattened or discarded.
- The fixed profile remains narrower than the direct API.
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

Focused real/provider tests:

- `write: false` output files;
- `write: true` disk output;
- one and multiple entries;
- ESM/CJS/IIFE where provider supports them;
- browser/node/neutral platform;
- CSS and file-loader outputs;
- splitting;
- plugin resolve/load/dispose;
- structured errors, warnings, notes, locations, IDs, and details;
- transform success/failure;
- context rebuild;
- watch start and scope close;
- serve start and scope close;
- manual cancel followed by later use characterization;
- cancel/dispose ordering under interruption;
- two concurrent contexts;
- one-shot interruption without cancellation claims;
- current fixed-profile tests unchanged.

## STOP conditions

Stop and report if:

- public typing requires replacing provider options/results with `unknown`;
- context release cannot safely call cancel/dispose once;
- per-context cleanup requires global `esbuild.stop()`;
- watch or serve cannot be tied to context Scope;
- one-shot build/transform is represented as cancellable;
- provider plugins, diagnostics, output files, or metafiles are dropped;
- the existing profile's lifetime or Cause behavior regresses.

## Completion receipt

Completion requires one Esbuild-focused implementation PR with exact source SHA,
provider version, and observed CI. Do not combine it with Bun, Deno, the public
profile, or the final 0.4 export cut.
