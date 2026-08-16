# Plan 041: Add Bun API and command build lanes

## Status

- Priority: P1 provider-native API
- Effort: XL
- Risk: HIGH dual-lane semantics and Bun-host verification
- Depends on: Plans 039-040
- Planned at: `3c318072cec6debd7c5eae6de14b20c8df4b1842`
- Status: TODO

## Objective

Expand `effect-build-bun` from a command compiler plus one fixed Node bundle
profile into explicit Bun host-API and command lanes.

Expose:

```text
effect-build-bun/Api
effect-build-bun/Command
```

The API lane wraps `Bun.build()` and requires Bun as the Effect orchestrator
host. The command lane invokes a selected Bun executable and remains usable
under Node, Deno, or another Effect runtime with process services.

Keep Bun source to Bun executable as a first-class provider-native operation.
Never replace it with Node SEA composition: the resulting runtime contract is
different.

## Public surface

### API lane

```ts
export interface Service {
  readonly build: (
    options: Bun.BuildConfig
  ) => Effect.Effect<Bun.BuildOutput, BunApiError>

  readonly compileExecutable: (
    options: Bun.CompileBuildOptions
  ) => Effect.Effect<
    Artifact.Executable,
    BunApiError | ExecutablePublicationError
  >
}

export class BunApi extends Context.Service<
  BunApi,
  Service
>()("effect-build-bun/Api") {}

export const layerCurrent: Layer.Layer<
  BunApi,
  BunApiUnavailable
>
```

`layerCurrent` detects and captures the current Bun runtime API. It does not
spawn or install Bun and does not silently switch to the command lane.

### Command lane

```ts
export interface Service {
  readonly build: (
    input: BunCommandBuildInput
  ) => Effect.Effect<BunWrittenOutput, BunCommandBuildError>

  readonly compileExecutable: (
    input: CompileExecutableInput
  ) => Effect.Effect<Artifact.Executable, BunCompileError>

  readonly compileExecutableMatrix: (
    input: CompileExecutableMatrixInput
  ) => Effect.Effect<
    readonly Artifact.Executable[],
    BunMatrixError
  >

  readonly withSingleNodeProgram: <A, E, R>(
    input: SingleNodeProgramInput,
    use: (
      program: InternalBorrowedSingleNodeProgram
    ) => Effect.Effect<A, E, R>
  ) => Effect.Effect<
    A,
    BunSingleNodeProgramError | E,
    Exclude<R, Scope.Scope>
  >
}
```

The profile method remains direct/provider-specific in this plan. Plan 043
publishes the core profile adapter.

## Provider capability coverage

The Bun API lane must not be limited to the current fixed profile. Characterize
and support provider-native cases for:

- one and multiple entrypoints;
- filesystem and virtual files;
- browser, Bun, and Node targets;
- ESM, CJS, and supported IIFE behavior;
- JavaScript, TypeScript, JSX/TSX, HTML, CSS, and assets;
- plugins and loaders;
- code splitting;
- in-memory output objects and written outputs;
- structured build logs;
- Bun executable compilation and cross targets.

The command lane should expose the broad stable CLI subset, not every API-only
callback. Plugin callbacks and virtual-file maps remain API-lane capabilities
unless an explicit helper protocol is designed.

## Interruption semantics

### API lane

`Bun.build()` is a one-shot Promise without a documented per-build cancel
handle. The Effect wrapper may stop awaiting and must suppress downstream use
on interruption, but it must document that underlying Bun work may continue.
It must not claim child termination.

No temporary publication is committed after the caller has been interrupted.
If the API wrote directly to user destinations before interruption, that is
provider behavior and must be documented. Prefer provider in-memory output plus
core-owned publication for executable/file operations where practical.

### Command lane

The selected Bun child is scoped. Interruption terminates/reaps it and removes
staging. Atomic rename remains the publication point of no return.

## Errors

API errors retain Bun build logs and provider values. Command errors retain:

- tool discovery/probe failures;
- spawn failure versus nonzero completion;
- bounded stdout/stderr;
- provider request validation;
- output-set/metafile validation;
- executable validation/publication failure.

Do not make API and command failures one union merely because both use Bun.

## Scope

- Add `Api` and `Command` modules and root namespace exports.
- Move existing scalar/matrix compile behavior behind `Command` without changing
  its runtime contract.
- Add a provider-native command build operation for the CLI-representable
  output-set subset.
- Add Bun host API build and compile operations.
- Preserve the exact current selected-command profile implementation for Plan
  043.
- Add telemetry from Plan 039.
- Keep 0.3 root exports as temporary no-publish delegates until Plan 044.

Out of scope:

- generic plugin API;
- automatic API/command fallback;
- Deno or Node SEA behavior;
- portable profile publication;
- watch context unless Bun exposes a stable programmatic lifecycle with
  cancellation that can be characterized separately.

## Steps

1. Characterize current Bun API and CLI option/result differences at an exact
   Bun version.
2. Define `BunApiUnavailable`, API build errors, command build errors, and exact
   provider guards.
3. Implement `BunApi.layerCurrent` and provider-native `build`.
4. Implement API executable compilation without losing Bun runtime/target
   semantics.
5. Move scalar/matrix command compilation to `BunCommand` through Plan 039's
   `CommandCompiler`.
6. Implement command `build` with written output discovery and optional Bun
   metafile retention.
7. Retain direct `withSingleNodeProgram` over the selected command and prove its
   existing callback Cause/lifetime behavior.
8. Add examples that visibly differ by host lane.
9. Add architecture tests forbidding fallback and sibling imports.
10. Run Node-host command, Bun-host API, real compiler target, Effect endpoint,
    and packed consumer verification.

## Invariants

- `BunApi` can only run when Bun is the host.
- `BunCommand` can run under any supported process-capable Effect host.
- Selecting one lane never invokes the other.
- Bun executable artifacts remain Bun-runtime artifacts.
- Browser/Bun/Node build targets remain provider-native distinctions.
- Provider-native output sets are not reduced to one JavaScript file.
- API interruption does not falsely claim cancellation.
- Command interruption terminates active child work.
- Direct profile callback failure/defect/interruption retain exact Cause.

## Verification

```sh
bun run build
bun run check
bun run test:types
bun run test:unit
bun run test:architecture
bun run verify
bun run verify:effect
EFFECT_BUILD_BUN_VERSION=<pinned> bun run verify:real
git diff --check
```

Required focused evidence:

- API build with multiple entries, virtual files, plugins, CSS/assets, splitting,
  browser/Bun/Node targets, in-memory outputs, and structured logs;
- API compile with at least current-host and one foreign target;
- command build under Node Effect services;
- command scalar/matrix compile behavior unchanged;
- explicit API-unavailable failure under Node;
- no API-to-command or command-to-API fallback;
- API interruption documentation/test proving downstream suppression without a
  false cancellation assertion;
- command interruption/reaping;
- existing Bun to Node SEA lane remains green.

## STOP conditions

Stop and report if:

- Bun's official types cannot be consumed without forcing every package user to
  install a Bun runtime implementation;
- API build output must be flattened into the command result to fit the design;
- executable compilation through `Bun.build()` cannot preserve the same target
  observation/publication validation required of durable artifacts;
- the implementation is tempted to select a lane automatically;
- profile work starts before the direct provider surfaces are independently
  usable;
- current compile/matrix behavior changes outside the final hard cut.
