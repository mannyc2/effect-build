# Plan 005: Prove normalized executable compilation with the Deno CLI

> **Executor instructions**: Follow this plan step by step and run every
> verification gate. This plan must reuse the core and shared contract delivered
> by Plans 003 and 004 unchanged. Implement Deno-specific semantics in the Deno
> driver; do not make the normalized operation a union of Bun and Deno flags.
> STOP and report on any condition listed below. After local implementation
> gates, set this plan's row in `plans/README.md` to
> `IMPLEMENTED: awaiting required CI` unless a reviewer owns the index. Plan 006
> alone provisions checksum-pinned Linux tools and promotes it to `DONE` after
> observed offline CI. Include the pending-status edit in the final verified
> Plan 005 commit and require a clean worktree before Plan 006.
>
> **Drift check (run first)**: this plan was written in an unversioned workspace
> on 2026-08-09. Run the dependency gate in Step 1 and `pnpm verify`. If Git now
> exists, inspect `git status --short`; otherwise save `shasum -a 256` output for
> all out-of-scope core, Bun, and shared-contract files in the execution log and
> compare it before completion. Do not create a checksum file in the repository.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: `plans/004-add-bun-cli-executable-driver.md`
- **Category**: feature / tests / architecture
- **Planned at**: unversioned workspace on 2026-08-09

## Why this matters

Bun alone cannot prove the architecture is normalized; a wrapper can look
clean while merely encoding one tool's worldview. Deno supplies the useful
counterexample: fixed config/lock isolation, an optional experimental
bundle/minify mode, and a separate target runtime (`denort`) that Deno otherwise downloads on
first compile. Passing the same core lifecycle and shared driver contract while
keeping those semantics local demonstrates a real deterministic architecture.

Parity is behavioral parity for the supported Deno V1 profile. It is not raw
CLI parity, and `Unbundled` means only “omit Deno's experimental `--bundle`”;
`deno compile` still creates a standalone executable.

## Current state and fixed contract

Plans 003 and 004 must already provide:

- `Build.run(driver, request)`, scoped staging, content-addressed artifacts,
  records, typed outcomes/errors, exact contract-owned invocation variants,
  and exactly one core-owned managed-build spawn.
- explicit `ExecutionPlatform.Current` with one provided
  `layerNode/layerBun/layerDeno({ executable })`; Build never discovers the
  controller host from globals.
- fully opaque branded `ToolchainResolution` from core's closed probe; a
  core-private WeakMap atomically associates semantic `ResolvedToolchain`, the
  `ExecutionToolchainHandle`, and execution-profile fingerprint from the same
  observation. Drivers cannot inspect/pair them, and the handle contains no
  semantic `expected` copy.
- Generic
  `ToolchainAssetIdentity { role, target, logicalPath, digest, byteLength }`
  values sorted into semantic toolchain identity; the private handle carries
  matching absolute asset paths/driver bindings. Core hashes executable and
  assets before staging and immediately before spawn.
- `test/testkit/compileExecutableDriverContract.ts` exporting
  `compileExecutableDriverContract`; this plan reuses it without edits.
- `src/bun/BunCli.ts` exporting named `descriptor`, `Config`, `ResolvedInput`,
  `makeCompileExecutableRequest`, opaque `Driver`, and explicit
  `layer({ executable })`; its implementation SPI is private and invocation
  rendering is core-owned contract projection.
- `ResolvedBuild.operation` as the sole nested `ResolvedOperation`, containing
  identity, `resolvedRecipe`, context, target, and outputs. The
  `CompileExecutable` resolved recipe contains only the snapshot-relative
  entrypoint. There are no sibling top-level context/target/output fields, and
  Bun's strict empty `ResolvedInput` proves drivers need not copy them.

The runtime-required Deno profile is exactly version `2.9.3` on the current
executable target. A configured path is recorded as `ConfiguredObserved`; the
probe can verify version/platform but cannot distinguish same-version stable
from LTS bytes. Only checksum-verified CI archive evidence establishes that the
tested distribution is official stable. Therefore records never infer a
channel, and configured same-version bytes are observed execution, not a stable
support claim. Local Deno `2.9.2` is development-only evidence and must never
satisfy or silently skip a release/CI support claim.

The Deno driver-specific config and resolved input contain one closed tagged
choice and nothing else:

```ts
type Config = {
  readonly optimization:
    | { readonly _tag: "Unbundled" }
    | { readonly _tag: "Bundled"; readonly minify: boolean }
}

type ResolvedInput = {
  readonly optimization:
    | { readonly _tag: "Unbundled" }
    | { readonly _tag: "Bundled"; readonly minify: boolean }
}
```

Both schemas reject entrypoint, context, target, output, toolchain assets,
runtime permissions, source maps, and unknown keys. Nested
`ResolvedBuild.operation` owns entrypoint/resolved recipe, context,
`CurrentHost`, `NoSourceMap`, fixed syntax/module-graph semantics, and its one
logical executable output.

Denort appears only in `ResolvedToolchain.requiredAssets` as
`{ role: "DenoRuntime", target: <execution-platform>, logicalPath: "denort",
digest, byteLength }`; it never appears in `ResolvedInput`. V1 always emits `--no-config --no-lock`.
Explicit config and lock would add states without product value while V1 is
no-typecheck and local-only; defer them until a dependent operation exists.

`descriptor.invocationContract` is the versioned
`DriverInvocationContractV1` runtime canon with protocol version 1, required
Deno version exactly `2.9.3`, semantic target mode `CurrentHost`, required
asset role `DenoRuntime`, and a bounded exact `ProbeContractV1`. Its fixed argv
is `deno eval --no-config --no-lock --no-remote --no-npm` plus the
literal script
`console.log(JSON.stringify({version:Deno.version.deno,os:Deno.build.os,arch:Deno.build.arch}))`.
It runs in a private empty cwd with a fresh probe scratch `DENO_DIR`, fixed
`DENO_NO_UPDATE_CHECK=1`/`DENO_NO_PROMPT=1`, no inherited environment, and
timeout `5_000ms`, stdout limit 256 bytes, and stderr limit 0 bytes. It requires
exit 0, empty stderr, and one strict JSON stdout line with
exactly `version`, `os`, and `arch` matched through exact maps
`linux->linux`, `darwin->macos`, `windows->windows`,
`x86_64->x86_64`, and `aarch64->aarch64`; unknown values reject.
The probe environment binds `DENO_DIR -> ProbeScratchPath`, never the
build-attempt `ScratchPath`; core creates and scope-cleans that fresh directory
before any attempt boundary on every terminal path.
It owns exactly three variants, uniquely matched to canonical encoded
`{"optimization":{"_tag":"Unbundled"}}`,
`{"optimization":{"_tag":"Bundled","minify":false}}`, or
`{"optimization":{"_tag":"Bundled","minify":true}}` `ResolvedInput`, with
the complete ordered argv template shown below and the same complete replacement environment:
`DENO_DIR -> ScratchPath`, `DENORT_BIN -> ToolAsset(DenoRuntime)`,
`DENO_NO_UPDATE_CHECK -> FixedLiteral("1")`, and
`DENO_NO_PROMPT -> FixedLiteral("1")`. It also has a closed managed-policy set:
CLI executable compilation, syntax/module-graph with `NoTypeCheck`, the three
declared optimization forms, `NoConfig`, `NoLock`, `NoRemote`, `NoNpm`,
`CachedOnly`, `DenyAll`, `NoPrompt`, `NoSourceMap`, one regular executable,
empty caller environment, explicit denort, and fresh engine-owned `DENO_DIR`.
`CurrentHost` is a target mode, not a detected-host claim. Compatibility must
not contain controller runtime, detected OS, process cancellation, filesystem,
atomicity, or store-durability claims and must not select a driver at runtime.
`Compatibility.DriverCompatibility.fromDescriptor(descriptor)` is the only source of the
Schema-encoded compatibility projection; that projection is never runtime
authority.

The exact ordered argv projections are:

```text
# Unbundled
compile --no-config --no-lock --no-remote --no-npm --cached-only --no-check --no-prompt --output <absolute-staging-output> <snapshot-relative-entry>

# Bundled { minify: false }
compile --no-config --no-lock --no-remote --no-npm --cached-only --no-check --no-prompt --bundle --output <absolute-staging-output> <snapshot-relative-entry>

# Bundled { minify: true }
compile --no-config --no-lock --no-remote --no-npm --cached-only --no-check --no-prompt --bundle --minify --output <absolute-staging-output> <snapshot-relative-entry>
```

Run the absolute Deno binary from the snapshot root. Omit `--target` so output
is current-host only. `--no-check` is mandatory: common V1 is
syntax/module-graph compilation, not typechecking, and retaining Deno's default
typecheck would silently strengthen Bun semantics. Runtime permissions are the
fixed tagged state `DenyAll`; emit no `--allow-*` flag and embed `--no-prompt`
so the compiled executable throws rather than prompting.

Core matches canonical Deno `ResolvedInput` to exactly one of those contract
variants and renders operation-owned `SnapshotEntrypoint`, staged output,
scratch, and denort slots. There is no driver-owned renderer or template
selector. The driver never receives a raw host path and never reconstructs or
copies context, target, or logical output into driver data.

Always set the driver-owned `DENORT_BIN` environment binding to the verified
private handle for the configured current-host denort bytes. Set `DENO_DIR` to an
engine-owned empty attempt directory plus `DENO_NO_UPDATE_CHECK=1` and
`DENO_NO_PROMPT=1`; do not depend on a user's opaque cache layout. Use an
environment replacement, not inherited caller environment. The directory is
attempt scratch owned/cleaned by core and is not a declared artifact. Its path,
the staging output, and all attempt-local binding values live only in core's
private `ExecutionEnvironmentHandle`; they never enter `EnvironmentFingerprint`,
`ResolvedBuild`, or record identity.

`--cached-only` does **not** by itself prevent Deno from downloading denort.
The generic companion-asset preflight must resolve/hash the configured denort before
staging and fail `ToolchainAssetsUnavailable` when it is missing. The library
never downloads or prewarms it. Explicit `DENORT_BIN`, a fresh `DENO_DIR`, and
network denial together prove the build has no hidden runtime download.

### Official 2.9.3 CI trust roots

For Linux x86_64:

- Deno archive: `deno-x86_64-unknown-linux-gnu.zip`
- archive SHA-256:
  `8101865641cbede56f08ad19c0a67a87df84bce127fee0d3e3e1f7467717ffa6`
- denort archive: `denort-x86_64-unknown-linux-gnu.zip`
- denort archive SHA-256:
  `9fd1ecebd84bfd99b406442f40176e32e948b00edb91221358ec44d25a2092bd`

All URLs are under
`https://github.com/denoland/deno/releases/download/v2.9.3/`. The two archive
digests above are committed trust roots, not checksum files blindly downloaded
beside their payloads in CI. After archive verification, hash both extracted
binaries and record those observed digests/byte lengths in the resolved
toolchain. Put denort in `ToolchainAssetIdentity` with role
`DenoRuntime`, canonical `ExecutablePlatformTarget`, and logical path `denort`;
the runtime identity records extracted bytes only. The verified archive digest,
target-specific asset name, and successful real executable run establish
separate CI compatibility evidence for this official fixture. Runtime does not
decode a Deno release version from arbitrary denort bytes and must never call a
configured same-target asset “matching 2.9.3”; it records
`ConfiguredObserved` digest/length/target only.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Dependency gate | `pnpm verify` | Plans 003/004 are green before edits |
| Focused unit | `pnpm test:unit:deno` | exact Deno unit file passes |
| Exact real parity | `EFFECT_BUILD_REQUIRE_REAL_DENO=1 EFFECT_BUILD_DENO_BIN=/abs/deno-2.9.3 EFFECT_BUILD_DENORT_BIN=/abs/denort-2.9.3 pnpm test:integration:deno` | all required cases pass |
| Cross-driver | `EFFECT_BUILD_REQUIRE_REAL_BUN=1 EFFECT_BUILD_BUN_BIN=/abs/bun-1.3.9 EFFECT_BUILD_REQUIRE_REAL_DENO=1 EFFECT_BUILD_DENO_BIN=/abs/deno-2.9.3 EFFECT_BUILD_DENORT_BIN=/abs/denort-2.9.3 pnpm test:integration:cross-driver` | the shared normalized-semantics case executes through both direct tools and both drivers |
| All real tools | `EFFECT_BUILD_REQUIRE_REAL_BUN=1 EFFECT_BUILD_BUN_BIN=/abs/bun-1.3.9 EFFECT_BUILD_REQUIRE_REAL_DENO=1 EFFECT_BUILD_DENO_BIN=/abs/deno-2.9.3 EFFECT_BUILD_DENORT_BIN=/abs/denort-2.9.3 pnpm test:integration:all` | exact Bun, Deno, and cross-driver files all pass offline |
| Deno host | `pnpm test:host:deno` | exit 0 |
| Types | `pnpm test:types && pnpm check` | exit 0, no errors |
| Quality | `pnpm lint && pnpm format:check` | exit 0 |
| Aggregate | `pnpm verify` | exit 0 |

The stable aliases name exact files and must not depend on positional filter
behavior.

## Scope

**In scope** — modify or create only:

- `src/deno/DenoCli.ts`
- `src/deno/internal/DenoCliImplementation.ts`
- `package.json`
- `vitest.config.ts`
- `test/unit/deno-cli.test.ts`
- `test/integration/deno-executable.test.ts`
- `test/integration/cross-driver-executable.test.ts`
- `test/fixtures/deno-executable/hello.ts`
- `test/fixtures/deno-executable/type-only-error.ts`
- `test/fixtures/deno-executable/permission-denied.ts`
- `test/fixtures/deno-executable/missing-import.ts`
- `test/fixtures/deno-executable/syntax-error.ts`
- `test/fixtures/deno-executable/no-config-trap/entry.ts`
- `test/fixtures/deno-executable/no-config-trap/deno.json`
- `test/fixtures/deno-executable/no-config-trap/deno.lock`
- `test/fixtures/deno-executable/remote-import.ts`
- `test/fixtures/deno-executable/npm-import.ts`
- `plans/README.md` only for the final status update

**Out of scope** — do not touch:

- Core files from Plans 002/003, `src/bun/**`, or
  `test/testkit/compileExecutableDriverContract.ts`.
- `src/index.ts` and the `package.json` export map; Plan 006 owns public driver
  subpaths. Package changes here extend scripts only.
- `Deno.bundle`, a native/raw CLI adapter, raw args, watch, cross-target output,
  allow-permission flags, remote/npm inputs, inherited config/lock discovery, multiple
  artifacts, arbitrary environment, or source maps.
- Automatic download/install/prewarm logic in library or test code.
- A universal normalized `minify`/`bundle`, or any V1 config/lock field. The
  optimization choice remains Deno driver input; config/lock are fixed off.

## Steps

### Step 1: Gate on the Bun proof and freeze unchanged boundaries

Run:

```sh
test -f plans/004-add-bun-cli-executable-driver.md
test -f src/bun/BunCli.ts
test -f test/testkit/compileExecutableDriverContract.ts
awk -F'|' '$2 ~ / 004 / { gsub(/^ +| +$/, "", $7); print $7 }' plans/README.md | rg -q '^(DONE|IMPLEMENTED: awaiting required CI)$'
EFFECT_BUILD_REQUIRE_REAL_BUN=1 EFFECT_BUILD_BUN_BIN=/absolute/verified/bun-1.3.9 pnpm test:integration:bun
pnpm verify
```

Read Plan 003's toolchain seam and confirm generic companion assets and private
driver bindings exist exactly as described. Record hashes for all out-of-scope
core, Bun, and testkit files when Git is absent.

Replace the placeholder with the verified absolute Bun 1.3.9 path. **Verify**:
the Plan 004 row is locally implemented or `DONE`, the required-real suite executes rather than skips,
and every command exits 0; the helper and core seam need no change. Otherwise
STOP.

### Step 2: Write the Deno schema and argv contract tests first

Create `test/unit/deno-cli.test.ts` and establish `test:unit:deno` as exactly
`vitest run test/unit/deno-cli.test.ts` before the first red test. It has no
positional filter or empty-suite success path. Require `src/deno/DenoCli.ts` to export
named runtime values `descriptor`, `Config`, `ResolvedInput`,
`makeCompileExecutableRequest`, `Driver`, and `layer`; `Config` and
`ResolvedInput` are dual Schema values/types. Its exact additional type-only
names are `ConfigEncoded`, `ResolvedInputEncoded`, and `Request`. Require the
validated Effect-returning boundary and an opaque `Driver` `Context.Service`
tag with runtime key
`effect-build/DenoCli/Driver`, and
`layer({ executable: AbsoluteFilePath, denort: AbsoluteFilePath })` matching
Plan 003. The constructor has
the exact shape
`(input: unknown) => Effect.Effect<Request, Schema.SchemaError, never>` using
the concrete nominal request type, delegates to the shared request Schema
decoder, and has no synchronous/throwing overload.
Put the private resolver/completion SPI in
`src/deno/internal/DenoCliImplementation.ts`; it is not a package export and
cannot appear in public emitted declaration signatures. There is no
driver-owned argv renderer: exact templates are descriptor data rendered by
core.

Test:

- only required Deno executable version `2.9.3` and a configured denort with
  valid bytes plus the exact current OS/architecture/ABI are accepted at
  runtime; local Deno `2.9.2`, wrong denort targets/formats, missing assets, and
  byte/digest changes reject before staging. There is no denort semantic-version
  or channel check because the asset exposes neither authority; the joined
  official Deno/denort pin plus real execution is CI compatibility evidence.
- the descriptor uses the private strict profile constructor; mutation before
  Layer creation cannot change identity, probe, variant templates, environment,
  or policy, while its Schema object identities remain exact.
- `descriptor.invocationContract` round-trips as
  `DriverInvocationContractV1`, exactly authorizes the required profile,
  `DenoRuntime` role, three unique canonical resolved-input matches, three
  complete ordered templates, four complete environment bindings, and managed
  policies above, and
  rejects extra, duplicate, contradictory, host, or controller claims. Its
  generated `DriverCompatibilityV1` projection matches and cannot drift. Any
  contract change requires a descriptor-version change.
- the exact Deno eval probe succeeds, while ordinary multi-line `deno --version`
  text, unknown/missing JSON keys, extra lines/stderr, malformed/truncated
  output, wrong version/platform, nonzero exit, quota, and timeout are rejected.
- Bun `arm64/x64` and Deno `aarch64/x86_64` raw probe values normalize to the
  same canonical `ExecutablePlatformTarget` on an identical host.
- valid input succeeds through `makeCompileExecutableRequest`; unknown fields,
  wrong operation/driver/surface/version, invalid recipe, invalid optimization,
  and copied operation/toolchain fields fail with `Schema.SchemaError` in the
  Effect error channel. Type assertions prove environment `never`; `Effect.exit`
  proves malformed input never throws or defects.
- every tagged optimization choice encodes canonically; `minify` cannot exist
  outside `Bundled`; permissions are fixed `DenyAll`, source maps are fixed
  `NoSourceMap`, and config/lock fields are rejected as excess properties.
- both `Config` and `ResolvedInput` reject entrypoint, context, target, output,
  denort/toolchain, permissions, source-map, and unknown fields.
- absolute/traversing paths fail the common recipe Schema; a portable logical
  path missing from the verified context manifest fails the common operation
  projector with `MissingEntrypoint`, all before execution.
- exact descriptor-owned templates match all three argv arrays above, each
  canonical resolved input selects exactly one, and none can express a shell.
- changing entrypoint changes operation `resolvedRecipe`; changing optimization
  changes only Deno `ResolvedInput`; changing denort digest changes only
  `ResolvedToolchain.requiredAssets`. Each changes the build digest exactly once.
- changing absolute Deno, denort, cache, or staging paths does not change the
  encoded `ResolvedBuild`.
- no raw args, target, watch, remote/npm permission, or host path can decode.
- `layer` is the sole tool-location ingress: it rejects relative/empty paths,
  never searches `PATH`, reads no process environment, constructs executable/
  asset handles internally, and yields the `Driver` service with only explicit
  platform requirements.
- `Driver.key` is exactly `effect-build/DenoCli/Driver`; Plan 006 retrieves it
  alongside Bun's distinct service from a merged Layer.
- the resolver accepts validated Deno optimization config plus canonical
  operation/execution platform only; type tests prove Recipe and whole request
  are absent.

**Verify**: `pnpm test:unit:deno` initially fails only for the missing
implementation; `pnpm check` has no unrelated failures.

### Step 3: Implement resolution and the Deno CLI projection

Implement `src/deno/DenoCli.ts` plus its package-private implementation module
against the unchanged driver protocol. During
resolution, verify exact Deno version/target, executable identity, and the
configured denort byte/native-target `ToolchainAssetIdentity`; return
`ToolchainAssetsUnavailable` before staging if denort is missing. Return only
the normalized optimization in driver `ResolvedInput`. Put Deno's required
profile and `ConfiguredObserved` executable observation in `ResolvedToolchain`;
put denort only in `requiredAssets { role, target, logicalPath, digest,
byteLength }`. Archive provenance stays CI evidence. Absolute paths live only
in core's private resolution association. The fully opaque resolution token's WeakMap entry must bind that
semantic value, handle, and canonical Deno profile fingerprint from the same
core probe; planning requires the stamp to match before preparing. Core's two revalidation points must
cover both files.

Implement `DenoCli.layer({ executable, denort })` around exactly those two
configured absolute paths. It captures only closed `ToolchainProbe`, validates
the Deno 2.9.3 version profile and denort byte/native target, constructs private
handles internally, and yields the `Driver` service tag under the exact runtime
key `effect-build/DenoCli/Driver`. The public service is
only the opaque handle; the SPI remains package-private. `ToolchainProbe`
accepts no caller argv, cwd, environment, or output; neither the layer nor
hidden driver implementation imports `ProcessExecutor`, `ChildProcessSpawner`, or another
spawn API. It performs no PATH,
environment, cache, alternate-path, download, or fallback lookup. Callers use
`yield* DenoCli.Driver`; neither product nor tests construct private handles.

Implement `makeCompileExecutableRequest` with the shared validated request
Schema/`ManagedBuildRequest.makeEffect`, preserving exact `Schema.SchemaError`
and `R = never`. Do not catch/rethrow, run the Effect synchronously, use an
unchecked constructor, or expose a trusted overload. Use Plan 002's
package-private generic constructor; export only the concrete validated Deno
boundary. Implement no `prepareInvocation`, peer renderer, or template
selector: core matches canonical `ResolvedInput` to one of the descriptor's
three complete variants and renders all private slots/environment.

The driver never constructs raw environment values and never spawns. Core
selects/validates/renders the captured template, owns the sole managed-build invocation, and drains
stdout/stderr concurrently. Implement `interpretCompletion` so nonzero compile
becomes `BuildRejected`; missing/changed tool assets, spawn/termination, or
artifact violations remain typed core errors. Preserve interruption and
delegate cleanup/storage/materialization to core.

Do not probe by compiling, invoke a downloader, inspect a user's Deno cache, or
fall back when denort is absent.

**Verify**: `pnpm test:unit:deno && pnpm test:types && pnpm check` exits 0.

### Step 4: Differentially test every supported semantic branch

In `test/integration/deno-executable.test.ts`, read explicit verified 2.9.3
Deno and denort paths only in the test harness; product code never reads these
environment variables. The Node test harness also canonicalizes its actual
`process.execPath`, or in CI requires the exact equal
`EFFECT_BUILD_CONTROLLER_BIN`, and supplies
`ExecutionPlatform.layerNode({ executable })` to `Build.layerLocal`. The
harness validates all absolute paths, passes only Deno/denort to
`DenoCli.layer`, and the test program yields `DenoCli.Driver`; there is no
PATH/cache discovery or private-handle construction. A local developer without
them may receive one clearly labeled capability skip. CI sets
`EFFECT_BUILD_REQUIRE_REAL_DENO=1`, which must turn missing/wrong tools into test
failure. Deno 2.9.2 may run unit/host development checks but never the supported
integration suite.

For each case, use identical immutable snapshots and compare a direct
`deno compile` invocation with the layer-provided driver's
`Build.run(driver, request)`:

The direct side independently selects/renders the same descriptor variant,
uses the materialized snapshot root as cwd, and replaces the environment
completely with a fresh empty `DENO_DIR`, exact verified `DENORT_BIN`,
`DENO_NO_UPDATE_CHECK=1`, and `DENO_NO_PROMPT=1`. It inherits nothing and
asserts argv/environment against the authored contract before invocation.

- `hello.ts` under `Unbundled`, `Bundled { minify: false }`, and
  `Bundled { minify: true }`; both executables have identical observable
  exit/stdout/stderr behavior. Do not require byte identity.
- `type-only-error.ts` is accepted and runs under direct Deno `--no-check` and
  the Deno driver, proving Deno's side of the fixed no-typecheck contract.
- `permission-denied.ts` compiles, then an environment read fails immediately
  without a prompt under both direct and managed Deno, proving `DenyAll`.
- `no-config-trap` proves `--no-config --no-lock` prevents ambient config and
  lock discovery.
- syntax error and `missing-import.ts` reach Deno and become direct/compiler
  rejection plus managed `BuildRejected`, without publication.
- an entrypoint absent from the immutable context is the same common
  `MissingEntrypoint` planning failure as Bun, with zero attempt/spawn; it is not
  a driver parity case.
- `remote-import.ts` and `npm-import.ts` reject under `--no-remote --no-npm
  --cached-only` while networking is denied and an empty `DENO_DIR` is used.
- missing, changed, malformed, wrong-architecture, or wrong-ABI denort; changed
  Deno/denort between resolution and spawn; output violation; and interruption
  satisfy the shared contract with zero/one spawn as appropriate. Do not invent
  a denort semantic-version mismatch case.

Invoke `compileExecutableDriverContract` unchanged for Deno. Compare normalized
outcome/artifact/diagnostic shape plus raw channels, allowing unstable absolute
paths, warning wording, timing, and binary bytes to differ.

Put the actual four-way proof in the separate exact
`test/integration/cross-driver-executable.test.ts`. Its harness requires and
validates all three explicit tool paths, provides `BunCli.layer` and
`DenoCli.layer`, provides exactly one shared
`ExecutionPlatform.layerNode({ executable: exactControllerPath })`, and runs
the same immutable `type-only-error.ts` snapshot
through direct Bun, managed Bun, direct Deno `--no-check`, and managed Deno.
All four executables must run with the same observable result. The Deno-only
test neither reads Bun variables nor claims this cross-driver case; therefore
its authoritative command is complete with Deno and denort alone.
Both direct sides independently render their descriptor variant, use snapshot
cwd, and apply the same complete replacement-environment rules above (empty for
Bun; fresh four-binding Deno environment) with no inherited values.

**Verify**: when exact Deno 2.9.3 and official denort-fixture paths are locally provisioned, the
real-parity command exits 0 and reports every case executed. Without them, the
required flag must fail rather than skip; Plan 006 supplies the authoritative
checksum-verified Linux execution before this row can become `DONE`.

### Step 5: Establish exact routes and define cold-offline acceptance

Preserve the exact `test:unit:deno` route from Step 2. Extend the existing
`package.json`/`vitest.config.ts` routing so
`test:integration:deno` is exactly
`vitest run test/integration/deno-executable.test.ts`, and
`test:integration:cross-driver` is exactly
`vitest run test/integration/cross-driver-executable.test.ts`.
`test:integration:all` runs the exact Bun, Deno, and cross-driver aliases in
that order,
`test:host:deno` runs a genuine Deno-host smoke selection, and `verify` includes
the exact Deno unit suite, types, and static checks without pretending an
unprovisioned real tool ran. No no-op, silent required skip, positional filter,
or `passWithNoTests` route is acceptable.

Plan 006 alone owns `.github/workflows/ci.yml`, archive provisioning/checksums,
and the final matrix. This plan establishes required-real harnesses and the
exact release facts they consume; it does not extend a competing partial
workflow.

Plan 006 discards/walls off provisioning network state, then runs integration
in a network-denied Linux namespace with a fresh empty `DENO_DIR` and explicit
`DENORT_BIN`. No package install, cache warmup, checksum fetch, or download may
occur in that phase. It must show the first managed compile succeeds without a
runtime fetch. Every required-real flag converts a missing capability into a
failure.

**Verify**: all exact aliases exist, and each required-real alias fails closed
when its required path is absent/wrong. Record checksum/network-denied execution
as pending Plan 006 acceptance.

### Step 6: Run change-amplification and aggregate gates

Run unit, host, type, quality, and aggregate commands; run real integration
commands when exact local tools exist, otherwise run their fail-closed missing-
tool assertions and leave acceptance pending. Compare saved hashes or Git diff:
`src/bun/BunCli.ts`, the shared contract
helper, and every core file must be byte-for-byte unchanged. Inspect the Deno
module for cache-layout discovery, downloader, fallback, raw args, and inherited
environment.

**Verify**: `pnpm verify` exits 0; `git diff --check` exits 0 when applicable;
out-of-scope hashes match; and `rg -n 'download|rawArgs|--target|--watch|Deno\.bundle|process\.env' src/deno` finds no forbidden production path (explicit fixed environment construction may be reviewed and accepted).

## Test plan

- Unit/golden: exact versioned compatibility/tool/asset facts, validated request
  decoding, tagged schemas, invalid states, exact argv,
  operation/driver/toolchain ownership, path isolation, semantic identity
  boundaries.
- Shared contract: unchanged lifecycle/artifact/rejection/interruption tests.
- Differential real-tool: three optimization modes, type-only-error acceptance,
  success/rejection, config/lock discovery trap, and remote/npm
  rejection.
- Cold offline required-real harness: verified Deno plus denort, fresh cache,
  explicit `DENORT_BIN`, unavailable network, and no permitted skip; Plan 006
  wires this into CI.
- Change amplification: Bun, shared helper, and core remain unchanged.

## Implementation and final acceptance criteria

- [ ] Deno executable `2.9.3` plus configured current-host denort
      digest/length/native target is the sole runtime profile; runtime never
      assigns the companion a semantic release version, while the official
      joined distribution plus execution proof remains CI fixture evidence.
- [ ] Deno obtains one fully opaque core-branded `ToolchainResolution`; only
      core can unwrap the bound Deno/denort semantic identities, handles, and
      profile fingerprint, and pre-spawn checks use the resolved-build canon.
- [ ] Missing/changed denort fails before staging; no implicit download/cache
      fallback is possible.
- [ ] Optimization uses the closed tagged model; config/lock are fixed disabled,
      runtime permissions are fixed `DenyAll`, and exact argv goldens pass.
- [ ] `makeCompileExecutableRequest` returns an Effect with precise
      `Schema.SchemaError`, `R = never`, and no throwing/unchecked overload.
- [ ] The Deno driver has no `prepareInvocation`, renderer, template selector,
      invocation capability, raw attempt path/environment, or spawner;
      `interpretCompletion` sees only bounded core data.
- [ ] `descriptor.invocationContract` is versioned, matches Deno 2.9.3,
      `DenoRuntime`, three exact resolved-input-matched ordered templates,
      complete environments/policies, and has no
      host/controller capability claims; compatibility is a drift-proof
      generated projection and never runtime authority.
- [ ] `DenoCli.layer({ executable, denort })` is the sole explicit tool ingress,
      yields the opaque `Driver` service at `effect-build/DenoCli/Driver`, keeps
      the SPI/handles private, and performs
      no PATH/environment/cache discovery or fallback.
- [ ] Every Node-hosted real integration/cross-driver test supplies exactly one
      explicit `ExecutionPlatform.layerNode({ executable })`; merged Bun+Deno
      Layers share that identity. The genuine `test:host:deno` smoke instead
      uses `ExecutionPlatform.layerDeno({ executable: exactDenoPath })`. Neither
      path leaves an unsatisfied environment or global host discovery.
- [ ] Deno `ResolvedInput` contains optimization only; common recipe fields occur
      only in nested `ResolvedBuild.operation`, and denort occurs only in
      `ResolvedToolchain.requiredAssets`.
- [ ] A type-only-error fixture is accepted by direct and managed Bun/Deno,
      proving `--no-check` normalization.
- [ ] Direct and managed behavior agrees for every supported branch and named
      rejection fixture.
- [ ] First compile with fresh `DENO_DIR` succeeds in the required-real harness
      with networking denied because verified `DENORT_BIN` is explicit; Plan
      006 is the sole owner of the corresponding CI job.
- [ ] Local Deno 2.9.2 never counts as supported 2.9.3 coverage.
- [ ] The Bun module, shared contract, and core are byte-for-byte unchanged.
- [ ] `test:unit:deno`, `test:integration:deno`,
      `test:integration:cross-driver`, `test:integration:all`, and all host,
      type, lint, format, build, and aggregate gates pass with no required-real
      skip.
- [ ] Local completion sets `plans/README.md` to
      `IMPLEMENTED: awaiting required CI`; Plan 006 alone promotes it to `DONE`
      after the checksum-verified network-denied suite is observed green.
- [ ] That pending-status edit is in the final verified Plan 005 commit and the
      worktree is clean at handoff.

## STOP conditions

Stop and report instead of improvising if:

- Plans 003/004 are not green, or the shared contract/core seam must change.
- `ResolvedBuild.operation.resolvedRecipe` is absent, common operation fields
  also exist as top-level siblings, or correct Deno argv rendering requires
  copying entrypoint/context/target/output into Deno `ResolvedInput`.
- The request constructor needs a service, throws/defects on malformed input,
  or loses its precise Schema error; or the invocation contract depends on
  runtime host/controller evidence.
- Generic semantic companion assets/private handles or double asset rehashing
  are absent from Plan 003's live implementation.
- Verified Deno 2.9.3 help contradicts an exact flag/order assumption above.
- A supplied Deno executable has the wrong version/target, configured denort
  bytes have the wrong native target/format, or Plan 006 cannot provision and
  prove the pinned official fixture/target through real execution. Mere local absence leaves this plan
  `IMPLEMENTED: awaiting required CI`; it is not permission to skip final
  acceptance or choose another version.
- Deno ignores `DENORT_BIN`, still attempts target-runtime download with a fresh
  cache, or denort availability cannot be reliably preflighted before staging.
  Report this as a V1 capability limitation; do not inspect opaque user caches.
- A supported fixture requires network/npm, inherited config/environment,
  cross-target output, raw args, or a library downloader.
- Deno needs minification without bundling; that state is intentionally
  unrepresentable.
- Offline denial cannot be proven, CI skips real coverage, direct and managed
  outcomes diverge after two focused attempts, or a gate fails twice.
