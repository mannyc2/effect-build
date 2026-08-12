# Plan 006: Freeze the managed API, compatibility evidence, and CI

> **Executor instructions**: Follow this plan in order. Write the named tests
> before changing exports, docs, or CI. Run every verification command and
> confirm its expected result. If a STOP condition occurs, stop and report; do
> not improvise. This plan owns the coordinated CI-acceptance transition for
> rows 004-006 in `plans/README.md`; do not change any other status row unless a
> dispatching reviewer owns the index.
>
> **Dependency/drift check (run first)**:
>
> ```sh
> test -f plans/005-prove-normalization-with-deno-cli.md
> awk -F'|' '$2 ~ / 005 / { gsub(/^ +| +$/, "", $7); print $7 }' plans/README.md | rg -q '^(DONE|IMPLEMENTED: awaiting required CI)$'
> git rev-parse --verify HEAD
> pnpm verify
> test -z "$(git status --porcelain=v1)"
> ```
>
> Expected: Plan 005 is either `DONE` or `IMPLEMENTED: awaiting required CI`;
> the complete existing gate exits 0; the worktree is clean. If a reviewer owns
> the index, their explicit confirmation may replace
> only the row check. On any export, descriptor, command, or behavior mismatch
> with “Current state,” STOP for reconciliation.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/005-prove-normalization-with-deno-cli.md`
- **Category**: tests / DX / docs / CI / architecture
- **Planned at**: unversioned workspace on 2026-08-09; official release metadata
  checked on that date

## Why this matters

Plans 002–005 prove a managed core and two genuinely different executable
drivers. This plan converts those proofs into a frozen, inspectable V1 surface:
one reusable conformance suite, type/import boundaries, descriptor-generated
compatibility documentation, and required CI that uses exact verified tools and
runs real-tool tests without network access. It does not test hypothetical
changes or enlarge the product.

## Current state and fixed release evidence

Plan 004 creates `src/bun/BunCli.ts`, exporting runtime values `descriptor`,
`Config`, `ResolvedInput`, `makeCompileExecutableRequest`, `Driver`, and `layer`.
`Config` and `ResolvedInput` are dual Schema values/types; exact additional
type-only names are `ConfigEncoded`, `ResolvedInputEncoded`, and `Request`. It also creates
`test/unit/bun-cli.test.ts`, `test/integration/bun-executable.test.ts`, and
`test/testkit/compileExecutableDriverContract.ts` with named
`compileExecutableDriverContract`.

Plan 005 creates the equivalent closed exports in `src/deno/DenoCli.ts`,
`test/unit/deno-cli.test.ts`, and `test/integration/deno-executable.test.ts`.
Both implement one unchanged `CompileExecutable` recipe; configs remain
driver-specific. The Deno driver resolves denort as semantic
`ToolchainAssetIdentity { role, target, logicalPath, digest, byteLength }`, keeps
its path in a private handle, and supplies a verified `DENORT_BIN` plus fresh
engine-owned `DENO_DIR`. Product modules never read test-harness variables.

Both modules also export explicit Layer factories: `BunCli.layer({ executable
})` and `DenoCli.layer({ executable, denort })`. The root exports
`ExecutionPlatform.Current` under runtime key
`effect-build/ExecutionPlatform/Current` plus explicit
`layerNode/layerBun/layerDeno`; every Build Layer is provided exactly one of
them. Harness variables are validated
only by tests and passed as absolute Layer configuration; Layer construction
creates private handles internally. `Driver` is a service tag yielded inside
the test program, never a tag passed as an implementation value.

Each descriptor already carries one versioned `DriverInvocationContractV1`, the
sole runtime canon for compiler/tool/profile and symbolic token/binding
authorization. `Compatibility.DriverCompatibility.fromDescriptor` generates
`DriverCompatibilityV1` for docs/conformance; the projection is not separately
authored or consulted during execution. Runtime/controller/OS/process/
filesystem/store capabilities are separate `HostCapabilityEvidence` from Plan
003 and must not be invented in descriptors.

Required Linux x86-64 CI assets are official release artifacts pinned by
archive digest:

| Asset | URL | Required SHA-256 |
|---|---|---|
| Bun 1.3.9 | `https://github.com/oven-sh/bun/releases/download/bun-v1.3.9/bun-linux-x64.zip` | `4680e80e44e32aa718560ceae85d22ecfbf2efb8f3641782e35e4b7efd65a1aa` |
| Deno 2.9.3 | `https://github.com/denoland/deno/releases/download/v2.9.3/deno-x86_64-unknown-linux-gnu.zip` | `8101865641cbede56f08ad19c0a67a87df84bce127fee0d3e3e1f7467717ffa6` |
| denort 2.9.3 | `https://github.com/denoland/deno/releases/download/v2.9.3/denort-x86_64-unknown-linux-gnu.zip` | `9fd1ecebd84bfd99b406442f40176e32e948b00edb91221358ec44d25a2092bd` |

CI test-harness variables are exactly:

- `EFFECT_BUILD_CONTROLLER_BIN` for the explicitly provided Node
  `ExecutionPlatform.Current` Layer;
- `EFFECT_BUILD_EXPECTED_HOST_OUTCOME_JSON`, used only by the publication-host
  harness and absent from real-tool product paths;
- `EFFECT_BUILD_BUN_BIN` and `EFFECT_BUILD_REQUIRE_REAL_BUN=1`;
- `EFFECT_BUILD_DENO_BIN`, `EFFECT_BUILD_DENORT_BIN`, and
  `EFFECT_BUILD_REQUIRE_REAL_DENO=1`.

The `REQUIRE_REAL` flags convert missing/wrong tools into failures, never skips.
Only test harness code reads these names and converts verified paths to public
Layer configuration. The library never downloads tools/assets or reads these
variables, and tests never construct private handles.

## Commands to establish

Run exactly `pnpm add -D -E yaml@2.9.0` and commit the resulting lockfile
change; it is the one YAML parser used by architecture checks. Add these exact
scripts:

| Purpose | Command | Script behavior / expected result |
|---|---|---|
| All units | `pnpm test:unit` | exact script `pnpm test:unit:models && pnpm test:unit:core && pnpm test:unit:bun && pnpm test:unit:deno`; no discovery/filtering |
| Conformance | `pnpm test:conformance` | `vitest run test/conformance/compile-executable-drivers.test.ts`; both descriptors pass |
| Architecture | `pnpm test:architecture` | `pnpm build && vitest run test/architecture/import-boundaries.test.ts test/architecture/public-api.test.ts test/architecture/generated-and-ci.test.ts`; a fresh build precedes the three exact files |
| External consumer | `pnpm test:consumer` | `pnpm build && node scripts/test-built-consumer.mjs`; packed declarations/runtime exports work from a temporary external NodeNext project |
| Publication host | `pnpm test:integration:publication-host` | exact script `vitest run test/integration/publication-host.test.ts`; consumes one strict authored host expectation |
| Generate docs | `pnpm docs:generate` | build, then `node scripts/generate-compatibility.mjs --write` |
| Check docs | `pnpm docs:check` | build, then generator `--check`; exit 0 without writes |
| Freeze gate | `pnpm verify:freeze` | exact script `pnpm test:unit && pnpm test:conformance && pnpm test:architecture && pnpm test:consumer && pnpm test:types && pnpm docs:check`; exit 0 |
| Existing full gate | `pnpm verify` | Plans 002–005 remain green |

The existing exact-real commands remain authoritative:

```sh
EFFECT_BUILD_REQUIRE_REAL_BUN=1 EFFECT_BUILD_BUN_BIN=/abs/bun-1.3.9 pnpm test:integration:bun
EFFECT_BUILD_REQUIRE_REAL_DENO=1 EFFECT_BUILD_DENO_BIN=/abs/deno-2.9.3 EFFECT_BUILD_DENORT_BIN=/abs/denort-2.9.3 pnpm test:integration:deno
EFFECT_BUILD_REQUIRE_REAL_BUN=1 EFFECT_BUILD_BUN_BIN=/abs/bun-1.3.9 EFFECT_BUILD_REQUIRE_REAL_DENO=1 EFFECT_BUILD_DENO_BIN=/abs/deno-2.9.3 EFFECT_BUILD_DENORT_BIN=/abs/denort-2.9.3 pnpm test:integration:cross-driver
EFFECT_BUILD_REQUIRE_REAL_BUN=1 EFFECT_BUILD_BUN_BIN=/abs/bun-1.3.9 EFFECT_BUILD_REQUIRE_REAL_DENO=1 EFFECT_BUILD_DENO_BIN=/abs/deno-2.9.3 EFFECT_BUILD_DENORT_BIN=/abs/denort-2.9.3 pnpm test:integration:all
```

## Scope

**In scope** (only these files):

- `package.json`
- `pnpm-lock.yaml`
- `src/index.ts`
- `test/testkit/compileExecutableDriverContract.ts`
- `test/conformance/compile-executable-drivers.test.ts`
- `test/architecture/import-boundaries.test.ts`
- `test/architecture/public-api.test.ts`
- `test/architecture/generated-and-ci.test.ts`
- `typetest/public-api-freeze.tst.ts` (following the Plan 002 Tstyche
  convention; do not create a competing suffix/layout)
- `tooling/tool-pins.json`
- `tooling/support-matrix.json`
- `tooling/public-api.json`
- `scripts/read-tooling.mjs`
- `scripts/verify-tool-assets.mjs`
- `scripts/generate-compatibility.mjs`
- `scripts/test-built-consumer.mjs`
- `test/consumer/positive.ts`
- `test/consumer/runtime.mjs`
- `test/consumer/negative-driver-spi.ts`
- `test/consumer/negative-internal-import.ts`
- `test/integration/publication-host.test.ts`
- `test/fixtures/publication/input.txt`
- `docs/compatibility.md`
- `docs/architecture.md`
- `docs/roadmap.md`
- `README.md`
- `.github/workflows/ci.yml`
- `plans/README.md` (coordinated Plan 004-006 status transitions only)

**Out of scope**:

- Any semantic edit to `src/bun/BunCli.ts`, `src/deno/DenoCli.ts`, the core
  executor/model/content store, or existing direct-vs-driver fixtures. A failing
  conformance requirement that needs such an edit requires plan reconciliation.
- New drivers/operations, native/raw argv APIs, cache reads, remote/watch/DAG,
  Node SEA, auto-download in product code, retry/fallback, or legacy exports.
- Publishing, deployment, signing, secrets, release credentials, an Effect
  upstream issue, scheduled canaries, or a 1.0 stability promise.
- Fake change-amplification exercises that edit a fake option/driver and ask a
  reviewer to judge changed files. This plan uses real, machine-checked graph and
  public-surface boundaries instead.

## Git workflow

Continue the existing foundation branch. Commit logical verified slices, for
example `test(api): freeze managed driver contracts` and
`ci: verify exact Bun and Deno offline`. Do not push/open a PR unless requested.

## Steps

### Step 1: Make both real drivers pass one reusable conformance suite

Set the final `test:unit` package script here as the fixed sequential
composition of `test:unit:models`, `test:unit:core`, `test:unit:bun`, and
`test:unit:deno`, in that order. Plans 002–005 own the four exact member aliases;
Plan 006 alone owns this final aggregate. Do not replace it with a glob,
positional filter, or empty-suite behavior.

Extend `compileExecutableDriverContract` only with backend-independent managed
requirements, then instantiate it for Bun and Deno in
`test/conformance/compile-executable-drivers.test.ts` using their named
`descriptor`, Schema/types, concrete request constructor, opaque `Driver`, and
Layer factory. No renderer or implementation SPI is public or supplied to the
suite; core selects and renders the descriptor-captured contract.

Machine-check for each driver:

- exact operation/driver/surface/version descriptor and Schema round trips;
- exact `DriverInvocationContractV1` round trip, descriptor-version coupling,
  all finite exact canonical `ResolvedInput` variants and their full ordered
  argv/environment projections, runtime token/binding authorization, and a generated
  `DriverCompatibilityV1` projection that cannot drift or become runtime input;
- one nested operation-owned resolved recipe/context/target/output projection,
  driver-only resolved input, and adversarial duplicate/mismatch decode
  rejection; `CurrentHost` resolves once before driver resolution and the
  immutable operation/platform is passed to the selected driver;
- resolver types receive only validated driver config plus canonical operation/
  execution platform, never Recipe or the whole request;
- descriptor and operation construction privately capture compiled strict
  encoder/decoder/projector closures once; replacing or mutating publicly
  reachable Schema methods/AST or operation wrapper properties afterward
  cannot change request ingress, planning, canonical matching, or output facts;
- the Deno probe uses a fresh probe-only `ProbeScratchPath`, cleans it on every
  terminal path, allocates no attempt ID/record, and neither probe nor build
  contracts accept the other's scratch-token vocabulary;
- tool resolution is one core-branded atomic semantic/handle value; handles
  have no peer expected identity, forced semantic-A/handle-B pairings fail
  before attempt, and revalidation compares to the resolved-build toolchain;
- exact driver/request match before side effects; one capability-bound symbolic
  invocation, one core-owned build spawn, driver interpretation only after
  bounded completion, and no fallback/retry;
- private staging only, unchanged normalized recipe and artifact outcome shape;
- success, compiler rejection as data, infrastructure error, bounded evidence,
  interruption, tool/asset mutation before spawn, path/output violations, and
  raw stdout/stderr separation;
- missing declared entrypoint as zero-attempt `MissingEntrypoint` planning
  failure versus a valid entrypoint's missing import as compiler rejection;
- no caller destination, shell string, raw extra args, callback, secret/user
  environment, or driver-native result in managed values.
- driver invocation specs contain no raw executable/cwd/output/environment path,
  and drivers have no managed-build process-spawn dependency;
- Bun's single-token outfile uses only the contract-exact
  `PrefixedCapability("--outfile=", StagedOutput)`; general interpolation and
  other prefix/capability pairings fail.
- invocation contracts are the sole runtime authorization, compatibility
  projections contain only driver/tool/profile facts and cannot drift, runtime
  host capabilities come from probes, and public Layer factories are the sole
  explicit tool-path ingress with private handles unconstructible.
- the public handles expose no `resolve`, `prepare`, `interpretCompletion`, raw
  invocation, probe, or spawning method; Bun and Deno service keys are exactly
  distinct, and a program merging both Layers retrieves both descriptors
  without collision;
- core source contains no switch, branch, registry, or literal dispatch over
  the Bun/Deno driver IDs; selection is the exact opaque handle supplied by the
  caller and captured in `PreparedBuild`.

Keep tool-specific argv/config assertions in the existing Bun/Deno unit tests.
Keep direct CLI parity in existing integration tests. Do not duplicate them into
the generic suite.

**Verify**:

```sh
pnpm test:conformance
pnpm test:unit:bun
pnpm test:unit:deno
pnpm check
```

Expected: both conformance instantiations and existing driver unit suites pass.

### Step 2: Freeze public types, exports, and import ownership

Set `package.json` exports to exactly the core root plus explicit driver
subpaths: `.`, `./bun/BunCli`, and `./deno/DenoCli`, each with declaration and ESM
targets. The sorted runtime keys at `.` are exactly `Artifact`, `Build`,
`BuildContext`, `BuildDriver`, `BuildError`, `BuildExecutor`, `BuildOperation`,
`BuildOutcome`, `BuildPlan`, `BuildRecord`, `BuildRequest`, `Compatibility`,
`CompileExecutable`, `Diagnostic`, `Environment`, `Evidence`,
`ExecutionPlatform`, `Identifier`, `Target`, and `Toolchain`. These are explicit
namespace exports, not a wildcard. `BuildOperation`, `BuildRequest`, and
`BuildDriver` expose only readonly public type views and the fixed V1 values
needed by consumers; they expose no generic operation/descriptor/request maker.
The root must not export `ContentStore`, `BuildRecordStore`, drivers,
`src/internal/**`, `PreparedBuild` constructors, execution handles, or future/
native/cache/session APIs.

Encode the three exact package subpaths and a recursively qualified public
surface once in versioned `tooling/public-api.json`: every root namespace's
runtime members and type-only declaration symbols (for example
`Build.run`, `ExecutionPlatform.Current`, and
`ExecutionPlatform.layerNode`,
`Compatibility.DriverCompatibility.fromDescriptor`, and
`Evidence.EvidenceContract.v1Default`), plus each driver subpath's runtime/type-only
members, and a canonical declaration signature for every package-owned public
symbol/overload. Signature normalization uses the TypeScript compiler API over
the built `.d.ts` graph and preserves fully qualified symbol/kind, ordered type
parameters with constraints/defaults, overload order, parameter type/rest/
optional status, return type, readonly/optional members, and referenced public
types. Parameter names and whitespace/comments/source locations are discarded;
external bare-module types are stable qualified leaves. Store the readable
normalized signatures in this same manifest, not only hashes. It is the
authored freeze manifest consumed by package-export,
built-runtime, declaration, and external-consumer checks; no test regenerates
it from current output or keeps a second expected list. Tests recursively
compare own built namespace-object keys and package-owned `.d.ts` symbols to
this manifest, so adding a member beneath an unchanged root namespace or
changing an existing generic/parameter/return/member/overload signature fails.
The implementation may bootstrap the initial actual report once, but a human
must review/commit it; tests never update or accept the manifest.

Each driver subpath has exactly these runtime keys: `descriptor`, `Config`,
`ResolvedInput`, `makeCompileExecutableRequest`, `Driver`, and `layer`.
`Config` and `ResolvedInput` are dual value/type Schema names; the exact
additional type-only names are `ConfigEncoded`, `ResolvedInputEncoded`, and the
concrete `Request` returned by the
constructor. No renderer, invocation contract constructor, probe facade,
private implementation method, or generic extension maker is exported. Assert
the exact authored runtime allowlists after a fresh build and inspect emitted
declarations—not source barrels alone.

In `typetest/public-api-freeze.tst.ts`, prove:

- Bun/Deno requests yield the same normalized artifact outcome while configs
  remain distinct;
- operation recipe projection is canonical once; Bun input is empty, Deno input
  is optimization-only, and denort is toolchain-only;
- mismatched operation/driver pairs and native callbacks/raw argv do not compile;
- `BuildRejected` is data, not an Effect error;
- `Build.run`/`runPrepared` expose no Scope; runtime handles are not importable or
  structurally constructible; driver-native results never leak;
- no `Build.acquire`, watch/session, router/fallback, or caller cache key exists.
- `Build.layerLocal`, `ExecutionPlatform.layerNode/layerBun/layerDeno`,
  `BunCli.layer`, and `DenoCli.layer` accept only their explicit validated
  configuration, while private handles/constructors remain unimportable. The
  complete sample provides `ExecutionPlatform.layerNode` into the core Layer
  (not as a sibling), merges Bun/Deno against that single identity, provides
  exact `@effect/platform-node` services, and has final environment `never`.
- `ExecutionPlatform.Current` accepts only opaque `CurrentHandle`; consumers
  cannot construct one structurally, and a forced forged `Layer.succeed`
  reaches the typed `ExecutionPlatformCapabilityInvalid` pre-side-effect guard
  rather than authorizing a caller-authored platform identity.
- `BuildContext.snapshot` and `Artifact.materialize` delegate to the same
  store-bound `BuildExecutor`; the complete sample provided with one core Layer
  and one driver Layer has no residual `ContentStore` requirement.

Implement `import-boundaries.test.ts` with the TypeScript compiler API over real
import/export declarations, not substring guesses. Assert:

- only `src/internal/ProcessExecutor.ts` imports `effect/unstable/process`;
- core imports neither `src/bun/**` nor `src/deno/**`; drivers never import each
  other; no source imports a native/raw adapter;
- root and package export maps match the exact allowed surface;
- the final `test:unit` script is exactly the fixed four-alias composition and
  each member alias still names its exact file list;
- `test:host:node`, `test:host:bun`, and `test:host:deno` exactly match the
  command bodies frozen in Plan 003 (including Deno flags), contain no
  no-op/skip/`passWithNoTests` branch, and are actually invoked by their named
  CI jobs;
- `ExecutionToolchainHandle`/private asset handles stay internal.
- no driver imports the unstable process API or any other process-spawn API;
  driver Layers reference only closed `ToolchainProbe`, which accepts no caller
  argv/cwd/environment/output; only core renders `DriverInvocationSpec` tokens
  into raw host paths.
- `BuildRecordStore.putIfAbsent` accepts one validated record rather than peer
  ID/hash/byte canons; its key, canonical bytes, and hash are derived internally.

`public-api.test.ts` imports the built root/subpaths and compares sorted runtime
export keys to explicit snapshots. No catch-all export is allowed.

Create `scripts/test-built-consumer.mjs` as a fail-closed external-package
test. It creates a fresh temporary NodeNext project outside the workspace
package, packs the just-built package directly into that temp directory (never
the worktree), copies all four consumer fixture sources plus a read-only copy of
the authored `tooling/public-api.json` into the temp, and runs
compilers/runtime only against those copies. The temp `package.json` has exact
direct dependencies `effect-build: "file:./<packed-tarball>"`,
`effect: "4.0.0-beta.106"`, `@effect/platform-node: "4.0.0-beta.106"`, and the
exact TypeScript version read from the root dev manifest; all versions must
first be read/verified against the root manifest rather than maintained as a
second floating value. Run exactly `pnpm install --offline --no-frozen-lockfile` with
cwd set to the disposable consumer (the product install remains frozen).
Assert both the package-manager resolution and `import.meta.resolve`/realpath
for every `effect-build` entrypoint land beneath that temp project's
`node_modules/effect-build` and its packed-package location, never a workspace
link/source path. Direct Effect/platform imports are permitted only from the
temp consumer's own `node_modules`; no path alias or source import exists.

`test/consumer/positive.ts` imports only the three public package entrypoints,
`effect`, and `@effect/platform-node`, and typechecks a complete explicitly
provided `ExecutionPlatform.layerNode` + snapshot/plan/run/materialize program
whose environment is `never`. The two negative fixtures must fail for the expected
diagnostics: `negative-driver-spi.ts` gets TS2305 for the exact absent
`ManagedDriverImplementation` root export, and
`negative-internal-import.ts` gets TS2307 for the exact package-internal
subpath. Compile each fixture independently and require its file/import in the
diagnostic; an unrelated compiler failure is not success.
Run the copied `test/consumer/runtime.mjs` under the exact Node process with cwd
equal to the temp project and compare recursive namespace/subpath runtime keys
to that temp-copied manifest. The script fails if any effect-build module or
package realpath escapes the temp install. Scope-clean the temp directory on
success, failure, or interruption.

Starting from the three emitted public declaration entrypoints, parse every
transitively reachable **package-owned** declaration with the TypeScript
compiler API: follow relative references and `effect-build` self-references
only, and treat external bare imports such as `effect` and
`@effect/platform-node` as leaves. Invoke only the temp-installed compiler via
`pnpm exec tsc` with cwd=temp. Fail if that owned public graph mentions
`src/internal`, an absolute workspace path,
`ManagedDriverImplementation`, `InvocationCapabilities`,
`DriverInvocationSpec`, `ProcessCompletion`, or an `any` keyword. Compare the
packed package's runtime root/subpath keys and normalized package-owned
declaration signatures to the same authored entries used by
`public-api.test.ts` from `tooling/public-api.json`; neither test may generate
or update an expected surface from the package under test.

**Verify**: `pnpm build && pnpm exec vitest run
test/architecture/import-boundaries.test.ts
test/architecture/public-api.test.ts && pnpm test:consumer && pnpm test:types`
→ fresh-built boundaries, packed external consumption, and exact export
snapshots pass. Do not run the full `test:architecture` yet because the
generated/CI artifacts are created in later steps.

### Step 3: Generate compatibility documentation from canonical evidence

Create `tooling/tool-pins.json` as the sole machine-consumed CI source for each
of the three assets' distribution URL, archive SHA-256, exact archive member
path, and canonical expected `ExecutablePlatformTarget`. Archive members are
portable nonempty relative paths: reject absolute/rooted paths, empty/`.`/`..`
segments, NUL, backslash, drive prefixes, leading `-`, shell/glob characters,
or any segment outside `[A-Za-z0-9._+-]+`; reject duplicate normalized members and any
member whose normalized extraction path escapes or collides with another
asset. Create
versioned `tooling/support-matrix.json` as the sole checked-in source for the
three **publication-host** cells, their suites, and required runtime-probed
root capability outcomes. Quality and real-tool runner/controller pins are
workflow-owned infrastructure and are explicitly outside this host-cell canon;
they must not be misdiagnosed as duplicate publication cells. The three
publication cells are authored, not probe-generated:
Ubuntu 24.04 x86-64 and macOS 15 arm64 each expect
`Supported { required: ["AtomicLeafReplacement", "CrashDurableStoreCommit"] }`;
Windows 2025 x86-64 expects
`Unsupported { errorTag: "UnsupportedStoreDurability", capability:
"CrashDurableStoreCommit" }`. “Supported” means both separately configured
content/record root domains on that runner filesystem pass and their fixed
layouts are durably initialized; it is not an OS-wide guarantee. Every cell
uses exactly one of those closed tagged outcomes plus its exact suite list. CI consumes that same file; it is
not a second README matrix and never rewrites expected values from observations.
The only suite IDs are `NodeHost` and `PublicationHost`. Define their sole
ID-to-command mapping in `scripts/read-tooling.mjs` as exact argv
`["pnpm", "test:host:node"]` and
`["pnpm", "test:integration:publication-host"]`. Every publication cell's
canonical suite list is exactly both IDs in that order. The workflow may render
those two commands as run steps, but `generated-and-ci.test.ts` must parse the
workflow and prove each matrix cell's IDs map bijectively to the exact executed
commands—no documented-but-unrun, extra, duplicate, reordered, or no-op suite.
Create `scripts/read-tooling.mjs` as the single strict parser/interpreter of
those two files. It uses only Node built-ins so the setup job can run it before
dependency installation. It validates strict JSON object/array shapes,
versions, roles, targets, HTTPS release URLs, SHA-256 syntax, uniqueness, and
those safe archive-member invariants plus all joins internal to the two tooling
files, then emits GitHub matrix/output
variables. It does not import or join descriptors.
The script contains field/role mappings but no archive URL, checksum, or host
cell literal; it is a consumer, not another trust source.

Create `scripts/generate-compatibility.mjs`. Reuse the validated structures
exported by `read-tooling.mjs`; do not implement a second parser. After
`pnpm build`, import only the
named `descriptor` exports,
`Compatibility.DriverCompatibility.fromDescriptor`, and
`Evidence.EvidenceContract.v1Default` from the built public root/driver
subpaths. Validate both tooling files,
derive each compatibility value from its invocation contract, and join it to pins by exact
driver/version/asset role/expected native target and to support cells by named
suite, sort
canonically, and render deterministic
`docs/compatibility.md` with:

- operation/driver/surface/protocol versions;
- exact supported tool version, target mode, required tool-asset roles, and
  pinned distribution provenance;
- normalized behavior versus driver-specific config;
- driver-owned config/lock/network/autoload policy and artifact kind from the
  generated compatibility projection;
- evidence limits from the core contract, plus the authored publication-host
  matrix and its **expected/required** atomic-leaf-replacement/store-durability outcomes—
  not compiler descriptors and not a claim that generation observed CI. Actual
  cross-host probe results remain external required-CI acceptance evidence
  unless a future signed result-ingestion plan explicitly makes them inputs;
- explicit unsupported states and evidence level.

`--write` atomically writes the file. `--check` computes expected bytes in
memory, never writes, and exits nonzero with the path if stale. Generated output
must carry a “do not edit” header. Do not maintain a second hand-written support
table.

**Verify**:

```sh
pnpm docs:generate
pnpm docs:check
pnpm build
pnpm exec vitest run test/architecture/public-api.test.ts
```

Expected: generation followed by check proves docs derive from both
descriptors, both tooling canons, and core evidence defaults; the focused
public test proves the surface remains frozen;
they contain exact Bun 1.3.9/Deno 2.9.3 pins without descriptor-owned host
claims or a second hand-written matrix. The full generated/CI architecture gate
waits until Step 4 creates the final workflow.

### Step 4: Add checksum-verified setup and network-isolated real-tool CI

Finalize `.github/workflows/ci.yml`, with required jobs and no
`continue-on-error`. The workflow trigger is exactly `push` plus
`pull_request`, with no `paths`, `paths-ignore`, branch exclusion, or commit-
message skip logic; therefore both implementation and plans-only status commits
run every required check. Set top-level `permissions: { contents: read }` and
grant nothing broader. Architecture tests parse and enforce both properties.

The only permitted remote actions and exact reviewed pins are:

| Action | Reviewed signed upstream release | Required commit SHA |
|---|---|---|
| `actions/checkout` | `v6.0.2` reviewed 2026-08-09 | `de0fac2e4500dabe0009e67214ff5f5447ce83dd` |
| `actions/setup-node` | `v6.4.0` reviewed 2026-08-09 | `48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e` |
| `pnpm/action-setup` | `v6.0.9` reviewed 2026-08-09 | `0ebf47130e4866e96fce0953f49152a61190b271` |

Forbid every other `uses:` target. Every checkout sets
`persist-credentials: false`; every pnpm setup sets `run_install: false`; every
Node setup omits the `cache` input entirely and sets
`package-manager-cache: false`; architecture tests reject any `cache` key
because setup-node interprets every nonempty string, including `"false"`, as a
cache-manager name. No action may implicitly
install dependencies or populate a package-manager cache before exact Node/pnpm
version assertions. The review record above is the approval allowlist, not a
request for an implementer to choose another “current” SHA.

A setup job validates `tooling/support-matrix.json` and
emits the exact GitHub matrix JSON consumed by later jobs; do not duplicate its
cells as YAML literals. Every `uses:` reference is pinned to a reviewed full
40-character commit SHA—floating tags and branches are forbidden. Every job
that invokes Node or pnpm, including `setup`, installs Node `24.14.1` with a
full-SHA-pinned `actions/setup-node`, installs pnpm `10.17.1` with a
full-SHA-pinned `pnpm/action-setup`, captures their exact resolved paths, and
asserts `node --version` is `v24.14.1` and `pnpm --version` is `10.17.1` before
the first project Node/pnpm command. Architecture tests parse the workflow with
the exact pinned `yaml@2.9.0` library and enforce this per job.

1. `setup` on `ubuntu-24.04`: allowed full-SHA checkout with credentials
   disabled, exact controller setup with caches/implicit installs disabled, and
   assertions, then the pure-Node `scripts/read-tooling.mjs` before dependency
   installation. Emit canonical tool-pin fields and the exact publication
   matrix; do not use YAML-authored shadow cells.
2. `quality` on `ubuntu-24.04`: the same full-SHA checkout/exact controller
   setup/assertions, frozen install, `pnpm verify`, then
   `pnpm verify:freeze`.
3. `real-tools-offline` on `ubuntu-24.04` x86-64: the same full-SHA checkout/
   exact controller setup/assertions, then run
   `pnpm fetch --frozen-lockfile` while setup networking is allowed, then
   `pnpm install --offline --frozen-lockfile`; read the three exact
   URLs/digests/archive members/expected native targets from the setup outputs,
   download them into
   `$RUNNER_TEMP`, verify each pinned digest with `sha256sum --check`, unzip to
   private paths, assert Bun `1.3.9` and Deno `2.9.3`, and run
   `scripts/verify-tool-assets.mjs` against the generic ELF/Mach-O/PE inspector
   to prove byte-encoded format/machine and any honestly available exact
   `PT_INTERP` ABI witness for Bun, Deno, and denort before any project test
   consumes the six exact real-tool harness variables (including controller).
   The shell may assign/export local harness names earlier for verification
   commands, but no project test invocation may consume them until inspection
   succeeds. The inspector alone never
   upgrades an unknown/static ELF to GNU. Official URL/member/checksum joins,
   exact runtime version probes, successful Deno compile with the pinned denort,
   and execution of the produced fixture together establish the official
   Linux-GNU compatibility claim.
4. Still in `real-tools-offline`, run
   `sudo unshare --net --mount-proc --fork` and execute `test:integration:all`
   plus Node/Bun/Deno host smokes inside that network namespace. Probe
   `sudo unshare --net true` first and fail if unavailable; no proxy/canary is a
   substitute for an absent network interface. Downloads/setup happen before
   this step; no install/cache warmup occurs inside it.
5. `publication-hosts` over the exact support-matrix cells for `ubuntu-24.04`,
   `macos-15`, and `windows-2025`: the same full-SHA checkout/exact controller
   setup/assertions and frozen install. Pass the setup job's exact cell as
   strict JSON in `EFFECT_BUILD_EXPECTED_HOST_OUTCOME_JSON` and the asserted
   absolute Node path in `EFFECT_BUILD_CONTROLLER_BIN`; those names are read
   only by `test/integration/publication-host.test.ts`. Invoke exactly
   `pnpm test:host:node` and `pnpm test:integration:publication-host`, the exact
   commands mapped from that cell's `NodeHost` and `PublicationHost` IDs. CI
   architecture validation rejects any cell/workflow suite mismatch.

   The publication harness strictly decodes the expected tagged outcome,
   constructs `ExecutionPlatform.layerNode({ executable:
   EFFECT_BUILD_CONTROLLER_BIN })`, and attempts the real
   `Build.layerLocal` against three fresh private roots on the runner
   filesystem. For the supported branch it reuses Plan 003's existing
   deterministic-success `FakeManagedDriver`/closed fake-process testkit to
   perform the full public snapshot → `Build.run` → `Artifact.materialize`
   path with known fixture bytes; it may not import or call an internal store
   put/materialize shortcut. A `Supported` cell independently proves content-
   root and record-root durability/layout initialization, snapshots
   `test/fixtures/publication/input.txt`, stores/verifies it, materializes the
   successful build artifact by byte copy to a fresh destination, and verifies
   bytes/mode while CAS remains immutable. An `Unsupported` cell requires exact early
   `UnsupportedStoreDurability(CrashDurableStoreCommit)`, no yielded executor,
   no attempt/record/artifact/destination mutation, and permits only cleaned
   capability probes or incomplete unacknowledged private layout residue.
   Different tags/capabilities, partial acknowledged output, or unexpectedly
   supported/unsupported observations fail CI. Expectations always come from
   the authored matrix, never from the probe. These jobs do not advertise real
   Bun/Deno support on those hosts.

Use this shell shape in the Linux real-tool job after
`scripts/read-tooling.mjs` has loaded `BUN_URL`, `BUN_SHA256`, `DENO_URL`,
`DENO_SHA256`, `DENORT_URL`, `DENORT_SHA256`, the three archive-member paths,
and the canonical expected target from the validated JSON. The workflow must
not duplicate any URL/digest/member/target literal, and it must not fetch
checksum text as the trust root:

`scripts/verify-tool-assets.mjs` runs only after `pnpm build` and imports the
built internal inspector by the exact physical URL
`new URL("../dist/internal/NativeExecutableFormat.js", import.meta.url)`.
That relative file import is package-maintainer tooling only: the package
`exports` map must still block `effect-build/internal/*` for consumers. The
script uses the same total bounded API and public-error mapping tests as core;
it must not carry a second binary parser.

```sh
pnpm fetch --frozen-lockfile
pnpm install --offline --frozen-lockfile
curl --proto '=https' --tlsv1.2 --fail --location --output "$RUNNER_TEMP/bun.zip" "$BUN_URL"
curl --proto '=https' --tlsv1.2 --fail --location --output "$RUNNER_TEMP/deno.zip" "$DENO_URL"
curl --proto '=https' --tlsv1.2 --fail --location --output "$RUNNER_TEMP/denort.zip" "$DENORT_URL"
printf '%s  %s\n' "$BUN_SHA256" "$RUNNER_TEMP/bun.zip" | sha256sum --check --strict -
printf '%s  %s\n' "$DENO_SHA256" "$RUNNER_TEMP/deno.zip" | sha256sum --check --strict -
printf '%s  %s\n' "$DENORT_SHA256" "$RUNNER_TEMP/denort.zip" | sha256sum --check --strict -
install -d -m 0700 "$RUNNER_TEMP/effect-build-tools"
unzip -p "$RUNNER_TEMP/bun.zip" "$BUN_MEMBER" > "$RUNNER_TEMP/effect-build-tools/bun"
unzip -p "$RUNNER_TEMP/deno.zip" "$DENO_MEMBER" > "$RUNNER_TEMP/effect-build-tools/deno"
unzip -p "$RUNNER_TEMP/denort.zip" "$DENORT_MEMBER" > "$RUNNER_TEMP/effect-build-tools/denort"
chmod 0700 "$RUNNER_TEMP/effect-build-tools/bun" "$RUNNER_TEMP/effect-build-tools/deno" "$RUNNER_TEMP/effect-build-tools/denort"
export EFFECT_BUILD_BUN_BIN="$RUNNER_TEMP/effect-build-tools/bun"
export EFFECT_BUILD_DENO_BIN="$RUNNER_TEMP/effect-build-tools/deno"
export EFFECT_BUILD_DENORT_BIN="$RUNNER_TEMP/effect-build-tools/denort"
export EFFECT_BUILD_REQUIRE_REAL_BUN=1 EFFECT_BUILD_REQUIRE_REAL_DENO=1
test "$("$EFFECT_BUILD_BUN_BIN" --version)" = "1.3.9"
test "$("$EFFECT_BUILD_DENO_BIN" --version | sed -n '1s/^deno //p')" = "2.9.3 (stable, release, x86_64-unknown-linux-gnu)"
pnpm build
node scripts/verify-tool-assets.mjs \
  --expected-target-json "$EXPECTED_TARGET_JSON" \
  --bun "$EFFECT_BUILD_BUN_BIN" \
  --deno "$EFFECT_BUILD_DENO_BIN" \
  --denort "$EFFECT_BUILD_DENORT_BIN"
```

Then pin the controller/package-manager paths and run the integration and host
commands without a login shell. The namespace must assert that every bare host
alias resolves to the intended exact binary before it tests anything:

```sh
NODE_BIN="$(command -v node)"
PNPM_BIN="$(command -v pnpm)"
BASH_BIN="$(command -v bash)"
EFFECT_BUILD_CONTROLLER_BIN="$NODE_BIN"
EXACT_PATH="$(dirname "$EFFECT_BUILD_BUN_BIN"):$(dirname "$EFFECT_BUILD_DENO_BIN"):$(dirname "$NODE_BIN"):$(dirname "$PNPM_BIN"):/usr/bin:/bin"
sudo env \
  PATH="$EXACT_PATH" \
  EXACT_NODE_BIN="$NODE_BIN" \
  EXACT_PNPM_BIN="$PNPM_BIN" \
  EXACT_WORKSPACE="$GITHUB_WORKSPACE" \
  EFFECT_BUILD_CONTROLLER_BIN="$EFFECT_BUILD_CONTROLLER_BIN" \
  EFFECT_BUILD_BUN_BIN="$EFFECT_BUILD_BUN_BIN" \
  EFFECT_BUILD_REQUIRE_REAL_BUN=1 \
  EFFECT_BUILD_DENO_BIN="$EFFECT_BUILD_DENO_BIN" \
  EFFECT_BUILD_DENORT_BIN="$EFFECT_BUILD_DENORT_BIN" \
  EFFECT_BUILD_REQUIRE_REAL_DENO=1 \
  unshare --net --mount-proc --fork "$BASH_BIN" -euo pipefail -c '
    cd -- "$EXACT_WORKSPACE"
    test "$(command -v node)" = "$EXACT_NODE_BIN"
    test "$(command -v pnpm)" = "$EXACT_PNPM_BIN"
    test "$(command -v bun)" = "$EFFECT_BUILD_BUN_BIN"
    test "$(command -v deno)" = "$EFFECT_BUILD_DENO_BIN"
    test "$EFFECT_BUILD_CONTROLLER_BIN" = "$EXACT_NODE_BIN"
    test "$(node --version)" = "v24.14.1"
    test "$(pnpm --version)" = "10.17.1"
    test "$(bun --version)" = "1.3.9"
    test "$(deno --version | sed -n "1s/^deno //p")" = "2.9.3 (stable, release, x86_64-unknown-linux-gnu)"
    pnpm test:integration:all
    pnpm test:host:node
    pnpm test:host:bun
    pnpm test:host:deno
  '
```

Use test harness paths only. Harnesses pass validated paths to public driver
Layer factories, which create handles internally; product code must not read CI
variables or download denort. The CI architecture test must parse both tooling
files and parse the workflow structurally with `yaml@2.9.0` rather than text
matching. It validates tooling schemas/uniqueness and—only after the
fresh build—validates descriptor/pin/support joins, and proves generated docs
and the workflow consume those values without duplicating
URL/digest/archive-member/target/host-cell literals. It checks exact unfiltered
`push`/`pull_request` triggers and read-only permissions; the three-action SHA
allowlist; checkout credential removal; disabled action caches/implicit
install; every Node/pnpm job's exact setup, path, and pre-use version
assertions; every support cell's one tagged expected outcome; recursive
qualified public namespace/type freezes; the suite-ID/command/workflow
bijection for every publication cell; the exact publication harness alias
and strict expectation/controller variables; stable integration aliases; exact
non-skipping host-alias bodies; guard flags, `--offline`, `unshare --net`, required jobs, exact in-namespace runtime
assertions, absence of a login shell, and absence of `continue-on-error`.
Checksum value review occurs only at the `tooling/tool-pins.json` change; the
test must not hardcode a second copy.

**Verify**:

```sh
pnpm test:architecture
pnpm verify:freeze
```

Expected locally: workflow structure/pins pass. Expected in GitHub Actions: all
required jobs pass; missing tools/assets or unavailable isolation fail loudly.

### Step 5: Document evidence levels, frozen V1, and gated roadmap

Update `README.md`, `docs/architecture.md`, and `docs/roadmap.md` using these
exact evidence meanings:

- `Observed`: invocation, exact tool/assets, logs, terminal record, and outputs
  were captured.
- `InputClosed`: every semantic source/config/environment/tool-asset channel was
  declared or snapshotted for the named fixture/driver claim.
- `Hermetic`: enforced isolation prevented undeclared filesystem, network, and
  environment reads.
- `ReproducibleVerified`: independent clean executions produced identical
  artifact manifests.

V1 advertises `Observed`; it may label the exact offline fixtures
`InputClosed` only where descriptor/tests prove every named channel. Network
isolation alone is not filesystem hermeticity. Do not claim `Hermetic` or
`ReproducibleVerified`. Document the residual source/destination ancestor-swap
race on path-only platform adapters; static containment and immediate
revalidation are not handle-relative adversarial filesystem safety.

README and hand-written architecture docs link to generated compatibility
evidence; they do not copy tool pins, support cells, or policy tables. Document
the explicit Layer ingress and the fact that harness environment variables are
converted to Layer config only in tests.

Keep provenance levels explicit: ordinary runtime resolution records only
`ConfiguredObserved` self-report plus executable/asset byte identities. The
checksum-verified official Bun/Deno/denort archives—and Deno's `stable` release
label—are CI compatibility evidence for the tested fixture, never inferred
runtime provenance from a configured path or version string. Generated docs
must render those as separate columns/facts.

Document the frozen managed/native boundary and roadmap order: separate
`Bundle`; then justified `TypeCheck`/`Transpile`/`Package`; native adapters;
Node SEA as assembly; scoped sessions; cache reads after closure proof; remote
coordination; package extraction/release only after evidence. No legacy fallback
or permissive decoder is added during future protocol changes.

Repeat the upstream gate: open no broad Effect “Build service” issue. After the
external implementation and two downstream users, a minimal cross-platform
reproduction may justify a narrow process/filesystem primitive request—most
plausibly atomic-no-replace plus directory-sync commit—if current Effect
services demonstrably cannot express it.

**Verify**: `pnpm docs:check && pnpm test:architecture && pnpm test:types` → docs
are current, evidence claims match descriptors, and public API remains frozen.

### Step 6: Run the final release-candidate gate

Run:

```sh
pnpm verify
pnpm verify:freeze
pnpm docs:check
git diff --check
```

Expected: all exit 0. CI, not an optional local skip, supplies the exact real-tool
and cross-OS evidence.

After the local gate, change only row 006 to
`IMPLEMENTED: awaiting required CI`; leave rows 004/005 in that same pending
state unless they already have valid required-CI evidence. Commit that status
with the locally verified Plan 006 slice. This is the mandatory local handoff,
not `DONE`.

Do not push or trigger GitHub Actions without operator authorization. If no such
authorization exists, stop successfully at the pending-CI commit and report its
commit ID plus the required job names. If authorized, push that exact commit and
observe `quality`, `real-tools-offline`, and every `publication-hosts` matrix
cell to a green terminal conclusion. Only then make one coordinated follow-up
commit promoting rows 004, 005, and 006 to `DONE` (preserving an already-DONE
row), push it, and observe the same required checks green on the status commit.
Do not mark Plan 001 `DONE`; its aggregate acceptance remains separate. A
failed/cancelled/skipped/missing required job on the implementation commit
leaves all pending rows `IMPLEMENTED: awaiting required CI` and forbids the
status commit. If any required check on the already-pushed `DONE` status commit
fails/cancels/skips/is missing, immediately create and push one coordinated
recovery commit changing rows 004-006 back to
`IMPLEMENTED: awaiting required CI` (preserving only a row whose independent
prior DONE evidence remains valid). Observe required checks on that recovery
commit, but never report/handoff `DONE`; diagnosis and a later fresh two-green-
run promotion are separate work. A red status commit may never be described as
though the rows “remained pending” without this explicit recovery commit.

## Test plan

- Reusable conformance: both descriptors against one managed lifecycle/artifact
  contract; driver-specific behavior stays in existing unit/integration suites.
- Tstyche: inference, invalid combinations, native/runtime-handle exclusion,
  outcome/error/Scope separation, and absent future APIs.
- Architecture: parsed import/export graph, exact runtime/package exports,
  deterministic generated docs, and parsed CI pins/isolation requirements.
- CI: exact binaries/assets, checksum failure, required-real guards, network
  namespace, three controller host smokes, and three OS publication smokes.

## Done criteria

- [ ] `pnpm verify`, `pnpm verify:freeze`, and `pnpm docs:check` exit 0.
- [ ] `pnpm test:consumer` proves the packed built package from an external
      NodeNext project whose copied fixtures and runtime resolve effect-build
      only from its temp node_modules; package-owned declarations contain no
      internal path/SPI/`any` leak while external Effect declarations are
      traversal leaves.
- [ ] Both descriptors pass one conformance suite; existing direct-vs-driver
      tests remain green and are not duplicated.
- [ ] Public Schema/projector mutation and same-label operation/driver
      substitution cannot alter captured ingress, projection, canonical
      matching, execution policy, or completion decoding; probe scratch is
      lifecycle-separated from attempt scratch and leaves no temp state.
- [ ] Package exports are exactly `.`, `./bun/BunCli`, `./deno/DenoCli`; every
      qualified root namespace and driver runtime/type member matches the one
      recursive authored freeze manifest, including normalized package-owned
      generic/parameter/return/member/overload signatures.
- [ ] Only `src/internal/ProcessExecutor.ts` imports the unstable process API;
      all architecture boundaries pass without fake change exercises.
- [ ] Compatibility docs are generated from descriptor invocation contracts,
      their drift-proof compatibility projections, core evidence defaults,
      tool pins, and the tested support matrix; they pin Bun 1.3.9, Deno 2.9.3,
      and DenoRuntime semantics without putting host claims in a driver
      descriptor or using documentation data as runtime authorization.
- [ ] CI verifies all three SHA-256 values from the single validated tool-pin
      source, consumes the single support-matrix source, requires real tools,
      and runs `test:integration:all` under
      `unshare --net`; no required job may skip/fail open.
- [ ] CI triggers on every push and pull request without path filters, has
      read-only contents permission, uses only the three exact approved action
      SHAs with credentials/caches/implicit install disabled, and therefore runs
      both implementation and status-only commits.
- [ ] Every action reference is a full commit SHA; every job that invokes
      Node/pnpm sets up and pre-use verifies Node 24.14.1 and pnpm 10.17.1; no
      workflow/script/test duplicates pin URLs, digests, archive members,
      expected native target, or support cells.
- [ ] Each publication cell returns its authored tagged capability outcome:
      the exact integration harness builds an explicit Node execution-platform
      Layer; supported cells independently prove both configured durable root
      domains plus snapshot/store and byte-copy atomic
      materialization; the Windows unsupported cell fails before any
      acknowledged attempt/record/artifact/destination mutation with exact
      `UnsupportedStoreDurability(CrashDurableStoreCommit)` during
      `Build.layerLocal` acquisition. Cleaned probes or unacknowledged private
      layout residue are not misreported as build state.
- [ ] Public core/execution-platform/Bun/Deno Layer factories are the only private
      storage-root/tool-installation path ingress; explicit per-call snapshot
      roots and materialization destinations remain outside identity; harness
      variables become Layer config, never product env reads or externally
      constructed handles.
- [ ] Snapshot → build → materialize works through one store-bound core Layer;
      no public `ContentStore` requirement remains.
- [ ] Descriptor contracts own every exact canonical-input-matched argv/
      environment variant; core alone selects and renders one variant and
      performs the managed-build spawn; drivers only resolve tool/config facts
      and interpret bounded completion.
- [ ] Record keys, canonical bytes, and hashes are derived from one validated
      `AttemptRecord` inside the store; peer caller-supplied canons are absent.
- [ ] Evidence docs claim no more than tests enforce; no Hermetic or
      ReproducibleVerified V1 claim exists.
- [ ] Roadmap adds no implementation, legacy export, fallback, or public publish.
- [ ] Local completion records row 006 as `IMPLEMENTED: awaiting required CI`;
      rows 004-006 become `DONE` only after two observed green required-CI runs
      (implementation commit, then coordinated status commit). Without push/run
      authority the handoff remains pending and is not called done.
- [ ] A red/cancelled/skipped/missing status-commit check triggers the specified
      coordinated recovery commit back to pending; no DONE handoff occurs.
- [ ] `git status --short` contains no path outside Scope, including only the
      authorized coordinated Plan 004-006 status edits.

## STOP conditions

Stop if Plan 005 is neither locally green/pending required CI nor `DONE`;
required named exports/descriptors/tests differ;
conformance needs a core/driver semantic change; exact release download or
checksum differs; `DENORT_BIN` is ignored or a first-run download occurs; the
offline namespace cannot be enforced; a required job would need a skip or
`continue-on-error`; generated docs need hand-edited support facts; the API test
would expose internal/native/future state; an evidence claim exceeds enforced
isolation; a support-matrix capability differs from its runtime probe; a
credential/publish/deploy action is requested; an out-of-scope file
is needed; or a verification fails twice after one scoped correction.

## Maintenance notes

- Driver invocation contracts are the sole executable driver-profile source;
  compatibility is their generated projection; tool pins are the sole archive
  trust source; the support matrix is the sole tested host-cell source; core
  owns evidence defaults. Change the owning canon, its conformance/CI checks,
  and regenerate docs together—never copy facts between them.
- A new public export or protocol field is an intentional versioned API change,
  not a barrel convenience. Never retain an old permissive path as fallback.
- Update checksum constants only from official immutable release metadata and
  review the corresponding tool/asset semantic change.
- Scheduled canaries, publication, API extraction packages, and broader OS/tool
  matrices are later plans with their own evidence and maintenance cost.
