# Plan 042: Add Deno host API and selected-command lanes

## Status

- Priority: P1 provider-native API
- Effort: XL
- Risk: HIGH unstable host API, permissions, declarations, and project compile
- Depends on: Plan 039
- May run in parallel with: Plans 040 and 041
- Architecture commit: `e23722e81fa651c1540c8aa72e2703ff62ac609b`
- Status: TODO

## Objective

Expand `effect-build-deno` into:

```text
effect-build-deno/Api
effect-build-deno/Command
```

The API lane wraps experimental `Deno.bundle()` under a Deno host. The command
lane wraps `deno bundle` and `deno compile` through a selected Deno executable.

The intended 0.4 surface includes both lanes. A hard type-isolation/runtime gate
protects the rest of the package ecosystem from Deno's unstable globals and
permissions.

## Upstream contract

Official Deno evidence:

- [`Deno.bundle` declarations](https://github.com/denoland/deno/blob/89f33cbef296a2b287f323d42de54c871fa69c77/cli/tsc/dts/lib.deno.unstable.d.ts)
- [`BundleProvider`](https://github.com/denoland/deno/blob/89f33cbef296a2b287f323d42de54c871fa69c77/ext/bundle/src/lib.rs)
- [`deno bundle` documentation](https://github.com/denoland/docs/blob/aa772cfbe4455e2a3ef86e9f4df584d41523c0f9/runtime/reference/bundling.md)
- [`deno compile` documentation](https://github.com/denoland/docs/blob/aa772cfbe4455e2a3ef86e9f4df584d41523c0f9/runtime/reference/cli/compile.md)

Facts:

- `Deno.bundle()` is experimental and requires `--unstable-bundle`;
- it requires Deno read/import/write permission authority;
- it supports multiple entries, browser/Deno platforms, ESM/CJS/IIFE,
  splitting, package handling, externals, source maps, and memory/written
  outputs;
- it is unavailable in `deno compile` binaries because `denort` installs the
  no-op provider;
- `deno bundle` also supports HTML roots, watch, and `--declaration`;
- `deno compile` owns permissions, includes, workers, dynamic imports,
  framework/project detection, target runtime acquisition, engine selection,
  runtime arguments, and cross-target output.

## Canonical public modules

```text
effect-build-deno/Api
effect-build-deno/Command
```

Root exports only `Api` and `Command` namespaces.

## API lane

The package defines an isolated structural declaration matching the exact
supported upstream types instead of requiring unrelated consumers to load
global Deno libs.

```ts
export interface Service {
  readonly bundle: (
    options: DenoBundleOptions
  ) => Effect.Effect<
    DenoBundleResult,
    DenoBundleApiError
  >
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

`DenoBundleOptions`, `DenoBundleResult`, output files, diagnostics, notes, and
locations must match the pinned declaration structurally. Add a type fixture
that checks both directions under Deno.

Layer/runtime behavior:

- requires a Deno host;
- verifies `Deno.bundle` exists;
- does not enable unstable flags or grant permissions;
- maps missing flag, permission denial, provider failure, and compiled-binary
  unavailability into distinct exact provider errors;
- preserves provider result values;
- makes no cancellation claim for the one-shot Promise.

## Hard API gate

Before the API subpath may remain in the 0.4 target:

1. a Deno-host consumer imports and runs it with `--unstable-bundle`;
2. a Node-host consumer installs `effect-build-deno` without global Deno type
   pollution;
3. official Deno option/result types are structurally compatible in both
   directions;
4. missing unstable flag is distinguishable;
5. read/import/write permission denial is distinguishable;
6. compiled-binary unavailability is characterized;
7. one-shot interruption is documented without false cancellation.

If any gate fails, stop Plan 042 and request the maintainer choice recorded in
the architecture: amend 0.4 to omit `/Api`, or delay the hard cut. Do not
substitute the command lane behind `DenoApi`.

## Command lane

Target operations:

```ts
export interface Service {
  readonly bundle: (
    input: DenoBundleCommandInput
  ) => Effect.Effect<
    DenoWrittenOutput,
    DenoBundleCommandError
  >

  readonly compileExecutable: (
    input: DenoCompileExecutableInput
  ) => Effect.Effect<
    Artifact.Executable,
    DenoCompileError
  >

  readonly compileExecutableMatrix: (
    input: DenoCompileExecutableMatrixInput
  ) => Effect.Effect<
    readonly Artifact.Executable[],
    DenoMatrixError
  >
}
```

### `bundle`

Typed 0.4 command surface:

- one or multiple entries;
- file, URL, package, and HTML roots where supported;
- output file or directory;
- browser/Deno platform;
- ESM/CJS/IIFE;
- splitting;
- minification;
- source maps;
- externals/packages;
- inline imports;
- keep names;
- **declaration generation**;
- workspace/config/certificate/import-map options that materially affect
  resolution and can be modeled without raw argv.

Return a provider-specific written output set including declaration files.
Do not claim atomic multi-file publication.

### `compileExecutable`

Broaden the released subset with typed provider authority for:

- module specifier or project directory;
- permissions;
- includes and include-as-is;
- workers and dynamic import inclusion;
- embedded arguments;
- icon where supported;
- Deno compile bundling/minification;
- V8/QuickJS engine;
- runtime target;
- custom runtime authority such as `DENORT_BIN` through explicit environment
  policy;
- config/certificate/import-map and workspace behavior.

Do not force Bun terminology or a universal executable request.

### Matrix

Keep the matrix homogeneous and defined over scalar compile input. The matrix
does not generalize bundle outputs or mix engines/providers.

## Watch probe

`deno bundle --watch` exists. A public Effect wrapper requires a stable event
and lifetime model.

Probe:

- readiness;
- rebuild start/success/failure output;
- diagnostics;
- output write timing;
- termination;
- config reload behavior.

Publish a scoped `watchBundle` only if a typed contract can be stated. Otherwise
document the 0.4 exclusion and retain no raw process escape.

## Steps

1. Pin exact Deno runtime/command versions and official declarations.
2. Implement isolated Deno bundle types and bidirectional type tests.
3. Implement `Api.bundle`.
4. Run the hard API gate.
5. Add Command service and typed `bundle`.
6. Add declaration output support and verification.
7. Broaden scalar compile request and CLI rendering.
8. Reuse scalar compile for the matrix.
9. Characterize provider-written multi-output failure/interruption.
10. Probe watch and decide by the stated gate.
11. Add lane telemetry and redaction.
12. Add Deno-host, Node-host, and packed consumer matrices.
13. Run full verification and record actual jobs.

## Invariants

- API and Command never fall back to each other.
- API requires Deno host and unstable/permission policy remains application
  authority.
- Unrelated consumers need no global Deno types.
- Command remains usable from another process-capable Effect host.
- Deno declarations are preserved as provider output, not erased.
- Compile permissions/includes/engine/runtime remain provider-specific.
- `DENORT_BIN` is modeled as environment authority, not invented as a CLI flag.
- Command interruption terminates and reaps the selected process.
- Multi-file bundle output is not called atomic.
- Deno does not implement SingleNodeProgram for symmetry.
- No sibling integration dependency is added.

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

Focused evidence:

- Deno-host API import and execution;
- Node-host installation/typecheck without global Deno libs;
- unstable flag absent/present;
- read/import/write permission denial;
- compiled-binary API unavailability;
- one and multiple entries;
- ESM/CJS/IIFE;
- browser/Deno platform;
- memory and written output;
- HTML/CSS/assets;
- splitting/source maps/externals/packages;
- declaration generation;
- command project/framework compile;
- includes/workers/dynamic imports;
- V8 and QuickJS policy where supported;
- every advertised system target;
- scalar/matrix interruption and partial success;
- watch probe receipt;
- isolated packed Api and Command consumers.

## STOP conditions

Stop and report if:

- Deno types leak into unrelated consumers;
- exact provider option/result compatibility cannot be maintained;
- API operation silently invokes a command;
- missing unstable flag, permission failure, and compiled-binary unavailability
  cannot be distinguished sufficiently for a stable wrapper;
- declaration output is omitted from command bundle;
- `DENORT_BIN` or another environment behavior is misrepresented as a CLI flag;
- command compile is flattened into Bun's option vocabulary;
- watch has no stable contract but is still proposed publicly.

## Completion receipt

Completion requires one Deno-focused implementation PR. Record exact Deno
versions, host/permission matrices, API gate outcome, watch decision, and actual
CI jobs.
