# Plan 004: Add the Bun CLI executable driver

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. This
> plan implements one bounded managed profile, not every `bun build` option.
> If a condition in **STOP conditions** occurs, stop and report; do not widen
> the core contract or add an escape-hatch options bag. When done, update this
> plan's row in `plans/README.md` to
> `IMPLEMENTED: awaiting required CI`, unless a reviewer owns the index. Do not
> mark it `DONE`; Plan 006 owns checksum provisioning and the authoritative
> network-denied Linux acceptance, then promotes the row after observed CI.
> Include the pending-status edit in the final verified Plan 004 commit and
> require a clean worktree before Plan 005.
>
> **Drift check (run first)**: this plan was written before the workspace had a
> Git `HEAD`. After Plan 003 is complete, run the dependency gate in Step 1 and
> `pnpm verify:core`. If Git now exists, also run `git status --short` and inspect
> every pre-existing change. If Git still does not exist, capture
> `shasum -a 256` for the out-of-scope core files listed below in the execution
> log and compare the hashes again before completion. Do not initialize Git or
> create a baseline file merely for this plan.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/003-build-content-executor-and-recording.md`
- **Category**: feature / tests / architecture
- **Planned at**: unversioned workspace on 2026-08-09

## Why this matters

This is the first real proof that the normalized build lifecycle can drive an
upstream compiler without turning compiler flags into the product's canon.
The Bun driver must preserve the exact behavior of Bun 1.3.9 for a deliberately
small standalone-executable profile while core continues to own snapshots,
staging, records, artifacts, and publication. A differential direct-CLI test
prevents the Effect wrapper from silently changing upstream semantics.

“Parity” here means behavioral parity for the declared V1 profile. Full Bun
surface parity belongs in a future native CLI lane that accepts ordered argv
and is explicitly non-managed; do not smuggle native parity into this plan.

## Current state and required dependency contract

Plan 003 must already provide these unchanged core files:

- `src/Build.ts` — `Build.run(driver, request)` and the public facade.
- `src/BuildDriver.ts` — the managed driver protocol.
- `src/BuildExecutor.ts` — the supervised one-attempt state machine.
- `src/internal/ProcessExecutor.ts` — the sole unstable Effect process import.
- `src/BuildContext.ts`, `src/BuildPlan.ts` — immutable snapshot planning.
- `src/Toolchain.ts` — `ResolvedToolchain`, private
  `ExecutionToolchainHandle`, and exact preflight/revalidation.
- `src/Artifact.ts`, `src/BuildRecord.ts`, `src/internal/Staging.ts` —
  core-owned output validation, content storage, records, and cleanup.
- `Build.layerLocal({ contentRoot, recordRoot, workRoot })` as the only explicit
  core construction path, provided by exactly one explicit
  `ExecutionPlatform.layerNode/layerBun/layerDeno({ executable })`; private
  handles and internal services are not public.

Plan 003 must also preserve the canonical operation seam established by the
model plan: `ResolvedBuild.operation` is the sole `ResolvedOperation`, containing
operation identity, `resolvedRecipe`, context, target, and outputs.
`CompileExecutable.ResolvedRecipe` contains only the snapshot-relative
entrypoint. There are no sibling top-level context/target/output fields, and
driver `ResolvedInput` repeats none of these semantics.

The driver seam must have this semantic shape:

```ts
type DriverResolution<R> = {
  readonly resolvedInput: R
  readonly toolchain: ToolchainResolution
}
```

`ResolvedToolchain` separates the required Bun profile from the
`ConfiguredObserved` version/digest/byte-length observation and canonically sorted companion
`ToolchainAssetIdentity { role, target, logicalPath, digest, byteLength }`
values. The plan's single `executionPlatform` owns executable host/ABI facts;
they are not copied into toolchain identity. The branded
`ToolchainResolution` is a fully opaque token constructed only by core's closed
probe; a core-private WeakMap associates semantic identity, the unexported
handle, and the exact execution-profile fingerprint from one observation. A
driver cannot inspect or pair them independently. `ExecutionToolchainHandle` contains
absolute host paths and private bindings but no semantic `expected` copy. Core re-hashes
executable/assets before staging and immediately before spawn. Core selects and
renders the exact descriptor-owned invocation variant, performs one
managed-build spawn, then calls `interpretCompletion` once. The driver receives
no invocation selector or capability. If
those guarantees are absent, STOP; Plan 004 does not redesign them.

Locally observed Bun is exactly `1.3.9`. Its `bun build --help` establishes:

- `--compile` generates a standalone executable and implies `--production`.
- `--production` enables minification, while Bun also accepts explicit
  `--minify`; V1 therefore cannot truthfully expose a `minify: boolean` until a
  direct 1.3.9 probe proves both states are selectable.
- `--no-compile-autoload-dotenv`, `--no-compile-autoload-bunfig`,
  `--no-compile-autoload-tsconfig`, and
  `--no-compile-autoload-package-json` disable produced-executable runtime
  autoloads; they do not isolate the Bun build process.
- `--outfile=<value>` selects the single output.

The only accepted argv projection, after core renders its capability tokens and
in this order, is:

```ts
[
  "build",
  "--no-env-file",
  "--compile",
  "--minify",
  `--outfile=${absoluteStagingOutput}`,
  "--no-compile-autoload-dotenv",
  "--no-compile-autoload-bunfig",
  "--no-compile-autoload-tsconfig",
  "--no-compile-autoload-package-json",
  snapshotRelativeEntrypoint
]
```

Run the absolute verified Bun executable with the materialized snapshot root as
`cwd`; that snapshot is the entire declared build context and is placed under a
fresh engine-owned parent. `--no-env-file` isolates the build process from
`.env`. Snapshot-local `package.json`, `tsconfig.json`, and `bunfig.toml` remain
declared snapshot bytes and may affect Bun; the four
`--no-compile-autoload-*` flags apply to the produced executable at runtime,
not Bun's build process. Step 2 must prove Bun 1.3.9 does not search an engine
parent or user location for bunfig/config; otherwise STOP and reconcile an
explicit core-owned config-file token rather than claiming input closure. The
descriptor contract's one exact `{}`-matched template reads the
operation-owned `SnapshotEntrypoint` slot and emits
`PrefixedCapability("--outfile=", StagedOutput)` rather than concatenating a
path, while core owns the logical output contract. The attempt-local
`absoluteStagingOutput` is rendered from a private core slot and never enters the driver,
`ResolvedInput`, `ResolvedBuild`, or their digests. Context, current-host target,
and output come only from `prepared.resolvedBuild.operation`.

Both `Config` and `ResolvedInput` are strict empty structs. The descriptor fixes
the required `BunStable` 1.3.9 profile and its driver-specific
`ExplicitMinified` projection. Configured runtime bytes remain
`ConfiguredObserved`; only the CI archive test proves use of an official asset.
The operation-owned output contract fixes `NoSourceMap` and one regular
executable; the driver must honor but not duplicate those facts in resolved
input. The explicit `--minify` projection is accepted
only after Step 2's direct 1.3.9 probe; if that probe contradicts it, STOP rather
than silently changing the normalized model.

`descriptor.invocationContract` is the versioned
`DriverInvocationContractV1` runtime canon with protocol version 1, required
stable Bun exactly `1.3.9`, semantic target mode `CurrentHost`, no required
tool-asset roles, and a bounded exact `ProbeContractV1`. Its fixed probe argv is
`["--no-env-file", "-e", "process.stdout.write(JSON.stringify({version:Bun.version,os:process.platform,arch:process.arch})+'\\n')"]`
under private empty cwd/environment with timeout `5_000ms`, stdout limit 256
bytes, and stderr limit 0 bytes; it requires exit 0, empty stderr, and one
strict JSON stdout line with exactly `version`, `os`, and `arch`
matched to profile/platform through exact maps
`linux->linux`, `darwin->macos`, `win32->windows`, `x64->x86_64`, and
`arm64->aarch64`; unknown values reject. It then has exactly
one canonical `{}`-matched variant containing the complete ordered argv
template above and an empty replacement environment. Its output token is
`PrefixedCapability("--outfile=", StagedOutput)`. General interpolation is not
representable. The contract also has a closed policy set covering managed CLI
executable compilation, syntax/module-graph semantics,
`ExplicitMinified`, conformance to the operation-owned `NoSourceMap`/one-file
contract, empty caller environment, build-process `NoEnvFile`, declared
snapshot-local configuration, local snapshot inputs, and all four produced-
runtime compile-autoload sources disabled. `CurrentHost` is a target mode, not a claim about the machine running
the controller. The descriptor must contain no controller runtime, detected OS,
process cancellation, filesystem, atomicity, or store-durability claims and
must never drive automatic driver selection. The compatibility value used by
tests/docs is produced only by the root namespace path
`Compatibility.DriverCompatibility.fromDescriptor(descriptor)`; it is not an additional Bun
subpath export, is documentation/conformance evidence, and is never runtime
authority.

The Linux x64 CI archive is
`https://github.com/oven-sh/bun/releases/download/bun-v1.3.9/bun-linux-x64.zip`
with SHA-256
`4680e80e44e32aa718560ceae85d22ecfbf2efb8f3641782e35e4b7efd65a1aa`.
This Linux x64 archive is the sole V1 distribution trust root owned by this
plan. Plan 006 writes it once into the canonical tool-pins document. Local or
Apple Silicon observations do not create another pin or support claim.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Dependency gate | `pnpm verify:core` | Plan 003 model/core/host gate exits 0 before edits |
| Focused unit | `pnpm test:unit:bun` | exact Bun unit file passes |
| Real parity | `EFFECT_BUILD_REQUIRE_REAL_BUN=1 EFFECT_BUILD_BUN_BIN=/abs/bun-1.3.9 pnpm test:integration:bun` | exact Bun 1.3.9 cases execute; no skip path |
| Host checks | `pnpm test:host:node && pnpm test:host:bun` | both exit 0 |
| Types | `pnpm test:types && pnpm check` | exit 0, no type errors |
| Quality | `pnpm lint && pnpm format:check` | exit 0 |
| Aggregate | `pnpm verify` | exit 0 |

Use the existing package manager pin (`pnpm@10.17.1`). This plan adds real
integration/Bun-host/aggregate script routing only after the named tests exist;
no no-op or `passWithNoTests` script is allowed.

## Scope

**In scope** — modify or create only:

- `src/bun/BunCli.ts`
- `src/bun/internal/BunCliImplementation.ts`
- `package.json`
- `vitest.config.ts`
- `test/testkit/compileExecutableDriverContract.ts`
- `test/unit/bun-cli.test.ts`
- `test/integration/bun-executable.test.ts`
- `test/fixtures/bun-executable/hello.ts`
- `test/fixtures/bun-executable/missing-import.ts`
- `test/fixtures/bun-executable/syntax-error.ts`
- `test/fixtures/bun-executable/autoload-trap/entry.ts`
- `test/fixtures/bun-executable/autoload-trap/.env`
- `test/fixtures/bun-executable/autoload-trap/bunfig.toml`
- `test/fixtures/bun-executable/autoload-trap/tsconfig.json`
- `test/fixtures/bun-executable/autoload-trap/package.json`
- `plans/README.md` only for the final status update

**Out of scope** — do not touch:

- The Plan 003 core files named above or any public core schema.
- `src/index.ts` or the `package.json` export map; Plan 006 owns the public root
  and `./bun/BunCli` / `./deno/DenoCli` subpath exports. Here `package.json`
  changes are script-only.
- `src/deno/**`, a Bun TypeScript/native API adapter, or another driver.
- Raw args, plugins, virtual files, watch mode, cross-compilation, Bun app
  generation, multiple outputs, source maps, caller-selectable or ambient/
  undeclared config discovery, remote inputs, tool installation, or download
  code in the library. Snapshot-local package/tsconfig/bunfig bytes remain
  declared context inputs under the fixed profile above.
- A `minify: boolean` or `minify: false` option: Bun 1.3.9 does not expose a
  verified compile-without-minification state.
- Any fallback to another binary, version, API, or driver.

## Steps

### Step 1: Prove Plan 003 is the actual substrate

Run:

```sh
test -f plans/003-build-content-executor-and-recording.md
test -f src/Build.ts
test -f src/BuildDriver.ts
test -f src/BuildExecutor.ts
test -f src/internal/ProcessExecutor.ts
test -f src/Toolchain.ts
test -f src/internal/Staging.ts
test "$(awk -F'|' '$2 ~ / 003 / { gsub(/^ +| +$/, "", $7); print $7 }' plans/README.md)" = "DONE"
pnpm verify:core
```

Read the live driver protocol and confirm the resolution, private staging,
typed rejection/error, and double-revalidation guarantees above. Record hashes
for every out-of-scope `src/*.ts` and `src/internal/*.ts` file if Git is absent.

**Verify**: the command block exits 0 and the seam matches. Otherwise STOP.

### Step 2: Probe Bun 1.3.9, then specify the profile

Before fixing the model, create the minimal deterministic
`test/fixtures/bun-executable/hello.ts`, then use the exact verified 1.3.9
binary to capture `bun build --help` and directly compile it once with
`--no-env-file --compile` and once with
`--no-env-file --compile --minify`, using the four no-autoload flags and
private outputs. Run both executables. Confirm explicit `--minify` is accepted,
both outputs behave identically, help says compile implies production/
minification, and no supported `--no-minify` compile state exists. Separately
compile from a snapshot root beneath a fresh private parent while placing
hostile `bunfig.toml`, `.env`, `tsconfig.json`, and `package.json` in that
parent and in an isolated candidate home directory. Use a complete replacement
environment. Prove Bun reads no parent/user config and `--no-env-file` prevents
build-process dotenv loading; distinguish these ambient traps from the
snapshot-local config files, which are declared input and may affect the build.
If Bun 1.3.9 consults an ambient location, STOP and revise Plans 001-003 with an
explicit engine-owned config capability. This is a capability probe, not a
byte-equality test. STOP on ambiguity.

Then create `test/unit/bun-cli.test.ts` and establish `test:unit:bun` as exactly
`vitest run test/unit/bun-cli.test.ts` before the first red test. It has no
positional filter or empty-suite success path. Require `src/bun/BunCli.ts` to export
named runtime values `descriptor`, `Config`, `ResolvedInput`,
`makeCompileExecutableRequest`, `Driver`, and `layer`; `Config` and
`ResolvedInput` are dual Schema values/types. Its exact additional type-only
names are `ConfigEncoded`, `ResolvedInputEncoded`, and `Request`. Require the
validated Effect-returning request boundary and an opaque `Driver`
`Context.Service` tag with runtime key
`effect-build/BunCli/Driver`, and
`layer({ executable: AbsoluteFilePath })` compatible with Plan 003. The constructor
has the exact boundary shape
`(input: unknown) => Effect.Effect<Request, Schema.SchemaError, never>` (using
the concrete nominal request type), delegates to the shared request Schema
decoder, and has no synchronous/throwing overload.
Put the private resolver/completion SPI in
`src/bun/internal/BunCliImplementation.ts`; it is not re-exported and cannot
appear in the public module's emitted declaration signature. There is no
driver-owned argv renderer: the exact template is descriptor data rendered by
core.

Test all of the following:

- `descriptor` supports only `CompileExecutable`, CLI surface, driver V1, and
  required stable Bun profile exactly `1.3.9`; `1.3.8`, `1.3.10`, and malformed output
  are typed unsupported/unavailable results.
- the built-in descriptor was created by the package-private strict profile
  constructor; mutation attempts before Layer creation cannot change its
  identity, version probe, exact template, or policy, and Schema object identity
  is preserved.
- `descriptor.invocationContract` round-trips as
  `DriverInvocationContractV1`, exactly authorizes the required tool profile,
  no asset roles, one `{}` match, the complete ordered template, empty
  environment, and managed policies above, and
  rejects extra, duplicate, contradictory, host, or controller capability
  claims. Its generated `DriverCompatibilityV1` projection matches and cannot
  drift. Changing the contract requires changing the descriptor version.
- probe tests cover the exact Bun eval argv plus valid JSON and reject ordinary
  human `--version` text, unknown/missing keys, extra lines/stderr, malformed or
  truncated UTF-8/JSON, wrong version/platform/ABI, nonzero exit, quota, and
  timeout. Every call receives a distinct empty `ProbeCwd`; hostile caller,
  parent, and candidate-home config cannot contaminate it, and it is cleaned on
  every terminal path without allocating an attempt.
- valid request input succeeds through `makeCompileExecutableRequest`; unknown
  fields, wrong operation/driver/surface/version, non-empty config, and invalid
  recipe data fail with `Schema.SchemaError` in the Effect error channel. Type
  assertions prove environment `never`; `Effect.exit` proves no throw/defect.
- `Config` is a strict empty struct. It contains no toolchain,
  optimization/source-map/target toggle, raw argv, or upstream option bag.
  `ResolvedInput` is independently strict and empty; it rejects entrypoint,
  context, target, output, toolchain, and fixed descriptor facts as excess
  properties.
- absolute entrypoint/output paths and `..` traversal fail the common
  `CompileExecutable.Recipe` schema, not either Bun schema.
- a syntactically valid entrypoint absent from `ResolvedOperation.context`
  fails the operation projector with `MissingEntrypoint` before attempt/spawn;
  it is not a Bun `BuildRejected` case.
- the exact descriptor-owned ordered-template golden above is stable, maps
  canonical Bun `ResolvedInput {}` uniquely, and has no shell interpolation.
- the template contains exactly
  `PrefixedCapability("--outfile=", StagedOutput)`; arbitrary prefixes,
  capability pairings, and general string interpolation are unrepresentable and
  rejected by core.
- changing the recipe entrypoint changes
  `ResolvedBuild.operation.resolvedRecipe` and the semantic build digest while encoded
  Bun `ResolvedInput` remains `{}`.
- two different absolute staging paths render different argv but leave the
  same encoded `ResolvedBuild`; changing logical output changes only the
  nested `ResolvedBuild.operation.outputs` contract and digest.
- no absolute executable/staging path appears in encoded semantic values.
- `layer` is the sole tool-location ingress: it rejects relative/empty paths,
  never searches `PATH` or reads process environment, constructs private
  toolchain handles internally, and yields the opaque `Driver` service. Its requirement
  type exposes only the needed platform services.
- `Driver.key` is exactly `effect-build/BunCli/Driver`; Plan 006 will merge it
  with Deno's distinct tag and retrieve both without collision.
- the resolver accepts empty validated Bun config plus canonical operation/
  execution platform only; type tests prove Recipe and whole request are absent.

**Verify**: `pnpm test:unit:bun` fails only because the driver is not yet
implemented, while `pnpm check` reports no unrelated regression.

### Step 3: Implement one exact, supervised CLI projection

Implement `src/bun/BunCli.ts` using the live Plan 003 protocol. Resolution must
accept a configured tool that reports exactly 1.3.9, return one fully opaque
core-branded `ToolchainResolution` whose private WeakMap entry atomically binds
semantic observation, execution handle, and Bun profile fingerprint, and fail before
staging on a missing,
changed, or wrong-version binary. Return strict empty `ResolvedInput`; do not
copy any recipe, target, output, context, or fixed descriptor fact into it. It
must never download or install Bun.

Implement `BunCli.layer({ executable })` around one configured absolute path.
The layer captures only closed `ToolchainProbe`, validates the exact descriptor
pin, constructs private handles internally, and yields the opaque `Driver`
service tag under `effect-build/BunCli/Driver`. `ToolchainProbe` accepts no
caller argv, cwd, environment, or output;
neither the layer nor hidden driver implementation imports `ProcessExecutor`,
`ChildProcessSpawner`, or another spawn API. It performs no command-name lookup, environment read,
alternate-path search, or fallback. With `yield* BunCli.Driver`, callers obtain
only the opaque handle, never the hidden
implementation. They never pass the tag as a plain driver value or
construct an execution handle.

Implement `makeCompileExecutableRequest` with the shared validated request
Schema/`ManagedBuildRequest.makeEffect`, preserving the precise
`Schema.SchemaError` and `R = never`. Do not catch and rethrow, call
`Effect.runSync`, use an unchecked constructor, or add an ambiguous trusted
overload. Use the package-private generic constructor from Plan 002; do not
export it. The exact invocation is already the descriptor contract's one
canonical `{}` variant, so implement no `prepareInvocation` or peer argv
renderer.

The driver does not call the binary or receive a process spawner. Core selects
and renders the exact captured template, performs the sole managed-build spawn, and drains separate
stdout/stderr concurrently. Implement `interpretCompletion` so a Bun nonzero
exit becomes `BuildRejected` with complete channel-separated raw evidence when
it remains within the declared quotas; overflow follows core's typed
`EvidenceLimitExceeded` path. Spawn/termination/output violations remain core
infrastructure errors. Preserve Effect interruption and let core own cleanup,
record persistence, hashing, storage, and materialization.

**Verify**: `pnpm test:unit:bun && pnpm test:types && pnpm check` exits 0.

### Step 4: Establish the reusable executable-driver contract

Create `test/testkit/compileExecutableDriverContract.ts` with named export
`compileExecutableDriverContract`. Parameterize it over descriptor, request
factory, driver, direct invocation harness, exact supported version, and fixture
expectations. It must assert one selected driver/one core-owned build spawn,
one exact contract variant rendered by core with no raw host path, driver completion
interpretation only after the process terminates, pre-staging
tool failure, no publication after rejection/interruption, staging cleanup,
artifact executable bit/content digest, stable semantic identity across host
paths, raw channel preservation, and no fallback. It must also assert that
common recipe fields appear only in nested `ResolvedBuild.operation` fields
and decode as excess properties in driver `ResolvedInput`.

The helper may create attempt-local directories during tests, but must not know
Bun flags. Plan 005 will reuse this file unchanged; compiler semantics stay in
driver-specific tests.

**Verify**: `pnpm test:unit:bun` exits 0 and the helper has no imports
from `src/bun/**` or `src/deno/**`.

### Step 5: Differentially prove direct Bun and managed Bun agree

In `test/integration/bun-executable.test.ts`, require an explicit exact 1.3.9
binary (`EFFECT_BUILD_BUN_BIN` in the test harness; product code must not read
it). The Node test harness also canonicalizes its actual `process.execPath`, or
in CI requires the exact equal `EFFECT_BUILD_CONTROLLER_BIN`, and passes that
path to `ExecutionPlatform.layerNode({ executable })`. Product code never reads
either global. The harness validates the absolute paths, provides the platform
Layer to `Build.layerLocal`, and passes Bun only to `BunCli.layer`;
there is no product or local `PATH` discovery. For each case, compile once by
invoking the exact direct argv and once via a program that yields
`BunCli.Driver` and calls `Build.run(driver, request)` from identical
snapshots:

The direct side independently renders the same descriptor-owned `{}` variant
into its own private output, uses the materialized snapshot root as exact cwd,
and replaces (does not merge) the environment with the variant's empty map.
Assert its argv against the authored golden before invocation. Managed and
direct sides must therefore differ only in lifecycle ownership, not cwd/env/
template semantics.

- `hello.ts`: both accept; both executables run with identical exit code,
  stdout, and stderr; driver artifact metadata is valid.
- `syntax-error.ts` and `missing-import.ts`: both direct and managed invocations
  reach Bun, return compiler rejection/`BuildRejected`, and publish nothing.
- an entrypoint absent from the immutable context fails the managed operation
  projector as `MissingEntrypoint` before attempt ID/staging/spawn. The direct
  CLI's later missing-file error is recorded only as contrast, not forced into
  false lifecycle parity.
- `autoload-trap`: place `.env`, `bunfig.toml`, `tsconfig.json`, and
  `package.json` inside the immutable snapshot. `--no-env-file` proves `.env`
  cannot influence the build process; the four compile-autoload flags prove
  none is autoloaded by the produced executable at runtime. Snapshot-local
  bunfig/tsconfig/package bytes are nevertheless declared build inputs and may
  affect compilation, so assert direct/managed parity and that changing any of
  them changes the context/build digest. In a separate dynamically created
  fixture, put hostile config files only in the fresh engine parent and
  isolated candidate home; neither direct nor managed build may observe them.
- fake-process cases cover wrong version, binary mutation between resolution
  and spawn, output outside staging, non-executable/missing output, and
  interruption. They must observe zero or one build spawn as appropriate.

Compare observable behavior and normalized/raw evidence; do not require byte
identical executables, absolute diagnostic paths, or timing equality.

**Verify**:
`EFFECT_BUILD_REQUIRE_REAL_BUN=1 EFFECT_BUILD_BUN_BIN=/abs/bun-1.3.9 pnpm test:integration:bun`
exits 0 with Bun 1.3.9 and reports every named case as executed.

### Step 6: Add exact script routing and define the required-real CI handoff

Preserve the exact `test:unit:bun` route from Step 2. Update `package.json` and
`vitest.config.ts` so `test:integration:bun` is exactly
`vitest run test/integration/bun-executable.test.ts`. Keep a generic focused
runner only as developer convenience; required gates use the stable aliases.
`verify` aggregates `verify:core`, the exact Bun unit suite, types, and static
checks without pretending an unprovisioned real tool ran. Keep Plan 003's
genuine `test:host:bun` route; do not replace it, make an empty selection
succeed, or duplicate test semantics into shell code.

Plan 006 alone owns `.github/workflows/ci.yml`, checksum-driven provisioning,
and the final matrix. This plan establishes the required-real harness and the
exact Bun archive facts it will consume; it does not create a competing partial
workflow.

Plan 006 provisions the pinned archive and runs the real parity test in a
network-denied Linux namespace after proving no network interface is usable.
Proxy variables are not network denial, and no install/download occurs inside
that phase. It sets `EFFECT_BUILD_BUN_BIN` to the verified absolute binary and
`EFFECT_BUILD_REQUIRE_REAL_BUN=1`, which converts missing/wrong tools into
failures. A matching local/Linux run is useful preflight evidence but cannot
replace the Plan 006 required CI job.

**Verify**: the exact required-real alias exists and fails closed when its flag
is set without a valid 1.3.9 path. Record the remaining external acceptance in
the status as `IMPLEMENTED: awaiting required CI`.

### Step 7: Run the complete gate and audit the boundary

Run all commands in the table. Compare the saved core hashes or Git diff and
confirm that only in-scope files changed. Search the new module for download,
fallback, raw-argument, and shell-string paths.

**Verify**: `pnpm verify` exits 0; `git diff --check` exits 0 when Git exists;
the core hashes are unchanged; and `rg -n 'try.*driver|rawArgs|Bun\.build|curl|download' src/bun test/testkit` has no production escape hatch (test names/comments are acceptable after inspection).

## Test plan

- Unit/golden tests: invocation contract/generated compatibility/pin, validated request decoding,
  schemas, path rejection, exact argv, operation/driver ownership,
  semantic/execution separation, typed resolution failures.
- Shared contract tests: lifecycle, one spawn, staging/artifact invariants,
  rejection, interruption, raw evidence, no fallback.
- Real differential tests: accepted executable behavior, syntax/missing-import
  compiler rejection, separate missing-entrypoint preflight, and ambient-autoload
  trap using Bun 1.3.9.
- Required-real harness: verified official binary followed by an offline
  real-tool run; Plan 006 wires the checksum provisioning and CI job.

## Implementation and final acceptance criteria

- [ ] Bun `1.3.9` is the sole supported version and its executable digest is in
      every resolved record.
- [ ] Bun obtains one fully opaque core-branded `ToolchainResolution`; only
      core can unwrap the bound semantic identity, handle, and profile
      fingerprint, and pre-spawn checks use the resolved-build canon.
- [ ] The descriptor's sole `{}`-matched exact ordered template matches the
      golden including build-process `--no-env-file`; core alone renders it,
      and semantic values contain no host path.
- [ ] The Bun driver has no `prepareInvocation`, template selector, invocation
      capability, raw path, or process-spawn capability; `interpretCompletion`
      runs only on core-supplied bounded completion data.
- [ ] Driver-fixed `ExplicitMinified` and operation-owned `NoSourceMap` are not
      caller options or duplicated driver input.
- [ ] `makeCompileExecutableRequest` is Effect-returning with precise
      `Schema.SchemaError`, `R = never`, and no throwing/unchecked overload.
- [ ] `descriptor.invocationContract` is versioned, matches Bun 1.3.9 and the
      exact resolved-input match/ordered argv/empty environment/policy/
      no-asset-role facts, and contains no
      host/controller claims; compatibility is a drift-proof generated
      projection and never runtime authority.
- [ ] `BunCli.layer({ executable })` is the sole explicit tool ingress, yields
      the opaque `Driver` service at `effect-build/BunCli/Driver`, keeps the SPI
      and handles private, and performs no PATH/
      environment discovery or fallback.
- [ ] Bun `Config` and `ResolvedInput` are strict empty structs; entrypoint is
      present exactly once in `ResolvedBuild.operation.resolvedRecipe`, while
      context, target, and output exist only in that same nested operation.
- [ ] Direct and managed success/rejection behavior agrees for every fixture.
- [ ] The test program supplies one explicit
      `ExecutionPlatform.layerNode({ executable })`; no product global host
      discovery exists, and controller/Bun target mismatch rejects pre-attempt.
- [ ] Snapshot-local config is declared/digesting input, produced-runtime
      autoload is disabled, and hostile engine-parent/user config is not read;
      no broader hermetic claim is made.
- [ ] The shared driver contract passes and is compiler-agnostic.
- [ ] Library code never installs/downloads, tries another driver, accepts raw
      args, or publishes partial output.
- [ ] The required-real harness runs with networking unavailable and cannot
      silently skip; Plan 006 is the sole owner of the corresponding CI job.
- [ ] `test:integration:bun` plus unit, host, type, lint, format, build, and
      aggregate gates pass.
- [ ] Out-of-scope core hashes/diffs are unchanged.
- [ ] Local completion sets `plans/README.md` to
      `IMPLEMENTED: awaiting required CI`; only Plan 006 changes it to `DONE`
      after checksum-verified, network-denied Linux CI is observed green.
- [ ] That pending-status edit is in the final verified Plan 004 commit and the
      worktree is clean at handoff.

## STOP conditions

Stop and report instead of improvising if:

- Plan 003 is incomplete or its live seam lacks private staging, semantic vs
  execution toolchains, one-spawn execution, or double tool revalidation.
- `ResolvedBuild.operation.resolvedRecipe` is absent, common operation fields
  also exist as top-level siblings, or correct argv rendering would
  require copying common recipe fields into Bun `ResolvedInput`.
- The validated request constructor needs a service, throws/defects on bad
  input, or loses the precise Schema error; or the invocation contract requires
  runtime host/controller branching.
- Correct implementation requires changing a Plan 003 core file/schema.
- The verified Bun 1.3.9 probe/help contradicts explicit `--minify`, exposes a
  selectable non-minified compile state, or otherwise contradicts the exact
  tagged profile/argv above.
- The explicitly supplied local executable is absent or does not report exact
  Bun `1.3.9`. Official archive availability/digest acceptance belongs only to
  Plan 006 and is not a Plan 004 STOP condition.
- The driver needs ambient config/environment/network or library download code.
- Direct and managed behavior differs after two focused correction attempts.
- Network denial cannot be demonstrated in CI, a required real test skips, or
  any verification command fails twice after a reasonable fix.

## Maintenance notes

- A new Bun version is a new tested capability entry with new help snapshots,
  archive/binary evidence, and differential tests—not a relaxed semver range.
- Reviewers should scrutinize argv ordering, lack of ambient autoloads, error
  channel classification, and any value crossing the semantic/host-path line.
- Native CLI/API parity, watch/plugins, cross-target output, and other build
  operations are deliberately deferred until after the Bun/Deno normalized
  boundary is proven.
