# Plan 042: Add Deno bundle and complete command lanes

## Status

- Priority: P1 provider-native API
- Effort: XL
- Risk: HIGH unstable upstream API, permissions, project semantics, and runtime acquisition
- Depends on: Plans 039-041
- Planned at: `3c318072cec6debd7c5eae6de14b20c8df4b1842`
- Status: TODO

## Objective

Expand `effect-build-deno` from a narrow command compile adapter into explicit
Deno host-API and command lanes.

Expose:

```text
effect-build-deno/Api
effect-build-deno/Command
```

The API lane wraps `Deno.bundle()` under a Deno host and preserves its
provider-native result. The command lane exposes `deno bundle` and the current
`deno compile` product, including provider-specific permissions, includes,
project/framework behavior, runtime/engine selection, and cross targets.

Deno does not implement the `SingleNodeProgram` profile in this program.

## Upstream stability gate

`Deno.bundle()` is an unstable runtime API and is unavailable inside executables
created by `deno compile`. Plan 042 begins with an explicit source/type/runtime
characterization at the selected Deno version.

Proceed with the public `Api` subpath only if all of these are true:

- the API is present in the selected supported Deno release;
- its TypeScript declarations can be consumed without polluting non-Deno users;
- permission requirements and output ownership can be documented precisely;
- its failure and result shapes are stable enough for a pre-1.0 provider module;
- packed consumers can import other packages without requiring a Deno host.

If a condition fails, stop only the API-lane portion, record the exact upstream
fact, and complete the command lane. Do not invent a compatibility wrapper or
silently implement `Api.bundle` with a child process.

## Public surface

### API lane

```ts
export interface Service {
  readonly bundle: (
    options: Deno.bundle.Options
  ) => Effect.Effect<Deno.bundle.Result, DenoBundleApiError>
}

export class DenoApi extends Context.Service<
  DenoApi,
  Service
>()("effect-build-deno/Api") {}

export const layerCurrent: Layer.Layer<
  DenoApi,
  DenoApiUnavailable
>
```

The operation uses the current Deno runtime permission context. It returns
provider-native in-memory or written output values. It is not a generic
filesystem bundler.

### Command lane

```ts
export interface Service {
  readonly bundle: (
    input: DenoBundleCommandInput
  ) => Effect.Effect<DenoWrittenOutput, DenoBundleCommandError>

  readonly compileExecutable: (
    input: DenoCompileExecutableInput
  ) => Effect.Effect<Artifact.Executable, DenoCompileError>

  readonly compileExecutableMatrix: (
    input: DenoCompileExecutableMatrixInput
  ) => Effect.Effect<
    readonly Artifact.Executable[],
    DenoMatrixError
  >
}

export class DenoCommand extends Context.Service<
  DenoCommand,
  Service
>()("effect-build-deno/Command") {}
```

Provider-native command input must be able to represent, where supported by the
selected Deno release:

- file, URL, package, or project-directory entry;
- permission policy;
- one or many bundle entries;
- HTML bundle roots and output directories;
- browser or Deno bundle platform;
- ESM/CJS/IIFE format;
- code splitting, externals, package handling, minification, sourcemaps, and
  type-check mode;
- compile includes/excludes, workers, dynamic imports, framework detection,
  virtual/self-extracting filesystem, icon, runtime engine, embedded arguments,
  and system target;
- explicit custom `denort`/runtime behavior where the CLI exposes it.

## Interruption and acquisition

### API lane

`Deno.bundle()` is a one-shot Promise without a public cancellation handle.
Effect interruption stops awaiting and suppresses downstream use but cannot
claim that Deno stopped underlying bundling.

Deno permissions are not core Effect filesystem permissions. They are part of
the provider runtime and must remain visible in documentation and tests.

### Command lane

The Deno child is scoped and terminated/reaped on interruption. Watch modes are
long-lived process resources. If `deno compile` downloads a target runtime,
that acquisition is provider behavior and may produce network/cache failures;
it is not hidden inside core publication errors.

## Error model

Separate:

- API unavailable and Deno permission failures;
- API bundle errors/warnings/output records;
- command tool discovery/probe/spawn/completion;
- Deno bundle graph/type-check/config failures;
- Deno compile target/runtime acquisition and provider diagnostics;
- core durable-output validation/publication failures.

Do not flatten Deno module specifiers, permissions, or project errors into Bun's
`InvalidDriverOptions` vocabulary.

## Scope

- Add `Api` after passing the upstream stability gate.
- Add command `bundle` with one-shot and scoped watch variants if watch can be
  typed without exposing a raw process handle.
- Expand command compile input to the selected 0.4 provider-native subset.
- Move current scalar/matrix behavior behind `DenoCommand` through Plan 039's
  `CommandCompiler`.
- Preserve current target evidence and publication validation.
- Add Plan 039 telemetry.
- Keep 0.3 root exports as no-publish delegates until Plan 044.

Out of scope:

- `SingleNodeProgram` profile;
- universal module graph;
- automatic `denort` installation policy beyond Deno's own documented behavior;
- shared Bun/Deno compile request;
- generic watch service;
- declaration generation.

## Steps

1. Pin and characterize exact Deno runtime/API/CLI source and declarations.
2. Execute the API stability gate and record its result before authoring public
   declarations.
3. Define Deno API and command errors with provider-native diagnostics.
4. Implement `DenoApi.layerCurrent` and `bundle` if the gate passes.
5. Implement command `bundle` over Plan 039 command/temporary-output mechanics.
6. Model watch as a scoped Deno-specific resource if included.
7. Expand compile request validation and argv rendering for provider-native
   permissions/includes/runtime/engine/project options selected for 0.4.
8. Preserve scalar/matrix lifecycle and output ordering.
9. Add examples for runtime API bundle, command bundle, project compile, and
   cross-target compile.
10. Run Deno-host API, Node-host command, real compile targets, Effect endpoint,
    architecture, and packed consumer verification.

## Invariants

- `DenoApi` requires Deno and never spawns the CLI.
- `DenoCommand` never reads the global Deno API.
- Deno permission and project behavior stay provider-specific.
- Runtime acquisition/cache behavior is observed, not reimplemented in core.
- Command interruption terminates active work; API interruption does not make a
  false cancellation claim.
- Deno executables remain Deno-runtime artifacts.
- Matrix remains homogeneous and scalar compilation remains the primitive.
- Importing non-Deno packages does not require a Deno host or Deno global types.

## Verification

```sh
bun run build
bun run check
bun run test:types
bun run test:unit
bun run test:architecture
bun run verify
bun run verify:effect
EFFECT_BUILD_DENO_VERSION=<pinned> bun run verify:real
git diff --check
```

Required focused evidence:

- Deno API presence/absence receipt at exact version;
- API bundle with multiple entries, in-memory and written outputs, formats,
  platforms, splitting, external imports, and permissions;
- API unavailable under Node and unavailable behavior in a compiled Deno
  executable if upstream documents/enforces it;
- command bundle with file and HTML entries;
- command type-check and watch lifecycle where exposed;
- compile permissions, include/include-as-is, dynamic import/worker behavior,
  project/framework directory, engine selection, current host, and foreign
  targets;
- runtime acquisition failure separated from publication failure;
- scalar/matrix 0.3 behavior remains green through delegates.

## STOP conditions

Stop and report if:

- `Deno.bundle()` cannot be typed or isolated without forcing Deno globals on
  every package consumer;
- the API is absent or materially changed at the selected release;
- command bundle output cannot be identified without guessing files outside a
  provider-owned output directory;
- provider network/runtime acquisition is mistaken for core automatic
  installation;
- Deno permissions are normalized into an incomplete generic permission model;
- a Node-profile adapter is added merely for symmetry;
- current compile target evidence regresses.
