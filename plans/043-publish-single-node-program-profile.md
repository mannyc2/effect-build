# Plan 043: Publish law-tested portable profiles and the Node recipe

## Status

- Priority: P1 portable application roles
- Effort: XL
- Risk: CRITICAL borrowed lifetimes, normalization, and multi-provider conformance
- Depends on: Plan 039 plus completed direct-provider slices from Plans 040-042
- Research evidence: `research/post-0.3/`
- Status: TODO
- Publication authority: NONE

## Objective

Publish the three portable roles that survived executable falsification:

```text
effect-build/Profile/NodeMainProgram
effect-build/Profile/NodeMainExecutable
effect-build/Profile/BrowserModuleApplication
```

Publish one provider-neutral composition recipe:

```text
effect-build/Recipe/NodeSourceExecutable
```

Add provider adapters:

```text
effect-build-bun/Profile/NodeMainProgram
effect-build-esbuild/Profile/NodeMainProgram
effect-build-bun/Profile/BrowserModuleApplication
effect-build-deno/Profile/BrowserModuleApplication
effect-build-node-sea/Profile/NodeMainExecutable
```

Provider `Api` and `Command` modules remain permanent canonical surfaces. The
profiles are additive roles, not replacement APIs.

Do not publish the valid-but-deferred `IncrementalNodeMain` role, a generic
watch stream, a declaration profile, a durable multi-file artifact, a universal
executable builder, a `pkg` integration package, or any release mutation.

## Dependency order inside this plan

Plan 043 may be executed as one PR only after all prerequisites are green, but
implementation proceeds in these slices:

```text
039 + 040 + 041
  -> NodeMainProgram core + Bun/Esbuild adapters

039 + 041 + 042
  -> BrowserModuleApplication core + Bun/Deno adapters

039 + Node SEA direct command work
  -> NodeMainExecutable core + Node SEA adapter

NodeMainProgram + NodeMainExecutable
  -> Recipe/NodeSourceExecutable
```

Do not start a slice whose direct provider service is incomplete.

## Baseline and drift check

Before editing:

1. verify ancestry from released 0.3 and exact completion SHAs for Plans 039-042;
2. record exact provider/tool versions and public declarations;
3. reproduce every research law and real-provider receipt;
4. freeze direct provider APIs and 0.3 narrow delegates;
5. stop if direct provider changes invalidate any request/output/lifecycle law.

## Profile 1: `NodeMainProgram`

### Role

Produce one borrowed JavaScript **main entry** for Node execution.

The word `main` is required by executable evidence: Bun and Esbuild conformed
when executed directly and differed when imported.

### Core request

```ts
export interface Request {
  readonly entrypoint: string
  readonly cwd?: string
  readonly format: "esm" | "cjs"
}
```

### Borrowed output

```ts
export interface Borrowed {
  readonly protocol: "effect-build/NodeMainProgram@1"
  readonly executionRole: "main"
  readonly format: "esm" | "cjs"
  readonly resolutionTarget: "node"
  readonly externalImportObservations: readonly string[]
  readonly steps: readonly BuildStepObservation[]
  readonly file: Effect.Effect<
    BorrowedOutput.File,
    Expired | Changed
  >
}
```

Use one outer continuation. Do not restore the earlier nested `withFile`
callback. The closure-owned `file` Effect rechecks liveness, containment, byte
count, and digest at each acquisition.

A compatible duplicate core copy can call the Effect because the producing
closure owns authority. An incompatible protocol fails deterministically.

### Implementations

- Bun adapter uses the permanent command lane for strong child interruption.
- Esbuild adapter uses the permanent scoped context and cancel/dispose release.

### Exclusions

- importable-module equivalence;
- multiple entries;
- splitting;
- CSS/assets/HTML side-output graph;
- browser/Bun/Deno targets;
- plugins/loaders in the portable request;
- watch/incremental context;
- durable ownership;
- raw provider options.

## Profile 2: `NodeMainExecutable`

### Role

Assemble one existing bundled CommonJS or ESM main into one validated durable
Node-runtime executable.

### Core request

```ts
export interface Request {
  readonly main:
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
  readonly outfile: string
  readonly cwd?: string
  readonly systemTarget?: SystemTarget
  readonly digest?: boolean
}
```

### Durable output

Return:

```ts
Artifact.Executable<{
  readonly name: "node"
  readonly version?: string
}>
```

The adapter privately copies/materializes the main, authenticates the copy,
stages one executable beside the destination, validates native format/runtime/
target, optionally digests, and atomically renames.

### Implementations

- Shipped 0.4 adapter: Node built-in SEA through
  `effect-build-node-sea/Command`.
- Research conformance adapter: `@yao-pkg/pkg` SEA mode. Retain it under
  `research/post-0.3/` only. A future production adapter must eliminate hidden
  runtime acquisition or make it explicit at Layer construction.

### Exclusions

- Bun or Deno runtime executables;
- source/project compilation;
- assets;
- snapshots/code cache;
- signing;
- package graph traversal;
- implicit runtime installation/acquisition;
- provider-specific exec-argument policy.

Those remain direct provider features.

## Profile 3: `BrowserModuleApplication`

### Role

Produce one borrowed browser HTML module application whose module-reachable
JavaScript, CSS, and assets are all contained in a validated output-tree
manifest.

### Core request

```ts
export interface Request {
  readonly entryHtml: string
  readonly cwd?: string
  readonly minify?: boolean
}
```

### Borrowed output

```ts
export interface ManifestEntry {
  readonly relativePath: string
  readonly kind:
    | "html"
    | "javascript"
    | "css"
    | "asset"
    | "source-map"
    | "other"
  readonly bytes: number
  readonly digest: Artifact.Digest
}

export interface Borrowed {
  readonly protocol: "effect-build/BrowserModuleApplication@1"
  readonly target: "browser"
  readonly entryHtml: string
  readonly manifest: readonly ManifestEntry[]
  readonly steps: readonly BuildStepObservation[]
  readonly files: Effect.Effect<
    readonly BorrowedOutput.TreeEntry[],
    Expired | Changed
  >
}
```

Every emitted local reference in HTML must resolve to a file in the manifest.
All file paths remain inside the owned root. The files Effect rechecks
containment and digests.

### Implementations

- Bun selected-command build.
- Deno selected-command bundle.

Both use command lanes so interruption terminates/reaps active work.

### Narrowing established by research

Arbitrary top-level linked resources are excluded. Deno dropped a linked
stylesheet in the adversarial broad fixture. Both providers preserved CSS
imported through the JavaScript module graph and produced valid HTML/JS/CSS
output trees.

### Exclusions

- arbitrary non-module HTML resource semantics;
- provider plugins/options;
- server-side rendering;
- durable directory publication/replacement;
- generic browser module output without HTML;
- watch/incremental operation.

## Common profile failure law

Each profile exports one useful normalized failure family with:

```ts
{
  readonly provider: string
  readonly kind: finiteProfileSpecificKind
  readonly diagnostics: readonly Diagnostic[]
  readonly providerError: unknown
}
```

Rules:

- normalized fields are actionable without provider imports;
- exact provider error identity is retained in memory;
- provider adapters export identity-safe narrowing guards;
- only identity-proven provider failures are normalized;
- callback typed failures, defects, interruptions, and mixed Causes are not
  caught/remapped;
- tool compatibility failures are represented explicitly;
- unknown provider failures are not guessed by `_tag` string alone.

## One-continuation ownership law

All borrowed profiles use:

```ts
withRole(request, (borrowed) => Effect<A, E, R>)
```

The callback owns the temporary lifetime. The borrowed object contains
closure-owned acquisition Effects, not raw durable paths.

Required laws:

1. cleanup after callback success;
2. cleanup after typed failure;
3. cleanup after defect;
4. cleanup after interruption;
5. exact callback Cause preservation, including Fail+Interrupt and Fail+Die;
6. deterministic expiry after callback exit;
7. mutation and same-length digest mismatch detection;
8. root-containment rejection;
9. compatible duplicate-core interoperability;
10. incompatible protocol rejection;
11. no nested callback whose only effect is another lexical scope.

## Node recipe

### Core path

```text
effect-build/Recipe/NodeSourceExecutable
```

### Contract

```ts
export interface Request {
  readonly program: NodeMainProgram.Request
  readonly outfile: string
  readonly cwd?: string
  readonly systemTarget?: SystemTarget
  readonly digest?: boolean
}

export const createExecutable: (
  request: Request
) => Effect.Effect<
  Artifact.Executable<{
    readonly name: "node"
    readonly version?: string
  }>,
  NodeMainProgram.Failure | NodeMainExecutable.Failure,
  NodeMainProgram.Bundler | NodeMainExecutable.Assembler
>
```

The recipe:

1. borrows a Node main;
2. acquires/revalidates its file;
3. invokes the selected Node-main assembler;
4. returns one durable Node executable.

It selects neither service implementation and imports no provider package.

## Representative consumers

### Generic Node executable consumer

One unchanged application must run under all supported Layer combinations:

```text
Bun NodeMainProgram + Node SEA NodeMainExecutable
Esbuild NodeMainProgram + Node SEA NodeMainExecutable
```

The test harness also retains the research `pkg` assembler combination without
shipping it.

Exercise ESM and CJS, current and supported foreign system targets, callback
failure/defect/interruption, mutation, and packed duplicate-core consumers.

### Generic browser deployment consumer

One unchanged application must:

1. request the browser module application;
2. acquire the validated file tree;
3. copy/upload every manifest entry;
4. verify entry HTML and local references;
5. run unchanged under Bun and Deno profile Layers.

Do not use provider-specific options in the generic program.

## Direct provider permanence

Profile work must not narrow direct providers.

Required direct escape examples remain:

- Bun host build with virtual files/plugins/Bun target/compile mode;
- Bun command compile with Bun runtime target policy;
- Deno host bundle result and Deno command declarations/project compile;
- Esbuild transform/context/watch/serve/metafile;
- Node SEA assets/cache/snapshot/exec arguments.

Documentation explicitly states that direct modules are permanent supported
surfaces, not temporary escape hatches.

## Valid but deferred evidence

Retain research conformance for:

```text
IncrementalNodeMain
BrowserModuleOutputSet
```

Do not export them in 0.4.

`IncrementalNodeMain` is architecturally valid under Esbuild and Rolldown, but
0.4 ships no Rolldown integration package. Deferral is release sequencing, not
an invalidity or experimental label.

`BrowserModuleOutputSet` is valid but overlaps the chosen application profile.
Do not ship two near-duplicate role names in the first cut.

## Rejected proposals retained as negative tests

- importable `SingleNodeProgram` (Bun/Esbuild semantics differed);
- universal runtime executable producer (Bun/Deno runtimes differed);
- generic declaration output set (`tsc`/Deno topology differed);
- rolled-up declaration file for Deno/Rolldown (Deno unresolved import);
- durable multi-file application artifact (no common commit law);
- typed Bun/Deno command-watch events (no stable machine protocol);
- nested `withFile` callback (no additional ownership enforcement).

## Scope

- Add three core profile modules and services.
- Add five provider profile adapters.
- Add the core Node recipe.
- Broaden Node SEA direct command input to file/bytes independently of profiles.
- Preserve exact direct provider options/results/errors.
- Add profile protocol/version identity.
- Add normalized failures and exact provider-error guards.
- Add borrowed file/tree laws over Plan 039 `Author/BorrowedOutput`.
- Add runtime/tool compatibility observations and Plan 039 telemetry.
- Add generic Node and browser consumers plus packed fixtures.
- Update architecture docs to state provider permanence and profile exclusions.

Out of scope:

- Deno Node-main adapter;
- `pkg` public package;
- Rolldown public package/profile adapter;
- incremental profile export;
- declaration profile;
- command watch;
- durable directory artifact;
- signing;
- automatic provider/assembler selection;
- release mutation.

## Steps

1. Freeze direct provider surfaces and research receipts.
2. Implement core profile protocols/errors/services.
3. Implement one-continuation closure-owned borrowed files/trees.
4. Add NodeMainProgram Bun adapter over Command.
5. Add NodeMainProgram Esbuild adapter over scoped context.
6. Broaden Node SEA direct file/bytes input and prove standalone use.
7. Implement NodeMainExecutable Node SEA adapter.
8. Implement BrowserModuleApplication Bun adapter.
9. Implement BrowserModuleApplication Deno adapter.
10. Implement core NodeSourceExecutable recipe.
11. Add generic Node and browser applications with Layer-only substitution.
12. Add negative/falsifier fixtures and research `pkg` adapter.
13. Run exact Cause, expiry, mutation, duplicate-core, real-provider, platform,
    compatibility, and packed-consumer verification.
14. Record exact completion receipt.

## Invariants

- Provider direct modules remain permanent/canonical and independently usable.
- Generic Node application imports no Bun, Esbuild, Node SEA, or `pkg` package.
- Generic browser application imports no Bun or Deno package.
- Changing only Layers changes provider implementation.
- NodeMainProgram promises main execution, not general importability.
- NodeMainExecutable always returns runtime `node`.
- Bun/Deno runtime executables never implement NodeMainExecutable.
- Browser profile includes only module-reachable output and valid local
  references.
- Borrowed raw roots/paths are unavailable outside closure-owned acquisitions.
- Returning a borrowed object cannot extend valid use.
- Callback Causes remain exact.
- Direct provider errors/options/results remain available.
- No profile silently ignores a field.
- No automatic fallback/selection/installation occurs.
- Node recipe is ordinary Effect composition, not a plan/algebra.

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
node --test research/post-0.3/*.test.mjs
git diff --check
```

Required profile evidence:

### NodeMainProgram

- ESM/CJS under Bun and Esbuild;
- direct execution equivalence;
- imported-module difference retained as a negative test;
- external-import observations and provider-error guards;
- success/failure/defect/interruption/mixed Causes;
- producer interruption and cleanup;
- same-length mutation/digest mismatch;
- expiry and duplicate-core protocol tests.

### NodeMainExecutable

- direct file and bytes;
- CJS/ESM;
- current host and every advertised system target;
- exact runtime `node` observation;
- standalone Node SEA use without a producer package;
- mismatched builder/target hard gate;
- atomic publication/locked destination/interruption;
- research `pkg` adapter conformance without product export.

### BrowserModuleApplication

- unchanged generic consumer under Bun/Deno Layers;
- HTML/JS/CSS module graph;
- asset and source-map manifest;
- every local reference resolves inside manifest;
- top-level linked CSS negative fixture;
- root escape/missing/mutation/expiry;
- callback Cause and command interruption cleanup.

### Recipe

- Bun -> Node SEA and Esbuild -> Node SEA;
- ESM/CJS;
- generic program imports core only;
- producer and assembler Layers independently replaceable;
- packed isolated/composed consumers.

## STOP conditions

Stop and report if:

- Node-main equivalence requires promising importable-module behavior;
- a provider silently ignores a profile field;
- NodeMainExecutable must permit non-Node runtime output;
- a Node assembler requires project-graph authority to satisfy the profile;
- the Node SEA adapter still requires a producer package;
- the browser profile must include arbitrary linked resources that one provider
  drops;
- borrowed file/tree use succeeds after expiry or outside containment;
- duplicate-core interoperability requires a consumer-global registry;
- normalized error mapping catches caller Causes or loses provider identity;
- direct provider surfaces are demoted to escape hatches;
- automatic provider/assembler fallback appears;
- deferred profiles are exported merely for symmetry;
- release mutation is required.

## Completion receipt

Record exact source SHA, profile protocols/declarations, provider versions and
adapters, every conformance/falsifier law, generic consumer source hashes, all
workflow/job conclusions, packed consumers, and confirmation that no publish,
tag, release, merge, `pkg` product package, watch API, or incremental profile
was added.
