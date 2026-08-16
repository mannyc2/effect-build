# Plan 043: Publish the single-Node-program profile and Node SEA recipe

## Status

- Priority: P1 portable composition
- Effort: XL
- Risk: HIGH public lifetime, error, and substitution contract
- Depends on: Plans 039-042
- Planned at: `3c318072cec6debd7c5eae6de14b20c8df4b1842`
- Status: TODO

## Objective

Publish one deliberately narrow portable profile for the provider behavior that
Bun and Esbuild have already demonstrated in common:

> Produce one borrowed ESM or CommonJS main file with Node module-resolution
> semantics, no provider-owned side-output graph, and continuation-owned
> lifetime.

Name the profile `SingleNodeProgram`. Provide it from Bun's command lane and
Esbuild's API lane. Broaden the direct Node SEA command to accept an existing
bundled main file, then add a provider-neutral recipe that consumes the profile.

Do not make this profile the root ontology for provider-native build APIs.

## Public surface

### Core profile

```text
effect-build/Profile/SingleNodeProgram
```

```ts
export interface Request {
  readonly entrypoint: string
  readonly cwd?: string
  readonly format: "esm" | "cjs"
}

export interface Borrowed {
  readonly format: "esm" | "cjs"
  readonly resolutionTarget: "node"
  readonly digest: Artifact.Digest
  readonly externalImportObservations: readonly string[]
  readonly steps: readonly BuildStepObservation[]

  readonly withFile: <A, E, R>(
    use: (
      file: TemporaryOutput.BorrowedFile
    ) => Effect.Effect<A, E, R>
  ) => Effect.Effect<A, BorrowedProgramExpired | E, R>
}

export interface Service {
  readonly withProgram: <A, E, R>(
    request: Request,
    use: (
      program: Borrowed
    ) => Effect.Effect<A, E, R>
  ) => Effect.Effect<
    A,
    Failure | E,
    Exclude<R, Scope.Scope>
  >
}

export class Bundler extends Context.Service<
  Bundler,
  Service
>()("effect-build/Profile/SingleNodeProgram/Bundler") {}
```

The temporary path is not a property on `Borrowed`. It exists only inside
`withFile`. A retained borrowed handle fails deterministically after expiry.

### Provider adapters

```text
effect-build-bun/Profile/SingleNodeProgram
effect-build-esbuild/Profile/SingleNodeProgram
```

Bun's adapter uses the command lane so the profile retains strong interruption
and child-termination semantics. Esbuild's adapter uses a scoped context and
calls cancel/dispose on release.

Both direct provider services also retain provider-specific
`withSingleNodeProgram` operations and exact provider errors.

### Node SEA direct command

```text
effect-build-node-sea/Command
```

The direct request accepts an existing bundled file:

```ts
export interface MainFile {
  readonly path: string
  readonly format: "commonjs" | "module"
}

export interface CreateExecutableInput {
  readonly main: MainFile
  readonly outfile: string
  readonly cwd?: string
  readonly digest?: boolean
  readonly assets?: Readonly<Record<string, string>>
  readonly executable?: string
  readonly useSnapshot?: boolean
  readonly useCodeCache?: boolean
  readonly execArgv?: readonly string[]
  readonly execArgvExtension?: "none" | "env" | "cli"
}
```

The implementation canonicalizes, validates, privately copies, and rehashes the
main before selected Node reads it. Direct Node SEA use does not require Bun or
Esbuild.

### Recipe

```text
effect-build-node-sea/Recipe/SingleNodeProgram
```

The recipe composes the core profile with the Node SEA command. It selects no
producer. The application provides Bun or Esbuild's profile Layer.

## Profile limits

The portable request intentionally excludes:

- multiple entrypoints;
- code splitting;
- CSS and asset side outputs;
- browser, Bun, and Deno targets;
- plugins/loaders;
- declaration generation;
- watch/incremental context;
- durable bundle ownership;
- raw provider options.

Provider-specific defaults may be configured on each profile Layer. Per-call
provider controls remain on direct provider operations.

## Error model

```ts
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

Normalized fields must be useful without provider imports. Provider packages
export identity-safe narrowing guards for `providerError`.

Adapters map only their own identity-proven errors. The callback's typed
failure, defect, interruption, or mixed Cause remains untouched. No `_tag`
string collision is sufficient for mapping.

## Lifetime and duplicate-core design

Use closure-owned borrowed authority rather than requiring the consumer module
to find the value in its own module-global WeakSet.

A compatible duplicate core package instance may call the borrowed object's
public `withFile` method because the producing closure owns liveness and
validation. The profile includes a protocol/version identity so incompatible
copies fail deterministically rather than reading temporary paths directly.

This is an interoperability and lifecycle property, not a sandbox boundary
against malicious provider code.

## Scope

- Add core profile request/service/error/borrowed capability.
- Add Bun and Esbuild profile Layers plus direct provider profile methods.
- Change Node SEA direct input from a core live artifact to an existing bundled
  main file and full supported provider options.
- Add Node SEA recipe over the core profile.
- Preserve current exact selected-Node syntax and external-builtin validation
  as the initial implementation support boundary unless a separate target
  expansion is approved.
- Add provider-free generic application examples and packed consumers.
- Add Plan 039 telemetry.

Out of scope:

- Deno profile adapter;
- multiple-file portable output graph;
- generic assembler service;
- durable bundle artifact;
- automatic bundler selection;
- fallback from Bun to Esbuild;
- combined package;
- remote execution, cache, or receipt.

## Steps

1. Freeze direct Bun/Esbuild profile behavior and Plan 038's historical
   substitution requirements as executable tests.
2. Implement `SingleNodeProgram.Borrowed` over Plan 039 temporary-output
   capability without exposing a top-level path.
3. Implement typed expiry and protocol-version checks.
4. Implement normalized failure mapping with exact provider error retention.
5. Add Esbuild profile Layer over Plan 040's scoped API.
6. Add Bun profile Layer over Plan 041's command service.
7. Broaden Node SEA direct input and prove standalone use from a pre-existing
   main file.
8. Add the Node SEA recipe and one provider-free application fixture.
9. Run that fixture unchanged with the Bun and Esbuild Layers for ESM and CJS.
10. Add interruption, failure, defect, mutation, duplicate-core, and packed
    consumer tests.
11. Update docs to make the profile optional and provider-native APIs primary.

## Invariants

- The application program contains no Bun or Esbuild import.
- Changing only the provided profile Layer changes the producer.
- Direct provider APIs retain exact provider options and errors.
- The borrowed path is available only in `withFile`.
- Returning the borrowed handle cannot retain access after callback exit.
- Producer and consumer interruption preserve exact Cause and cleanup.
- Bun and Esbuild satisfy the same profile request/result contract.
- Node SEA imports only core and consumes any validated existing main file.
- External imports are explicitly provider-reported observations, not a closed
  graph claim.
- Node SEA validates external builtins against the selected Node authority.

## Verification

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

Required focused evidence:

- ESM and CJS under both producers;
- one unchanged generic program with only Layer changes;
- direct Bun and Esbuild provider calls remain usable;
- profile invalid request and provider build failures;
- provider error narrowing guards;
- callback failure identity;
- callback defect;
- callback interruption;
- Fail+Interrupt and Fail+Die Causes;
- production interruption and cleanup;
- consumer interruption and cleanup;
- same-length file mutation and digest mismatch;
- escaped borrowed handle;
- compatible duplicate-core consumer;
- incompatible protocol version;
- standalone Node SEA from a pre-existing bundled file;
- Node SEA assets and supported configuration;
- real Bun -> Node SEA and Esbuild -> Node SEA lanes;
- isolated and composed packed consumers.

## STOP conditions

Stop and report if:

- a portable field is required only by one provider;
- Bun or Esbuild must silently ignore a profile field;
- provider plugins or multi-output behavior leak into the portable request;
- error mapping catches caller failures or loses sibling interrupt/die Causes;
- the borrowed program can be used successfully after expiry;
- duplicate-core compatibility requires exposing the raw temporary path outside
  the nested callback;
- Node SEA direct use still requires a producer package;
- the profile becomes the only documented provider API.
