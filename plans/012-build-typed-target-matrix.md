# Plan 012: Build the typed executable target matrix

> **Executor instructions**: Execute only after Plans 011 and 013 are `DONE`.
> Plan 013's pinned target evidence must be green before matrix work begins. This plan
> adds one homogeneous target-matrix lifecycle by reusing the existing single
> compile operation; it must not grow into a generic build graph, arbitrary
> cell runner, or publication transaction. Add deterministic tests first. Run
> every verification command and honor every STOP condition. When complete,
> update only Plan 012's status row in `plans/README.md`, unless a coordinating
> reviewer owns the index.
>
> **Drift check (run first)**:
>
> ```sh
> rg -q '^\| 011 \|.*\| DONE \|$' plans/README.md
> rg -q '^\| 013 \|.*\| DONE \|$' plans/README.md
> git diff --stat eb2995c2597f6765302de2e223b643f8b9946fde..HEAD
> git status --short
> pnpm verify
> ```
>
> Expected: Plans 011 and 013 are complete, their declared internal target and
> evidence changes are the only scoped, reviewed changes since `eb2995c`, and
> `pnpm verify` exits 0. Compare the current-state excerpts and final internal
> provider tables against the live tree; unexplained drift is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `plans/013-require-cross-target-support-evidence.md`
- **Category**: feature / correctness / architecture / tests
- **Planned at**: commit `eb2995c`, 2026-08-12
- **Effect baseline**: `effect@4.0.0-beta.107`

## Why this matters

Callers can already compose single builds with `Effect.all`, but that
composition does not know build-domain invariants. It is fail-fast, attributes
an error only positionally, lets callers drift on target filenames and Windows
suffixes, and permits multiple targets to overwrite one destination.

The matrix earns a library operation by owning exactly the missing domain
policy: a provider-typed non-empty target set, canonical output names, complete
preflight before build side effects, bounded structured concurrency, all
typed failures with target attribution, and an honest record of artifacts that
were already published. Every cell still runs the existing interruption-safe,
atomic single-output lifecycle.

## Final contract implemented privately by this plan

Plan 013 has already made support evidence green. Plan 014 publishes the
top-level provider functions. This plan defines and implements their final
contract internally; do not invent a temporary alternative API.

### Matrix input

Each provider gets one concrete alias of this conceptual shape:

```ts
interface CompileExecutableMatrixInput<SupportedTarget, Options> {
  readonly entrypoint: string
  readonly outdir: string
  readonly name: string
  readonly targets: readonly [SupportedTarget, ...SupportedTarget[]]
  readonly cwd?: string
  readonly digest?: boolean
  readonly options?: Options
  readonly concurrency?: number
}
```

The public provider aliases hide both generic parameters. A matrix has one
entrypoint, one compiler/options set, and one logical artifact name. It varies
only the explicitly selected compiler's target.

Rules:

- `targets` is non-empty and ordered. Duplicate targets are invalid.
- `name` is an ASCII release-artifact stem matching
  `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`. The generated target suffix means even
  a stem such as `CON` is not itself a Windows reserved basename. Do not add a
  second platform-specific name policy or a naming callback.
- `outdir` is resolved against `cwd` by the captured Effect `Path` service,
  matching single-build path resolution.
- `concurrency` defaults to `1` and, when present, must be a positive safe
  integer. Do not accept `"unbounded"`; compiler processes are CPU/memory heavy
  and each can retain up to 2 MiB of diagnostics.
- `digest` and provider `options` apply to every cell.
- Per-target options, arbitrary cell IDs, multiple entrypoints, per-cell
  outfiles, and native target-token overrides are deliberately absent. Callers
  needing those variants compose `compileExecutable` themselves.

Ordinary runtime-invalid data must produce typed preflight issues rather than a
defect. Require a non-null object; non-empty string `entrypoint` and `outdir`;
string `cwd` when present; boolean `digest` when present; an array for `targets`;
and the field-specific rules above. Reject NUL in path strings. Ignore excess
object keys just as the scalar TypeScript API does; strict record decoding is
not a build invariant. A hostile Proxy/getter that throws, or an internal
validation bug, remains a defect and aborts traversal. Entrypoint existence and
compiler project resolution remain the compiler's job, not matrix preflight.

### Canonical output naming

The matrix owns final names:

```text
<resolved outdir>/<name>-<canonical target><suffix>
```

where suffix is `.exe` exactly for Windows targets and empty otherwise. For:

```ts
{
  outdir: "dist",
  name: "app",
  targets: ["macos-aarch64", "linux-x64-gnu", "windows-x64"]
}
```

the final paths are:

```text
dist/app-macos-aarch64
dist/app-linux-x64-gnu
dist/app-windows-x64.exe
```

This convention is why the matrix is not an array of `{ target, outfile }`
cells: filename drift, target-triple drift, forgotten `.exe`, and destination
collisions are part of the product problem. Single-build `outfile` remains the
escape hatch for custom layouts and is unchanged.

Preflight still computes and compares all normalized destinations before
starting a cell. The canonical formula should make collision impossible after
duplicate-target rejection, but the defensive assertion protects future
catalog changes.

### Success and failure

On total success, return a readonly array of provider-specialized Artifacts in
the exact input-target order.

Typed cell failures are **collect-all**, not fail-fast. Run every target unless
the fiber is interrupted or a defect aborts structured traversal, then fail
once with a typed aggregate carrying both sides:

```ts
interface CellFailure {
  readonly tool: "bun" | "deno"
  readonly target: SupportedTarget
  readonly path: Artifact.AbsolutePath // normalized intended final destination
  readonly error: BuildError.BuildError
}

class MatrixFailed {
  readonly _tag: "MatrixFailed"
  readonly artifacts: readonly ProviderArtifact[]
  readonly failures: readonly [CellFailure, ...CellFailure[]]
}
```

Both `artifacts` and `failures` preserve the relative order of their targets in
the input. A target is in exactly one array. `MatrixFailed` is an Effect typed
failure, so a release job fails naturally while callers can catch it and
render every target-attributed diagnostic.

Whole-matrix input defects fail before any output directory, staging
directory, render, or build child with a separate tag:

```ts
class InvalidMatrixInput {
  readonly _tag: "InvalidMatrixInput"
  readonly issues: readonly [MatrixIssue, ...MatrixIssue[]]
}
```

`MatrixIssue` has a closed `field` literal: `input`, `entrypoint`, `outdir`,
`name`, `targets`, `cwd`, `digest`, `options`, `concurrency`, or `output`. It
also has a non-empty `reason`, optional non-negative safe-integer `index`, and
optional target/value context represented as a safe string.
Do not create one error class per validation branch. Matrix errors live in a new root
`MatrixError` schema/namespace and do not expand the existing `BuildError`
union; exhaustive single-build handlers must remain source-compatible.
The future root runtime schema is the serializable cross-provider envelope. Add
a package-private projection such as `MatrixErrorFor<Name, SupportedTarget>` so
the internal Bun/Deno runners' cell targets and partial artifacts stay
provider-narrowed without another runtime schema. Plan 014 is the first place
that exposes provider aliases or the root namespace.
Use beta.107 `Schema.NonEmptyArray` for `issues` and `failures`, the existing
`Artifact.ToolName`/`Target.Target` schemas for cell identity, and
`Artifact.AbsolutePath` for `CellFailure.path`. Correlate tool plus target from
the provider tables in the root runtime union, just as Plan 014 will do for
Artifact. Empty decoded aggregates, relative paths, and Deno-musl cell failures
must be rejected, not merely discouraged by TypeScript tuple notation.

Refine decoded `MatrixFailed` values so every artifact/failure target is unique
across both arrays, every path is unique across both arrays, and any nested
BuildError carrying a `tool` field agrees with `CellFailure.tool`. These are
constructor invariants, not optional decoder hygiene. Relative ordering within
each array is guaranteed by live construction; a decoded value cannot prove
ordering against an absent original input and must not claim to.

### Atomicity and interruption

Atomic replacement remains **per artifact**. There is no multi-file
transaction, rollback, or delete-on-failure:

- successful cells stay published when other cells fail;
- `MatrixFailed.artifacts` reports those committed outputs;
- a rollback must not be attempted because it could destroy destinations that
  existed before this call; and
- parent-fiber interruption remains interruption, kills/reaps active compiler
  children through their scopes, cleans their staging, and starts no queued
  cells afterward. It is never encoded as either matrix error tag; and
- a defect likewise remains a defect, interrupts active siblings, prevents
  queued cells from starting, and returns no aggregate value.

Already committed outputs can remain after interruption or defect. Because
neither becomes a value, the operation cannot return an aggregate in those
cases; this is an explicit limitation, not a hidden transaction claim.

## Minimal primitive set

Add only:

1. `CompileExecutableMatrixInput` — homogeneous target selection and canonical
   name policy;
2. `MatrixIssue` / `InvalidMatrixInput` — whole-request preflight failure;
3. `CellFailure` / `MatrixFailed` — contextual all-settled failure; and
4. `compileExecutableMatrix` — bounded traversal over the existing single
   compile lifecycle.

Reuse the provider Target, provider Options, Compiler Layer/service, root
Artifact/BuildError schemas, target catalog, native validator, process runner,
and atomic output implementation. Do not add `MatrixPlan`, `MatrixExecutor`, a
scheduler service, a result store, events, cache keys, or publication records.

## Current state

- `README.md:49-73` demonstrates two manually constructed compile Effects in
  `Effect.all`, explicitly documents fail-fast behavior, and leaves target
  attribution/naming to the caller.
- `src/standalone/Driver.ts:15-18` currently gives the Compiler service only one
  scalar compile method.
- `src/standalone/internal/CompilerEngine.ts` closes over one discovered tool
  and captured platform services, then validates, stages, spawns, performs
  ranged native inspection, hashes, commits, and returns one Artifact. This is
  the cell lifecycle to reuse rather than fork.
- `src/standalone/internal/AtomicOutput.ts:30-60` resolves and commits one
  destination independently.
- `test/unit/standalone-publication.test.ts:251-260` deliberately proves that
  two independent single calls may race on one outfile; the matrix must add a
  stronger preflight invariant without changing single-call behavior.
- `src/standalone/internal/Process.ts:7,43-59` caps each stdout and stderr at 1
  MiB and scopes one child process.
- Installed `Effect.forEach` preserves input order, defaults concurrency to 1,
  and bounds numeric concurrency at
  `node_modules/effect/src/Effect.ts:1050-1150` and
  `node_modules/effect/src/internal/effect.ts:4612-4685`.
- Installed `Effect.partition` runs all effects but separates bare errors from
  successes, losing cell context unless explicitly wrapped
  (`node_modules/effect/src/Effect.ts:500-590`). Do not use it directly.
- The installed `Effect.result`/equivalent captures typed failures while
  preserving defects and interruption; use that property for per-cell
  collection rather than `catchAllCause`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm check` | exit 0 |
| Matrix unit tests | `pnpm exec vitest run test/unit/standalone-matrix.test.ts` | all matrix cases pass |
| Existing lifecycle | `pnpm test:unit` | old and new units pass |
| Type contracts | `pnpm test:types` | all assertions/suppressions pass |
| Architecture | `pnpm test:architecture` | boundaries and docs remain green |
| Full deterministic gate | `pnpm verify` | exit 0 |

## Suggested executor toolkit

- Use `effect-ts` if available for pinned `Effect.forEach`, typed result
  capture, Schema error classes, Scope, and Layer patterns.
- Use `test-design-review` after the matrix tests exist; the concurrency and
  interruption assertions must test observable behavior rather than mocks that
  cannot race.

## Scope

**Create:**

- `src/standalone/MatrixError.ts`
- `src/standalone/CompileExecutableMatrix.ts`
- `test/unit/standalone-matrix.test.ts`
- `test/fixtures/matrix/fake-compiler.mjs` if the existing publication fixture
  cannot deterministically model delay, failure, target header, and sentinel
  behavior

**Modify:**

- `src/standalone/internal/CompilerAdapter.ts`
- `src/standalone/internal/CompilerEngine.ts`
- `src/standalone/internal/BunAdapter.ts`
- `src/standalone/internal/DenoAdapter.ts`
- `test/unit/standalone-contract.test.ts`
- `test/unit/standalone-bun.test.ts`
- `test/unit/standalone-deno.test.ts`
- `test/unit/standalone-publication.test.ts` only if a shared helper must be
  extracted without changing assertions
- `test/architecture/import-boundaries.test.ts`
- `test/testkit/standaloneDriverContract.ts`
- `typetest/standalone-contract.tst.ts`
- `package.json` only to include the new unit test in `test:unit`
- `plans/README.md` only for Plan 012's status

**Out of scope:**

- exporting `compileExecutableMatrix` or root `MatrixError` from package entry
  points; Plan 014 owns the coordinated public cut;
- adding the matrix method to the publicly named `CompilerService` /
  `Bun.Compiler` / `Deno.Compiler` declarations; Plan 014 wires the completed
  package-private runner into that service and its convenience function;
- changing the provider target tables from Plan 011 or the advertised support
  set/evidence from Plan 013;
- per-cell `outfile`, name templates/callbacks, per-target options, multiple
  entrypoints, variants, compiler selection, or arbitrary IDs;
- fail-fast typed failures, matrix-wide rollback, deleting successful outputs,
  or translating interruption;
- progress/event streams, watch mode, caching, task graphs, release upload,
  signing, container builds, or type checking; and
- raw Node imports or `Effect.runPromise` under `src/`.

## Git workflow

- Continue on the current branch; if creating a branch, use
  `codex/012-target-matrix`.
- Suggested commit: `feat: add typed executable target matrix`.
- Do not push, tag, publish, or open a PR unless separately instructed.

## Steps

### Step 1: Freeze matrix types and error schemas

Create contract/type tests for the exact input keys, provider target/options
correlation, readonly non-empty target tuple, provider artifact success, and
the separate matrix error union. Prove that single compile still fails only
with `BuildError.BuildError` and does not acquire the two matrix tags.

Implement `MatrixError.ts` with schema-encodable `MatrixIssue`,
`InvalidMatrixInput`, contextual `CellFailure`, `MatrixFailed`, and their
union. Add only package-private provider-specialized projections, keep one
runtime schema representation, and do not edit provider modules or expose
provider MatrixError aliases before Plan 014.

Use `Schema.NonEmptyArray` and `Artifact.AbsolutePath` exactly as specified.
Add decode rejection for empty `issues`, empty `failures`, and relative cell
paths. Round-trip a `MatrixFailed` with multiple nested BuildError tags and
partial provider-correlated artifacts. Reject duplicate/overlapping targets,
duplicate paths, and a nested error whose tool conflicts with its cell.

Update the import-boundary architecture test to encode the narrow exception:
compiler-neutral schema/engine modules may import the pure package-private
`BunTarget` / `DenoTarget` contract projections for correlation, but may not
import `src/Bun.ts`, `src/Deno.ts`, either adapter, discovery, or provider
execution code. Test the exact allowlisted importing modules so the exception
cannot spread silently. Also prove the pure target modules themselves have only
the imports allowed by Plan 011. Plan 014 updates architecture prose to match.

Implement the shared matrix input and package-private runner types in
`CompileExecutableMatrix.ts`. Keep `Driver.CompilerService`, Bun/Deno service
declarations, and provider entry points scalar-only in this plan. An internal
operation factory may construct both runners, but `makeCompilerService` must
return only `{ compileExecutable }` until Plan 014. This prevents a supposedly
unpublished matrix from leaking through `yield* Bun.Compiler` declarations.

**Verify**:

```sh
pnpm check
pnpm test:types
pnpm exec vitest run test/unit/standalone-contract.test.ts
```

Expected: exact matrix types compile, schema round trips pass, and the
single-build error union remains unchanged.

### Step 2: Split pure option validation from argv rendering

Matrix preflight must reject bad runtime options before any cell stages or
spawns. Refactor the private adapter boundary so each adapter:

1. validates unknown public options with a total expected-failure return such
   as `{ _tag: "Valid", value } | { _tag: "Invalid", error:
   InvalidDriverOptions }` rather than throwing for ordinary invalid data;
2. renders argv from validated options, resolved provider target, and the real
   staged path; and
3. cannot discover a new target or output path during rendering.

The Deno validated representation may retain pre-rendered permission args;
Bun's may be its checked option record. Generic machinery stays private.
Update single compile to validate options before acquiring atomic output. This
strengthens side-effect ordering without changing valid argv.

Extract one private `compilePreparedCell` from the current engine. It receives
an optional resolved requested-target descriptor, validated options, and exact
outfile, and owns the existing
staging/process/ranged-native-validation/digest/commit lifecycle. Scalar
compilation validates once and may pass no requested target; native inspection
then resolves the observed target through the provider table as fixed by Plan
011. Every matrix cell passes its explicit resolved descriptor. Matrix preflight
validates the shared options once and calls the same prepared-cell primitive for
every target. Do not call the public scalar method N times and do not fork its
lifecycle. Expected invalid option data produces `InvalidDriverOptions` for the
scalar operation. Matrix preflight converts that typed validation result into
an `InvalidMatrixInput` issue with `field: "options"`; it never starts a cell.
An unexpected throw/defect from validation or rendering remains a defect.

Add assertions that invalid single and matrix options cause zero output
directory creation, zero render after the rejected validation boundary, and
zero compile spawn. Add a validator-call counter proving one call for a
multi-target matrix. Probe during Layer construction is not a build child and
remains allowed.

**Verify**:

```sh
pnpm exec vitest run test/unit/standalone-bun.test.ts test/unit/standalone-deno.test.ts test/unit/standalone-publication.test.ts
pnpm check
```

Expected: all existing exact-argv tests pass unchanged; new preflight ordering
tests pass.

### Step 3: Implement total matrix preflight and canonical destinations

Using captured `Path.Path` and the target catalog, validate the complete input
before starting the traversal:

- runtime input/documented field types and path NUL checks described above;
- name rules;
- non-empty targets;
- every runtime target resolves through the selected provider table;
- target uniqueness;
- positive safe-integer concurrency, explicitly rejecting `"unbounded"`,
  `Infinity`, and `-Infinity` through runtime-unsafe calls;
- options validation once for the matrix; and
- normalized destination uniqueness after resolving `outdir` against `cwd`
  and applying `<name>-<target>[.exe]`.

Accumulate all preflight issues into one non-empty `InvalidMatrixInput.issues`
array in deterministic field/input order. Do not create the output directory,
create staging, render argv, or start a build child until the issue list is
empty. Store prepared cells in input order.

**Verify**:

```sh
pnpm exec vitest run test/unit/standalone-matrix.test.ts -t 'preflight|name|duplicate|concurrency|options|destination'
```

Expected: every invalid matrix fails with `_tag: "InvalidMatrixInput"`, all
expected issues are present, and spawn/staging counters remain zero.

### Step 4: Traverse cells with bounded collect-all semantics

Run prepared cells with the existing internal single-cell lifecycle. Use
ordered `Effect.forEach` plus the pinned typed-result capture primitive, with
default concurrency 1 or the validated explicit limit. Attach target and
intended absolute path before collecting a cell failure.

After traversal:

- if there are no failures, return artifacts in input order;
- otherwise fail once with `MatrixFailed`, successes in input order, and
  failures in input order;
- never catch defects or interruption into a cell result; and
- never delete or roll back a committed artifact.

Construct one package-private runner from one adapter/tool/platform capture.
Reuse it for two matrix calls in a deterministic test to prove no per-call or
per-target construction is hidden inside traversal. Its eventual service wiring
must therefore use one `Bun.layer()` or `Deno.layer()` probe. Plan 014 tests
that public Layer/discovery invariant directly.

**Verify**:

```sh
pnpm exec vitest run test/unit/standalone-matrix.test.ts -t 'order|collects|partial|concurrency|runner|defect'
```

Expected: reverse completion still returns input order; at least three forced
typed failures are all reported with the correct target/path; successes are
present on disk and in `MatrixFailed.artifacts`; observed active children
never exceed the requested bound; two calls reuse one runner; and a forced
defect remains a defect, interrupts siblings, skips queued cells, and does not
roll back already committed outputs.

### Step 5: Prove multi-child interruption and cleanup

Use real child processes in the fixture, not only synchronous fake Effects.
Start a matrix with more targets than the concurrency limit, wait until the
active children record PID sentinels, interrupt the parent fiber, and assert:

- the parent Exit contains interruption;
- every active child is reaped after the existing force-kill policy;
- no queued child writes its start sentinel;
- all active staging directories are removed;
- pre-existing final destinations are unchanged for interrupted cells; and
- no `InvalidMatrixInput`, `MatrixFailed`, or `Interrupted` error value is
  produced.

Keep the test bounded with the same polling style as
`test/unit/standalone-process.test.ts:35-58`; do not use an unbounded sleep.

**Verify**:

```sh
pnpm exec vitest run test/unit/standalone-matrix.test.ts -t 'interrupt'
pnpm test:unit
```

Expected: the focused interruption case and the full unit suite pass without
orphan processes or leftover `.effect-build-*` directories.

### Step 6: Run architecture and deterministic gates

Add the new unit file to the existing `test:unit` script. Keep package exports,
provider Compiler service declarations, and runtime-key manifests unchanged in
this plan; the implementation is reachable only through package-private test
imports until Plan 014's public cut.

**Verify**:

```sh
pnpm verify
pnpm build
! rg -n 'compileExecutableMatrix' dist/Bun.d.ts dist/Deno.d.ts
rg -n 'Effect\.runPromise|from "node:' src
git diff --check
git status --short
```

Expected: `pnpm verify` exits 0; provider declarations do not expose the matrix;
the source boundary search has no matches; only files listed in Scope plus the
Plan 012 status row are modified.

## Test plan

`test/unit/standalone-matrix.test.ts` must cover at least:

- one-target and all-provider-target happy paths with deterministic fake native
  outputs;
- canonical filenames for macOS, GNU, musl, and Windows `.exe`;
- empty targets through a runtime-unsafe call;
- duplicate targets and normalized destination collision defense;
- invalid names, targets, options, and concurrency (0, negative, fraction,
  unsafe integer, NaN, positive/negative Infinity, and `"unbounded"`);
- decoded empty issue/failure arrays and relative CellFailure paths rejected;
- decoded duplicate/overlapping targets or paths and nested tool mismatches
  rejected;
- all preflight issues reported together and zero build side effects;
- stable input ordering under reverse completion;
- default sequential execution and explicit bounded concurrency;
- mixed successes plus at least three target-attributed typed failures;
- per-artifact atomic replacement and no rollback;
- one package-private runner reused across multiple calls;
- a defect aborting siblings/queued cells without becoming MatrixFailed; and
- parent interruption with multiple active and queued real children.

Use `test/unit/standalone-publication.test.ts` and
`test/unit/standalone-process.test.ts` as lifecycle patterns. Test observable
paths, process counts, PIDs, headers, artifacts, and Effects; do not assert only
that an internal helper was called.

## Done criteria

- [ ] Matrix input is homogeneous and provider concrete; no public generic
  target/string signature appears.
- [ ] Output naming is exactly `<name>-<target>[.exe]`; no per-cell outfile or
  naming callback exists.
- [ ] Complete preflight happens before output-directory creation, staging,
  render, or build spawn.
- [ ] Invalid options are checked once at matrix preflight and before staging
  for single compile.
- [ ] Concurrency defaults to 1 and accepts only positive safe integers.
- [ ] Typed cell failures collect all and carry exact target/path attribution.
- [ ] Provider matrix error types narrow failure targets and partial artifacts;
  only one root runtime MatrixError schema exists.
- [ ] Successful partial artifacts are returned inside `MatrixFailed` and stay
  published; no rollback exists.
- [ ] Defects and interruption are not converted to matrix errors.
- [ ] Multi-child interruption reaps active children, skips queued work, and
  cleans staging.
- [ ] Package-private runner construction is one-adapter/one-tool; Plan 014 is
  responsible for proving one discovery/probe per provided Layer, reused across
  both scalar and matrix calls.
- [ ] Provider entry points and Compiler service declarations do not expose the
  matrix before Plan 014.
- [ ] Existing `compileExecutable` behavior and `BuildError` union remain green.
- [ ] `pnpm verify` exits 0.
- [ ] No files outside Scope are modified, other than the authorized status
  row.

## STOP conditions

Stop and report if:

- Plans 011/013 are not complete or their proven provider Target tables no
  longer match this contract;
- implementing canonical matrix names would require changing the final
  `outfile` semantics of the existing single operation;
- the only apparent implementation requires a second process/staging engine
  instead of calling the existing cell lifecycle;
- Effect's installed typed-result capture converts interruption or defects into
  values (choose another pinned primitive, but do not catch all causes);
- a multi-file rollback appears necessary to make tests pass;
- matrix path preflight would require raw Node path APIs under `src/` rather
  than the captured Effect Path service;
- an in-scope file has unexplained drift; or
- any verification fails twice after a reasonable correction.

## Maintenance notes

- A matrix is one entrypoint/options set crossed with provider targets. If a
  future request needs arbitrary variants, keep it as Effect composition until
  a separate product operation earns its own invariants.
- Adding target dimensions must not weaken canonical filename uniqueness.
- Reviewers should pay special attention to typed-result capture, interruption,
  stable ordering, option validation timing, and the absence of rollback.
- Progress streams remain deferred; do not retain internal event vocabulary in
  anticipation of them.
