# Plan 043: Broaden Node SEA and publish SingleNodeProgram

## Status

- Priority: P1 portable profile and recipe
- Effort: XL
- Risk: HIGH borrowed lifetime, generic failure, assembler compatibility
- Depends on: Plans 039, 040, and 041
- Does not depend on: Plan 042
- Architecture commit: `e23722e81fa651c1540c8aa72e2703ff62ac609b`
- Status: TODO

## Objective

Deliver three distinct products:

1. broaden `effect-build-node-sea/Command` into a direct assembler over file or
   bytes;
2. publish `effect-build/Profile/SingleNodeProgram`;
3. publish `effect-build-node-sea/Recipe/SingleNodeProgram`.

Bun and Esbuild direct APIs must already exist so the profile is visibly an
adapter, not provider ontology.

## Node SEA direct command

Canonical path:

```text
effect-build-node-sea/Command
```

```ts
export type Main =
  | {
      readonly _tag: "File"
      readonly path: string
      readonly format: "commonjs" | "module"
    }
  | {
      readonly _tag: "Bytes"
      readonly contents: Uint8Array
      readonly format: "commonjs" | "module"
      readonly sourceName?: string
    }
```

Request authority includes outfile/cwd/digest, builder Node selected by Layer,
optional base/target Node, assets, warning policy, snapshot, code cache,
`execArgv`, and `execArgvExtension`.

Implementation canonicalizes and privately copies file input, privately
materializes bytes, rehashes, syntax-checks, validates builder/base version and
cross-platform cache/snapshot restrictions, then uses `Author/Executable` for
native validation and atomic publication. Signing remains a separate later
operation.

## SingleNodeProgram profile

Canonical core path:

```text
effect-build/Profile/SingleNodeProgram
```

Contract:

> one borrowed ESM or CommonJS JavaScript main with Node module resolution, no
> provider-owned side-output graph, and continuation-owned lifetime.

```ts
export interface Request {
  readonly entrypoint: string
  readonly cwd?: string
  readonly format: "esm" | "cjs"
}

export interface Borrowed {
  readonly protocol: "effect-build/SingleNodeProgram@1"
  readonly format: "esm" | "cjs"
  readonly resolutionTarget: "node"
  readonly digest: Artifact.Digest
  readonly externalImportObservations: readonly string[]
  readonly steps: readonly BuildStepObservation[]

  readonly withFile: <A, E, R>(
    use: (file: {
      readonly path: HostPath.Absolute
      readonly bytes: number
      readonly digest: Artifact.Digest
    }) => Effect.Effect<A, E, R>
  ) => Effect.Effect<
    A,
    BorrowedProgramExpired | E,
    Exclude<R, Scope.Scope>
  >
}
```

The path exists only inside `withFile`. Returning the borrowed value or path
does not extend ownership. Later use fails or the physical file is gone. The
closure carries protocol authority and does not depend on a receiving module's
WeakSet.

```ts
export class Bundler extends Context.Service<
  Bundler,
  Service
>()("effect-build/Profile/SingleNodeProgram/Bundler") {}

export class Failure extends Data.TaggedError(
  "SingleNodeProgramFailure"
)<{
  readonly provider: string
  readonly kind:
    | "invalid-request"
    | "tool-unavailable"
    | "build-failed"
    | "invalid-output"
    | "host-io"
  readonly diagnostics: readonly Diagnostic[]
  readonly providerError: unknown
}> {}
```

Adapters map only identity-proven provider failures. Callback failures, defects,
interruptions, and mixed Causes pass through unchanged. Provider packages export
narrowing guards.

The profile excludes multiple entries, splitting, CSS/assets/HTML,
browser/Bun/Deno targets, declarations, portable plugins/loaders,
provider-native output sets, watch/incremental contexts, raw provider options,
and durable program ownership.

## Provider adapters

### Bun

Canonical path:

```text
effect-build-bun/Profile/SingleNodeProgram
```

Use the selected-command lane initially because it already proves the fixed
profile and child termination contract. Export:

- exact-error direct `withProgram`;
- generic `layer` mapping construction/probe/operation errors to
  `SingleNodeProgram.Failure` while retaining the exact Bun object;
- `isBunFailure` guard.

Layer defaults may be provider-specific; per-call provider options use direct
Bun APIs.

### Esbuild

Canonical path:

```text
effect-build-esbuild/Profile/SingleNodeProgram
```

Use Plan 040's scoped context. Export exact-error direct `withProgram`, generic
Layer, and guard. Profile FileSystem/Path/Crypto requirements do not belong on
the direct Esbuild Api Layer. Preserve cancel/dispose and callback Cause.

## Node SEA recipe

Canonical path:

```text
effect-build-node-sea/Recipe/SingleNodeProgram
```

The recipe asks for the profile service, borrows the program file, and calls the
Node SEA direct command. It imports no producer and selects none. One unchanged
program must run under Bun or Esbuild by changing only the profile Layer.

## Steps

1. Broaden Node SEA main/config types.
2. Separate builder and base/target Node authority.
3. Implement byte materialization and authenticated file copy.
4. Validate version, syntax, externals, target, snapshot, and code cache.
5. Remove Node SEA's dependency on the current root live-bundle representation.
6. Implement closure-owned borrowed protocol.
7. Add expiry and duplicate-core tests.
8. Add portable failure and provider guards.
9. Implement Bun and Esbuild profile adapters.
10. Implement the recipe and unchanged substitution application.
11. Preserve exact errors/defects/interruption/cleanup.
12. Add telemetry/redaction and packed-consumer verification.

## Invariants

- Node SEA direct operation requires no producer package.
- Profile core imports no provider package.
- Recipe selects no producer.
- Direct Bun/Esbuild APIs remain richer and canonical.
- Borrowed output is never called an Artifact.
- Borrowed path cannot extend ownership.
- Compatible duplicate core copies rely on closure authority, not shared
  module state.
- Generic profile Layers expose one generic failure family, including
  construction/probe failures.
- Direct profile functions retain exact provider errors.
- Provider identity remains in `providerError`.
- Callback Cause is unchanged.
- Temporary roots close after every Exit.
- Node SEA reads only its private authenticated copy.
- Builder/base version and system restrictions are validated.
- Single-file publication remains atomic.
- Deno is not required and does not implement the profile by symmetry.

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

Required evidence: Node SEA file/bytes, CJS/ESM, assets, args, snapshot/cache
validity, version mismatch, every advertised target, syntax/external rejection;
Bun/Esbuild profile ESM/CJS; unchanged generic program under both Layers;
caller identity, mixed Causes, producer/consumer interruption, expiry,
mutation/digest mismatch, compatible/incompatible protocol copies,
cleanup/publication overlap, real pipelines, and packed consumers.

## STOP conditions

Stop if Node SEA still requires a producer; the profile needs provider options
or multiple output topologies; a provider ignores a profile field; error mapping
captures callback tags; Cause changes; ownership requires one shared module;
cross-platform SEA restrictions cannot be validated; Bun compile is called
replaceable by Node SEA; or the recipe selects a producer.

## Completion receipt

Completion requires one focused implementation PR, or a clearly ordered pair if
Node SEA broadening must land before profile publication. Record exact provider
versions, target matrix, duplicate-core result, and observed CI.
