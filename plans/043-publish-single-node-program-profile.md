# Plan 043: Broaden Node SEA and publish SingleNodeProgram

## Status

- Priority: P1 portable profile and recipe
- Effort: XL
- Risk: HIGH borrowed lifetime, generic failure, and assembler compatibility
- Depends on: Plans 039, 040, and 041
- Does not depend on: Plan 042
- Architecture commit: `e23722e81fa651c1540c8aa72e2703ff62ac609b`
- Status: TODO

## Objective

Deliver three related but distinct products:

1. broaden `effect-build-node-sea/Command` into a direct provider-native
   assembler over a file or bytes;
2. publish the narrow portable
   `effect-build/Profile/SingleNodeProgram` service;
3. publish the provider-neutral
   `effect-build-node-sea/Recipe/SingleNodeProgram` composition.

Bun and Esbuild direct APIs must already exist so the profile is visibly an
adapter rather than the provider's ontology.

## Part 1: Node SEA direct command

Canonical module:

```text
effect-build-node-sea/Command
```

Direct main input:

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

Direct request includes:

- outfile/cwd/digest;
- builder Node selected by Layer;
- optional target/base Node executable;
- assets;
- experimental warning policy;
- snapshot;
- code cache;
- `execArgv`;
- `execArgvExtension`.

Implementation:

- canonicalize file input;
- privately copy and rehash it;
- privately materialize byte input;
- syntax-check the private copy;
- validate builder/base Node version agreement;
- validate cross-platform cache/snapshot restrictions;
- use `Author/Executable` for candidate validation and atomic publication;
- inspect and report `systemTarget`;
- preserve direct provider diagnostics.

Signing is out of scope and remains a later platform/provider operation.

## Part 2: SingleNodeProgram profile

Canonical core module:

```text
effect-build/Profile/SingleNodeProgram
```

Contract:

> one borrowed JavaScript main, ESM or CommonJS, Node module resolution, no
> provider-owned side-output graph, continuation-owned lifetime.

Request:

```ts
export interface Request {
  readonly entrypoint: string
  readonly cwd?: string
  readonly format: "esm" | "cjs"
}
```

Borrowed result:

```ts
export interface Borrowed {
  readonly protocol: "effect-build/SingleNodeProgram@1"
  readonly format: "esm" | "cjs"
  readonly resolutionTarget: "node"
  readonly digest: Artifact.Digest
  readonly externalImportObservations: readonly string[]
  readonly steps: readonly BuildStepObservation[]

  readonly withFile: <A, E, R>(
    use: (
      file: {
        readonly path: Artifact.LocalPath
        readonly bytes: number
        readonly digest: Artifact.Digest
      }
    ) => Effect.Effect<A, E, R>
  ) => Effect.Effect<A, BorrowedProgramExpired | E, R>
}
```

The temporary path is visible only inside `withFile`. Returning `Borrowed` or
the path cannot extend producer ownership. Later use fails or the physical file
is gone.

The capability has closure-owned authority and protocol version. It must not
depend on the consuming core module's WeakSet.

### Service and failure

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

Provider adapters map only identity-proven provider failures. Caller failures,
defects, interruptions, and mixed Causes pass through unchanged.

Provider packages export exact narrowing guards.

### Exclusions

The profile rejects or omits:

- multiple entries;
- splitting;
- CSS/assets/HTML;
- browser/Bun/Deno targets;
- declarations;
- plugins/loaders in the portable request;
- provider-native output sets;
- watch/incremental contexts;
- durable program ownership.

Direct provider APIs remain the escape hatch.

## Part 3: provider adapters

### Bun

Canonical module:

```text
effect-build-bun/Profile/SingleNodeProgram
```

The first implementation uses Bun's selected-command lane.

Reasons:

- it already proves the fixed output profile;
- child interruption/reaping is part of the profile contract;
- it avoids pretending `Bun.build()` Promise cancellation exists.

Layer construction may accept provider defaults. Per-call provider-specific
options use direct Bun APIs.

### Esbuild

Canonical module:

```text
effect-build-esbuild/Profile/SingleNodeProgram
```

Use scoped Esbuild context from Plan 040. Preserve cancel/dispose and exact
callback Cause behavior.

## Part 4: Node SEA recipe

Canonical module:

```text
effect-build-node-sea/Recipe/SingleNodeProgram
```

The recipe:

1. requests `SingleNodeProgram.Bundler`;
2. obtains the borrowed program;
3. borrows its file;
4. calls Node SEA direct command;
5. selects no producer.

One unchanged program must run under Bun or Esbuild by changing only the profile
Layer.

## Steps

1. Broaden Node SEA direct main/config types.
2. Separate builder Node and target/base Node authority.
3. Implement byte materialization and file copy/rehash.
4. Add version, syntax, external, target, snapshot, and code-cache validation.
5. Replace current root live-bundle dependency with direct file/bytes input.
6. Implement closure-owned borrowed program protocol.
7. Add expiry and duplicate-core tests.
8. Add portable failure and provider guards.
9. Implement Bun profile adapter.
10. Implement Esbuild profile adapter.
11. Implement Node SEA recipe.
12. Add unchanged Bun/Esbuild substitution application.
13. Preserve exact failures, defects, interruption, and cleanup.
14. Add profile/recipe telemetry and redaction.
15. Run full provider and packed-consumer verification.

## Invariants

- Node SEA direct operation requires no Bun or Esbuild package.
- Profile core imports no provider package.
- Recipe selects no producer.
- Bun and Esbuild direct APIs remain richer and canonical.
- Borrowed output is never called an Artifact.
- Borrowed path cannot extend producer root ownership.
- Compatible duplicate core instances use closure authority, not a shared
  module-global WeakSet.
- Provider error identity is retained in memory.
- Caller error/defect/interruption Cause is unchanged.
- Temporary roots close after every Exit.
- Node SEA reads only its private authenticated copy.
- Builder/base Node version and system restrictions are validated.
- Single-file executable publication remains atomic.
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

Focused evidence:

- Node SEA file main;
- Node SEA byte main;
- CommonJS and ESM;
- assets;
- exec args/extension;
- snapshot/code-cache valid and invalid combinations;
- builder/base Node version mismatch;
- every advertised current/cross system target;
- syntax rejection;
- non-builtin external rejection for recipe input;
- Bun profile ESM/CJS;
- Esbuild profile ESM/CJS;
- unchanged generic program under both Layers;
- caller typed failure identity;
- Fail+Interrupt and Fail+Die;
- producer and consumer interruption;
- escaped borrowed value;
- file mutation/digest mismatch;
- same-version duplicate core;
- incompatible protocol version;
- cleanup/publication overlap;
- real Bun -> Node SEA and Esbuild -> Node SEA;
- packed direct and recipe consumers.

## STOP conditions

Stop and report if:

- Node SEA still requires a producer package;
- the portable profile must accept provider options or multiple output
  topologies;
- a provider silently ignores a profile field;
- provider error mapping catches callback errors by tag collision;
- Cause topology changes;
- borrowed ownership requires one shared module instance;
- cross-platform Node SEA cannot validate builder/base version and
  cache/snapshot restrictions;
- Bun compile is presented as replaceable by Node SEA;
- the recipe chooses Bun or Esbuild implicitly.

## Completion receipt

Completion requires one focused implementation PR or a clearly ordered pair if
Node SEA broadening must land before profile publication. Record exact provider
versions, target matrix, duplicate-core result, and observed CI.
