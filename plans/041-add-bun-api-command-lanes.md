# Plan 041: Add Bun host API and selected-command lanes

## Status

- Priority: P1 provider-native API
- Effort: XL
- Risk: HIGH dual-lane semantics and Bun-host verification
- Depends on: Plan 039
- May run in parallel with: Plans 040 and 042
- Architecture commit: `e23722e81fa651c1540c8aa72e2703ff62ac609b`
- Status: TODO

## Objective

Expand `effect-build-bun` into two explicit lanes:

```text
effect-build-bun/Api
effect-build-bun/Command
```

`Api` wraps the real `Bun.build()` API and requires a Bun orchestrator host.
`Command` invokes one selected Bun executable through Effect process services
and remains usable under Node, Deno, or another supported host.

Keep source -> Bun executable first-class. It is not replaced by
SingleNodeProgram -> Node SEA because the runtime contract differs.

## Upstream contract

At Bun ref
[`75fad5b`](https://github.com/oven-sh/bun/tree/75fad5b142d5bb73f985ffe745d718acc874a85c):

- `Bun.build()` supports multiple and virtual entries;
- browser, Bun, and Node targets;
- ESM/CJS/IIFE;
- HTML, CSS, and assets;
- plugins/loaders;
- splitting;
- in-memory provider output artifacts and logs;
- executable compile mode through `BuildConfig.compile`;
- cross-target Bun executable tokens with system, architecture, libc, Bun
  compatibility, and CPU baseline/modern semantics;
- no documented per-build cancellation handle analogous to Esbuild context.

## Canonical public modules

```text
effect-build-bun/Api
effect-build-bun/Command
```

Root exports `Api`, `Command`, and later `SingleNodeProgram` namespaces. It does
not re-export flat callable aliases.

## API lane

Target declaration:

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

export const layerCurrent: Layer.Layer<
  BunApi,
  BunApiUnavailable
>
```

The API operation includes executable compile mode through the provider's own
configuration. Do not add a second API-lane `compileExecutable` in 0.4.

Why:

- its request would duplicate or distort `Bun.BuildConfig.compile`;
- Bun controls when and where its native API writes;
- the Promise has no documented cancellation handle;
- a durable core `Artifact.Executable` wrapper would need a specific probe of
  output path, bytes, validation, interruption, and publication.

The API lane preserves `Bun.BuildOutput` and exact plugin/output/log values.

Interruption contract:

> Fiber interruption stops awaiting and downstream Effect use. It does not
> claim to cancel underlying Bun work or roll back provider direct writes.

## Command lane

Target operations:

```ts
export interface Service {
  readonly build: (
    input: BunCommandBuildInput
  ) => Effect.Effect<
    BunWrittenOutput,
    BunCommandBuildError
  >

  readonly compileExecutable: (
    input: BunCompileExecutableInput
  ) => Effect.Effect<
    Artifact.Executable,
    BunCompileError
  >

  readonly compileExecutableMatrix: (
    input: BunCompileExecutableMatrixInput
  ) => Effect.Effect<
    readonly Artifact.Executable[],
    BunMatrixError
  >
}
```

### `build`

Expose a typed CLI-representable subset:

- one or multiple entries;
- browser/Bun/Node target;
- output directory/file mode;
- ESM/CJS/IIFE where supported;
- splitting;
- minification;
- source maps;
- externals/packages;
- defines/naming/public path;
- metafile;
- HTML/CSS/assets where the CLI supports them.

Return a provider-specific written-output record. Do not claim that all files
are atomically committed as a set. If the provider writes several files and is
interrupted, partial provider output is possible unless a later operation
proves an owned staging strategy.

Do not reconstruct JavaScript plugin callbacks through argv.

### `compileExecutable`

Preserve and broaden the released command operation:

- Bun source entry;
- Bun executable target tokens;
- minification;
- bytecode where supported;
- source maps;
- defines and other verified compile flags;
- selected executable identity;
- native target inspection;
- optional digest;
- core-owned single-file staging and atomic publication.

The output is a Bun-runtime executable with Bun and Node built-ins. It is not a
Node SEA executable.

### `compileExecutableMatrix`

Remain homogeneous and provider-specific.

- scalar compilation is the primitive;
- whole-request validation happens before output work;
- ordered partial success/failure behavior remains explicit;
- no matrix-wide rollback;
- interruption stops active and queued work.

## Watch scope

Bun CLI watch exists, but 0.4 does not promise a typed watch operation merely
because `--watch` exists.

Plan 041 must probe:

- startup readiness;
- rebuild notification format;
- diagnostic format;
- termination behavior;
- whether one stable provider event model exists.

If the probe succeeds, add a scoped provider-specific `watchBuild`. If it does
not, document watch as excluded from the 0.4 wrapper. Do not expose a raw
process escape hatch through the provider module.

## Profile preparation

Keep or implement a package-private direct
`withSingleNodeProgram` adapter using the command lane. It lands publicly only
in Plan 043.

The adapter must not become the canonical Bun API.

## Steps

1. Pin Bun runtime/tool versions separately from package-manager use.
2. Add Bun-host typecheck and runtime fixtures.
3. Implement `Api.build` with exact provider types.
4. Preserve provider errors/logs/output artifacts.
5. Add Command service and migrate scalar/matrix compilation.
6. Add typed command `build`.
7. Characterize provider-written output under failure/interruption.
8. Probe command watch without publishing it prematurely.
9. Preserve a private SingleNodeProgram adapter.
10. Add lane-specific telemetry and redaction.
11. Add Bun-host and Node-host packed consumers.
12. Run full verification and record actual jobs.

## Invariants

- API and Command never fall back to each other.
- API requires Bun host; Command does not.
- API preserves `Bun.BuildOutput`.
- API interruption makes no false cancellation/rollback claim.
- Command interruption terminates and reaps the selected child.
- Command compile retains native inspection and atomic single-file publication.
- Bun compile remains distinct from Node SEA.
- Multi-file command build does not claim atomic set publication.
- Plugins remain provider-native; no core plugin interface appears.
- Package manager, Effect host, selected Bun tool, and output runtime remain
  independent.
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

- Bun-host import/type fixture;
- Bun-host `Api.build` with virtual files;
- multi-entry browser/Bun/Node builds;
- ESM/CJS/IIFE;
- HTML/CSS/assets;
- plugins/loaders;
- splitting and metafile;
- compile mode through `Api.build`;
- one-shot interruption with no cancellation claim;
- Node-host Command build;
- every advertised Bun executable target;
- compile bytecode/source-map/define flags;
- scalar/matrix interruption and partial success;
- provider-written output state after command failure/interruption;
- watch probe receipt;
- isolated packed Api and Command consumers.

## STOP conditions

Stop and report if:

- `Api.build` requires Node process or filesystem APIs;
- provider request/result types are flattened;
- command build claims plugin parity with the API;
- API compile is wrapped as atomic/cancellable without evidence;
- Bun-runtime executable behavior is replaced by Node SEA;
- command output-set publication is described as atomic without proof;
- Bun-host fixtures cannot install and type-check the packed package;
- watch lacks a stable event/lifetime contract but is still proposed publicly.

## Completion receipt

Completion requires one Bun-focused implementation PR. Record the exact Bun
runtime, selected command versions, host matrices, and actual CI jobs.
