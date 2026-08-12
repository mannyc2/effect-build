# Plan 014: Hard-cut the typed target matrix into the public product

> **Executor instructions**: Execute only after Plans 011-013 are `DONE` and
> their full gates are green. This is one coordinated public contract cut, not
> permission to add other build verbs. Freeze public exports with failing
> architecture and type tests first, then update code, examples, and docs in
> the same change. Do not leave an undocumented service-only matrix method,
> compatibility alias, broad `string` target overload, or experimental target
> prose. Stop if the support evidence from Plan 013 is incomplete.
>
> **Drift check (run first)**:
>
> ```sh
> rg -q '^\| 011 \|.*\| DONE \|$' plans/README.md
> rg -q '^\| 012 \|.*\| DONE \|$' plans/README.md
> rg -q '^\| 013 \|.*\| DONE \|$' plans/README.md
> git status --short
> pnpm verify
> node scripts/verify-workflow-receipt.mjs \
>   --receipt-file plans/013-require-cross-target-support-evidence.md \
>   --prefix 'Target evidence:'
> ```
>
> Expected: all three prerequisite rows are `DONE`; the deterministic gate
> passes; and Plan 013 records its required green workflow for all real/support
> gates. This is prerequisite evidence, not final evidence for Plan 014's source
> changes. Review every existing worktree change before continuing. Any
> prerequisite failure or unrelated dirty file is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH
- **Depends on**:
  `plans/011-centralize-provider-target-contracts.md`,
  `plans/012-build-typed-target-matrix.md`, and
  `plans/013-require-cross-target-support-evidence.md`
- **Category**: direction / public API / documentation / release contract
- **Planned at**: commit `eb2995c`, 2026-08-12
- **Effect baseline**: `effect@4.0.0-beta.107`
- **Required final receipt**: pending. Plan 013's receipt permits this work to
  start; it cannot complete this plan. Completion requires a new green required
  workflow for the exact Plan 014 source commit and an unbulleted receipt in
  this file prefixed `Final target evidence:`, followed by the run URL, ` @ `,
  and the full 40-character SHA.

## Why this matters

Plans 011-013 establish package-private provider-owned target authority, real
evidence for every target, and a package-private matrix lifecycle. They
deliberately stop short of provider target exports, scalar narrowing, and the
matrix operation. This plan publishes all three as one evidence-backed hard
cut and makes the matrix the second and final public operation.

The result is not a generic Build framework. It is one lifecycle at two
cardinalities:

1. `compileExecutable` publishes one caller-named executable and fails with the
   unchanged closed `BuildError` union; and
2. `compileExecutableMatrix` publishes a homogeneous provider target set with
   canonical names, total preflight, bounded collect-all execution, and a
   separate closed `MatrixError` union.

That distinction is what lets the matrix earn its existence beyond
`Effect.all`: it centralizes target typing, naming, collision prevention,
failure attribution, and collect-all semantics while preserving the proven
single-artifact lifecycle.

## Public contract fixed by this plan

### Exact package surface

The package still has exactly three entry points:

```ts
import { Artifact, BuildError, MatrixError, Target } from "effect-build"
import * as Bun from "effect-build/bun"
import * as Deno from "effect-build/deno"
```

The exact runtime keys are:

| Entry point | Runtime keys |
|---|---|
| `effect-build` | `Artifact`, `BuildError`, `MatrixError`, `Target` |
| `effect-build/bun` | `Compiler`, `Target`, `compileExecutable`, `compileExecutableMatrix`, `layer` |
| `effect-build/deno` | `Compiler`, `Target`, `compileExecutable`, `compileExecutableMatrix`, `layer` |

`Bun.Target` has the six literals proven by Plan 013. `Deno.Target` has its
six literals and rejects both musl targets statically and at runtime. There is
no root compile verb, provider value argument, registry, generic provider
service, or compatibility export.

The exact exported declaration names are also frozen; an AST-based declaration
test must reject missing or extra names:

| Entry point | All exported names (runtime and type-only) |
|---|---|
| `effect-build` | `Artifact`, `BuildError`, `MatrixError`, `Target` |
| `effect-build/bun` | `Artifact`, `CompileExecutableInput`, `CompileExecutableMatrixInput`, `Compiler`, `LayerOptions`, `MatrixError`, `Options`, `Target`, `compileExecutable`, `compileExecutableMatrix`, `layer` |
| `effect-build/deno` | `Artifact`, `CompileExecutableInput`, `CompileExecutableMatrixInput`, `Compiler`, `LayerOptions`, `MatrixError`, `Options`, `PermissionValue`, `Permissions`, `Target`, `compileExecutable`, `compileExecutableMatrix`, `layer` |

`Artifact`, both input aliases, `MatrixError`, provider options, and Deno
permission declarations are type-only. `Target` and `Compiler` are both values
and types. Do not export shared generics, validated options, target tables,
prepared cells, or runner factories.

Scalar input fields and behavior remain the same, but their types intentionally
narrow: `Bun.CompileExecutableInput.target` is `Bun.Target`, Deno's is
`Deno.Target`, and success is the corresponding provider `Artifact`. The one
root runtime `Artifact.Artifact` schema becomes a provider/target-correlated
union derived from the proven tables; it rejects every provider-invalid wire
value, including Deno plus musl and Bun plus either `linux-aarch64-musl` or
`windows-aarch64`.
The shared private service type is parameterized by tool name, supported target,
and options—conceptually `CompilerService<Name, SupportedTarget, Options>`—so a
provider Artifact's `tool.name` cannot drift from its target/options. Public
provider declarations instantiate and hide all three parameters.

### Matrix call

The documented Bun shape is:

```ts
const artifacts = Bun.compileExecutableMatrix({
  entrypoint: "src/main.ts",
  outdir: "dist",
  name: "app",
  targets: ["macos-aarch64", "linux-x64-gnu", "windows-x64"],
  concurrency: 2,
  digest: true,
  options: {
    minify: true
  }
})
```

Its exact effect type is equivalent to:

```ts
Effect.Effect<
  readonly Bun.Artifact[],
  Bun.MatrixError,
  Bun.Compiler
>
```

The Deno function has the corresponding Deno target, artifact, and options
types, including a type-only `Deno.MatrixError` alias. Both provider error
aliases remain assignable to the root runtime `MatrixError.MatrixError` schema
while narrowing cell targets and partial artifacts. Shared implementation
generics stay package-private; public signatures are concrete. `targets` is a
readonly non-empty tuple, output order equals input order, and every output path is exactly
`<resolved outdir>/<name>-<canonical target>[.exe]`.

`concurrency` is optional and defaults to 1. If provided, it is a positive safe
integer. Do not expose Effect's `"unbounded"` concurrency value or a fail-fast
mode. Callers that need custom output names, heterogeneous options, multiple
entrypoints, or cross-provider work compose scalar calls themselves.

### Matrix failure handling

The matrix error channel is exactly:

```ts
type MatrixError = InvalidMatrixInput | MatrixFailed
```

The serialized schema fields are exact. `NonNegativeSafeInteger` below means a
`Schema.Number` check accepting only `Number.isSafeInteger(value)`, `value >= 0`,
and non-`-0` values. A safe string is an already-validated primitive string;
constructing it from unknown input must never invoke user conversion code.

| Schema | Fields |
|---|---|
| `MatrixIssue` | `field: Schema.Literals(["input", "entrypoint", "outdir", "name", "targets", "cwd", "digest", "options", "concurrency", "output"] as const)`; `reason: Schema.NonEmptyString`; `index: Schema.optionalKey(NonNegativeSafeInteger)`; `value: Schema.optionalKey(Schema.String)` |
| `InvalidMatrixInput` | `_tag: "InvalidMatrixInput"`, `issues: NonEmptyArray<MatrixIssue>` |
| `CellFailure` | `tool: Artifact.ToolName`; provider-correlated `target`; `path: Artifact.AbsolutePath`; `error: BuildError.BuildError` |
| `MatrixFailed` | `_tag: "MatrixFailed"`, ordered `artifacts: readonly Artifact.Artifact[]`, `failures: NonEmptyArray<CellFailure>` |

The root `MatrixFailed` schema is a provider-correlated Bun/Deno union derived
from the same tables. It rejects every provider-invalid failure cell and
impossible partial Artifact, including the invalid Deno-musl and narrowed Bun
pairs above. Its refinements also reject targets or paths duplicated across
artifacts/failures and nested BuildError tool fields that disagree with the
cell's tool. Provider type aliases narrow tool, targets, nested failures, and
partial artifacts without adding provider runtime schemas.

`InvalidMatrixInput` contains every deterministic preflight issue and guarantees
that no output directory, staging directory, argv render, or build child was
started. `MatrixFailed` contains successful committed artifacts plus ordered
cell failures with target, intended final path, and the original
`BuildError.BuildError`.

Do not add matrix tags to `BuildError.BuildError`. Existing exhaustive handlers
for `compileExecutable` remain source-compatible and semantically exact.
Matrix interruption remains interruption: active children are terminated and
staging is cleaned, queued cells do not start, already committed artifacts are
not rolled back, and no interruption value is returned.

### Product boundary after the cut

Update the repository execution rule from “one public operation” to the exact
two-operation boundary above. Explicitly keep these outside this package until
a separately approved product decision:

- standalone bundling/transforms;
- TypeScript checking or declaration emission;
- code generation, watch, or dev servers;
- task graphs, workspaces, caching, or remote execution;
- container image construction;
- signing, checksums-as-release-manifests, publication, or package release; and
- streaming progress/events.

This plan preserves gate decision 1: the matrix remains per-provider and no
driver value enters the call. It completes the gate-3 supersession from Plan
013 and explicitly supersedes Plan 010's operation-count and exact runtime-key
freezes with the tables above—no other public growth is authorized.

## Current state at the planning baseline

- `src/index.ts` exports only root `Artifact`, `BuildError`, and `Target`.
- `src/Bun.ts` and `src/Deno.ts` each export only `Compiler`,
  `compileExecutable`, and `layer` at runtime.
- `tooling/public-api.json` version 1 freezes those exact keys.
- `README.md:49-73` presents a manual, cross-provider, fail-fast `Effect.all`
  example as experimental target composition.
- `docs/api.md` documents only scalar input and `BuildError` handling.
- Plans 011-013 will have updated internals and support evidence by execution
  time, but the public provider declarations/runtime keys remain scalar and
  broad until this cut.
- `examples/` has no canonical matrix example.
- `AGENTS.md` says to keep one public operation, so leaving that instruction
  unchanged would make the delivered public API self-contradictory.
- `scripts/test-built-consumer.mjs` and the public-API architecture tests freeze
  the current three-key provider modules and must be updated as contract
  oracles, not weakened.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Static and unit contract | `pnpm check && pnpm test:types && pnpm test:unit` | exact scalar and matrix types/lifecycle pass |
| Public surface | `pnpm test:consumer && pnpm test:architecture` | built and packed imports expose only the declared keys |
| Full deterministic | `pnpm verify` | exit 0 |
| Current-host real tools | provisioned `pnpm verify:real`; final required CI `real-tools` job | Bun and Deno executables compile and run |
| Every provider target | `pnpm verify:targets` on Linux x64 as a local diagnostic; final required CI provider shards | all 12 independent external-oracle cells pass on the Plan 014 source commit |
| Package contents | `npm pack --dry-run` | only intended dist/docs/examples/package files appear |

## Suggested executor toolkit

- Use `effect-ts` for the pinned Effect signatures and schema/error exports.
- Use `test-design-review` after updating the type, architecture, built-consumer,
  and example tests; these are release-contract tests, not snapshots to loosen.

## Scope

**Create:**

- `examples/bun-matrix.ts`

**Modify:**

- `src/index.ts`
- `src/Bun.ts`
- `src/Deno.ts`
- `src/standalone/Artifact.ts`
- `src/standalone/CompileExecutable.ts`
- `src/standalone/Driver.ts`
- `src/standalone/internal/CompilerEngine.ts`
- `tooling/public-api.json`
- `scripts/read-tooling.mjs`
- `scripts/test-built-consumer.mjs`
- `test/architecture/public-api.test.ts`
- `test/architecture/import-boundaries.test.ts`
- `test/architecture/docs-contract.test.ts`
- `test/unit/standalone-contract.test.ts`
- `test/unit/standalone-bun.test.ts`
- `test/unit/standalone-deno.test.ts`
- `test/unit/standalone-publication.test.ts` for the intentional public target
  narrowing in its runtime-unsafe rejection fixture
- `test/testkit/standaloneDriverContract.ts`
- `test/integration/standalone-deno.test.ts` and
  `test/integration/standalone-target-support.test.ts` for the same concrete
  provider input/artifact correlation exercised by the real-tool gates
- `typetest/standalone-contract.tst.ts`
- `examples/README.md`
- `README.md`
- `docs/README.md`
- `docs/api.md`
- `docs/architecture.md`
- `docs/drivers.md`
- `docs/errors.md`
- `AGENTS.md`
- `package.json` for the authorized `0.2.0` release version and only if an exact
  example or contract-test command must include the new file; do not add a new
  package subpath
- `plans/README.md` for the final gate supersessions and Plan 014 status

**Out of scope:**

- changing target literals/mappings or target-support cells from Plans 011/013;
- changing matrix naming, traversal, or error semantics from Plan 012;
- changing scalar fields, output naming, or `BuildError` membership beyond the
  intentional provider target/artifact type narrowing fixed above;
- adding another compiler, host runtime, package subpath, build verb, service
  tag, registry, generic public facade, or raw-argv escape hatch;
- adding per-target options/outfiles, variants, callbacks, events, retry,
  rollback, cache, task graph, signing, publication, or type checking; and
- publishing, tagging, pushing, or opening a release/PR.

## Git workflow

- Continue on the current branch; if creating a branch, use
  `codex/014-public-target-matrix`.
- Suggested commit: `feat: publish typed executable target matrices`.
- Do not push, tag, publish, or open a PR unless separately instructed.

## Steps

### Step 1: Freeze the exact public module manifests

First update failing architecture tests and `tooling/public-api.json` with the
exact runtime keys above. Keep its schema `version` at 1 and keep the three
package subpaths unchanged; the manifest shape is not changing. Extend tooling
validation so duplicate, missing, extra, and out-of-order runtime keys fail
deterministically. Extend the built-declaration architecture test to parse each
entry point and compare its exported identifiers to the exact all-exported-name
table above; string searching or a handpicked subset is insufficient.

Extend type tests before production exports to assert:

- provider `Target.literals` exactness;
- Bun/Deno matrix input target and option correlation;
- non-empty target tuples;
- narrowed provider artifacts and tool names;
- exact provider-narrowed MatrixError failure and provider Compiler context;
- the root Artifact and MatrixFailed schemas reject every provider-invalid
  value while accepting every provider-correlated wire value;
- Deno musl plus Bun ARM64-musl and Windows-ARM64 target rejection; and
- unchanged scalar `BuildError.BuildError` failure.

**Verify**:

```sh
pnpm build
pnpm test:architecture
pnpm test:types
```

Expected before implementation: the new export assertions fail for the missing
public surface while all unrelated assertions pass.

### Step 2: Publish the correlated targets, artifacts, and matrix operation

Export root `MatrixError` from `src/index.ts`. Project `Bun.Target` and
`Deno.Target` directly from the proven package-private tables—do not copy their
literals into the public modules. Narrow each provider's scalar input target and
success Artifact alias, and change the single root `Artifact.Artifact` runtime
schema to the provider-correlated Bun/Deno union fixed above. Prove both static
and runtime rejection of Deno-plus-musl artifacts and both narrowed Bun pairs.
Preserve every scalar field, default, lifecycle step, and `BuildError` member.

Extend the existing internal and provider Compiler service type with the
completed Plan 012 matrix runner, then export each provider's concrete matrix
input/artifact/error types and `compileExecutableMatrix` from its existing
subpath. Reuse the same Compiler service and Layer; one Layer construction must
capture both scalar and matrix methods after one discovery/probe. Do not
construct a second service or add a root operation.

Return the already-built package-private matrix runner from
`makeCompilerService`, and expose a thin `Effect.flatMap(Compiler, ...)`
convenience function matching the scalar pattern. Do not fork validation or
traversal into the public module. Add the public Layer assertion that two
matrix calls under one provided Layer perform exactly one discovery/probe, while
re-providing/rebuilding the Layer has its ordinary independent acquisition.

**Verify**:

```sh
pnpm check
pnpm test:types
pnpm test:unit
pnpm build
pnpm test:architecture
```

Expected: exact runtime and declaration surfaces pass; no extra keys or
subpaths appear; scalar and matrix results are provider-correlated; and the root
Artifact/MatrixError decoders reject impossible provider-target combinations.

### Step 3: Test the built and packed consumer contract

Extend `scripts/test-built-consumer.mjs` to import all three built entry points,
compare exact runtime keys, inspect both provider target literal sets, and run
at least a deterministic preflight-only matrix failure without requiring a real
compiler child. If Layer construction probes before the operation and makes
that inappropriate, keep runtime behavior in unit tests and assert the built
function/schema identities here instead; do not introduce a test-only public
Layer.

Pack the package to a temporary directory through the existing consumer test
workflow. In a fresh consumer, typecheck representative Bun and Deno matrix
calls and runtime-import `MatrixError`, provider `Target`, and both matrix
functions. Prove no workspace source path or undeclared dependency makes the
consumer pass accidentally.

**Verify**:

```sh
pnpm test:consumer
npm pack --dry-run
```

Expected: a fresh built/packed consumer sees exactly the final surface and
the tarball contains the new declarations, docs, and example.

### Step 4: Replace the experimental recipe with the product operation

Replace README's manual fail-fast cross-provider `Effect.all` example with one
provider-homogeneous matrix example. It must show canonical filenames, bounded
concurrency, `digest`, one provider Layer, and one host Layer. Do not imply
transactional rollback or foreign execution.

Add `examples/bun-matrix.ts` as a runnable equivalent and include it in the
existing example typecheck/architecture allowlist. Keep examples explicit
about environment/tool requirements and do not download compilers.

**Verify**:

```sh
pnpm check
pnpm test:architecture
```

Expected: docs-contract tests recognize the scalar and matrix examples, exact
imports, and supported-target claims.

### Step 5: Rewrite API, lifecycle, error, and support documentation

At the detail level of current `docs/api.md`, document:

- exact scalar and matrix input fields;
- provider-specific target schemas and artifact types;
- canonical matrix naming and stable input order;
- preflight-before-side-effects guarantee;
- default/explicit concurrency;
- collect-all `MatrixFailed` contents and partial-commit semantics;
- exhaustive `catchTags` examples for `BuildError` and `MatrixError` separately;
- interruption behavior; and
- the exact provider target sets/evidence boundary from Plan 013.

Update architecture with one scalar cell lifecycle wrapped by matrix preflight
and bounded traversal. Replace the now-overbroad “common contract modules do not
import either compiler” rule with the exact tested boundary: root correlated
schemas may import only the pure provider target-contract projections, never
provider public modules, adapters, discovery, or execution code. Update drivers
to make provider target tables the mapping/support authority. Update errors
without merging the unions.

Change `AGENTS.md` to the exact two-operation boundary and preserve all other
lifecycle, provider-selection, and platform-neutral rules.

**Verify**:

```sh
pnpm test:architecture
rg -n 'experimental target|fail-fast|one public operation|supportedTargets|<T, *string>' \
  README.md docs AGENTS.md src
```

Expected: architecture/docs contracts pass; the search returns no stale
product claim, removed support authority, or broad public target generic.

### Step 6: Record superseded gates and run every release gate

Update `plans/README.md` without rewriting history:

- gate 1 remains per-tool and closed;
- gate 3 is explicitly superseded by exact provider-target evidence;
- gate 4's library decision now includes the matrix's concrete semantic value;
- gate 6 records beta.107's audited broad-release exception without pretending
  it followed the dedicated-plan rule; and
- Plan 010's operation-count and exact runtime-key freezes are explicitly
  superseded only by the approved scalar-plus-matrix surface tables.

Run the local deterministic/package gates first. A provisioned Linux-x64
executor should also run `pnpm verify:real` and `pnpm verify:targets`, but a local
run does not replace final CI because this plan changes the public schema and
service wiring after Plan 013's evidence commit.

**Verify**:

```sh
pnpm verify
npm pack --dry-run
git diff --check
git status --short
```

Expected: every local command exits 0; package contents are intentional; only
files listed in Scope plus prerequisite plan/status changes are modified.

Then commit the complete Plan 014 source cut. With explicit push authority,
observe the required CI workflow for that exact commit. Its `quality`,
`real-tools`, `publication-hosts`, and both target-support provider shards must
all appear green. Append the exact final receipt candidate described in Status,
then use Plan 013's verifier to query the run through `gh api` and require
`conclusion == "success"`, `head_sha` equal to the full receipt SHA, and
successful named jobs for every required job/shard; receipt syntax alone is not
evidence. Only then mark Plan 014 `DONE`. This repository has no configured
remote at the planning baseline; remote selection and push require explicit
operator direction. If either is absent, stop with the plan still `IN PROGRESS`
and report that one external gate; do not substitute Plan 013's older receipt.

After appending the receipt, parse its SHA and prove the receipt/status-only
follow-up did not change product or verification files:

```sh
node scripts/verify-workflow-receipt.mjs \
  --receipt-file plans/014-hard-cut-typed-matrix-public-api.md \
  --prefix 'Final target evidence:'
final_sha="$(sed -n 's/^Final target evidence: https:\/\/github.com\/.* @ \([0-9a-f]\{40\}\)$/\1/p' plans/014-hard-cut-typed-matrix-public-api.md)"
test -n "$final_sha"
git diff --exit-code "$final_sha" -- \
  src test typetest scripts tooling .github examples README.md docs AGENTS.md \
  package.json pnpm-lock.yaml
```

Expected: the parsed SHA is the green workflow commit and the scoped diff is
empty.

## Test plan

- Exact root/provider runtime keys and unchanged three package subpaths.
- Exact public declaration identifier sets and signatures for scalar and matrix
  operations.
- Bun six-target and Deno six-target runtime literals.
- Root Artifact accepts all valid provider-target pairs and rejects Deno musl,
  Bun ARM64 musl, and Bun Windows ARM64 in type tests and runtime decode.
- Matrix success order and provider-narrowed artifacts.
- Exact MatrixIssue fields plus tagged-error encode/decode round trips; empty
  issue/failure arrays, relative paths, duplicate targets/paths, nested tool
  mismatches, and every provider-invalid failure cell rejects.
- Separate exhaustive error handlers; scalar handlers need no matrix cases.
- Fresh packed-consumer imports and matrix typecheck.
- Runnable Bun matrix example typechecks against package exports.
- Docs assertions for canonical filenames, collect-all behavior, partial
  commits, interruption, and supported target evidence.
- All deterministic, current-host, and 12 target-support gates remain green.

## Done criteria

- [ ] The root module exports exactly `Artifact`, `BuildError`, `MatrixError`,
  and `Target` at runtime.
- [ ] Each provider module exports exactly `Compiler`, `Target`,
  `compileExecutable`, `compileExecutableMatrix`, and `layer` at runtime.
- [ ] Package subpaths remain exactly `.`, `./bun`, and `./deno`.
- [ ] Built declaration ASTs expose exactly the runtime and type-only names in
  the frozen table; no shared generic/helper declaration leaks.
- [ ] Public matrix signatures are provider-concrete and never generic over
  `string`.
- [ ] Type-only provider Artifact and MatrixError aliases preserve target/tool
  correlation without adding provider runtime keys.
- [ ] Scalar fields, defaults, lifecycle, and `BuildError` union are unchanged;
  only provider target input and successful Artifact types intentionally narrow.
- [ ] Root Artifact decoding accepts every valid Bun/Deno pair and rejects all
  impossible provider-target values, including Deno musl and both narrowed Bun
  pairs.
- [ ] Matrix failure is exactly the separate two-tag `MatrixError` union, with
  the exact field schemas and non-empty/absolute-path decode constraints above.
- [ ] README/docs/examples state canonical naming, total preflight, bounded
  collect-all behavior, partial commits, and interruption accurately.
- [ ] `AGENTS.md` states the exact scalar-plus-matrix product boundary.
- [ ] Gate supersessions are recorded without erasing their original bases.
- [ ] Built and freshly packed consumers prove the exact public surface.
- [ ] `pnpm verify` passes locally; the final required workflow for the Plan 014
  source commit has green current-host real tools, publication hosts, and both
  6/6 target-support shards.
- [ ] This file records that final run URL/SHA, and no product or verification
  file differs from the recorded evidence commit.
- [ ] The recorded run's API conclusion, `head_sha`, and complete required job
  set and exact CI workflow path—not merely the receipt text—have been verified.
- [ ] `npm pack --dry-run` contains only intended files.
- [ ] No out-of-scope source or documentation file is modified.

## STOP conditions

Stop and report if:

- any prerequisite plan is not `DONE` or any prerequisite verification fails;
- any public provider target lacks the required Plan 013 real evidence;
- the requested package version has already been published and the operator
  has not authorized the semver-breaking release shape;
- publishing the matrix requires a fourth package subpath, root driver
  registry, broad target overload, or duplicate implementation;
- the existing Compiler/Layer cannot expose scalar and matrix operations with
  one discovery/probe without changing service ownership;
- a packed consumer cannot express the exact provider-correlated types;
- docs or tests would need to promise matrix-wide rollback, foreign execution,
  or runtime-version rejection that the implementation does not provide;
- any verification fails twice after a reasonable correction; or
- an unrelated dirty file would need to be overwritten, formatted, staged, or
  deleted.

## Maintenance notes

- The matrix is a cardinality operation over the scalar lifecycle, not a
  scheduler platform. Resist feature requests that introduce another execution
  graph or storage model.
- Provider target tables, provider schemas, and the support manifest are one
  release contract. A target change must update and verify all three together.
- Keep scalar and matrix error unions separate so actionability, not symmetry,
  determines error taxonomy.
- Custom naming and heterogeneous work remain ordinary Effect composition of
  scalar calls until a concrete invariant justifies another primitive.
