# Plan 013: Prove every provider target with required real evidence

> **Executor instructions**: Execute after Plan 011 is `DONE` and before Plan
> 012. It verifies the package-private provider tables through the existing
> scalar operation before those tables become public schemas. This plan
> explicitly supersedes the original gate-3 current-host-only advertisement:
> every table key becomes supported only when its pinned real compiler cell is
> green. Do not remove a failing cell, mark it experimental, or add a skip to
> make CI pass. A genuine capability mismatch reopens Plan 011 while the API is
> still private; resolve and re-run both plans before matrix implementation.
>
> **Drift check (run first)**:
>
> ```sh
> rg -q '^\| 011 \|.*\| DONE \|$' plans/README.md
> git diff --stat eb2995c2597f6765302de2e223b643f8b9946fde..HEAD -- \
>   src test typetest scripts tooling .github package.json pnpm-lock.yaml docs
> git status --short
> pnpm verify
> ```
>
> Expected: Plan 011 is complete, Plan 012 has not started, Plan 011's scoped
> changes are understood, and the deterministic gate exits 0.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `plans/011-centralize-provider-target-contracts.md`
- **Category**: tests / CI / compatibility / docs
- **Planned at**: commit `eb2995c`, 2026-08-12
- **Effect baseline**: `effect@4.0.0-beta.107`
- **Required completion receipt**: pending. Do not mark this plan `DONE` until a
  required CI run for the exact implementation commit has green `quality`,
  `real-tools`, `publication-hosts`, and both target-support provider shards,
  and an unbulleted receipt is appended to this file with the literal prefix
  `Target evidence:`, the GitHub run URL, ` @ `, and the full 40-character SHA.

### First exact-source run (not a completion receipt)

The required run at
`https://github.com/mannyc2/effect-build/actions/runs/31614922393` for source
`37723270060a183f2a0cccf57c19a13a3f14bd4f` passed quality, real-tools, and all
three publication hosts, but intentionally failed both target-support shards.
Bun passed six of eight provisional cells; the ARM64-musl output contradicted
its label with `GLIBC_2.0` references, and pinned Bun could not acquire a
Windows ARM64 runtime. That evidence reopened Plan 011 and narrowed Bun to six
targets rather than weakening this plan's oracle. Deno compiled all six; its
two valid Linux ELFs exposed Ubuntu libmagic 5.45's default 128 MiB ELF-section
inspection ceiling. The independent `file` invocation is therefore kept
strict but given an explicit bounded 256 MiB `elf_shsize` limit, while all
`readelf` format, architecture, interpreter, and ABI checks remain unchanged.

## Why this matters

A future public provider Target type is a support promise, not an autocomplete
hint. The provisional internal package mapped eight Bun targets and six Deno
targets, but advertised only Node/Linux-x64-GNU and kept four foreign compile
tests optional. A typed target matrix would make that mismatch more visible and more costly: callers
would build release matrices from values the package has never required itself
to produce.

This plan resolves the reopened support gate without weakening the original
principle: **advertise equals test**. Every provider target gets ordinary,
non-skipping real compilation and independent external binary validation. Only current-host
artifacts are executed; executing a foreign binary is neither possible nor
needed to prove the compiler emitted its declared format/architecture/ABI.

## Gate-3 resolution

Supersede gate decision 3's target subset while preserving its reasoning:

- supported orchestrator host remains Node;
- supported compilers remain pinned Bun 1.3.9 and Deno 2.9.3 fixtures for CI;
- supported Bun artifact targets become all six evidence-backed Bun table literals;
- supported Deno artifact targets become all six internal Deno table literals;
- every `(compiler, target)` pair appears in the authored support manifest and
  runs as a non-skipping invocation in one of two required provider jobs;
- the provider job matrix uses `fail-fast: false`, and each provider-local
  verifier accumulates every target failure before exiting nonzero;
- every cell compiles, validates the Artifact metadata, independently inspects
  the published native header, and checks optional digest/byte count;
- the two Linux-x64-GNU current-host cells additionally execute through the
  existing `verify:real` lane; and
- Bun/Deno orchestrator-host lanes remain experimental. This plan changes the
  artifact target axis, not the orchestrator axis.

The exact required cells are:

| Compiler | Required targets |
|---|---|
| Bun 1.3.9 | `macos-x64`, `macos-aarch64`, `linux-x64-gnu`, `linux-x64-musl`, `linux-aarch64-gnu`, `windows-x64` |
| Deno 2.9.3 | `macos-x64`, `macos-aarch64`, `linux-x64-gnu`, `linux-aarch64-gnu`, `windows-x64`, `windows-aarch64` |

This does not reopen gate 1: callers still import exactly one provider module,
and there is no driver value, registry, or fallback. It does not expand the
compiler options or artifact fields.

## Evidence contract

For one environment-selected cell, the real test must:

1. require explicit `EFFECT_BUILD_TARGET_COMPILER`,
   `EFFECT_BUILD_TARGET`, and the matching provisioned compiler executable;
   missing values fail the test rather than skip it;
2. call the selected provider's existing scalar `compileExecutable` through a
   deliberate internal/runtime-safe boundary with an explicit table target,
   unique temporary outfile, and `digest: true`;
3. assert the returned `artifact.tool` name/version/path, exact target, absolute
   final path, byte count, and SHA-256;
4. invoke an external independent oracle on the published file: Ubuntu's
   `/usr/bin/file --brief` for format/architecture and `/usr/bin/readelf -lW`
   plus `readelf -VW` for ELF interpreter/libc evidence;
5. assert Windows cells publish the caller-selected `.exe` filename and other
   cells do not gain one; and
6. never execute a foreign output. Current Linux-x64-GNU execution remains in
   `test/integration/standalone-bun.test.ts` and Deno equivalent.

The test must not call `inspectNativeExecutable` or any package parser as its
oracle: production already uses that code. Assert external evidence as follows:

- Mach-O: `file` reports Mach-O plus exactly x86_64 or arm64;
- PE: `file` reports PE32+ plus exactly x86-64 or Aarch64;
- ELF: `file` and `readelf -hW` agree on ELF64 plus x86-64 or AArch64;
- GNU: `readelf -lW` reports a `PT_INTERP` path containing `ld-linux`; any
  version table is supporting evidence and must not contradict GNU;
- musl: `readelf -lW` reports a `PT_INTERP` path containing `ld-musl`; a static
  file with no interpreter is insufficient evidence for either ABI; and
- ambiguous/unknown output fails the cell rather than falling back to Artifact
  metadata.

This is independent evidence for the target claim, not a second production
parser.

## Tool provisioning policy

Keep Bun/Deno compiler pins and checksums in `tooling/tool-pins.json`. The
current Deno current-host lane may continue setting the pinned Linux GNU
`DENORT_BIN`.

Foreign target compilation may use each compiler's documented ordinary target
runtime acquisition and cache behavior. Do not add runtime downloads, cache
directories, target tokens, or `DENORT_BIN` to the library API. The cross-target
CI lane must not set the Linux-only `DENORT_BIN` for foreign Deno targets.

Allow `scripts/provision-tool-assets.mjs` to accept a narrow `--only bun` or
`--only deno` mode so each provider job does not download irrelevant compiler
fixtures. With no `--only`, it must preserve the existing real-tools behavior
and output Bun, Deno, and current-host denort paths. Validate the argument; no
generic URL or arbitrary asset option is allowed.

`pnpm verify:targets` is an explicitly Linux-x64 real-tool gate. Its Node
orchestrator must create one temporary `EFFECT_BUILD_TOOL_DIR`, provision both
pinned compilers there, parse their emitted paths, run all 12 cells, and clean
the directory. `--compiler bun|deno` narrows the same script for CI and
provisions only that compiler. On other hosts the command fails immediately
with an actionable “run the required Ubuntu CI gate” message; it must not use
an unpinned local compiler and must not pretend to pass. Plan 014 accepts the
observed required CI job as completion evidence when the development host is
not Linux x64.

Deno 2.9.3's official GitHub release includes both the Windows ARM64 compiler
and `denort-aarch64-pc-windows-msvc.zip`; nevertheless, the real compile remains
the acceptance oracle because current Deno docs lag that sixth target.

## Current state

- `tooling/support-matrix.json:5-8` advertises only Node/Linux-x64-GNU with Bun
  and Deno.
- `docs/drivers.md:28-47` lists the mappings but calls foreign targets
  experimental.
- `test/integration/standalone-cross-target.test.ts:31-50` has only four
  macOS/Windows cases and is not part of `pnpm verify` or `pnpm verify:real`.
- `.github/workflows/ci.yml:29-52` requires one Linux real-tool lane and sets a
  Linux GNU `DENORT_BIN`; there is no required foreign-target job.
- `.github/workflows/release.yml` mirrors deterministic, real-tool, and
  publication gates but has no target-support dependency before publish.
- `test/architecture/generated-and-ci.test.ts:24-62` verifies compiler pins and
  publication hosts but does not compare provider Target literals to supported
  cells.
- `scripts/provision-tool-assets.mjs:14-36` always downloads all three current
  assets and requires all outputs.
- Production already validates through
  `src/standalone/internal/NativeExecutable.ts`; reusing it in integration would
  not be independent evidence. Ubuntu `file` and `readelf` are the required
  external oracle.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Tooling schema | `node scripts/read-tooling.mjs` | exits 0 and prints validated JSON |
| Deterministic contract | `pnpm test:architecture` | manifests, internal tables, and two provider jobs agree |
| One target cell | `EFFECT_BUILD_TARGET_COMPILER=bun EFFECT_BUILD_TARGET=windows-x64 EFFECT_BUILD_BUN_BIN=/absolute/bun pnpm test:integration:target` | one real compile/header test passes |
| All target cells (Linux x64) | `pnpm verify:targets` | self-provisions pinned tools and reports all 12 cells |
| Current host | `pnpm verify:real` | current Linux GNU builds execute in CI-equivalent environment |
| Full deterministic | `pnpm verify` | exit 0 |

The Node orchestration script must enumerate the authored support manifest,
call provisioning and the test process without a shell, accumulate every
failing cell, clean its temporary directory, and exit nonzero after reporting
all failures.

## Scope

**Create:**

- `test/integration/standalone-target-support.test.ts`
- `scripts/verify-target-support.mjs` as the one manifest-driven provider/all
  cell orchestrator
- `scripts/verify-workflow-receipt.mjs` as a read-only `gh api` verifier for an
  exact GitHub Actions run URL, head SHA, conclusion, and required job shards

**Modify:**

- `tooling/support-matrix.json`
- `scripts/read-tooling.mjs`
- `scripts/provision-tool-assets.mjs`
- `package.json`
- `test/architecture/generated-and-ci.test.ts`
- `test/integration/standalone-cross-target.test.ts` (delete it after its useful
  cases move to the exhaustive required test; do not keep an optional duplicate)
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `README.md`
- `docs/drivers.md`
- `docs/architecture.md` only to state the support/evidence boundary
- `plans/README.md` for the gate-3 supersession and Plan 013 status

**Out of scope:**

- silently changing provider target mappings/types from Plan 011; a real
  mismatch blocks this plan and explicitly reopens Plan 011 before any public
  cut;
- matrix implementation/public API from Plans 012/014;
- supporting another compiler version or orchestrator host;
- executing macOS/Windows/foreign-architecture outputs on Linux;
- packaging, signing, notarization, GitHub release uploads, containers, remote
  caching, or compiler auto-install in product source;
- weakening pinned action hashes or release provenance; and
- marking required cells optional, skipped, experimental, or
  `continue-on-error`.

## Git workflow

- Continue on the current branch; if creating a branch, use
  `codex/013-cross-target-evidence`.
- Suggested commit: `test: require every provider target cell`.
- Do not push, tag, publish, or create a release unless separately instructed.

## Steps

### Step 1: Author the exact support matrix and drift tests

Expand `tooling/support-matrix.json` so the 12 `(compiler, target)` pairs are
data, not prose. Order Bun first and Deno second, with each provider's cells in
its table-literal order. Keep the existing Node orchestrator and three
publication hosts. Update `read-tooling.mjs` to reject:

- duplicate pairs;
- unknown compiler names;
- malformed canonical target strings;
- any supported-cell key other than exactly `orchestrator`, `runner`, `target`,
  and `compiler`;
- any orchestrator other than `node` or runner other than `ubuntu-24.04`;
- a target outside the corresponding package-private table literal set
  (verified by the architecture test after build); and
- a provider literal with no supported cell; and
- any supported-cell ordering that differs from the provider/table order above.

Update architecture tests to import the built package-private pure target-table
modules and assert that manifest targets for each compiler equal that table's
exact literals. This is an intentional equality between internal capability
and advertised release policy before Plan 014 exports the schemas.

**Verify**:

```sh
node scripts/read-tooling.mjs
pnpm build
pnpm exec vitest run test/architecture/generated-and-ci.test.ts
```

Expected: exact 6/6 equality passes; duplicate/missing/extra test fixtures are
rejected.

### Step 2: Replace the optional sample with one strict target-cell test

Create `standalone-target-support.test.ts` with exactly one environment-selected
cell per process. Validate its environment at module/test setup and fail with
an actionable message if anything is absent. Select Bun/Deno explicitly; do
not build a production compiler registry to share test code.

Use a portable temporary directory and the real provider Layer. Validate the
Artifact plus the independent external oracle specified above. Assert `file`
and `readelf` exist up front. Set a bounded
timeout appropriate for target runtime acquisition. Move useful assertions
from the four-case optional file, then delete that file so the repository has
one real cross-target authority.

**Verify**:

```sh
tool_dir="$(mktemp -d)"
trap 'rm -rf -- "$tool_dir"' EXIT HUP INT TERM
tool_output="$(EFFECT_BUILD_TOOL_DIR="$tool_dir" node scripts/provision-tool-assets.mjs)"
bun_bin="$(printf '%s\n' "$tool_output" | sed -n 's/^bun=//p')"
deno_bin="$(printf '%s\n' "$tool_output" | sed -n 's/^deno=//p')"
test -x "$bun_bin" && test -x "$deno_bin"
EFFECT_BUILD_TARGET_COMPILER=bun \
EFFECT_BUILD_TARGET=macos-aarch64 \
EFFECT_BUILD_BUN_BIN="$bun_bin" \
pnpm test:integration:target
DENO_DIR="$tool_dir/deno-cache" \
EFFECT_BUILD_TARGET_COMPILER=deno \
EFFECT_BUILD_TARGET=macos-aarch64 \
EFFECT_BUILD_DENO_BIN="$deno_bin" \
pnpm test:integration:target
```

Expected on Ubuntu x64: the existing provisioner supplies the pinned fixtures,
each test runs exactly one macOS/aarch64 cell, the external oracle agrees, no
foreign `DENORT_BIN` is set, and the explicit caller-owned temporary directory
is removed by the trap.

### Step 3: Add one manifest-driven Linux real-gate orchestrator

Implement `scripts/verify-target-support.mjs` and wire `verify:targets` to its
default all-provider mode. It validates Linux x64, creates and cleans one
temporary tool directory, provisions the necessary compiler pins, and executes
every matching manifest cell sequentially by default. It must continue after a
typed/test failure so one run reports all bad cells, then exit nonzero.

Accept only `--compiler bun` or `--compiler deno` for provider-sharded CI.
Unknown or duplicate arguments fail. The script may import `readTooling`; it
must not import provider source or invent target cells. It passes one absolute
provisioned compiler path and one target at a time to the strict integration
test. Deno gets a shared temporary `DENO_DIR` for ordinary target-runtime
caching but no foreign `DENORT_BIN`.

`--only` provisioning must keep existing default output stable. The provisioner
never deletes its root: it writes into explicit caller-owned
`EFFECT_BUILD_TOOL_DIR` when supplied, and otherwise preserves its current
emitted-path behavior for existing CI. The verifier alone creates, owns, and
cleans its temporary tool/cache root in `finally`. Tests or script self-checks
must reject unsupported `--only` values and prove the default still emits all
three current-host assets.

**Verify**:

```sh
node scripts/verify-target-support.mjs --compiler bun
node scripts/verify-target-support.mjs --compiler deno
pnpm verify:targets
```

Expected: provider commands report 6 and 6 cells respectively; the all-cell
command reports 12 results and exits 0; and each verifier cleans the temporary
tool/cache directory it created. Network acquisition by the compilers is
allowed in this real gate. Unit/script self-checks separately prove that narrow
provisioning emits only the requested compiler path and default provisioning
still emits Bun, Deno, and denort without claiming the provisioner deletes a
caller-owned root.

### Step 4: Make every target pair required in two bounded provider jobs

Add a `target-support` job to both CI and release workflows:

- Ubuntu 24.04 runner;
- a two-entry compiler matrix (`bun`, `deno`) with `strategy.fail-fast: false`;
- in the release workflow, the provider job depends on `preflight`;
- existing SHA-pinned checkout/setup actions and frozen install;
- run `node scripts/verify-target-support.mjs --compiler
  ${{ matrix.compiler }}`, which provisions only that compiler and accumulates
  every manifest target for it; and
- no `if` escape hatch, skip, `continue-on-error`, or Linux-only `DENORT_BIN`
  on foreign Deno cells.

Extend architecture tests to parse both workflows and prove the exact two
compiler shards, required accumulator command, action pins, and absence of
escape hatches or literal target lists in YAML. Script/manifest tests prove each
shard enumerates every internal table target. Make release `publish.needs` include
`target-support` in addition to quality, current-host real tools, and
publication hosts.

This is the accepted bounded CI shape: two additional real-tool jobs per
workflow, not twelve repeated checkout/install jobs. Each of the 12 cells is
still mandatory and separately reported inside its provider job.

**Verify**:

```sh
pnpm exec vitest run test/architecture/generated-and-ci.test.ts
pnpm verify
```

Expected: exact workflow/manifest equality passes and deterministic verification
is green.

### Step 5: Replace experimental target prose with the tested contract

Update README, compiler docs, architecture, and the gate record:

- list exact Bun 6 and Deno 6 target sets from the proven provider tables (Plan
  014 later exposes the same literal sets as public schemas);
- state Node remains the only supported orchestrator host;
- distinguish compile-plus-header validation for all targets from execution of
  current-host artifacts;
- remove claims that foreign targets are optional/experimental; and
- preserve the warning that support follows pinned compiler fixtures and is
  reverified, not enforced as runtime version rejection.

Do not document the matrix verb or provider `Target` exports yet; Plan 014 owns
both.

**Verify**:

```sh
pnpm test:architecture
pnpm verify
git diff --check
git status --short
```

Expected: docs and authored support data agree; only scoped files and the status
row changed.

### Step 6: Obtain and verify exact-source required CI evidence

Implement `verify-workflow-receipt.mjs` with one exact interface:

```sh
node scripts/verify-workflow-receipt.mjs \
  --receipt-file plans/013-require-cross-target-support-evidence.md \
  --prefix 'Target evidence:'
```

The helper parses exactly one line
`<prefix> https://github.com/<owner>/<repo>/actions/runs/<positive-id> @
<40-lowercase-hex-sha>`. Using `execFile("gh", ["api", ...])` without a shell,
it queries both `repos/<owner>/<repo>/actions/runs/<id>` and its
`/jobs?per_page=100` endpoint. It must require the run's `head_sha` to equal the
receipt SHA, `path` to be exactly `.github/workflows/ci.yml`, `conclusion` to be
`success`, and `event` to be `push` or `pull_request`; then require successful,
non-skipped jobs for exact `quality` and `real-tools`, all three
`publication-hosts` runner shards, and both `target-support` compiler shards.
Missing, duplicate, cancelled, skipped, non-success, or wrong-workflow runs
fail. Receipt syntax without live API agreement fails. Add helper self-tests for
malformed URL, mismatched SHA, wrong workflow path, missing/duplicate job, and
non-success job/run using an injected `gh` fixture; tests must not call the
network.

Commit the complete Plan 013 source, workflows, docs, and verification helper
before requesting evidence. With explicit remote/push authority, push that
commit and observe its required CI workflow. This repository has no configured
remote at the planning baseline, so remote selection and push are operator-owned
setup, not something to infer. Without a configured intended remote and push
authority, leave Plan 013 `IN PROGRESS` and report the external evidence gate;
do not fabricate a receipt or mark the target set supported.

After the required CI workflow is green, append the exact completion receipt
described in Status, run the helper above, and prove the receipt/status-only
follow-up changed no product or verification file:

```sh
node scripts/verify-workflow-receipt.mjs \
  --receipt-file plans/013-require-cross-target-support-evidence.md \
  --prefix 'Target evidence:'
evidence_sha="$(sed -n 's/^Target evidence: https:\/\/github.com\/.* @ \([0-9a-f]\{40\}\)$/\1/p' plans/013-require-cross-target-support-evidence.md)"
test -n "$evidence_sha"
git diff --exit-code "$evidence_sha" -- \
  src test typetest scripts tooling .github examples README.md docs AGENTS.md \
  package.json pnpm-lock.yaml
```

Expected: the live run, exact head SHA, and all required jobs pass; the scoped
diff is empty. Commit the receipt/status update and only then mark Plan 013
`DONE`.

## Test plan

- Manifest validation: duplicate pair, unknown compiler, extra target, missing
  internal table literal, unexpected key/runner/orchestrator, and exact 6/6
  happy path.
- One strict real invocation per manifest cell: missing env/tool is failure,
  not skip.
- Independent `file`/`readelf` assertions for Mach-O x64/aarch64, ELF
  x64/aarch64 GNU/musl, and PE x64/aarch64; package native parser imports are
  forbidden in this integration test.
- Byte count and SHA-256 recomputed independently.
- Windows final filename ends `.exe`; non-Windows chosen outfile does not.
- Workflow contract: exact two-provider matrix, `fail-fast: false`, no literal
  target duplication, no `continue-on-error`, pinned actions, accumulator
  command, and release dependency.
- Provision script: default all assets plus narrow Bun/Deno modes.
- Orchestrator: Linux-x64 enforcement, temporary-directory cleanup on success
  and failure, exact 6/6 counts, and all failures accumulated.

## Done criteria

- [x] `tooling/support-matrix.json` contains exactly Bun 6 and Deno 6 cells.
- [x] Built package-private provider table literals equal advertised cells
  exactly.
- [x] Every cell is a required, non-skipping invocation in CI and release; two
  provider jobs report all 6/6 cells without repeated per-target setup.
- [x] Every cell compiles with its pinned compiler and independently validates
  native OS/architecture/ABI.
- [x] Current Linux-x64-GNU Bun and Deno artifacts still execute in
  `verify:real`.
- [x] The optional four-cell cross-target test is deleted; no duplicate support
  authority remains.
- [x] Cross-target Deno cells do not receive the Linux-only `DENORT_BIN`.
- [x] Release publishing depends on target support.
- [x] Docs no longer call the proven provider target sets experimental, without
  claiming the still-unpublished provider Target exports.
- [x] `pnpm verify` and `pnpm verify:real` exit 0; `pnpm verify:targets` exits 0
  on provisioned Linux x64, and both required provider jobs are observed green.
- [x] This file contains the exact required GitHub-run receipt for the completed
  implementation SHA, and that SHA is the one reviewed by Plan 014.
- [x] No product or verification file differs from that recorded evidence
  commit; only receipt/status plan changes may follow it.
- [x] The recorded run's API conclusion, `head_sha`, and complete required job
  set and exact CI workflow path—not merely the receipt text—have been verified.
- [x] No file outside Scope is modified, other than the authorized gate/status
  updates.

## STOP conditions

Stop and report if:

- any Bun 1.3.9 or Deno 2.9.3 declared target fails real compilation twice
  after ruling out transient download failure;
- the independent external oracle disagrees with the requested target;
- Deno 2.9.3 does not in fact support `aarch64-pc-windows-msvc` in the pinned
  fixture;
- making a cell green requires passing hidden library environment/config flags
  or weakening normal compiler CLI behavior;
- required target runtime downloads cannot run reliably in ordinary CI and no
  checksummed official asset path is available (report the evidence and cost;
  do not silently make the cell optional);
- release workflow changes would publish or tag anything during verification;
- the intended GitHub remote or push authority is unavailable; leave the plan
  `IN PROGRESS` and report the exact external evidence gate rather than changing
  support claims; or
- any verification fails twice after a reasonable correction.

## Maintenance notes

- A package-private provider table literal and supported evidence cell are now
  one-to-one. Plan 014 publishes exactly that proven set.
- Real target evidence intentionally allows compiler-managed runtime downloads;
  this is not a product cache or auto-install feature.
- External binary inspection proves emitted target format, not runtime behavior
  on every foreign OS. Keep current-host execution as a separate assertion.
- Reviewers should scrutinize Windows ARM64, GNU/musl classification, workflow
  escape hatches, and release `needs`.

Target evidence: https://github.com/mannyc2/effect-build/actions/runs/31616301252 @ 2d430ec0b5abcd4e276cfe7c059f897ac4fc6b8b
