# Core and integration architecture audit

Audited on 2026-08-14 against `origin/main` commit
`60259f98a460b3d9b25b95221ca71b56c17d9d78`. The plan artifacts were prepared
in a source-untouched planning worktree based at
`e09e0b7056833f5897600d69ff4fb097260a82ae`; the only later main-line changes
are `test/fixtures/matrix/fake-compiler.mjs` and
`test/unit/standalone-matrix.test.ts`, so every production and architecture
excerpt below is byte-identical to current main. Implementation must start in
a clean worktree at current main, not in either older dirty planning checkout.

An Effect-specific Fable Max follow-up was attempted through the installed
Claude CLI on 2026-08-14 with a sanitized five-question brief, maximum effort,
no tools, and no session persistence. The CLI failed authentication before the
prompt was transmitted (`OAuth session expired and could not be refreshed`),
so there is no new response and no substitute model was used. The earlier
successful consultation is retained as historical research, but its two load-bearing claims were already
corrected by live evidence: `Effect.scoped` does not prevent a returned value
from escaping a closed Scope, and esbuild metadata cannot prove closure over
arbitrary JavaScript runtime module construction. This design independently
preserves those corrections with a continuation-owned bundle and a deliberately
narrow “observed external imports” claim.

The full raw response and accepted/corrected/rejected ledger remain at
`plans/research/2026-08-13-fable-max-raw.md` and
`plans/NEXT-STAGE-ARCHITECTURE-AUDIT.md#fable-max-recommendation-ledger`.
This program carries forward Fable's accepted continuation ownership,
cancel-then-dispose policy, structured-library-vs-process distinction, concrete
operation boundaries, single publication owner, ordered stage observations,
and rejection of failure-policy switches. It carries forward the live
corrections that assets belong to Node SEA input, selected Node is operation
state, ESM and CJS are both supported, the bundle records only
esbuild-observed edges, and a callback—not a returned scoped Effect value—owns
the temporary artifact lifetime. It continues to reject resolved options or
entrypoint as durable provenance, universal producers, immediate public
receipts, fake executor evidence, and semantic plans containing local paths.
No Fable claim is promoted merely because it appeared in the consultation.

## Governance decision gate

The selected granular surface conflicts with the live `AGENTS.md` generation:
that file still requires four packages, exactly two public operations, a closed
provider catalog, and package-private process capabilities. A plan artifact
cannot supersede repository instructions. Plan 023 therefore begins with one
separately authorized, `AGENTS.md`-only migration restamp, commits it alone,
and ends the turn. Source execution starts only in a fresh context that has
loaded those transitional rules. Plan 024 retains the migration generation
during the Esbuild/Node SEA cut; Plan 025 replaces it with the final
five-package `granular-integration-v2` rules only after Bun proves a second
bundle producer. Until
the maintainer explicitly requests the initial governance transition, this
architecture is selected and planned but source implementation is blocked.

## Prior Fable consultation disposition

| Disposition | Recommendation | Repository/live evidence used here |
|---|---|---|
| accepted | continuation-owned bundle lifetime; awaited cancel then dispose; separate bundle and SEA operations; one publication owner; no caller failure-policy switches | current cleanup paths/tests in `internal/Esbuild.ts:351-444`, shared publication in `CompilerEngine.ts:373-425`, and the two independently useful operations traced below |
| corrected | requiring `Scope` does **not** make a returned path non-escaping; esbuild metadata does **not** prove arbitrary-JavaScript dependency closure | installed `Effect.scoped` preserves `A` at `node_modules/effect/src/Effect.ts:12776-12778`; the preserved live probes/ledger in `NEXT-STAGE-ARCHITECTURE-AUDIT.md` show eval/global/`createRequire` blind spots |
| rejected | blob-backed bundle, Darwin-first SEA, multiple child-process abstractions, public provenance/receipts/plans/executors now, or a universal producer adapter | current producer materializes one scoped file, the only real SEA lane is exact Linux Node 26.7, core already owns bounded process/publication, and there is no closed-input or alternate-backend consumer |

The raw response remains unchanged under `plans/research`; this table records
the independently vetted effect on the present program without consulting a
new model.

## Effect-native follow-up review

Three independent reviewers applied the repository's `effect-ts` guidance to
services/Layers, Schema/errors, and Scope/concurrency/tests. Every proposed
change was then checked against both supported Effect endpoints: beta.104 and
rc.108. The relevant source APIs are endpoint-identical for `Context.Service`,
`Schema.TaggedError`, `Result`, `Schema.decodeUnknownResult`, `Effect.fn`,
`Layer.provide`, `acquireUseRelease`, and `SynchronizedRef`. Neither endpoint
exports the skill's newer `ServiceMap` or `Schema.TaggedErrorClass` spellings,
so live package source remains authoritative.

| Disposition | Effect-native recommendation | Rent/evidence |
|---|---|---|
| accepted | replace Provider's public `Valid`/`Invalid` union with `Result.Result<Validated, string>` | `produceExecutable.decodeStages` already uses Result; this deletes a parallel ADT and its duplicate matching branch |
| accepted | use one private `SynchronizedRef<ClaimState>` for cleanup-root/destination claims | one immutable atomic state replaces a Semaphore plus separately mutable sets/maps whose lock discipline could diverge |
| accepted | name reusable service/Integration operations with `Effect.fn`; keep one-line accessors unwrapped | adds native spans/stack boundaries without a BuildEvent/observer protocol; current Esbuild and Node candidate operations already prove the pattern |
| accepted | compose integration Layers once and satisfy private platform dependencies with `Layer.provide(NodeServices.layer)` | service methods expose only their tag/callback environment while Layer construction owns platform/tool probing |
| accepted | keep `Schema.Struct` DTOs and `Schema.TaggedError` failures; use explicit Result-to-code mapping, one exported core bundle-reason Schema plus finite integration-specific extensions, and identity-safe bundle-error guards | DTOs remain spreadable/plain, machine codes do not depend on formatted `SchemaError` text, integrations stop copying core literals, and a caller error with the same `_tag` is not accidentally intercepted |
| accepted | check `FileSystem.Info.size` as bigint before converting it to `ByteCount` | negative/unsafe test-layer sizes become one typed invalidity instead of silently losing precision or masquerading as drift |
| accepted | freeze Node SEA's public input reasons as literals plus one builtin-specifier template literal | removes the current arbitrary `reason: string` state while retaining the only evidence-backed dynamic code |
| accepted | copy the authenticated main with Effect `FileSystem.copyFile`, hash the private copy, and make both Node reads consume it | closes the ordinary authenticate-to-embed window without exposing a second Artifact or raw filesystem API; the method exists unchanged at beta.104 and rc.108 |
| corrected | “service methods require `never`” | Node SEA does; Esbuild must preserve callback `Exclude<R, Scope.Scope>` or the public Esbuild -> Node SEA composition becomes impossible |
| corrected | “make the resource bracket uninterruptible” | `acquireUseRelease` already masks acquire/release and restores interruption for use; wrapping the whole callback would violate the public interruption guarantee |
| corrected | replace matrix capture with `Effect.result` | live beta.104/rc.108 probes reduced a mixed typed-failure/interruption Cause to `Result.Failure`; the existing exact-Cause filter must remain |
| corrected | narrow public `PublicationFailed.operation` to current writers | Plan 023 preserves existing Bun/Deno construction and decoding; only a private helper is exhaustive over current lifecycle operations while the public field remains `string` |
| rejected | generic core Integration/Toolchain service, `Layer.scoped` tool lifetime, Schema classes/primitive brands, or `@effect/vitest` migration | each adds a second representation, ceremony, or dependency without removing a current branch; operation Scope and existing deterministic harnesses already own the real lifecycle |

The prior Fable response independently supports the two most important
non-additions: it rejected a universal producer interface because the concrete
operations do not share one protocol, and required a second interchangeable
implementation before replaceable executors. Its Scope advice remains applied
only in corrected continuation form. Fable did not supply the Effect-specific
recommendations above; those are independently source-vetted findings. No
Fable retry or model substitution is part of Plans 023-026. The new Bun
decision rests on exact Bun source and executable probes below.

## Narrow tsdown comparator

The official tsdown executable documentation still describes `exe` as
experimental, requires Node 25.7 or newer, combines bundling with SEA creation,
and downloads/caches Node binaries for cross-platform targets
([tsdown executable mode](https://tsdown.dev/options/exe)). That makes tsdown a
useful confirmation that executable packaging has a consumer, but the wrong
probe for this program's specific boundary: it hides the independently useful
`Source -> JavaScriptBundle` and `JavaScriptBundle -> Executable` operations
and adds automatic downloads that are explicitly excluded. Do not expand this
comparison into a library/npm-package pipeline.

## Bun 1.3.9 source verdict: Node resolution is not a Node version

The Bun question was checked against the exact `bun-v1.3.9` source tag at
commit `cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a`, not inferred from its
esbuild-compatible surface. `packages/bun-types/bun.d.ts:2430-2457,2779-2783`
separates JavaScript `BuildConfigBase.target` from
`CompileBuildOptions.target`. The former uses the exact
`Target = "bun" | "node" | "browser"` union at `:5074-5092`; the latter uses
Bun native executable targets such as `bun-linux-x64`. Native parsing in
`src/bun.js/api/JSBundler.zig:451-473` and `src/options.zig:354-405` accepts
only the finite JavaScript target enum. `src/bundler/bundle_v2.zig:900-901`
shows that the Node choice marks Node builtins external, while
`src/bundler/linker_context/postProcessJSChunk.zig:343-352` explicitly notes
that Bun does not lower even arrow functions.

Exact 1.3.9 probes confirmed the consequences: `target: "node26"` is rejected;
an esbuild-shaped `supported` property is ignored; optional chaining remains in
browser, Node, and Bun-targeted output. Bun can therefore select Node module-
resolution/builtin semantics, but it cannot select Node 26.7 or promise syntax
lowering for that release.

The follow-up pressure test also confirmed that Bun can transform and lower
syntax under this profile, including `import.meta.main`. In Bun 1.3.9 the
lowered expression behaves differently from native Node and Esbuild when the
bundle is imported, while `node --check` still passes. The proposed
`Preserved` tag was therefore rejected as representation debt: its plain
reading implied fidelity that the producer does not guarantee. The subsequent
rent test also rejected the renamed `ProducerDefault` tag from the neutral
Artifact: Node SEA applies the same selected-Node acceptance check regardless
of producer, so the tag recorded provenance without selecting behavior.
Esbuild's exact `node26.7` target and Bun's pinned producer-default behavior
remain integration-owned evidence.

The pressure-test decision is deliberately asymmetric:

```text
Bun CLI target=node  -> one Node-resolution bundle; pinned producer behavior
Esbuild target       -> one Node-resolution bundle; fixed node26.7 emission
selected Node 26.7.0 -> private-copy authentication, parser check, SEA assembly
```

The first Bun implementation uses the already-selected Bun CLI through the
core bounded command function. Calling the global TypeScript `Bun.build()` API
from package source would require Bun as the orchestrator and collapse the
independent runtime/tool axes. A helper/RPC child protocol is deferred until a
named consumer needs an API-only feature such as virtual files or plugins. The
fixed CLI slice is enough to produce one ESM/CJS bundle and structured
metafile; it still does not prove arbitrary-JavaScript dependency closure.

The Bun metafile is narrower than emitted-text reality. Exact 1.3.9 probes
showed generated `node:module` code absent from external edges, a `bun:wrap`
pseudo-record, and mixed path families: the entrypoint can remain lexical and
cwd-relative through `..` while imported inputs are realpathed. Plan 025
therefore compares the entrypoint lexically, adds a symlinked cwd/entry fixture,
tolerates well-formed non-external pseudo-records, and defines
`observedExternalImports` as only the sorted subset of metafile edges marked
external. It does not claim to enumerate every emitted import.

The same pressure test exposed an ordinary authenticate-to-embed window in
Node SEA: rehashing `main.path` and then letting `--check` and `--build-sea`
reread that path did not prove which bytes were consumed. The selected cut uses
Effect `FileSystem.copyFile` to place the authenticated main in Node's private
scoped staging, hashes that copy against the Artifact digest, and points both
commands at it. This adds no second Artifact; it stabilizes the input consumed
by one operation and preserves cleanup on every exit.

## Verifiable success criteria

This program succeeds only when all of the following are true:

1. Existing Bun and Deno scalar/matrix behavior remains intact: total matrix
   preflight, ordered partial results, bounded diagnostics, interruption as
   interruption, scoped child cleanup, native output validation, optional
   digest, and atomic publication all use one core lifecycle.
2. The final package graph is a star with no integration sibling dependency:

   ```text
   effect-build-bun --------> effect-build
   effect-build-deno -------> effect-build
   effect-build-esbuild ----> effect-build + esbuild@0.28.2
   effect-build-node-sea ---> effect-build
   application -------------> the integrations it composes
   ```

3. `effect-build-esbuild` and `effect-build-bun` independently produce one
   scoped, Node-compatible JavaScript bundle through continuations.
   `effect-build-node-sea` publicly consumes the neutral core handle and
   atomically publishes one executable. Every integration installs, builds,
   and type-checks without an integration sibling.
4. The core exports only concepts with current consumers: durable file and
   executable observations, system-target vocabulary, ordered stage/tool
   observations, the scoped JavaScript-bundle contract, and the narrow
   integration-author publication/process boundary.
5. The current opaque Node SEA source-to-executable and one-cell matrix facades
   are removed in the same unpublished hard cut. Keeping them would require a
   Node SEA -> Esbuild dependency or a guessed generic bundler service.
6. The existing Bun/Deno operation names, input semantics, target tables,
   result object values, and error/interruption behavior do not change; Bun
   additively gains only its scoped bundle continuation. The already-selected
   v0.3 workspace split preserves those semantics, not the published v0.2
   `effect-build/bun` and `effect-build/deno` module specifiers; the migration is
   documented explicitly and no cyclic compatibility facade is added.
7. No 0.3 package is published until exact-source CI, isolated packed
   consumers, the composed pipeline, all existing real-tool/target/publication
   axes, and a five-tarball candidate pass. Plan 021 remains blocked until a
   real coordinator can safely publish five npm subjects plus GitHub.
8. This is semantic and API growth with representation compression. It is not
   a source-line reduction exercise. The expected net additions are three
   useful public operations and one integration package; the compression is removal
   of the closed core provider catalog, the opaque combined Node SEA adapter,
   and duplicated artifact/stage authorities.

Hard exclusions for the entire program: a universal bundler or executable
packager service, generic build request/plan/executor, DAG, registry, fallback,
automatic backend selection, raw argv in end-user build requests, retry policy,
watch mode, plugin system, source maps, Node SEA snapshots/code cache,
automatic tool download, cache/CAS/store, remote/container execution,
transport, npm packaging, public native inspection, artifact manifest,
reproducibility classification, build receipt, `SemanticPlan`, and
`BoundExecutionPlan`.

## Repository measurements

Production, tests, docs, and plans were measured separately. Counts are
physical/nonblank lines for the exact file set named in each row.

| Surface | Files | Physical | Nonblank | Exact scope |
|---|---:|---:|---:|---|
| core production | 18 | 2,101 | 1,917 | `packages/effect-build/src/**/*.ts` |
| Bun production | 2 | 151 | 138 | `packages/effect-build-bun/src/**/*.ts` |
| Deno production | 2 | 240 | 221 | `packages/effect-build-deno/src/**/*.ts` |
| Node SEA production | 5 | 1,381 | 1,264 | `packages/effect-build-node-sea/src/**/*.ts` |
| tests | 68 | 7,276 | 6,800 | `test/**/*` |
| type tests | 2 | 431 | 385 | `typetest/**/*.ts` |
| user documentation | 11 | 799 | 638 | root/package READMEs, `docs/**/*`, `examples/**/README.md` |
| plans/research | 33 | 20,588 | 17,507 | `plans/**/*` |

The test estate is larger than production and already characterizes the hard
parts of the lifecycle. The next program should move and strengthen those
tests, not replace them with a speculative framework.

## End-to-end lifecycle trace

### Bun and Deno scalar

1. `effect-build-bun` or `effect-build-deno` exports
   `compileExecutable(input)` and a provider `Compiler` service.
2. `Provider.define` validates provider options and selects/discovers/probes the
   one explicitly chosen compiler. There is no registry or fallback.
3. `CompilerEngine.compilePreparedCell` resolves the destination and acquires
   an opaque sibling-staging candidate.
4. The command adapter sees semantic compiler input plus only the staged
   outfile. Core runs the child process, bounds stdout/stderr, and retains
   interruption as interruption.
5. On success the provider supplies its exact stage observation. Core validates
   the stage schema, regular/executable file facts, native header and requested
   target, optionally hashes the staged file, then performs the only rename.
6. The provider adds its literal `provider` field and returns the published
   artifact. Scope cleanup removes staging on failure or interruption.

The load-bearing current owner is visible at
`packages/effect-build/src/standalone/internal/CompilerEngine.ts:373-425`:

```ts
const destination = resolveExecutableDestination(path, { outfile, cwd })
const candidate = yield* acquireExecutableCandidate(fileSystem, path, { destination, executableSuffix })
const observedStages = yield* producer.produceCandidate({
  stagedOutfile: candidate.staged,
  resolvedDestination: destination,
  // provider input only
})
const published = yield* validateAndPublishExecutable(fileSystem, crypto, candidate, {
  digest,
  resolveTarget
})
return { ...published, provider: adapter.toolName, stages }
```

Scalar preflight is intentionally narrower than matrix preflight. The live
facade validates only target and provider options
(`CompilerEngine.ts:430-455`); `entrypoint`, `outfile`, `cwd`, and `digest` are
TypeScript-trusted values copied into the prepared cell, and digesting occurs
only for the literal `true` check at `CompilerEngine.ts:411-412`. The current
architecture guide states that boundary explicitly
(`docs/architecture.md:38-49`). Adding total runtime scalar decoding would be
an observable behavior change, not a hidden refactor, so Plans 023-025 preserve
it and leave a future decision gate rather than silently broadening errors.

### Bun and Deno matrix

The provider matrix operation decodes the complete request before starting a
cell, rejects empty/duplicate targets, invalid names, collisions, invalid
concurrency, and provider-option errors together, then traverses prepared
scalar cells with bounded collect-all semantics. Every cell enters the scalar
lifecycle above. Results and failures remain in input target order; committed
artifacts remain committed, active staging is cleaned on interruption, and no
rollback/fail-fast/publish-mode switch exists.

### Current opaque esbuild -> Node SEA path

`packages/effect-build-node-sea/src/Adapter.ts:117-146` currently makes both
tools inside one provider producer:

```ts
const esbuild = yield* makeLiveEsbuildService
const nodeSea = yield* makeLiveNodeSeaService(options, execute)
return {
  produceCandidate: (input) =>
    esbuild.withJavaScriptBundle(bundleInput, (main) =>
      nodeSea.produceCandidate({ main, stagedOutfile, resolvedDestination, assets })
    )
}
```

The private esbuild operation fixes `bundle: true`, `splitting: false`, Node
resolution, `node26.7` syntax, one output, no plugins, and structured diagnostic
overrides (`internal/Esbuild.ts:225-254`). It validates one JS entry output,
rejects CSS/runtime edges and unexpected warnings, records only external edges
actually observed by esbuild, writes one temporary `.mjs`/`.cjs`, registers a
WeakSet identity for the callback, and deletes it on success, failure, defect,
or interruption (`internal/Esbuild.ts:351-444`).

Node SEA consumes every retained bundle field: live identity, path, format,
Node syntax target, observed externals, and bundle stage. It validates exact
Node 26.7.0/Linux x64 GNU selection, builtins, input/asset/destination aliasing,
and destination containment before invoking `--build-sea`. It writes only the
core-owned staged path and returns the ordered Node stage. Core then performs
the same native validation/digest/rename used by Bun and Deno.

### Difficult paths that must survive the cut

| Path | Current guarantee | Required owner after cut |
|---|---|---|
| invalid scalar target/options | no child/publication; other scalar fields remain typed-only | provider facade |
| invalid matrix input | no child/publication; reports every ordered preflight issue | core matrix |
| missing/probe-failing tool | Layer acquisition fails; no fallback/download | integration Layer |
| nonzero compiler/Node exit | bounded diagnostics, staged output never published | integration error mapping |
| callback failure/defect | esbuild context cancel and dispose both attempted; temp bytes removed | Esbuild continuation |
| fiber interruption | child killed/reaped, scopes close, no synthetic build error | Effect Scope + bounded runner |
| forged/stale bundle | rejected before Node runs | core live-capability registry + Node SEA preflight |
| invalid/wrong-target native output | rejected before rename | core executable lifecycle |
| rename in progress | commit may linearize; post-rename interruption cannot undo it | core publication owner/documentation |
| matrix partial failure | ordered successful artifacts plus target-attributed failures | existing matrix orchestration |

## Representation and ownership map

| Concept | Current representation/owner | Decision | Rent paid |
|---|---|---|---|
| durable file facts | duplicated `ArtifactFields` and `ExecutableFile` | one core `FileArtifact` schema | removes duplicate validation/projections |
| published executable | closed Bun/Deno/Node SEA union in core | core `ExecutableArtifact` base; integration-specific refinements | removes core edits for every integration |
| system target | root eight-literal `Target` catalog | same canonical values, named `SystemTarget`; provider `Target` remains a subset | clarifies the overloaded word without a peer object model |
| native observation | private partial format/OS/arch/ABI value | remain private/integration-author-only | incomplete ABI is not an exact target |
| resolution target | fixed esbuild `platform: node` | core literal vocabulary containing only `node` | consumed by bundle validation/Node SEA |
| syntax semantics | esbuild fixes `node26.7`; Bun has no version target and has a known `import.meta.main` divergence | remain integration-specific; selected Node checks every private stabilized main | no current consumer branches on a neutral syntax tag, so adding one would record provenance without reducing state |
| execution target | selected Node tool/version | defer as a type | a SEA executable does not require an external runtime; stage already observes builder Node |
| tool/stage facts | exact provider tuples embedded in root Artifact | generic core observations plus integration refinements | preserves ordered multi-tool truth without calling it provenance |
| scoped bundle | Esbuild-owned interface + WeakSet | core nominal scoped capability plus required content digest; Esbuild and Bun produce, Node SEA privately copies/authenticates before consumption | removes sibling type/liveness dependency, stale/forged/same-length-rewrite states, and the ordinary authenticate-to-embed window |
| temporary-root/publication lifetime | Node checks only the current bundle directory | core allocates one fresh root from an integration prefix, atomically validates/claims it before production, deletes it before releasing the claim, and symmetrically tracks ref-counted prospective destinations | closes teardown and opposite-registration races while preventing Scope cleanup from deleting a published result and preserving same-outfile concurrency |
| executable candidate | private staged path + hidden rename state | remain private | producers cannot commit or observe rename authority |
| publication | private lifecycle function | one narrow integration-author operation wrapping the private candidate | three named integration consumers; one commit owner |
| process execution | private bounded runner plus public Provider types | narrow integration-author function; no replaceable runner service | avoids Node SEA process duplication without a universal executor |
| provider catalog | core hardcodes Bun/Deno/Node SEA in three files | provider-supplied ID, target, and stage schemas; command factory retained for Bun/Deno | deletes core branching and unsafe Node SEA casts |
| receipt/manifest/store | absent | remain absent | no durable consumer or hermetic evidence |

## Capability-boundary matrix

| Capability | core | Bun | Deno | Esbuild | Node SEA | application |
|---|---|---|---|---|---|---|
| file/executable schemas and system targets | owns | consumes/refines | consumes/refines | consumes | consumes/refines | consumes |
| scoped JS-bundle contract/liveness | owns | produces | — | produces | consumes | composes/borrows |
| compiler discovery/argv/diagnostics | lifecycle helper only | owns compile/bundle CLI | owns | — | — | selects Layer |
| esbuild API/options/metafile/errors | — | — | — | owns | — | chooses operation |
| Node selection/SEA config/assets/errors | publication helper only | — | — | — | owns | chooses operation |
| candidate/native validation/hash/rename | owns exclusively | invokes through facade | invokes through facade | — | invokes through integration SPI | never sees candidate |
| scalar/matrix orchestration | owns reusable command machinery | exports both | exports both | no matrix | no matrix | uses `Effect.gen`/`Effect.all` |
| host services | abstract requirements | Layer captures | Layer captures | Layer captures | Layer captures | provides official platform Layer |

## Direction findings

### 1. Core is currently an integration catalog, not an integration-neutral core

`ProviderContracts.ts:3-31` hardcodes all provider names and targets;
`Artifact.ts:41-117` hardcodes exact Bun, Deno, esbuild, and Node facts;
`MatrixError.ts:44-120` repeats all three variants; and
`Provider.ts:147-195,263-274` special-cases Node SEA with casts. Adding a public
Esbuild integration while retaining those authorities would require another
core case even though Esbuild does not produce an executable provider result.

**Decision:** make `Provider.define` a data-driven command-provider factory
with Bun and Deno as its two consumers. A definition supplies its ID, exact
target schema/table, and exact stage schema. It returns the provider-specific
Artifact/MatrixError schemas and current compile operations. Remove the
composed Node SEA branch; do not add esbuild to a provider-name union or a
registry.

**Sequence:** Plan 023 adds the neutral schemas and lifecycle while retaining
the closed provider compatibility projection required by the still-public
combined Node SEA facade. Plan 024 performs the data-driven provider cut in the
same atomic change that deletes that facade. Plan 023 is not incomplete merely
because the temporary projection still exists.

### 2. A scoped bundle and a durable executable are different states

The current `JavaScriptBundleArtifact` path is deleted after its continuation,
and a copied object is rejected. A Schema decoder cannot recreate its liveness.
Conversely, a successfully published executable remains at its destination
after the build Scope closes.

**Decision:** `FileArtifact` and `ExecutableArtifact` are plain durable
schemas. `JavaScriptBundle.Artifact` is an opaque, frozen, non-decodable handle
created only inside `JavaScriptBundle.withFile(...)` or the Esbuild
continuation. Core dynamically unregisters it on exit. Node SEA checks the live
identity and current file facts before doing work. Do not export a raw
`bundleScoped(): Effect<Artifact, ..., Scope>` API; Effect's type removes the
Scope requirement but does not prevent the returned value from escaping.

### 3. The real public operations are granular; the current Node SEA facade is not

Bun and Deno genuinely implement source -> executable, so their
`compileExecutable` and homogeneous matrix operations remain correct
orchestrators over core lifecycle abstractions. Bun also genuinely implements
source -> JavaScript bundle, but cannot target a Node syntax version. Node SEA
consumes a bundle. Its current source -> bundle -> executable facade chooses
esbuild and bundle policy inside the Node package, contradicting the
independent-integration graph.

**Decision:** expose:

```ts
Esbuild.withJavaScriptBundle(input, use)
Bun.withJavaScriptBundle(input, use)
NodeSea.createExecutable({ main, outfile, cwd?, digest?, assets? })
```

and document their short `Effect.gen`/continuation composition. Remove Node
SEA's `Compiler`, `Target`, `compileExecutable`, and
`compileExecutableMatrix`. The two producers share the exact scoped artifact,
not one options model or provider-substitution requirement. Do not replace them
with a generic bundler service or a combined package.

### 4. Target axes enter only when an operation needs them

The current system-target catalog is mature and shared by Bun, Deno, native
inspection, and Node SEA. The second pipeline proves Node resolution and one
Esbuild-specific syntax target; the Bun pressure test proves a producer with
different, version-pinned emission behavior. It does not prove a neutral
syntax vocabulary, a general browser/worker vocabulary, an external runtime
requirement for SEA output, or a cross-product `BuildTarget`.

**Decision:** keep the exact current system literals as `SystemTarget` and add
only `ResolutionTarget = "node"` to the bundle contract. Esbuild retains
`node26.7` as its own fixed request invariant; Bun retains its characterized
producer behavior; Node SEA always copies/authenticates the main and runs the
exact selected Node's `--check` before candidate acquisition. Defer
`SyntaxTarget`, `SyntaxMode`, and `ExecutionTarget`. Provider packages may keep their
ergonomic exported name `Target` for exact system-target subsets. Do not add a
convenience aggregate until one real operation must derive independent axes.

### 5. Observations are useful; receipts and reproducibility claims are not earned

The final SEA artifact has at least an esbuild and Node stage, so a singular
tool is misleading. The current ordered tuples record actual tool name,
version, optional selected path, and operation. They do not identify all
inputs, environment, lockfile, plugin code, backend, or output determinism.

**Decision:** core owns `ToolObservation` and `StageObservation`; integrations
refine exact values and preserve ordering. Documentation calls them observed
stages, never provenance, receipt, hermeticity, reproducibility, or an
attestation. A durable manifest/receipt waits for a consumer that can define
closed input and toolchain identity.

## Observable promotion gates carried forward

This selected cut refines rather than discards Plan 019's gates. The minimal
`FileArtifact`/`ExecutableArtifact` bases and scoped JavaScript-bundle
capability are earned now because Bun, Deno, Esbuild, and Node SEA use them as
an actual cross-package language. That does not earn every adjacent type.

| Candidate | Promote only when observable evidence adds all of the following |
|---|---|
| public executable inspection/validation | a named caller needs inspection without build/publication; every claimed native format/ABI ambiguity has real fixtures; the ranged-I/O and error contract does not expose candidate/rename state or create a second target canon |
| broader/durable artifact types | at least two integrations produce/consume the same durable semantic kind; lifecycle and atomic materialization are defined; no scoped path is serialized; provider/target correlation, digest behavior, Schema round trips, packed types, and the replacing semver cut are tested |
| versioned receipts | a named audit/replay/transport consumer; version discriminator and canonical encoding; observed stages/acceptance/backend identity only; unknown-version/migration fixtures; at least two topologies run the same evolution tests; workflow evidence remains distinct |
| `SemanticPlan` | closed content-identified inputs; content-identified toolchain requirement; backend-independent acceptance criteria and canonical encoding; no cwd/PATH/environment/workspace/output path/backend/credentials; the same encoded plan is consumed by two real binders |
| `BoundExecutionPlan` | the SemanticPlan gate is met; one explicit binder adds resolved tool/workspace/output/backend/transport facts; the bound value cannot encode as the semantic request; at least two real bindings preserve the same acceptance criteria |
| replaceable executors | the same versioned semantic plan runs on two genuinely different backends, not two local CLIs; both enforce the same acceptance criteria and record backend-specific observations; real cancellation, workspace, transfer, output retrieval, credential, and transport boundaries pass; selection remains explicit |

The long-term test remains: can one versioned semantic request with closed
inputs and a content-identified toolchain requirement be bound to multiple
backends, checked against the same acceptance criteria, and recorded in
backend-specific receipts? Until that is demonstrated, distinguish rigorously:

- **same semantic request** does not imply the same selected tool, workspace,
  invocation, backend, or bytes;
- **same invocation** adds the same binding/config/environment facts but still
  does not imply byte-identical output;
- **same output bytes** means only equal content digests under a named
  algorithm, not equal request, invocation, provenance, safety, or behavior.

## Selected public contract

The exact names may change only before Plan 023 implementation starts. After
its red type/API tests land, later executors must not invent synonyms or
compatibility aliases.

### `effect-build`

The root runtime keys are exactly `Artifact`, `BuildError`,
`JavaScriptBundle`, `MatrixError`, and `Target`. The only author subpaths are
`./Integration` and `./Provider`; do not create one subpath per data module.
Their roles are:

- `Artifact`: `FileArtifact`, `ExecutableArtifact`, `ToolObservation`, and
  `StageObservation` schemas/types. File fields remain flat
  (`path`, `bytes`, optional `digest`) so Bun/Deno result values do not change.
  Every platform bigint size is bounds-checked before conversion into the
  canonical numeric `ByteCount`; unsafe values are typed invalidity, not
  precision loss.
  `ExecutableArtifact` adds `target` and non-empty ordered `stages`; a provider
  package adds its literal `provider` field. The final namespace also retains
  only the primitive `AbsolutePath`, `ByteCount`, and `Digest`; the closed root
  `Artifact`, `ToolName`, `ArtifactFor`, and `StagesFor` catalog is deleted.
- `Target`: `SystemTarget` and `ResolutionTarget`. The latter initially accepts
  only `node`. There is no neutral syntax mode/target, aggregate target, or
  `ExecutionTarget` yet; the ambiguous inner
  `Target` alias exists only in Plan 023's no-publish compatibility step and is
  deleted in Plan 024.
- `JavaScriptBundle`: opaque `Artifact`, exact `Format`, `Input`, and
  `withFile(input, use)`, plus the one exported finite `InvalidReason` Schema
  that integration error Schemas compose rather than copy. The input names `observedExternalImports` rather than
  claiming full dependency closure and requires an ordered `stages` array
  (`[]` for a borrowed bundle with no observed producer). `withFile`
  observes/validates the regular
  file, byte count, and SHA-256 content identity and makes the handle live only
  during `use`; it does not delete a caller-owned file. Consumer inspection
  re-stats and rehashes before work, rejecting even a same-length rewrite. It
  returns the same nominal handle after authentication, not a peer wrapper.
- `Integration`: `produceExecutable`, bounded `executeCommand`, and one scoped-
  bundle authoring/inspection family. `withOwnedJavaScriptBundle` accepts a
  simple temporary prefix plus a root-indexed producer; core allocates,
  validates, and claims the fresh root in one
  `SynchronizedRef.modifyEffect` transition before
  production, keeps that claim through producer/use Scope teardown, awaits
  physical root deletion, and only then releases the claim. A generated path
  contested before claim installation is never deleted, because it may already
  contain an in-flight durable publication;
  `produceExecutable` privately claims its lexically resolved destination for
  the operation and performs physical canonicalization only when comparing it
  with an active cleanup root. Neither claim may contain the other, and both
  registration orders update one private immutable `ClaimState` atomically.
  `inspectLiveJavaScriptBundle` returns only the
  authenticated handle. The subpath exports no claim token, root, candidate
  object, commit function, process handle, raw native inspector, registry
  object, or replaceable executor service.
- `Provider`: data-driven command compiler authoring for Bun/Deno. A definition
  supplies provider ID, exact Target/stage schemas, Result-based option
  validation, probe, argv, diagnostics, and a pure service constructor around
  the one selected bound command. Bun uses that constructor to add bundling;
  Deno returns only the generated compile functions. The bound command remains
  type-only author context, not an end-user service. There is no composed-
  provider case.

`produceExecutable` receives final output intent plus a callback that can write
only the staged path:

```ts
Integration.produceExecutable({
  outfile,
  cwd,
  digest,
  executableSuffix,
  prepare: ({ resolvedDestination }) => Effect<Prepared, PrepareError, R1>,
  decodeStages: (prepared, value) => Result<Stages, InvalidStagesError>,
  resolveTarget: (observation) => Result<SystemTarget, string>,
  produce: ({ stagedOutfile, resolvedDestination, prepared }) => Effect<unknown, ProduceError, R2>
})
```

Core resolves the destination and atomically records a reference-counted
lexical claim so concurrent same-destination operations retain the current
run-both/serialized-rename behavior. With no owned cleanup root active, this
performs no new filesystem probe: candidate acquisition still owns recursive
parent creation and its existing `make-directory` failure. Only comparison
with the newly introduced owned-root feature derives the prospective physical
parent. That conditional canonicalization walks to the nearest existing
ancestor, realpaths it, and appends missing segments, so missing parents and
symlinked ancestors remain safe without changing ordinary Bun/Deno error
ordering. The claim is acquired before `prepare` and held through operation
exit; it creates no output directory or candidate. Core then runs `prepare`, allocates/consumes
the hidden candidate, validates returned stages through the prepared-aware
integration decoder, inspects the executable, computes the optional digest,
performs the sole rename, and returns the base executable. A producer cleanup
root registered in the opposite order cannot capture an active destination.
`resolvedDestination` exists only for alias/containment preflight; no producer
sees rename authority.

The prepared value is topology-specific and cannot contain facts that do not
yet exist. During Plan 023's retained opaque facade, the bundle is created only
inside `produce`, so `prepare` can retain only the fixed expected
esbuild-plus-selected-Node stage tuple; actual bundle authentication remains
inside that producer continuation and mismatch maps to the facade's existing
`ToolFailed`. After Plan 024 cuts to `NodeSea.createExecutable({ main, ... })`,
the live main exists before core preparation, so the Node integration can
authenticate it and correlate an arbitrary exact `main.stages` prefix with the
Node suffix. This avoids a hidden prebundle, escaped Scope, or false temporal
claim.

### `effect-build-bun`

The existing `Compiler`, `layer`, `compileExecutable`,
`compileExecutableMatrix`, and provider-specific Target/error surface remain.
The same service additively exposes `withJavaScriptBundle(input, use)`; the
Layer discovers/probes one Bun command, and both compilation and bundling close
over that exact selected executable. There is no second Bun Layer, discovery
path, or public command capability.

The first bundle request is exactly one JS/TS entrypoint, required ESM/CJS
format, and optional cwd. The fixed selected Bun 1.3.9 CLI invocation uses
`build --target=node --packages=bundle --format=<esm|cjs>` with one outfile and
one metafile under the core-owned temporary root. It validates one JS output,
rejects CSS/extra outputs, records sorted observed externals, and returns:

```ts
JavaScriptBundle.Artifact<readonly [{
  readonly operation: "bundle-javascript"
  readonly tool: { readonly name: "bun"; readonly version: "1.3.9"; readonly path: string }
}]>
```

The descriptor has `resolutionTarget: "node"`. The pinned Bun producer emits
according to its defaults without selecting a runtime syntax version; that is
documented and tested as an integration fact rather than encoded as a neutral
Artifact field. It does not claim Bun leaves TypeScript/JSX, modules, or
runtime-oriented syntax untouched.
The Bun operation never accepts `nodeVersion`, `syntaxTarget`, raw flags,
plugins, splitting, watch, or a Node executable. Existing direct Bun compile
continues to accept/observe its current selected versions; exact 1.3.9 is an
operation requirement only for this first bundle contract.

### `effect-build-esbuild`

The primary operation keys are `Esbuild`, `withJavaScriptBundle`, and `layer`.
The same entry point also exports the runtime diagnostic/error schemas/classes
(`EsbuildDiagnostic`, `EsbuildVersionMismatch`, `InvalidBundleInput`,
`EsbuildFailed`, `JavaScriptBundleInvalid`,
`BundleMaterializationOperation`, and `BundleMaterializationFailed`) plus
type-only inputs/unions and the core `JavaScriptBundle.Artifact` callback type.
The fixed first slice remains one JS/TS entry, one ESM/CJS output, Node
resolution, explicit Node 26.7 syntax, no splitting/plugins/watch, no
unexpected warnings, and no non-observed closure claim.

Raw `EsbuildApi`, context interfaces/factories, BuildOptions, metafile shape,
plugins, watch/rebuild API, and the package-global native service lifecycle are
private test/implementation details.

### `effect-build-node-sea`

The primary operation keys are `NodeSea`, `createExecutable`, and `layer`. The
same entry point exports the existing runtime Node SEA error/operation schemas
and classes needed for typed recovery. Public input:

```ts
interface CreateExecutableInput<MainStages extends readonly StageObservation[]> {
  readonly main: JavaScriptBundle.Artifact<MainStages>
  readonly outfile: string
  readonly cwd?: string
  readonly digest?: boolean
  readonly assets?: readonly { readonly key: string; readonly path: string }[]
}
```

`format` comes from `main`; target comes from the exact selected Node and native
output validation. Before candidate acquisition, Node SEA authenticates the
live main, copies it into operation-private staging, verifies the copy's digest,
and runs exact selected Node `--check` on that copy using its required
`.mjs`/`.cjs` suffix. The SEA config names the same private copy. This is parser
acceptance, not lowering or a runtime smoke test. There is no entrypoint,
esbuild option, target matrix,
snapshot/code-cache flag, automatic download, or signing option. The layer
accepts only optional `executable` selection and pins exact Node 26.7.0 on
Linux x64 GNU. The service method returns a Node-SEA-refined executable
artifact with `provider: "node-sea"`, the main's ordered stages followed by the
Node assembly stage, and integration-owned tagged errors plus shared output /
publication errors.

### Application composition

```ts
const nodeSeaLayer = NodeSea.layer({ executable })

const buildToolsLayer = Layer.mergeAll(
  Esbuild.layer,
  nodeSeaLayer
).pipe(
  Layer.provide(NodeServices.layer)
)

const program = Esbuild.withJavaScriptBundle(
  { entrypoint: "src/main.ts", format: "esm" },
  (main) => NodeSea.createExecutable({ main, outfile: "dist/app" })
).pipe(
  Effect.provide(buildToolsLayer)
)
```

The same Node SEA layer consumes the Bun producer without either integration
importing the other:

```ts
const bunProgram = Bun.withJavaScriptBundle(
  { entrypoint: "src/main.ts", format: "esm" },
  (main) => NodeSea.createExecutable({ main, outfile: "dist/app-bun" })
).pipe(
  Effect.provide(Layer.mergeAll(Bun.layer(), nodeSeaLayer)),
  Effect.provide(NodeServices.layer)
)
```

The application owns the producer selection. Two producer APIs do not yet earn
a generic substitution service: Bun and Esbuild differ in invocation,
configuration, diagnostics, and syntax guarantees. Node SEA and core remain
unchanged because both produce the exact live artifact capability. Multiple
builds use ordinary Effect composition; no build monad or pipeline object is
introduced.

## Compression ledger

| Change | Adds | Deletes/merges | Net architectural effect |
|---|---|---|---|
| core artifact model | durable base schemas and narrow target names | closed three-provider root union and repeated file/stage fields | one authority per durable fact |
| data-driven command provider | provider-supplied schemas and named Effect boundaries | provider catalog, custom Validation ADT, Node special-case, unsafe casts | core no longer changes per integration; Result is the one synchronous validation vocabulary |
| scoped bundle capability | one nominal live handle and borrow operation | Esbuild-owned public-shape/WeakSet authority | producer and consumer share one lifetime contract |
| claim coordination | one private `SynchronizedRef<ClaimState>` | separate Semaphore plus mutable root/destination collections | synchronization and state become one atomic authority |
| integration publication SPI | one higher-order operation | direct access to candidate choreography from every orchestrator | one validation/hash/rename path |
| Esbuild package | one independently useful public operation | Esbuild code/dependency inside Node SEA | isolates technology ownership |
| Bun bundle method | one independently useful operation on the existing service | second Bun discovery/Layer and false Node-version target | proves the core artifact with a structurally different CLI producer |
| integration-owned syntax facts + selected-Node check | one private-copy integrity step and parser preflight | provenance-only core syntax mode and producer-specific compatibility guesses | assigns emission facts to producers and acceptance to the selected consumer |
| Node SEA API | one bundle -> executable operation | opaque combined compiler, one-cell matrix, error flattening | API matches the real transformation |
| observations | generic tool/stage base | singular/closed tool assumptions | truthful multi-stage results without proof claims |

The program is allowed to increase source lines. It fails the compression test
if it leaves both old and new Artifact/Target names, duplicates esbuild code,
retains Node SEA's combined facade, adds a sibling package dependency, or
introduces a plan/executor/store abstraction with no current consumer.

## Program and dependency order

0. With explicit maintainer authorization, execute Plan 023 Step 0 as an
   `AGENTS.md`-only migration-governance commit, end that turn, and restart in
   a fresh context. No source edit is allowed before this gate.
1. Plan 023 establishes the core schemas, scoped bundle capability, and one
   integration publication owner while preserving the closed provider
   projection needed by every current operation.
2. Plan 024 atomically moves the exact esbuild producer to its own package,
   hard-cuts Node SEA to the granular bundle-consuming API, and only then makes
   the Bun/Deno command-provider factory data-driven. These moves are one plan
   because a separately releasable intermediate state would require
   duplication, an integration sibling dependency, or a broken facade.
3. Plan 025 adds `Bun.withJavaScriptBundle` through the same core capability,
   reuses its one selected command, and moves exact Node syntax acceptance into
   Node SEA. This is the second-producer pressure test, not a generic bundler
   extraction.
4. Plan 026 freezes the five-package surface, proves isolated and both composed
   packed-consumer topologies plus every existing CI axis, emits a non-mutating
   five-tarball candidate, and records the still-blocked release boundary.

No source implementation is authorized by this audit itself. Executors must
follow the numbered plans, stop on drift, and make no release between Plans
023 and 026.
