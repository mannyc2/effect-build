# Plan 019: Compare both executable topologies and decide public promotion by evidence

> **Executor instructions**: Execute only after the behavior-preserving direct
> lifecycle and the complete internal esbuild-to-Node-SEA vertical slice are
> green under their required real-tool gates. This is an evidence and public-
> surface decision plan. It does not authorize exporting the internal pipeline,
> changing Artifact, or implementing plans/executors/receipts. Measure the two
> working topologies, write the decision record, and keep every unmet promotion
> candidate explicitly internal/rejected. Do not replace evidence gates with
> dates or roadmap promises.
>
> **Drift check (run first)**:
>
> ```sh
> plan019_start_sha="$(git rev-parse HEAD)"
> test -n "$plan019_start_sha"
> rg -q '^\| 015 \|.*\| DONE' plans/README.md
> rg -q '^\| 016 \|.*\| DONE' plans/README.md
> rg -q '^\| 017 \|.*\| DONE' plans/README.md
> rg -q '^\| 018 \|.*\| DONE' plans/README.md
> git diff --stat e4257cc..HEAD -- \
>   src test docs tooling package.json .github/workflows plans
> git status --short
> bun run verify
> node scripts/verify-workflow-receipt.mjs \
>   --receipt-file plans/015-widen-effect-v4-compatibility.md \
>   --prefix 'Effect compatibility evidence:' \
>   --contract effect-v1
> node scripts/verify-workflow-receipt.mjs \
>   --receipt-file plans/018-build-node-sea-executable.md \
>   --prefix 'Node SEA evidence:' \
>   --contract node-sea-v1
> node_sea_sha="$(sed -n 's/^Node SEA evidence: https:\/\/github.com\/.* @ \([0-9a-f]\{40\}\)$/\1/p' plans/018-build-node-sea-executable.md)"
> test -n "$node_sea_sha"
> git diff --exit-code "$node_sea_sha" -- \
>   package.json pnpm-lock.yaml src test scripts tooling .github/workflows
> ```
>
> Expected: Plans 015-018 are `DONE`; deterministic and real Bun/Deno gates
> pass in the Plan 018 receipt's inherited `effect-v1` jobs; the exact pinned
> Linux Node SEA vertical slice has the same verified required receipt; current
> implementation/evidence paths, including the not-yet-edited docs-contract
> test, have zero diff from that SHA; and all dirty
> work is understood. Record `plan019_start_sha` in the evidence packet before
> the first edit.
> Local real-tool reruns are conditional on already-approved tools/hosts. If
> either topology lacks required receipt evidence, STOP—there is nothing to
> promote or compare yet.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW if kept documentary; HIGH if used to smuggle a public cut
- **Depends on**: Plans 015, 016, 017, and 018
- **Category**: direction / architecture / docs / public API decision
- **Planned at**: commit `e4257cc`, 2026-08-13
- **Goal kind**: evidence comparison and semantic compression decision; no
  feature implementation

## Why this matters

The repository previously removed a working but unowned managed-build system
because it created peer request, identity, store, record, driver, and
publication models without a consumer. A second working topology is necessary
but not sufficient to reverse that decision. This plan asks what the two real
paths actually share and which public consumers exist, then records promotion
as observable gates rather than speculative architecture.

The long-term design test remains demanding: can one versioned semantic request
with closed inputs and a content-identified toolchain requirement be bound to
multiple backends, checked by the same acceptance criteria, and recorded in
backend-specific receipts? The current direct and Node SEA pipelines do not by
themselves satisfy closed-input or alternate-backend requirements.

## Current baseline to compare

### Topology A: direct compiler

```text
typed Bun/Deno input
-> selected CLI compiler
-> one prepared cell
-> native executable candidate
-> common native validation/digest
-> atomic publication
-> public singular-tool Artifact
```

It supports scalar and homogeneous matrix cardinalities. Matrix is orchestration
over the same cell, not a second topology.

### Topology B: composed producer

```text
typed esbuild input
-> continuation-owned esbuild library context backed by package-global service
-> temporary JavaScriptBundleArtifact visible to the callback
-> exact selected direct-SEA Node CLI inside that continuation
-> native executable candidate
-> common native validation/digest
-> atomic publication
-> internal exact two-stage artifact
```

Only native file validation and publication are expected to be shared. Tool
selection, preparation, execution, diagnostics, intermediate lifetime, and
provenance differ.

### Released boundary remains frozen

`tooling/public-api.json` has exactly three subpaths: `.`, `./bun`, `./deno`.
Root runtime keys are `Artifact`, `BuildError`, `MatrixError`, `Target`; each
provider exposes its concrete `Compiler`, `Target`, scalar, matrix, and Layer.
Public Artifact has singular provider `tool`. This plan changes none of those
facts.

Verified planning-baseline excerpt (`tooling/public-api.json`):

```json
{
  "subpaths": [".", "./bun", "./deno"],
  "rootRuntimeKeys": ["Artifact", "BuildError", "MatrixError", "Target"],
  "toolRuntimeKeys": ["Compiler", "Target", "compileExecutable", "compileExecutableMatrix", "layer"]
}
```

The executor must re-read this file and generated declarations at its recorded
start SHA; the excerpt is a drift oracle, not permission to regenerate a new
surface.

## Evidence packet to produce

Create `plans/research/next-stage-promotion-evidence.md` with all of the
following, stamped at the exact evaluated source SHA:

1. a first line with label `Program start SHA:` followed by the 40-character
   lowercase SHA enclosed in backticks, recorded before any Plan 019 edit;
   then commands, tool versions/paths, required workflow URLs/SHAs, host OS/arch,
   and pass/fail results for both topologies;
2. a measured file/symbol map showing shared and topology-specific source;
3. tests proving one common native validation/publication owner plus
   continuation/config/candidate cleanup for both paths;
4. exact public export/API diffs (expected none);
5. internal artifact field tables and stage observations;
6. a consumer inventory: every in-repo and known external caller for proposed
   inspection, artifact, receipt, plan, and executor surfaces;
7. gate-by-gate verdict `MET`, `NOT MET`, or `REJECTED`, with evidence; and
8. an updated compression ledger: representations/workflows removed or added,
   production LOC separately from tests/docs/plans, and state-space consequence.

A green workflow URL is evidence that tests ran; it is not a build receipt or
provenance record.

## Promotion gates

### 1. Public executable inspection/validation

Promote only when all are true:

- Bun/Deno direct output and Node SEA output call one package-private
  file-level validator with identical regular/executable/native/target/bytes
  semantics.
- Real tests cover every supported native format/host claimed by the proposed
  public inspector, including corrected thin/fat Mach-O behavior where claimed.
- At least one named caller needs inspection without compilation/publication;
  internal reuse alone is insufficient for a public operation.
- The error schema, ranged-I/O contract, and target/ABI ambiguity policy are
  independently useful and can be documented without leaking the opaque
  candidate/validated lifecycle or temporary bundle state.
- Adding the operation does not create a second target canon or provider-
  specific inspection branch.

If only the first two are met, keep inspection package-private.

### 2. Public artifact types and provenance

Promote only when all are true:

- Both topologies pass ordinary, required real-tool gates and return a common
  durable semantic result without leaking scoped intermediate paths.
- A named external consumer needs to persist/transport/inspect artifacts from
  both topologies.
- One deliberate versioned hard cut can replace singular `tool` with an ordered
  stage/provenance shape for Bun/Deno one-stage and esbuild/Node two-stage
  results. Do not add plural fields beside singular fields or ship peer
  Artifact classes.
- Provider-target correlation, digest optionality, JSON/schema round trips,
  packed-consumer types, and semver/release migration are specified and tested.
- Stage observations are described strictly as observed work, not closed-input,
  hermetic, reproducible, attested, or byte-stable proof.

Until then, the Node pipeline artifact stays internal.

### 3. Versioned receipts

Promote only when all are true:

- A named consumer needs a durable record separate from the returned Artifact
  (for audit, replay diagnosis, or cross-process transport).
- The receipt records actual observed stages, acceptance outcomes, and backend
  identity without claiming more certainty than observed.
- Version discriminator, canonical encoding, Schema decode/encode, unknown-
  field/version behavior, migration policy, and round-trip fixtures exist.
- The design explicitly distinguishes a workflow-test receipt from a build
  receipt.
- At least two producer topologies exercise the same receipt evolution tests.

No receipt is added merely to justify future reproducibility.

### 4. `SemanticPlan`

Promote only when all are true:

- Every input is closed and content-identified; no ambient cwd/project config,
  PATH lookup, inherited environment, implicit import, or scoped path remains.
- The required toolchain is content-identified semantically, not a selected
  local executable path/version observation.
- The plan has a versioned canonical encoding and acceptance criteria
  independent of a backend.
- No workspace allocation, resolved tool path, selected backend, transport,
  credentials, or output destination path enters the portable representation.
- The same encoded plan is actually consumed by at least two binding
  implementations. A second compiler or cardinality variant is not enough.

Current Bun/Deno behavior intentionally preserves native project config and
environment, so this gate is expected to remain `NOT MET`.

### 5. `BoundExecutionPlan`

Promote only after `SemanticPlan` and when all are true:

- One explicit binding operation combines the portable plan with resolved
  toolchain paths/identities, workspace allocation, output paths, backend
  identity, and transport-specific facts.
- The bound value cannot be mistaken for or encoded as the semantic request.
- Rebinding the same semantic plan to another backend produces a distinct bound
  value while retaining the same acceptance criteria.
- At least two real bindings are exercised; no fake-only adapter earns it.

### 6. Replaceable executors

Promote only when all are true:

- The same versioned `SemanticPlan` has been bound to and executed by at least
  two genuinely different backends (for example local and container/remote),
  not two CLI tools through the same local process/filesystem lifecycle.
- Both backends enforce the same acceptance criteria and emit backend-specific
  observed receipts.
- Failure, interruption/cancellation, workspace allocation, input transfer,
  output retrieval, and credential/transport boundaries are tested in reality.
- Selection is explicit. No automatic registry/fallback/backend selection is
  introduced.

## Three equalities that must never be conflated

| Equality | Meaning | What it does not imply |
|---|---|---|
| Same semantic request | Same versioned portable intent, closed input identities, toolchain requirement, and acceptance criteria | same selected tool/path, environment, workspace, backend, argv, or bytes |
| Same invocation | Same semantic request **and** same bound toolchain, backend, workspace/input materialization, argv/config, and declared environment contract | same output bytes unless observed |
| Same output bytes | Accepted outputs have equal content digest under a named algorithm | same request, invocation, provenance, safety, or behavior |

The current library can observe output-byte equality when digest is enabled;
it cannot infer either of the other equalities from a digest.

## Failure and transaction policy

Do not add caller switches for `failFast`, rollback, or publish mode:

- matrix collect-all typed failures and independent commits are one public
  operation's policy;
- defect/interruption closes active scopes and skips queued cells;
- atomic rename is the per-artifact point of no return; and
- the composed pipeline's intermediate cleanup is continuation/Scope ownership,
  not a transaction or static linear-type claim.

If a future advanced caller needs different failure/transaction behavior, the
only admissible direction is composition of independently earned lower-level
operations. That future need does not justify switches or a public stage
protocol now.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Deterministic gate | `bun run verify` | all checks pass |
| Required direct real evidence | verify Plan 015/018 workflow receipts with `effect-v1`/`node-sea-v1` | required Bun/Deno host/target and Node SEA jobs are green for exact SHAs |
| Conditional local direct tools | `bun run verify:real` | run only when approved Bun/Deno tools are already available |
| Conditional Linux targets | `bun run verify:targets` | run only on the required provisioned Linux x64 host; otherwise consume receipt |
| Conditional Node SEA proof | `EFFECT_BUILD_NODE_SEA_BIN=/absolute/node-26.7.0 bun run test:integration:node-sea` | run only with approved exact Linux binary; otherwise consume receipt |
| Public surface | `bun run build && bun run test:architecture` | build ignored `dist`, then exact no-growth exports pass |
| Production measurement | `rg --files -0 src -g '*.ts' | xargs -0 wc -l` | record production TypeScript separately |
| Test/fixture measurement | `rg --files -0 test typetest | xargs -0 wc -l` | record all committed test/type/fixture files separately; also report TS-only subtotal |
| Docs measurement | `rg --files -0 README.md docs examples | xargs -0 wc -l` | record user/architecture docs separately |
| Plan measurement | `rg --files -0 plans | xargs -0 wc -l` | record plan/research cost separately |
| Tooling measurement | `rg --files -0 scripts tooling .github package.json | xargs -0 wc -l` | record scripts/manifests/workflows separately |
| Shared ownership | architecture/type tests asserting no candidate commit/destination, exactly one `fileSystem.rename` owner, and exact `inspectNativeExecutableFile` call sites | one publication owner and one ranged file inspector used only by lifecycle and selected Node |
| Dirty scope | `git status --short` | only in-scope research/docs/index files changed |

## Scope

**In scope**:

- `plans/research/next-stage-promotion-evidence.md` (create)
- `plans/NEXT-STAGE-PROMOTION-DECISION.md` (create)
- `docs/architecture.md` (only to describe the proven internal second topology
  and explicit non-public boundary; no public API documentation)
- `test/architecture/docs-contract.test.ts` (freeze truthful internal/public
  claims only)
- `plans/README.md` (record verdict/status)

**Read-only evidence sources** (inspect but do not modify in this plan):

- `src/**`
- `test/unit/**`, `test/integration/**`, `test/architecture/public-api.test.ts`
- `package.json`, `tooling/**`, `.github/workflows/**`
- Plans 015-018 and their required workflow receipts

**Out of scope**:

- Any source implementation or public export/type/schema change.
- Publishing esbuild/Node SEA, inspection, artifacts, stages, receipts, plans,
  executors, registry, backend selection, or a new package version.
- Container/remote implementations, CAS/cache, transport, snapshots, signing,
  downloads, npm packaging, watch, plugins, rollback/fail-fast/publish modes.
- New dates promising promotion; gates are evidence-based.
- `.repos/effect` or `.agent-sources/effect` modifications.

## Git workflow

- Suggested branch: `advisor/019-public-promotion-decision`.
- Suggested commit: `docs: record executable topology promotion gates`.
- This plan should be one documentation/evidence change after all source work is
  green. Do not publish, tag, push, or open a PR without operator instruction.

## Steps

### Step 1: Re-run and record exact evidence

Run every required deterministic/receipt command in the table. Run conditional
real commands only when their approved tool/host prerequisites are present;
otherwise record `CI RECEIPT USED` rather than `PASS` or `SKIP`. Validate Plans
015 and 018 receipts with the repository verifier. Treat Plan 018's
`node-sea-v1` receipt—which extends `effect-v1`—as the required current evidence
for both direct and composed paths. Extract its SHA and require zero diff from
the working tree across `package.json`, `pnpm-lock.yaml`, `src`, `test`,
`scripts`, `tooling`, and `.github/workflows` before the first edit, including
`test/architecture/docs-contract.test.ts`. Only after this entry gate may the
plan deliberately change that test and validate it locally. A historical green
URL against different implementation bytes is not evidence. Capture exact commit, OS/arch,
producer versions/real paths when locally observed, workflow SHAs/URLs
otherwise, test counts, and outcomes. Record the pre-edit
`plan019_start_sha`. Never record secrets or full environment dumps.

**Verify**:

```sh
rg -n 'commit|Node 24\.14\.1|Node 26\.7\.0|esbuild 0\.28\.2|Bun|Deno|PASS|FAIL|CI RECEIPT USED' \
  plans/research/next-stage-promotion-evidence.md
```

Expected: every topology/tool/gate has an exact evidence row. Any required
failure stops the plan.

### Step 2: Measure shared ownership and representation cost

Build tables in the packet listing exact files/symbols for:

- input/preflight;
- tool selection/probe;
- structured-library context/service or Effect-owned CLI execution;
- scoped intermediate ownership;
- file/native validation;
- digest;
- publication;
- result/provenance; and
- scalar/matrix orchestration.

Record production LOC separately from tests, docs, plans, and tooling. Count
representations and public exports, not only lines. Confirm:

- direct and composed paths share one file-level native validator and commit
  owner;
- esbuild and CLI execution do not share a universal adapter;
- intermediate bundle/config paths never enter a durable/public result; and
- public Artifact and export allowlists are unchanged.

Do not infer ownership from a broad symbol count. Require the Plan 016 type
assertions that candidate `commit`/`destination` and adapter final-output fields
are unavailable; require `fileSystem.rename` to occur only in
`src/standalone/internal/ExecutableLifecycle.ts`; and require
`inspectNativeExecutableFile` references to be confined to that definition/
publication owner and `src/standalone/internal/NodeSea.ts`. Link the exact
publication and Node-selection tests in the packet.

**Verify**:

```sh
rg -n '^\| (Input|Tool|Execution|Scope|Validation|Digest|Publication|Result|Matrix)' \
  plans/research/next-stage-promotion-evidence.md
test "$(rg -l 'fileSystem\.rename' src/standalone/internal)" = \
  'src/standalone/internal/ExecutableLifecycle.ts'
test "$(rg -l 'inspectNativeExecutableFile' src/standalone/internal | sort)" = \
  $'src/standalone/internal/ExecutableLifecycle.ts\nsrc/standalone/internal/NodeSea.ts'
bun run build && bun run test:architecture
```

Expected: the ownership table is complete and exact public surface tests pass.

### Step 3: Inventory named consumers

Search all code/docs/examples/plans and record each actual caller/use case for:

- inspection without build;
- a common multi-topology Artifact;
- durable build receipt;
- portable semantic planning;
- bound planning; and
- alternate executor/backend.

An architectural desire or plan text is not a consumer. Name the importing
module/application/person-owned workflow and the observable job it needs. If no
consumer exists, record `none` and keep the gate unmet.

**Verify**:

```sh
rg -n '^\| (inspection|artifact|receipt|semantic plan|bound plan|executor)' \
  plans/research/next-stage-promotion-evidence.md
```

Expected: six consumer rows exist with names/evidence or explicit `none`.

### Step 4: Render gate verdicts and decision record

Create `plans/NEXT-STAGE-PROMOTION-DECISION.md`. For each six-section gate in
this plan, copy the criteria and mark each subcriterion `MET`, `NOT MET`, or
`REJECTED`, linking exact evidence rows/symbols/commands. Do not average the
criteria; one required unmet row keeps that abstraction internal/unimplemented.

The expected baseline verdict, unless execution evidence materially changes,
is:

| Candidate | Expected verdict |
|---|---|
| Shared file-level inspection/validation | earned internally; public gate not met without external inspection-only consumer/cross-format support |
| Public artifact/provenance | not met; internal exact stage tuple only |
| Versioned receipts | not met; no named durable-record consumer |
| `SemanticPlan` | rejected now; inputs/toolchain not closed/content-identified and no second binder |
| `BoundExecutionPlan` | rejected now; depends on SemanticPlan and real binding evidence |
| Replaceable executors | rejected now; two local producers are not two backends |

If evidence unexpectedly earns a candidate beyond this expected verdict, this
plan still does not implement it or create a follow-on plan. Record the proposed
semver, consumer, schema, and migration consequences in the decision document
and wait for explicit maintainer selection.

**Verify**:

```sh
rg -n 'MET|NOT MET|REJECTED|same semantic request|same invocation|same output bytes' \
  plans/NEXT-STAGE-PROMOTION-DECISION.md
```

Expected: every criterion has a verdict/evidence and all three equalities are
explicit.

### Step 5: Update truthful architecture docs and freeze no overclaim

Update `docs/architecture.md` to state:

- the released surface remains Bun/Deno scalar and homogeneous matrix;
- a package-private continuation-owned bundle -> exact selected Node SEA
  topology proves shared native validation/publication and temporary cleanup;
- ordered stage observations are not receipts or reproducibility claims;
- direct and composed operations do not constitute replaceable executors; and
- public promotion is controlled by the linked decision gates.

Extend docs contract tests with positive required boundary sentences (for
example, "stage observations are not build receipts or reproducibility
evidence") plus exact public-export assertions. Do not use a broad prohibited-
word regex that also rejects truthful negative disclaimers. Do not add a user-
facing example for an unexported operation.

**Verify**:

```sh
bun run build && bun run test:architecture
bun run verify
```

Expected: docs and deterministic gates pass; exact public surface remains
unchanged.

### Step 6: Close the program without speculative follow-ons

Run:

```sh
git diff --check
program_start_sha="$(sed -n 's/^Program start SHA: `\([0-9a-f]\{40\}\)`$/\1/p' \
  plans/research/next-stage-promotion-evidence.md)"
test -n "$program_start_sha"
unexpected="$(git diff --name-only "$program_start_sha"..HEAD | \
  rg -v '^(plans/README\.md|plans/NEXT-STAGE-PROMOTION-DECISION\.md|plans/research/next-stage-promotion-evidence\.md|docs/architecture\.md|test/architecture/docs-contract\.test\.ts)$' || true)"
test -z "$unexpected"
unexpected_dirty="$(git status --porcelain=v1 | cut -c4- | \
  rg -v '^(plans/README\.md|plans/NEXT-STAGE-PROMOTION-DECISION\.md|plans/research/next-stage-promotion-evidence\.md|docs/architecture\.md|test/architecture/docs-contract\.test\.ts)$' || true)"
test -z "$unexpected_dirty"
git status --short
```

The exact labeled start-SHA line must have been recorded before the first edit.
The committed diff from it may contain only the five in-scope paths above;
this catches committed out-of-scope work that a dirty
working-tree check would miss. Update Plan 019's README row with the
evidence-based verdict. Add no new source
implementation plan unless a gate is fully met **and** the maintainer explicitly
selects it after reading the record.

## Test plan

- Re-run all deterministic, real compiler/target, and Node SEA vertical gates.
- Validate every recorded workflow receipt against the exact source SHA.
- Architecture tests freeze public no-growth and reject overclaims.
- Evidence tables trace shared symbols and independent topology-specific
  execution.
- Consumer inventory and all promotion subcriteria have machine-searchable
  verdicts.
- Compression ledger separates production/tests/docs/plans/tooling counts.

## Done criteria

- [ ] Both direct and composed topologies are green under required exact
      real-tool evidence in Plan 018's full receipt; all implementation/test
      paths matched that SHA at entry, and only the locally verified Plan 019
      docs-contract test changed afterward.
- [ ] Evidence packet names every file/symbol/tool/version/host/command needed
      to reproduce the comparison without secrets.
- [ ] One shared native validation/publication owner is proven; no universal
      producer adapter was introduced.
- [ ] All six public-promotion candidates have criterion-level verdicts and
      named consumers or explicit absence.
- [ ] Same semantic request, same invocation, and same output bytes are
      separately defined.
- [ ] Public API/Artifact remains unchanged and no public feature was added.
- [ ] Docs contain no hermeticity/reproducibility/remote/cache/public-pipeline
      overclaim.
- [ ] `bun run verify` and architecture docs tests exit 0.
- [ ] No source or out-of-scope/user-owned dirty file was modified.
- [ ] Committed and dirty changes since the recorded Plan 019 start SHA are
      confined to the five exact documentary/test paths in scope.

## STOP conditions

Stop and report; do not improvise if:

- Either topology or required receipt is not green for the exact evaluated SHA.
- Native validation/publication is still duplicated; return to the responsible
  implementation plan instead of documenting promotion.
- Someone attempts to promote a candidate with no named consumer or an unmet
  criterion. Recording `NOT MET`/`REJECTED` and continuing to the complete
  decision record is the expected path, not a STOP.
- A semantic plan would contain local entrypoint/output paths, ambient config/
  environment, selected tool paths, workspace, backend, or transport identity.
- "Multiple backends" evidence is only Bun vs Deno, scalar vs matrix, fake
  processes, or esbuild's package-managed service vs a local child; none is a replaceable
  backend proof.
- Documentation changes require a public export/source/schema/package version.
- An out-of-scope file must change or a verification fails twice after a
  reasonable correction.

## Maintenance notes

- Re-evaluate gates after observable consumer/backend evidence changes, not on
  a calendar.
- Receipts should always say what was observed. Closed inputs/toolchain identity
  and byte digests are separate facts and may remain absent/different.
- If an Artifact hard cut is ever approved, remove singular representation in
  the same versioned cut; never grow `tool` and `tools` peers indefinitely.
- Advanced transaction/failure control should compose earned lower-level
  operations. Do not append policy booleans to matrix or publication inputs.

## Compression ledger

| Candidate | Earned now | Kept internal/rejected until evidence changes |
|---|---|---|
| Native validation + atomic publication | Shared internal capability after two topologies | public inspection without consumer/support matrix |
| Continuation-owned JavaScript bundle | Concrete internal callback artifact with one consumer | raw handle/general bundle protocol/public artifact |
| Node SEA | Concrete internal consumer/producer | public compiler adapter, cross-target/signing/download modes |
| Stage observations | Exact internal tuple | public plural provenance/versioned receipt |
| Semantic/bound plans | nothing | all plan/executor/remote infrastructure |
