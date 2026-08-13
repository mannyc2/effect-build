# Plan 018: Consume the temporary bundle with exact Node SEA and atomically publish an executable

> **Executor instructions**: Follow this plan step by step. Implement the
> second half of one internal vertical slice: Plan 017's continuation-owned
> `JavaScriptBundleArtifact` is consumed by an exact selected Node 26.7.0 tool,
> checked against the selected tool's builtin and native-target facts, then
> validated and atomically published through Plan 016. The first and only
> supported proof lane is Linux x64 GNU. Never fall back to Node 24 postject,
> accept an untested Node range, download Node in library/runtime code, add a
> target option, or silently add macOS signing.
>
> **Drift check (run first)**:
>
> ```sh
> rg -q '^\| 015 \|.*\| DONE' plans/README.md
> rg -q '^\| 016 \|.*\| DONE' plans/README.md
> rg -q '^\| 017 \|.*\| DONE' plans/README.md
> test "$(node --version)" = "v24.14.1"
> git merge-base --is-ancestor e4257ccc84db70a6966c163700c9423659f9a4fc HEAD
> git diff --stat e4257cc..HEAD -- \
>   package.json pnpm-lock.yaml src test scripts tooling .github/workflows
> git status --short
> bun run check
> bun run test:unit
> bun run build && bun run test:architecture
> ```
>
> Expected: Plans 015-017 are `DONE`; ambient/orchestrator Node remains
> 24.14.1; the continuation bundle and opaque validated-publication seams match
> this plan; public exports remain exact; gates pass; and dirty work is
> understood. Node 24 is intentionally not the producer. Reconcile drift and
> STOP on a semantic mismatch.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED; HIGH if producer/orchestrator, target, or signing boundaries
  blur
- **Depends on**: Plans 015, 016, and 017
- **Category**: direction / feature / architecture / integration / CI
- **Planned at**: commit `e4257cc`, 2026-08-13
- **Goal kind**: bounded feature growth proving a second topology; still
  package-private
- **Required workflow receipt**: pending; exact `node-sea-v1` evidence is part
  of completion, not a public build receipt

## Why this matters

Plan 017's artifact pays rent only when a real downstream operation consumes
its format, syntax, observed externals, temporary path, and stage observation.
Node SEA supplies that consumer and a structurally different native path:
an esbuild structured library API (backed by its package-global native service)
followed by one selected CLI assembly step. The shared
surface is intentionally narrow: candidate allocation, native file validation,
digest, and publication—not preparation, execution, diagnostics, or a generic
producer interface.

Repository CI and the planning host use Node 24.14.1. Its SEA flow is
CommonJS-only and requires postject. Direct `--build-sea` plus ESM/CommonJS
first coexist at Node 25.7, but that is only a historical capability floor. SEA
is active-development and the first slice is pinned/tested, so runtime accepts
exactly Node **26.7.0**, not every version `>=25.7`.

## Fixed internal operation

Inside Plan 017's continuation:

```ts
Esbuild.withJavaScriptBundle(bundleInput, (main) =>
  NodeSea.createExecutable({
    main,
    outfile,
    cwd?,
    digest?,
    assets?,
  })
)
```

The operation input is exact and total:

```ts
interface NodeSeaAssetInput {
  readonly key: string
  readonly path: string
}

interface NodeSeaCreateInput {
  readonly main: JavaScriptBundleArtifact
  readonly outfile: string
  readonly cwd?: string
  readonly digest?: boolean
  readonly assets?: readonly NodeSeaAssetInput[]
}
```

Reject unknown object keys and malformed runtime values. `outfile`, optional
`cwd`, and each asset path must be non-empty NUL-free strings; `digest` must be
absent or boolean. Assets are a finite array of at most 256 entries. Keys are
non-empty, NUL-free, at most 1,024 UTF-8 bytes, and unique by exact string; each
resolved path must be a regular file. Resolve `cwd` once against the platform
process cwd, then resolve outfile and relative asset paths against that
normalized cwd; require the resolved cwd to be an existing directory before
candidate acquisition. Do not accept maps, records, globs, directories, or an
options bag as peer representations.

Tests/runtime composition provides the concrete package-private Esbuild and
NodeSea Layers plus one official Effect platform Layer at the outer boundary;
neither operation calls `Effect.runPromise` or constructs a platform runtime.

Conceptual operation type:

```ts
createExecutable(input): Effect.Effect<
  PipelineExecutableArtifact,
  NodeSeaCreateError,
  NodeSea
>
```

`NodeSea.createExecutable` opens/closes its own scoped config/candidate/child
lifecycle before returning a durable final result. The surrounding bundle
continuation stays alive until it completes. The operation accepts no target,
format, snapshot/cache, execArgv, download, signing, or publication mode.

### Private result

```ts
interface PipelineExecutableArtifact {
  readonly path: string
  readonly bytes: number
  readonly digest?: `sha256:${string}`
  readonly target: "linux-x64-gnu"
  readonly stages: readonly [
    JavaScriptBundleArtifact["stage"],
    {
      readonly operation: "assemble-node-sea"
      readonly tool: {
        readonly name: "node"
        readonly version: "26.7.0"
        readonly path: string
      }
    },
  ]
}
```

This is not a second public Artifact. The tuple reports observed work and a
selected physical tool; it does not claim closed inputs, content-identified
toolchains, hermeticity, reproducibility, attestation, or byte equality. Do not
add `tools`/`stages` beside public `Artifact.tool`.

### Exact selected Node service state

```ts
interface SelectedNodeSeaTool {
  readonly path: string
  readonly version: "26.7.0"
  readonly target: "linux-x64-gnu"
  readonly builtinSpecifiers: HashSet.HashSet<string>
}
```

The package-private Layer constructor is exact:

```ts
interface NodeSeaLayerOptions { readonly executable?: string }

layer(options: NodeSeaLayerOptions = {}): Layer.Layer<
  NodeSea,
  NodeSeaLayerError,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner
>
```

It captures those platform services so the provided `NodeSea` method has no
residual environment other than its service tag.

The Layer accepts an optional explicit absolute executable; otherwise it may
discover the command `node` on PATH, but acquisition succeeds only if the
resolved tool is exact 26.7.0 and `linux-x64-gnu`. For an explicit path,
canonicalize/stat/mode-check it before execution. For PATH discovery, the one
bounded metadata JSON probe must run the command first because current Effect
services expose no separate PATH resolver; require its absolute
`process.execPath`, then canonicalize/stat/mode-check/inspect that reported
file. In both cases run the one bounded `--help` capability probe through the
canonical path, not the unresolved command. The metadata probe uses the
selected Node's `node:module`
`builtinModules`/`isBuiltin` to emit a sorted exact set including valid bare and
`node:` spellings; the help probe must contain the exact `--build-sea` flag.
This selected tool is the authority for `main.observedExternalImports`; prefix
checks are insufficient. Convert the decoded array to Effect's immutable
`HashSet` and freeze the selected state; do not expose a mutable JavaScript Set.

Do not use `matchesObservation` or `targetFromObservation` for this first
slice: their missing-ABI fallback is intentionally broader than this proof.
Selected Node inspection must return exactly `{ format: "elf", os: "linux",
architecture: "x64", abi: "gnu" }`; the produced SEA must return the same exact
observation before `resolveTarget` returns literal `"linux-x64-gnu"`.

### Generated SEA config

```json
{
  "main": "/scope/bundle/main.mjs",
  "mainFormat": "module",
  "executable": "/explicit/node-26.7.0",
  "output": "/destination/.effect-build-.../app",
  "useSnapshot": false,
  "useCodeCache": false,
  "assets": {
    "explicit-key": "/resolved/regular/file"
  }
}
```

`mainFormat` is derived only from `main.format` (`cjs -> commonjs`, `esm ->
module`). `assets` is omitted when empty. Keys/paths are explicit; there are no
directory globs or implicit bundle outputs.

## Total preflight before the build child

Before `node --build-sea` starts:

- require Plan 017's package-private brand accessor to recognize the artifact
  identity and require its still-existing regular file;
- require literal `main.nodeSyntaxTarget === "node26.7"` and selected exact
  version 26.7.0;
- require every `main.observedExternalImports` specifier to be an exact member
  of the selected tool's `builtinSpecifiers` set;
- derive `mainFormat`; no independent format input exists;
- validate `digest` as absent/boolean and assets as a finite array with
  non-empty unique NUL-free keys and regular real paths;
- compute `resolvedDestination = resolveExecutableDestination(path, {
  outfile: input.outfile, cwd: resolvedCwd })` exactly once through Plan 016's
  pure policy, run every alias/containment check on that value, then acquire the
  candidate with `{ destination: resolvedDestination }`; require returned
  `ExecutableFile.path === resolvedDestination`;
- reject destination aliasing with `main.path`, selected Node path, or any
  asset. Also reject any destination equal to or lexically/canonically beneath
  `dirname(main.path)`, because that directory is bundle-Scope-owned and would
  delete the supposedly durable result. For a nonexistent destination, walk to
  its nearest existing ancestor, `realPath` that ancestor, append the unresolved
  suffix, and compare the prospective canonical path against the real bundle
  directory and source real paths. This catches symlinked existing parents
  before candidate acquisition/spawn;
- enforce the selected target and required host exactly
  `linux-x64-gnu`; no caller target exists;
- require every main/config/output/asset path emitted to JSON to be absolute;
- fix snapshot/code cache false and omit execArgv/flags; and
- perform no download, install, package-manager, postject, or signing action.

The produced executable must inspect as exactly the selected tool target before
publish. Merely deriving whatever target the output happens to contain is not
enough.

## Exact internal error ownership

Use live rc.108 `Schema.TaggedError` for serializable internal errors and
`Schema.Struct` for records. Define exactly:

```ts
type NodeSeaLayerError = NodeSeaToolNotFound | NodeSeaProbeFailed

NodeSeaToolNotFound { command: string }
NodeSeaProbeFailed { reason: string }

InvalidNodeSeaInput { reason: string }
NodeSeaPreparationFailed {
  path: string
  operation: "realpath" | "stat" | "make-config" | "write-config"
  reason: string
}
NodeSeaSpawnFailed { reason: string }
NodeSeaFailed {
  exitCode: number
  diagnostics: readonly Diagnostic[]
}

type NodeSeaCreateError =
  | InvalidNodeSeaInput
  | NodeSeaPreparationFailed
  | NodeSeaSpawnFailed
  | NodeSeaFailed
  | OutputMissing
  | OutputInvalid
  | OutputLocked
  | PublicationFailed
```

Layer acquisition owns not-found, explicit-path/realpath/stat/probe/version/
capability/host/selected-binary validation. All non-not-found acquisition
failures use `NodeSeaProbeFailed`. `createExecutable` owns total input/liveness/
syntax/builtin/assets/alias checks (`InvalidNodeSeaInput`), unexpected input or
config filesystem failures (`NodeSeaPreparationFailed`), child start/wait/drain
platform failure with no observed exit (`NodeSeaSpawnFailed`), and non-zero
completion (`NodeSeaFailed`). Reuse Process's exact 1 MiB-per-channel bounded
`Diagnostic` records for Node failure. Produced-file/native/target/digest/
rename errors stay owned by Plan 016's existing output lifecycle.

Esbuild errors compose outside NodeSea. Public compiler `Tool*`,
`InvalidDriverOptions`, `TargetUnsupported`, interruption, defects, and cleanup
finalizer failures are not members of `NodeSeaCreateError`.

## Verified current-state excerpts and primary evidence

Existing CLI execution is already scoped and bounded
(`src/standalone/internal/Process.ts:43-61`):

```ts
return Effect.scoped(
  Effect.gen(function*() {
    const handle = yield* ChildProcess.make(executable, argv, {
      shell: false,
      forceKillAfter: "2 seconds",
    })
    // stdout, stderr, and exit code are drained together
  })
)
```

Existing selected compiler state is narrow
(`src/standalone/internal/CompilerAdapter.ts:24-27`):

```ts
export interface DiscoveredCompiler<Name extends ToolName> {
  readonly artifactTool: ProviderTool<Name>
  readonly hostOs: OperatingSystem
}
```

Node gets its own concrete selected state because exact native target and
builtin set are real Node SEA requirements; do not widen `DiscoveredCompiler`
or public `ToolName`.

Current release publication explicitly enumerates required jobs
(`.github/workflows/release.yml`):

```yaml
publish-npm:
  needs: [quality, real-tools, publication-hosts, target-support]
```

Therefore Node SEA proof must be a mandatory release job and added to this
`needs` list; release integration is not optional.

Upstream evidence:

- [Node 24.14.1 SEA](https://nodejs.org/download/release/v24.14.1/docs/api/single-executable-applications.html)
  uses experimental config/postject and is CommonJS-only.
- [Node 26.7.0 SEA](https://nodejs.org/download/release/v26.7.0/docs/api/single-executable-applications.html)
  retains direct `--build-sea`, ESM/CommonJS `mainFormat`, explicit assets, and
  snapshot/code-cache controls.
- Node's documented macOS flow includes signing; `docs/architecture.md:92-99`
  excludes signing, so this plan stops rather than claiming macOS.
- Plan 016's package-private `inspectNativeExecutableFile` plus
  `ExecutableCandidate -> validateAndPublishExecutable -> ExecutableFile`
  lifecycle are the sole ranged-inspection and native validation/digest/rename
  owners. Node Layer maps inspection failure to `NodeSeaProbeFailed`; final
  publication maps it to `OutputInvalid`. Node SEA adds no generic callback or
  projector.
- Fable Max's abstract blob/multiple-child/Darwin flow was rejected against the
  direct Node 26.7 evidence. Its one-Scope direction survives as the concrete
  nested continuation/config/child cleanup topology.

## Exact producer pin and CI policy

Do not create a `tooling/node-sea.json` peer: `tooling/` is not packaged, no
runtime consumer reads that file, and a documentation-only capability floor
fails the field-rent test. `NodeSea.ts` owns three package-private literal
constants—version `26.7.0`, syntax `node26.7`, and target
`linux-x64-gnu`—used by Layer acquisition and operation preflight. Plan 017's
artifact literal and both workflow pins are deliberate projections;
architecture tests assert exact equality with those constants/source literals
so drift fails. Node 25.7 remains historical prose evidence only, never a
runtime field or accepted range.

No archive URL/checksum belongs in library code and
`provision-tool-assets.mjs` is not reused. CI may provision exact Node 26.7.0
with pinned `actions/setup-node`; environment provisioning is distinct from
runtime behavior.

The `node-sea` CI/release job must preserve independent axes in this exact
order:

1. checkout;
2. setup exact Node 26.7.0;
3. in a separate `run` step with `id: node26`, assert `node --version`, set
   `node_path="$(node -p 'process.execPath')"`, and append
   it with `echo "path=$node_path" >> "$GITHUB_OUTPUT"`;
   `actions/setup-node` itself has no
   binary-path output, and `$GITHUB_ENV` is not used;
4. setup exact Node 24.14.1 **afterward**;
5. assert ambient `node --version` is 24.14.1, the captured executable reports
   26.7.0, both paths differ, and the selected binary has the exact required
   ELF/Linux/x64/GNU observation;
6. setup pnpm/install under ambient Node 24; and
7. run exact `pnpm verify`, then `pnpm test:integration:node-sea` with the
   captured producer path as a step-local `EFFECT_BUILD_NODE_SEA_BIN` only on
   the integration step.

A second setup-node call must not silently make Node 26 the orchestrator.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Ambient baseline | `node --version` | `v24.14.1` outside isolated SEA setup |
| Type/unit | `bun run check && bun run test:unit` | all explicit suites, including Node SEA, pass |
| Focused fake tests | `bun x vitest run test/unit/node-sea.test.ts test/unit/esbuild-node-sea-pipeline.test.ts` | pass without locally installed Node 26 |
| Architecture | `bun run build && bun run test:architecture` | build ignored `dist`, then exact private API, scripts, CI/release, receipt contracts pass |
| Optional local real proof | `EFFECT_BUILD_NODE_SEA_BIN=/absolute/node-26.7.0 bun run test:integration:node-sea` | Linux x64 CJS/ESM/assets vertical slice passes |
| Deterministic gate | `bun run verify` | pass under Node 24 orchestrator and includes new unit tests |
| Workflow receipt | verifier command in Step 8 | exact successful source SHA and all `node-sea-v1` jobs |

Local real proof is optional when an approved exact binary/Linux host is not
already available; absence is not authorization to download. The required CI
job/receipt is the acceptance gate.

## Scope

**In scope**:

- `src/standalone/internal/NodeSea.ts` (create; owns exact Layer/service state,
  errors/unions, result type, probe/preflight/config, and operation)
- `test/unit/node-sea.test.ts` (create)
- `test/unit/esbuild-node-sea-pipeline.test.ts` (create)
- `test/integration/node-sea.test.ts` (create)
- `test/fixtures/node-sea/` (create)
- `package.json` (explicit unit/integration scripts only)
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `scripts/verify-workflow-receipt.mjs`
- `test/architecture/workflow-receipt.test.ts`
- `test/architecture/generated-and-ci.test.ts`
- `test/architecture/import-boundaries.test.ts`
- `test/architecture/public-api.test.ts` (no-growth assertion only)
- `plans/018-build-node-sea-executable.md` (receipt/status after source CI)
- `plans/README.md` (status/receipt reconciliation only)

**Out of scope**:

- Root/Bun/Deno exports; public Node/esbuild subpaths; public Artifact/error/
  target/provenance; Bun/Deno or matrix behavior.
- Node 24 postject/blob compatibility, postject dependency, automatic runtime
  Node download, runtime package-manager invocation, or fallback.
- Any Node version other than 26.7.0; cross-target, macOS/Windows, signing,
  snapshots, code cache, execArgv, flags/options bag, implicit assets.
- Changes to `ExecutableLifecycle.ts`, `ToolDiscovery.ts`, or `Process.ts`.
  Consume their Plan 016/current concrete APIs unchanged; STOP if a bug rather
  than the planned Node module requires another implementation plan.
- Generic producer/compiler adapter, DAG, registry, executor, **build** receipt,
  SemanticPlan, BoundExecutionPlan, cache/CAS, remote/container execution.
- `.repos/effect` or `.agent-sources/effect` modification.

The `node-sea-v1` workflow receipt verifies CI status only. It is not the public
build receipt rejected by this program.

## Git workflow

- Suggested branch: `advisor/018-node-sea-executable`.
- Suggested commits: `feat: add exact internal Node SEA operation`, then
  `ci: require pinned Node SEA proof`.
- Do not publish, tag, push, or open a PR without operator instruction.

## Steps

### Step 1: Freeze scripts, literal pins, private surface, and receipt contracts

Add package scripts:

- append `test/unit/node-sea.test.ts` and
  `test/unit/esbuild-node-sea-pipeline.test.ts` to the explicit `test:unit`;
- add `test:integration:node-sea` with exact
  `vitest run test/integration/node-sea.test.ts`.

Extend architecture tests before implementation to require:

- exact NodeSea source literals, Plan 017 syntax literal, and workflow pin
  equality, with no peer `tooling/node-sea.json`;
- no public `NodeSea`, `Esbuild`, pipeline artifact, `stages`, or new key;
- exactly one non-skipping `node-sea` job in CI and release;
- exact setup/capture/restore/assertion ordering described above;
- release `publish-npm.needs` includes `node-sea`; and
- no `latest`, `continue-on-error`, library download, or public support-matrix
  claim.

Extend Plan 015's versioned workflow verifier with `node-sea-v1`, defined as
the full `effect-v1` required-job set plus exactly one required job named
`node-sea`. Preserve default/`target-v1` and `effect-v1`. Add contract tests for
unknown/duplicate contract arguments and missing, duplicate, failed, skipped,
or incomplete `node-sea` jobs.

Use the exact receipt prefix `Node SEA evidence:`. Do not place any line in this
plan that begins with that prefix until the one real receipt is recorded;
`parseReceipt` intentionally requires exactly one matching line.

**Verify**:

```sh
bun run build && bun run test:architecture
```

Expected before product/workflow implementation: failures are only the exact
missing NodeSea source literals/private module and missing job/order/release
dependency; public no-growth and verifier unit cases pass.

### Step 2: Establish the Linux characterization lane before implementation

Create the raw direct-Node portion of `test/integration/node-sea.test.ts` before
importing `NodeSea.ts`. On an operator-provided exact Linux binary, run:

```sh
"$EFFECT_BUILD_NODE_SEA_BIN" --version
"$EFFECT_BUILD_NODE_SEA_BIN" --help | rg -- '--build-sea'
```

Build minimal CJS and ESM configs with absolute main/executable/output paths,
snapshots/cache false, and one asset. Execute outputs and inspect both selected
Node and outputs through the repository's native parser. Freeze in
`test/integration/node-sea.test.ts`:

- exact argv `node --build-sea /abs/config.json`;
- config spellings/format mapping;
- builtin probe set behavior for bare, `node:`, valid subpath, and invalid
  builtin-shaped specifiers;
- exact selected/output `{ format:"elf", os:"linux", architecture:"x64",
  abi:"gnu" }` equality;
- asset lookup;
- malformed config/nonzero diagnostics; and
- existing-output behavior.

If that exact local host/tool is unavailable, add the early `node-sea` CI job
now using the dual-Node step-output sequence above. At this stage the job runs
the raw characterization test under ambient Node 24 with only the integration
step receiving `EFFECT_BUILD_NODE_SEA_BIN`. With explicit push authority,
commit/push and observe it. Do not begin Step 3 until either the local command
or that exact CI characterization is green. Without an approved local tool and
without push authority, STOP and report the evidence gate; do not download a
tool or implement against assumptions.

**Verify one evidence route**:

```sh
EFFECT_BUILD_NODE_SEA_BIN=/absolute/node-26.7.0 \
  bun run test:integration:node-sea -- --reporter=verbose
```

Expected: CJS, ESM, assets, builtin authority, and native target pass. If exact
26.7 behavior differs, STOP; do not float the version. Record the preliminary
CI run URL/SHA in executor notes, not as the final receipt because source will
still change.

### Step 3: Implement exact selected/discovered Node capability

Implement private `NodeSea` `Context.Service`/Layer, separate from
`CompilerAdapter`:

- for an explicit absolute path, realpath/stat/mode-check before probing; for a
  PATH command, run the metadata probe first, require its absolute reported
  `process.execPath`, then realpath/stat/mode-check/inspect that file;
- run exactly one bounded JSON metadata probe reporting exact version/path plus
  canonical sorted builtin specifiers constructed by selected Node's
  `node:module` authority, and one bounded `--help` probe requiring the exact
  `--build-sea` flag through the canonical reported path;
- inspect the selected executable bytes through Plan 016's pure/file native
  logic and require the exact ELF/Linux/x64/GNU observation, without target
  fallback/wildcard matching;
- require exact `26.7.0`, direct capability, and literal
  `linux-x64-gnu` before service
  construction; `25.7.0` is not an accepted runtime version; and
- capture FileSystem/Path/Crypto/ChildProcessSpawner in the Layer, matching
  existing provider boundaries. The service method requires no residual
  platform environment.

Use `Effect.fn`/`Effect.gen` and official platform Layers at test/application
boundaries. Do not import `node:*` under `src/`.

**Verify**:

```sh
bun run check
bun x vitest run test/unit/node-sea.test.ts
```

Expected: explicit/PATH discovery, exactly one metadata plus one capability
probe per Layer, exact version/capability/ELF+GNU target, executable mode, malformed
output, symlink/non-file, builtin set, and no-download cases pass.

### Step 4: Implement total preflight and scoped config

Decode the exact operation/asset shapes once and reject unknown keys. Enforce
the complete preflight table above, including recognition through Plan 017's
package-private brand accessor, literal syntax equality, exact builtin
membership, asset bounds/uniqueness/realpaths, destination-source alias and
scoped-bundle-directory containment rejection (lexical plus prospective
canonical), and selected exact ELF/GNU target. No child or candidate is
acquired for known-invalid input.

After preflight, enter `Effect.scoped`, acquire Plan 016's opaque
`ExecutableCandidate` with the already-resolved absolute destination (no cwd or
outfile re-resolution), create a separate scoped config directory/file, and
set config `output` to `candidate.staged`. Hard-code snapshots/cache false.

Unit tests assert zero Node build spawns for every invalid combination and one
spawn only after valid preflight. Test existing destination symlinks/aliases to
Node, main, and assets; a sibling destination under the bundle directory; and
a destination reached through a symlinked parent into the bundle directory.

**Verify**:

```sh
bun x vitest run test/unit/node-sea.test.ts
```

Expected: total preflight leaves no config/staging/destination changes and no
spawn; valid input emits one exact config.

### Step 5: Run one Node child and reuse lifecycle unchanged

Invoke selected Node once with `--build-sea` and absolute config, passing the
single normalized cwd to `runProcess`. Reuse scoped `runProcess`; map platform
failures/nonzero completion to the exact errors.

On zero exit, call Plan 016's one `validateAndPublishExecutable` operation with
a `resolveTarget` function accepting only the exact ELF/Linux/x64/GNU
observation and returning literal `linux-x64-gnu`. It computes optional digest
once, runs hidden rename only after validation, and returns
`ExecutableFile`. Node SEA then projects that fact value into exact
`[main.stage, nodeStage]`.

Do not change Plan 016's lifecycle signature, add a result callback, duplicate
inspection/digest/rename, or weaken provider correlation.

**Verify**:

```sh
bun run check
bun x vitest run test/unit/node-sea.test.ts \
  test/unit/esbuild-node-sea-pipeline.test.ts \
  test/unit/standalone-publication.test.ts
! rg '\.commit' src/standalone/internal
test "$(rg -l 'fileSystem\.rename' src/standalone/internal | wc -l | tr -d ' ')" = "1"
```

Expected: one hidden rename owner; fake Node success/nonzero/spawn/missing/
invalid/wrong-target/publication paths pass; current providers stay green.

### Step 6: Prove the complete continuation topology

Test `withJavaScriptBundle(..., main => NodeSea.createExecutable(...))`:

- CJS/ESM/explicit asset success and execution;
- bundle failure means Node never starts;
- invalid observed external fails before Node build;
- Node typed failure removes bundle/config/candidate and preserves destination;
- invalid/wrong-target native output never publishes;
- interruption during esbuild cancels/disposes and starts no Node;
- interruption during Node reaps child and closes bundle/config/candidate;
- success leaves final executable after both scopes close while temp paths are
  gone; and
- rename-race interruption follows Plan 016's point of no return, not rollback.

Fake services own deterministic failure/interruption; exact Node 26.7 owns real
Linux execution.

**Verify**:

```sh
bun x vitest run test/unit/esbuild-node-sea-pipeline.test.ts
```

When the already-approved exact local Linux binary is present, additionally
run `EFFECT_BUILD_NODE_SEA_BIN=/absolute/node-26.7.0 bun run
test:integration:node-sea`. Otherwise record `CI EVIDENCE REQUIRED`, not `PASS`
or `SKIP`; Step 7 and the final receipt are mandatory. Expected: deterministic
suite passes everywhere; whichever real evidence route runs executes CJS/ESM/
assets and inspects exact ELF/Linux/x64/GNU.

### Step 7: Wire mandatory CI and release proof

Complete/upgrade the early characterization `node-sea` job and implement the
same exact order in release. CI and release use pinned setup-node to provision
exact 26.7.0, expose its absolute path from the separate `id: node26` capture
step described above, then
restore 24.14.1 as ambient orchestrator. After
`pnpm install --frozen-lockfile`, run exact `pnpm verify` with no SEA env and
then `pnpm test:integration:node-sea` under Node 24 with a step-local
`EFFECT_BUILD_NODE_SEA_BIN: ${{ steps.node26.outputs.path }}` only on that test.

Add `node-sea` to release `publish-npm.needs`. Parse workflow structure in
architecture tests; do not rely on loose text search. Keep public
`tooling/support-matrix.json` unchanged.

**Verify**:

```sh
bun run build && bun run test:architecture
bun run verify
git diff --check
git status --short
```

Expected: deterministic Node-24 gates include all new unit tests; workflows pin
and separate both Node axes; release cannot publish without Node SEA; public
exports/support claims remain unchanged.

### Step 8: Record exact workflow evidence

Commit the complete source/workflow change. With explicit push authority,
observe the required CI workflow for that exact source SHA. Append exactly one
physical line consisting of the prefix `Node SEA evidence:`, one space, a
`https://github.com/<owner>/<repo>/actions/runs/<positive-id>` URL, one space,
`@`, one space, and the 40-character lowercase source SHA. No placeholder line
may begin with the prefix before this step.

Verify:

```sh
node scripts/verify-workflow-receipt.mjs \
  --receipt-file plans/018-build-node-sea-executable.md \
  --prefix 'Node SEA evidence:' \
  --contract node-sea-v1
node_sea_sha="$(sed -n 's/^Node SEA evidence: https:\/\/github.com\/.* @ \([0-9a-f]\{40\}\)$/\1/p' plans/018-build-node-sea-executable.md)"
test -n "$node_sea_sha"
git diff --exit-code "$node_sea_sha" -- \
  package.json pnpm-lock.yaml src test scripts tooling .github/workflows
```

Expected: exact run URL/path/SHA/success and every `node-sea-v1` required job
verify; source/workflow paths have not changed since that SHA. Only then mark
Plan 018 `DONE` in `plans/README.md`. Without push authority leave it in
progress; local success is not a substitute.

## Test plan

- Layer: explicit/PATH, one metadata and one help probe, absolute/regular/
  executable/realpath, exact version, direct capability, exact target, builtin
  set, malformed probe, no download.
- Preflight: live artifact, syntax/format, observed externals, outfile/cwd/
  digest, assets, alias checks, fixed snapshot/cache, no target/flags.
- CLI: exact argv/config, bounded diagnostics, spawn/nonzero, missing/invalid/
  wrong-target output.
- Lifecycle: digest, replace/locked/failed rename, point of no return, one owner.
- Scope: every success/failure/defect/interruption across esbuild, config,
  child, candidate, and final output.
- Real Linux: exact 26.7 CJS/ESM/assets/execution/target equality.
- Architecture: exact private surface, scripts, dual-Node order, release
  dependency, receipt contract.

## Done criteria

- [ ] Node 24.14.1 remains orchestrator; exact Node 26.7.0 is separately
      selected and the only accepted producer on exact Linux target.
- [ ] Selected Node's binary target and builtin authority are observed once;
      main externals and exact ELF/Linux/x64/GNU output are checked against
      them without wildcard ABI fallback.
- [ ] Runtime/library performs no Node download, postject, package-manager, or
      signing action.
- [ ] Node SEA consumes only a live callback artifact, derives format, and has
      no target/snapshot/cache/flags modes.
- [ ] Destination cannot alias Node, main, or assets under the defined path/
      realpath policy or reside within the scoped bundle directory through a
      lexical or symlinked-parent path.
- [ ] One child writes to the opaque candidate; Plan 016 alone validates,
      digests, and publishes.
- [ ] Temp bundle/config/candidate state disappears on all exits; committed
      final executable persists.
- [ ] Internal result has exact two-stage observation; public Artifact remains
      unchanged.
- [ ] Explicit tests are in full gates; exact CI/release job is required and
      `node-sea-v1` receipt verifies the source SHA.
- [ ] No out-of-scope/user-owned work changed.

## STOP conditions

Stop and report; do not improvise if:

- Exact Node 26.7 changes/lacks direct SEA, ESM/CJS, asset, builtin-probe, or
  config behavior.
- Only Node 24, postject/blob injection, an untested Node version, or automatic
  runtime download is available.
- Neither an approved exact local Linux tool nor authorized preliminary CI can
  establish the Step 2 characterization before implementation.
- First proof must be macOS/Windows, cross-target, or signed.
- Selected Node target/builtin authority or output target equality cannot be
  decided before publication.
- Syntax/external/format compatibility cannot be decided before build.
- Reusing Plan 016 requires lifecycle redesign, duplicated validation/digest/
  rename, or generic adapter/projector.
- A public export/Artifact change/matrix mode/build-receipt protocol appears.
- Required CI/release passes only via skip/continue/latest/unpinned tool.
- Out-of-scope change or verification fails twice after reasonable correction.

## Maintenance notes

- Producer and orchestrator are independent axes; tests must keep them
  independently asserted.
- Upgrade the exact Node version only with docs/help, config, builtin, CJS/ESM/
  assets/native suite, all source literals/projections, both workflows, and the
  receipt contract together.
- macOS signing, Windows, cross-target, snapshots, and code cache are later
  operations/decisions, not booleans to append.
- Stage observations must never be described as hermetic, reproducible,
  attested, or content-identified without future evidence.

## Compression ledger

| Accepted primitive | Invalid state/workflow removed | Rejected expansion |
|---|---|---|
| exact selected Node state | accidental ambient Node 24, untested version, wrong host/builtin authority | version range, registry, runtime download |
| selected target equality | producer/output cross-host mismatch | public `ExecutionTarget` |
| format derived from bundle | bundle/SEA format mismatch | caller `mainFormat` |
| observed-external builtin check | bogus/unexpected runtime external reaches Node | false esbuild closure claim |
| destination/source disjointness | final rename can replace producer/input path | publish-mode option |
| explicit assets | implicit filesystem dependency | discovery/glob/plugin |
| shared opaque lifecycle | second validation/digest/rename workflow | universal producer adapter |
| exact stage tuple | misleading singular internal provenance | immediate public Artifact/build receipt |
