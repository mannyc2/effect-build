# Plan 026: Certify the five-package granular public cut without publishing it

> **Executor instructions**: This is an evidence and release-boundary plan, not
> a source-fix plan. Plan 025 must be `DONE` at one exact source commit, with
> only its declared plan-only receipt handoff left dirty. Run every local and
> remote gate against that exact commit and verify the produced
> candidate bytes. If a product/config/test defect appears, stop, reopen Plan
> the owning implementation plan, fix it there, obtain a new exact SHA, and
> restart this plan from the
> beginning. Do not patch source under this plan. Do not publish, tag, create a
> GitHub Release, or mutate trusted-publisher settings. Update this plan and
> `plans/README.md` with the exact receipt only after all gates pass.
>
> **Drift check (run first)**: Read the exact 40-character value from Plan
> 025's `Implementation source SHA` field into `IMPLEMENTATION_SHA` and run:
>
> ```sh
> test "$(bun --version)" = "1.3.14"
> rg -Fx -- '- Architecture generation: `granular-integration-v2`.' AGENTS.md
> IMPLEMENTATION_SHA="$(sed -n 's/^- \*\*Implementation source SHA\*\*: `\([0-9a-f]\{40\}\)`$/\1/p' plans/025-add-bun-javascript-bundling.md)"
> test "${#IMPLEMENTATION_SHA}" -eq 40
> test "$(git rev-parse HEAD)" = "$IMPLEMENTATION_SHA"
> git diff --exit-code HEAD -- . \
>   ':(exclude)plans/025-add-bun-javascript-bundling.md' \
>   ':(exclude)plans/README.md'
> test -z "$(git ls-files --others --exclude-standard)"
> git status --short
> git merge-base --is-ancestor 60259f98a460b3d9b25b95221ca71b56c17d9d78 HEAD
> ```
>
> Expected: HEAD equals the Plan 025 implementation source SHA, the ancestry
> check exits 0, and status contains only Plan 025's two declared plan-only
> handoff edits. Plan 026 and its promotion decision must still be untouched at
> entry. Any untracked path or any other tracked diff is a STOP.

## Status

- **Priority**: P1
- **Effort**: M plus remote CI time
- **Risk**: HIGH
- **Depends on**: Plans 023, 024, and 025
- **Category**: tests / direction / release evidence
- **Planned at**: commit `60259f9`, 2026-08-14
- **Initial state**: TODO after Plan 025

## Why this matters

Package boundaries are release claims, not just TypeScript structure. The
granular design is complete only if Esbuild and Node SEA install independently,
the application-composed pipeline works with exact real tools, Bun/Deno keep
all existing axes, five tarballs contain the intended dependency graph, and
the evidence comes from one immutable source commit. A green local unit suite
cannot prove any of those conjunctions.

This plan also prevents release work from smuggling in the speculative
architecture already rejected. Successful five-package evidence earns the
selected artifact/target/integration APIs; it does not earn manifests,
receipts, generic plans/executors, stores, caches, or remote execution.

## Required implementation state

Before any remote action, verify the following live facts from Plans 024-025 rather
than assuming them from prose:

1. Exactly five public package manifests exist at lockstep `0.3.0`:
   `effect-build`, `effect-build-bun`, `effect-build-deno`,
   `effect-build-esbuild`, and `effect-build-node-sea`.
2. Bun, Deno, Esbuild, and Node SEA each declare only `effect-build` as a
   workspace sibling dependency; Esbuild alone also declares exact raw
   `esbuild@0.28.2`. Node SEA has no Esbuild dependency.
3. Deno exports only its unchanged scalar/matrix surface. Bun retains those
   operations and additively exports its scoped bundle continuation. Esbuild
   exports its independent continuation service. Node SEA exports the granular
   assembly service and accepts either producer through core only.
4. Core owns the neutral Artifact/Target/JavaScriptBundle/Integration contract
   and no integration literal/version catalog.
5. `scripts/test-built-consumer.mjs` expects five tarballs and fourteen consumer
   cases; `.github/workflows/release.yml` remains non-mutating.

At the planning baseline, the workflow separation to preserve is visible in
`.github/workflows/ci.yml:11-153`: quality, exact Node producer, real tools,
two target-support cells, two Effect endpoints, and three publication hosts.
Plans 024-025 must add independent Esbuild and Bun bundle evidence without
deleting any of those axes.

At the planning baseline, `.github/workflows/release.yml:1-100` has only
`contents: read`, exact commit checkout, validation, packing/consumer tests,
and artifact upload. It has no npm publish, tag, GitHub Release, OIDC write, or
trusted-publisher mutation. Retain that boundary.

## Evidence contract

### Exact required CI jobs

The final CI workflow must report all of these successful jobs for the exact
Plan 025 SHA:

1. `quality`;
2. `esbuild` — public standalone Esbuild API/package evidence;
3. `node-sea` — public application-composed Esbuild -> Node SEA ESM/CJS
   evidence using ambient Node 24.14.1 and captured exact Node 26.7.0;
4. `bun-bundle` — standalone Bun ESM/CJS bundle evidence, the frozen
   Bun/Esbuild differential behavior fixture, and application-composed Bun ->
   Node SEA idiom-heavy ESM/CJS evidence using exact Bun 1.3.9 and exact Node
   26.7.0 as separately captured producers;
5. `real-tools` — current Bun/Deno scalar and host smoke;
6. `target-support (bun)`;
7. `target-support (deno)`;
8. `effect-compatibility (4.0.0-beta.104)`;
9. `effect-compatibility (4.0.0-rc.108)`;
10. `publication-hosts (ubuntu-24.04)`;
11. `publication-hosts (macos-15)`;
12. `publication-hosts (windows-2025)`.

No skipped/cancelled/neutral job counts as evidence. The producer capture step
must set its own output from `node -p process.execPath`; `actions/setup-node`
does not provide a path output. Node 24 must be restored after capture and both
versions/paths asserted before install/test.

### Candidate contents

The exact-SHA candidate workflow must upload one artifact containing exactly:

```text
effect-build-0.3.0.tgz
effect-build-bun-0.3.0.tgz
effect-build-deno-0.3.0.tgz
effect-build-esbuild-0.3.0.tgz
effect-build-node-sea-0.3.0.tgz
manifest.json
```

The manifest records exact source SHA, filename, package name/version, size,
and SHA-256 for each tarball. Each tarball is packed once and those exact bytes
are used by the fourteen consumer cases. Packed workspace dependencies are
rewritten to `effect-build: ^0.3.0`; only the Esbuild tarball contains exact
`esbuild: 0.28.2`. No source/workspace/file/link dependency or private path is
present.

### Consumer evidence

All fourteen cases are required:

- npm and Bun isolated consumers for core;
- npm and Bun isolated consumers for Bun, including its scoped bundle API;
- npm and Bun isolated consumers for Deno;
- npm and Bun isolated consumers for Esbuild;
- npm and Bun isolated consumers for Node SEA;
- npm and Bun applications declaring and composing Esbuild plus Node SEA;
- npm and Bun applications declaring and composing Bun plus Node SEA.

The Node SEA-only installations must prove neither `effect-build-esbuild`,
`effect-build-bun`, nor raw `esbuild` resolves. The Esbuild-only installation
must prove Node SEA and Bun do not resolve. The Bun-only installation must
prove Esbuild and Node SEA do not resolve. Each composed consumer must declare
every integration tarball it uses directly; transitive success is not evidence
of the star graph.

### Public compatibility decision

The existing published v0.2 package exposes `effect-build/bun` and
`effect-build/deno`. The selected v0.3 architecture uses separate packages and
cannot preserve those exact specifiers without a core -> integration cycle,
duplicate implementation, or optional unresolved facade. The deliberate
breaking migration is therefore:

```text
effect-build/bun  -> effect-build-bun
effect-build/deno -> effect-build-deno
```

The callable operation/type semantics and behavior are preserved. There is no
legacy subpath fallback. If exact old module identity becomes mandatory, this
plan stops because one architectural constraint must be changed by the
maintainer.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| frozen install | `bun install --frozen-lockfile` | exit 0; no lock change |
| complete deterministic | `bun run verify` | all build/check/type/unit/consumer/architecture/lint/format gates pass |
| Effect range | `bun run verify:effect` | beta.104 and rc.108 fresh copies pass |
| real Bun/Deno | host-aware pinned block in Step 2 | exact Bun 1.3.9/Deno 2.9.3/denort evidence passes locally on Linux x64 or in required exact-SHA `real-tools` CI |
| 12 targets | `bun run verify:targets` | six Bun + six Deno compile/header cells pass on approved Linux host |
| optional hosts | `bun run test:host:extra` | Bun/Deno orchestrator smokes pass where installed |
| exact Node SEA | `EFFECT_BUILD_NODE_SEA_BIN=/absolute/node-26.7.0 bun run test:integration:node-sea` | ESM/CJS public pipeline executables run on Linux x64 GNU |
| exact Bun bundle | explicit Bun 1.3.9 and Node 26.7.0 paths with `bun run test:integration:bun-bundle` and `bun run test:integration:bun-node-sea` | Bun ESM/CJS bundles, differential `import.meta.main` characterization, and both idiom-heavy SEA executables pass on Linux x64 GNU |
| packed candidate | `node scripts/test-built-consumer.mjs --candidate-dir "$CANDIDATE_DIR"` | five tarballs + manifest; fourteen consumers pass |
| formatting | `git diff --check` | no output |

Use a task-specific temporary directory:

```sh
CANDIDATE_DIR="$(mktemp -d -t effect-build-026-candidate.XXXXXX)"
test -n "$CANDIDATE_DIR"
```

Do not use `$HOME`, `~`, a repository root, or an unresolved variable as a
cleanup target. Preserve the candidate directory until its hashes are recorded;
do not remove it under this plan.

## Scope

**In scope for modification**:

- `plans/025-add-bun-javascript-bundling.md` — pre-existing Plan 025
  implementation receipt only; do not alter it under this plan;
- `plans/026-certify-five-package-public-cut.md` — status and exact receipt;
- `plans/README.md` — status/dependency/decision summary;
- `plans/GRANULAR-API-PROMOTION-DECISION.md` (new evidence decision record).

**Read-only evidence scope**:

- all source, tests, manifests, lockfile, tooling, docs, examples, scripts, and
  `.github/workflows/**` produced by Plans 023-025;
- Git/GitHub Actions and candidate artifacts for the exact implementation SHA;
- public package/tag metadata queried without mutation.

**Out of scope**:

- any source/config/test/workflow fix; return defects to the owning
  implementation plan and restart;
- npm publish, Git tag, GitHub Release, package-name reservation, trusted-
  publisher mutation, or release workflow with write authority;
- accepting a skipped/older/different-SHA job or locally fabricated receipt;
- changing Bun/Deno behavior, targets, or published v0.2 tags;
- adding a publisher fallback or four/five independent publish invocations;
- public native inspection, durable manifest/receipt product, ArtifactStore,
  cache/CAS, generic bundler/packager, plan/executor, registry/fallback,
  remote/container backend, or transport.

## Git and remote workflow

- Start with `HEAD` at the exact Plan 025 implementation SHA and no dirty path
  except Plan 025's already-recorded receipt plus the matching README status.
- Local verification is read-only except disposable external temp/cache paths.
- Pushing the implementation branch, opening a PR, or dispatching the existing
  non-mutating candidate workflow requires explicit operator instruction.
- Never push plan receipt edits before the implementation's exact-source jobs
  complete; otherwise the receipt commit is not the tested source. Record the
  implementation SHA separately and truthfully.
- Do not publish/tag/release even after all gates pass. Plan 021 remains blocked
  until a public release coordinator proves the five-package state machine.

## Steps

### Step 1: Audit the final graph and public declarations locally

Read all five manifests, package export maps, `tooling/public-api.json`, and
built `.d.ts` output. Verify exact package edges and runtime keys. Run searches
for stale combined-facade and integration-version ownership.

**Verify**:

```sh
test "$(bun --version)" = "1.3.14"
bun install --frozen-lockfile
bun run build
node scripts/read-tooling.mjs
bun run test:types
bun run test:architecture
git diff --check
```

Expected: all exit 0. Additionally, production-source searches show no
`effect-build-node-sea` import from Esbuild, no `effect-build-esbuild` import
from Node SEA, raw `from "esbuild"` only in the Esbuild package, and no Node
SEA/Esbuild provider case in core.

### Step 2: Run every local deterministic and compatibility gate

Run the complete local gate from the clean exact SHA. Do not edit on failure.

**Verify**:

```sh
test "$(bun --version)" = "1.3.14"
bun run verify
bun run verify:effect
if test "$(uname -s)-$(uname -m)" = "Linux-x86_64"; then
  TOOLS_FILE="$(mktemp)"
  node scripts/provision-tool-assets.mjs > "$TOOLS_FILE"
  EFFECT_BUILD_BUN_BIN="$(sed -n 's/^bun=//p' "$TOOLS_FILE")"
  EFFECT_BUILD_DENO_BIN="$(sed -n 's/^deno=//p' "$TOOLS_FILE")"
  DENORT_BIN="$(sed -n 's/^denort=//p' "$TOOLS_FILE")"
  test "$("$EFFECT_BUILD_BUN_BIN" --version)" = "1.3.9"
  test "$("$EFFECT_BUILD_DENO_BIN" --version | sed -n '1s/^deno //p')" = "2.9.3"
  test -x "$DENORT_BIN"
  EFFECT_BUILD_BUN_BIN="$EFFECT_BUILD_BUN_BIN" \
  EFFECT_BUILD_DENO_BIN="$EFFECT_BUILD_DENO_BIN" \
  EFFECT_BUILD_DENO_VERSION="2.9.3" \
  DENORT_BIN="$DENORT_BIN" \
  bun run verify:real
  EFFECT_BUILD_BUN_BIN="$EFFECT_BUILD_BUN_BIN" \
  bun run test:integration:bun-bundle
else
  echo "UNAVAILABLE: pinned real-tool assets require Linux-x86_64; Step 4 exact-SHA CI real-tools is mandatory"
fi
if command -v deno >/dev/null 2>&1; then
  bun run test:host:extra
else
  echo "UNAVAILABLE: optional Deno-host smoke (deno not installed)"
fi
git status --short
```

Expected: deterministic and compatibility commands exit 0; pinned real tools
either pass locally on Linux x64 with the exact explicit paths or are recorded
unavailable solely for host incompatibility and remain mandatory in Step 4's
exact-SHA `real-tools` job. The optional Deno-host lane either passes or is
explicitly recorded unavailable; status still contains only Plan 025's two
declared plan-only handoff edits. Never fall back to PATH, substitute
package-manager Bun 1.3.14 for compiler Bun 1.3.9, or include file contents or
secrets in the receipt.

On an approved Linux host also run:

```sh
bun run verify:targets
EFFECT_BUILD_NODE_SEA_BIN=/absolute/path/to/node-26.7.0 bun run test:integration:node-sea
EFFECT_BUILD_BUN_BIN=/absolute/path/to/bun-1.3.9 \
EFFECT_BUILD_NODE_SEA_BIN=/absolute/path/to/node-26.7.0 \
bun run test:integration:bun-node-sea
```

Expected: 12/12 target cells pass; Esbuild-origin and Bun-origin ESM/CJS
executables run. If the planning host is macOS/Windows or lacks exact Node,
record the local gate as unavailable, not failed/skipped evidence; Step 4's
exact CI jobs remain mandatory.

### Step 3: Pack once and verify local candidate consumers

Create a fresh owned temp directory and run the candidate consumer script once.
List the directory, parse the manifest, inspect each tarball manifest/exports,
and independently recompute SHA-256 values using a read-only tool. Verify the
six-file inventory and fourteen-consumer result.

**Verify**:

```sh
CANDIDATE_DIR="$(mktemp -d -t effect-build-026-candidate.XXXXXX)"
node scripts/test-built-consumer.mjs --candidate-dir "$CANDIDATE_DIR"
node scripts/verify-candidate.mjs --directory "$CANDIDATE_DIR" --source "$(git rev-parse HEAD)"
find "$CANDIDATE_DIR" -maxdepth 1 -type f -print | sort
```

Expected: exactly the five named tarballs and `manifest.json`; every recomputed
hash/size/name/version/source/dependency field matches through the independent
verifier. Record the directory and hashes. Do not call the candidate a release
or receipt product.

### Step 4: Require exact-source remote CI

With operator authorization, push the implementation commit and obtain one CI
run whose `head_sha` exactly equals the Plan 025 SHA. Inspect all twelve named
jobs and logs. Confirm Node 24 orchestrator / Node 26 producer separation in
the Node SEA and Bun-bundle jobs, public standalone Esbuild use in the Esbuild
job, and exact Bun 1.3.9 producer selection in the Bun-bundle job.

**Verify** (using the repository's authenticated GitHub tooling):

```sh
test "$(git rev-parse HEAD)" = "$IMPLEMENTATION_SHA"
gh run list --workflow ci.yml --event push --commit "$IMPLEMENTATION_SHA" --limit 5 --json databaseId,event,headBranch,headSha,status,conclusion,createdAt,url
# Set CI_RUN_ID to the exact push run from the filtered list above.
test -n "$CI_RUN_ID"
gh run watch "$CI_RUN_ID" --exit-status
test "$(gh run view "$CI_RUN_ID" --json event --jq .event)" = "push"
test "$(gh run view "$CI_RUN_ID" --json headSha --jq .headSha)" = "$IMPLEMENTATION_SHA"
gh run view "$CI_RUN_ID" --json event,headBranch,headSha,status,conclusion,jobs,url
```

Expected: `event: push`, exact `headSha`, completed/success, all twelve required jobs success,
no skip/cancel/neutral. Record run ID, URL, job names/conclusions, and source
SHA. If GitHub names matrix jobs differently, record their exact displayed
names but require the same twelve semantic cells.

### Step 5: Dispatch and independently verify the non-mutating candidate

With separate operator authorization, dispatch `.github/workflows/release.yml`
with the exact 40-character implementation SHA. Confirm its permissions remain
read-only and that checkout/input/HEAD agree. Download the resulting artifact
to a new owned temp directory and independently repeat the six-file,
manifest-hash, tarball-manifest, and dependency checks.

**Verify**:

```sh
test -n "$IMPLEMENTATION_REF"
test "$(git ls-remote --heads origin "refs/heads/$IMPLEMENTATION_REF" | awk '{print $1}')" = "$IMPLEMENTATION_SHA"
gh workflow run release.yml --ref "$IMPLEMENTATION_REF" -f commit="$IMPLEMENTATION_SHA"
gh run list --workflow release.yml --event workflow_dispatch --branch "$IMPLEMENTATION_REF" --commit "$IMPLEMENTATION_SHA" --limit 5 --json databaseId,event,headBranch,headSha,status,conclusion,createdAt,url
# Set CANDIDATE_RUN_ID to one databaseId from the exact filtered list above.
test -n "$CANDIDATE_RUN_ID"
gh run watch "$CANDIDATE_RUN_ID" --exit-status
test "$(gh run view "$CANDIDATE_RUN_ID" --json event --jq .event)" = "workflow_dispatch"
test "$(gh run view "$CANDIDATE_RUN_ID" --json headSha --jq .headSha)" = "$IMPLEMENTATION_SHA"
gh run view "$CANDIDATE_RUN_ID" --json event,headBranch,headSha,status,conclusion,jobs,url
REPOSITORY="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
ARTIFACTS_ENDPOINT="repos/$REPOSITORY/actions/runs/$CANDIDATE_RUN_ID/artifacts?per_page=100"
test "$(gh api "$ARTIFACTS_ENDPOINT" --jq '.total_count')" = "1"
test "$(gh api "$ARTIFACTS_ENDPOINT" --jq '.artifacts | length')" = "1"
CANDIDATE_ARTIFACT_COUNT="$(gh api "$ARTIFACTS_ENDPOINT" --jq '[.artifacts[] | select(.name == "effect-build-0.3.0-candidate")] | length')"
test "$CANDIDATE_ARTIFACT_COUNT" = "1"
CANDIDATE_ARTIFACT_ID="$(gh api "$ARTIFACTS_ENDPOINT" --jq '[.artifacts[] | select(.name == "effect-build-0.3.0-candidate")][0].id')"
CANDIDATE_ARTIFACT_DIGEST="$(gh api "$ARTIFACTS_ENDPOINT" --jq '[.artifacts[] | select(.name == "effect-build-0.3.0-candidate")][0].digest')"
printf '%s\n' "$CANDIDATE_ARTIFACT_ID" | rg -q '^[0-9]+$'
printf '%s\n' "$CANDIDATE_ARTIFACT_DIGEST" | rg -q '^sha256:[0-9a-f]{64}$'
test "$(gh api "$ARTIFACTS_ENDPOINT" --jq '[.artifacts[] | select(.name == "effect-build-0.3.0-candidate")][0].expired')" = "false"
test "$(gh api "$ARTIFACTS_ENDPOINT" --jq '[.artifacts[] | select(.name == "effect-build-0.3.0-candidate")][0].workflow_run.head_sha')" = "$IMPLEMENTATION_SHA"
CANDIDATE_DOWNLOAD_DIR="$(mktemp -d -t effect-build-026-remote-candidate.XXXXXX)"
gh run download "$CANDIDATE_RUN_ID" --name effect-build-0.3.0-candidate --dir "$CANDIDATE_DOWNLOAD_DIR"
node scripts/verify-candidate.mjs --directory "$CANDIDATE_DOWNLOAD_DIR" --source "$IMPLEMENTATION_SHA"
CANDIDATE_MANIFEST_DIGEST="sha256:$(shasum -a 256 "$CANDIDATE_DOWNLOAD_DIR/manifest.json" | awk '{print $1}')"
printf '%s\n' "$CANDIDATE_MANIFEST_DIGEST" | rg -q '^sha256:[0-9a-f]{64}$'
```

Expected: Node SEA prerequisite and candidate jobs both succeed at the exact
SHA; uploaded artifact has exactly six files; independently recomputed hashes
match `manifest.json`; the exact artifact ID/API digest and independently
computed `manifest.json` SHA-256 are recorded; all fourteen consumer cases ran
against those bytes. The
workflow performs no publication/tag/release mutation. Before dispatch, verify
the named ref's remote head equals the input SHA; dispatching the default branch
or a ref at another commit is invalid evidence.

### Step 6: Recheck external release preconditions without mutation

Use Bun/JavaScript `fetch` or another read-only registry query to check exact
names/versions. E404 proves absence, not ownership. Inspect Plan 021's current
public release-tool identity and its five-subject capability; do not install an
unreviewed newer tool or substitute a publisher.

Required release conditions remain:

- all five npm names are owned/reserved for the intended publisher;
- trusted publishing can cover all five subjects;
- one coordinator preflights and orders core -> Bun -> Deno -> Esbuild -> Node
  SEA -> GitHub;
- it publishes the already-tested candidate bytes exactly once;
- it records equivalent, conflict/failure, unknown outcome, and `NotReached`
  per subject with safe same-bundle resume;
- a non-success result persists until all six subjects converge.

Expected now: Plan 021 remains `BLOCKED` unless public evidence proves every
condition. Do not weaken it because the candidate is green.

### Step 7: Write the exact promotion decision and receipts

Create `plans/GRANULAR-API-PROMOTION-DECISION.md` with:

- implementation SHA, CI/candidate run IDs and URLs, artifact ID/digest,
  tarball hashes, exact job/consumer counts, and local command outcomes;
- `EARNED NOW`: durable core File/Executable bases, SystemTarget, narrow
  Node resolution, stage/tool
  observations, scoped bundle capability with one core invalid-reason
  authority, independent public Esbuild and Bun
  continuations, public Node SEA assembly, and the integration-author
  publication function;
- `REMAINS INTEGRATION-SPECIFIC`: Esbuild diagnostics/options/context and fixed
  `node26.7` target, Bun CLI/metafile semantics, differential
  `import.meta.main` behavior and version gate, and Node discovery/SEA
  config/assets/errors;
- `REJECTED UNTIL EVIDENCE CHANGES`: `ExecutionTarget`, generic bundler,
  executable packager, public native executable inspector, manifest, receipt, plan/executor,
  registry/fallback, store/cache/CAS, watch/plugins, and remote/container /
  transport;
- `DEFERRED INTEGRATION FEATURES`: source maps and Node SEA snapshot/code-cache
  modes. Record that source maps need a named debugging consumer plus verified
  mapping/materialization semantics, while snapshot/code-cache remain fixed
  false until exact selected-Node evidence establishes compatible combinations.
  Neither becomes a neutral core axis or a public Boolean merely because it is
  likely to be requested;
- the audit's exact observable promotion gates for executable inspection,
  broader/durable artifacts, versioned receipts, `SemanticPlan`,
  `BoundExecutionPlan`, and replaceable executors; record each as `MET`,
  `NOT MET`, or `REJECTED` with evidence, never a calendar date;
- explicit distinction between same semantic request, same invocation, and
  same output bytes. None is claimed equivalent by this evidence;
- v0.2 -> v0.3 import migration, additive Bun bundle method, and no legacy
  facade;
- release status: candidate verified, publication still blocked by Plan 021.

Preserve Plan 021 as the explicitly superseded historical four-package
qualification record. Update `plans/README.md`, then record this plan's exact
receipt. Plan artifacts may be committed separately from the tested
implementation, but the receipt names only the tested implementation SHA; do
not create a self-referential plan-commit field.

**Verify**:

```sh
git diff --check
test -z "$(git diff --no-index --check /dev/null plans/GRANULAR-API-PROMOTION-DECISION.md 2>&1 || true)"
EXPECTED_PLAN_PATHS="$(printf '%s\n' \
  plans/025-add-bun-javascript-bundling.md \
  plans/026-certify-five-package-public-cut.md \
  plans/GRANULAR-API-PROMOTION-DECISION.md \
  plans/README.md | LC_ALL=C sort)"
ACTUAL_PLAN_PATHS="$(git status --porcelain=v1 | cut -c4- | LC_ALL=C sort)"
test "$ACTUAL_PLAN_PATHS" = "$EXPECTED_PLAN_PATHS"
git status --short
```

Expected: exactly the four named plan artifacts differ, including the untracked
decision file, and all pass whitespace checks. All cited IDs/hashes/counts
match downloaded evidence.

## Test plan

This plan adds no test code. Its acceptance matrix is:

- local full deterministic suite and both Effect endpoints;
- real Bun/Deno scalar/host evidence;
- all 12 Bun/Deno target compile/header cells;
- exact public standalone Esbuild and Bun bundle evidence;
- exact public Esbuild -> Node SEA and Bun -> Node SEA ESM/CJS executable
  evidence;
- three-host atomic publication;
- ten isolated and four composed packed consumers under npm/Bun;
- independent candidate manifest/tarball hash verification;
- exact-source and read-only workflow verification.

Any missing cell prevents `DONE`; evidence is conjunctive, not averaged.

## Done criteria

- [x] The implementation source/config tree is clean at one recorded SHA
      descended from `60259f9`.
- [x] All mandatory local deterministic and Effect gates pass; pinned real-tool
      evidence passes locally on Linux x64 or in the named mandatory exact-SHA
      CI job.
- [x] The optional Bun/Deno orchestrator-host lane passes where Deno is
      installed or is truthfully recorded unavailable; it is non-gating.
- [x] Host-specific 12-target and exact Node gates pass locally or are
      truthfully assigned to their named mandatory CI cells.
- [x] Exact-source CI has all twelve required jobs successful.
- [x] The non-mutating candidate run uses the same SHA and uploads exactly five
      tarballs plus one manifest.
- [x] Independent hashes/manifests match; ten isolated and four composed
      consumers pass from those exact bytes.
- [x] Node SEA installs without Esbuild/Bun/raw esbuild; Esbuild and Bun each
      install without Node SEA or one another; each application composition
      declares its producer and Node SEA directly.
- [x] The promotion decision records earned/rejected concepts without receipt,
      hermeticity, reproducibility, or byte-equivalence overclaim.
- [x] Plan 021 remains a clearly superseded historical four-package record;
      the new promotion decision says a future restamped release plan needs
      five npm subjects plus GitHub and remains blocked on public evidence.
- [x] No npm package, tag, release, trusted-publisher configuration, or source
      file is mutated under this plan.
- [x] Final status differs from the implementation source SHA only in Plan
      025's frozen receipt plus Plan 026, README, and the new promotion decision.

## STOP conditions

Stop and report without improvising if:

- the Plan 025 source tree is dirty, the SHA differs, or any evidence comes from
  another commit;
- package-manager Bun is not the repository-pinned `1.3.14`; stop before any
  Bun install/build command and obtain that exact tool externally;
- a local/remote/product test fails; return the defect to its owning
  implementation plan and restart rather than patching here;
- any required CI job skips, cancels, or passes only on a different SHA;
- the candidate contains a sixth package/tarball, misses one of the five, packs
  twice, or hashes differ;
- Node SEA resolves Esbuild or Bun transitively, either producer resolves the
  other integration, or any integration sibling edge exists;
- the old v0.2 import specifiers are declared mandatory without changing the
  star-graph/no-fallback decision;
- anyone attempts to activate publication despite an occupied/unowned package
  name, incomplete trusted-publishing coverage, or the absence of a coordinator
  for five npm subjects plus GitHub. Those known release blockers do not prevent
  this non-mutating candidate-certification plan from becoming `DONE`; they
  keep release activation blocked;
- completing the task would require publication, tagging, release creation,
  trusted-publisher mutation, or source/config/test edits;
- any receipt would overclaim closure, hermeticity, reproducibility, same
  invocation, or same output bytes.

## Maintenance notes

- Keep Plan 020 as factual history of the four-package candidate; do not rewrite
  its receipts. Plan 026 supersedes only the active package cardinality and
  public direction.
- Plan 021's external release-tool qualification remains separate from build
  architecture. A green candidate does not authorize a fallback publisher.
- Future package additions must extend isolated packed consumers and release
  coordination before publication; matching version strings are not a
  lockstep-release proof.
- Bun and Esbuild are now two real producers, but they are not interchangeable
  implementations of one request: one is a selected CLI with pinned
  producer-default behavior, the other is a structured-library integration
  with explicit syntax targeting. Their differential `import.meta.main`
  characterization is positive evidence of that distinction. Extract a
  generic bundler service only after a named application
  needs provider substitution through one proven common request contract.

## Compression ledger

This plan adds no product representation. Its evidence must prove the
compression achieved by Plans 023-025:

| Required absence | Evidence |
|---|---|
| combined Node SEA compiler/matrix | public declarations and packed imports |
| Node SEA -> Esbuild/raw-esbuild edge | manifest, lock, isolated consumer |
| duplicate Esbuild implementation | production-source search/build graph |
| second Bun discovery/service | Provider construction tests and selected-path assertions |
| false Bun Node-version target | declarations, argv assertions, selected-Node syntax-check evidence |
| closed core integration catalog | core declaration/source architecture test |
| second publication owner | native publication tests/import boundary |
| legacy v0.2 facade | packed negative imports + migration docs |
| plan/executor/store/receipt product | public allowlist + docs assertions |

If any absent representation returns merely to make certification easier, the
program is not complete.

## Candidate-certification receipt

Fill this plan-only evidence section only after Steps 1-7 and every non-receipt
done criterion pass. This is an implementation-program handoff record, not a
public `BuildReceipt`, provenance object, hermeticity claim, or release.

- **Certification status**: `DONE`
- **Implementation source SHA**:
  `2dda53151e877ab89708d0b0fbafa5f00d06ad58`
- **Local gates**: exact Bun `1.3.14+0d9b296af`; frozen install made no
  lockfile change; graph/export audit, build, tooling reader, five type-test
  files, and 41 architecture tests passed; `bun run verify` passed 175 unit
  tests with one intentional skip and 14/14 packed consumers; and
  `bun run verify:effect` passed both `4.0.0-beta.104` and `4.0.0-rc.108` with
  the same unit and consumer results. Darwin arm64 could not run the pinned
  Linux x64 GNU producer/target assets, so their mandatory evidence came from
  exact-SHA CI without local substitution.
- **Optional host evidence**: `bun run test:host:extra` passed with Bun 1.3.14
  and installed Deno 2.9.5 on Darwin arm64.
- **Exact-source CI run / twelve job conclusions**:
  [`31855513747`](https://github.com/mannyc2/effect-build/actions/runs/31855513747),
  exact `head_sha` above, completed `success`: `quality` (`94939416625`),
  `real-tools` (`94939416635`), `esbuild` (`94939416639`),
  `target-support (deno)` (`94939416650`, 6/6), `node-sea`
  (`94939416653`), `bun-bundle` (`94939416660`),
  `effect-compatibility (4.0.0-rc.108)` (`94939416678`),
  `target-support (bun)` (`94939416688`, 6/6),
  `publication-hosts (windows-2025)` (`94939416690`),
  `publication-hosts (ubuntu-24.04)` (`94939416691`),
  `effect-compatibility (4.0.0-beta.104)` (`94939416700`), and
  `publication-hosts (macos-15)` (`94939416723`).
- **Candidate workflow run / artifact identity**:
  [`31855652066`](https://github.com/mannyc2/effect-build/actions/runs/31855652066),
  exact `head_sha` above, completed `success`; its `esbuild` (`94939804965`),
  `node-sea` (`94939805023`), `bun-bundle` (`94939804941`), and `candidate`
  (`94939901204`) jobs succeeded. Its sole artifact was
  `effect-build-0.3.0-candidate`, ID `9239034521`, API digest
  `sha256:698a21b099f86623a110ae31e38752e4141bae6e76987ad0dd6a35a7028139f4`,
  unexpired and attached to the exact implementation source.
- **Five tarball hashes and manifest hash**:
  `effect-build-0.3.0.tgz`
  `f76e4e60b7c4e14837e811bb820929c0aa4d3dc328fe0b55eb2d793aff39f325`;
  `effect-build-bun-0.3.0.tgz`
  `108ebe327a8067adaefbd46b2628737a1a364d437c5d93a2dddd4cd8cfa641f6`;
  `effect-build-deno-0.3.0.tgz`
  `1bcb609545ab5d31cb90475a3e608a9764109e217847e0c5eea4361b73bbf915`;
  `effect-build-esbuild-0.3.0.tgz`
  `3731347d4c509858cf747ca928641a902f6d71b3699dbda344683a0eef0b7994`;
  `effect-build-node-sea-0.3.0.tgz`
  `f3b03725691c4647d8c1ba09d05f11b8e49e19d28aea0a4eec709cc56bc56b36`;
  `manifest.json`
  `8b20e1198f6235fd00d1d7791fd31536c1ff11b878107c773ad7a11f654bada8`.
- **Independent verifier result**: `scripts/verify-candidate.mjs` passed for
  both the preserved local once-pack and the freshly downloaded workflow
  artifact; their six-file inventories, manifest fields, sizes, and hashes
  matched exactly.
- **Consumer result**: `14/14` passed from the once-packed bytes: ten isolated
  npm/Bun consumers and four directly declared composed consumers.
- **Promotion decision path**: `plans/GRANULAR-API-PROMOTION-DECISION.md`
- **Release activation**: `BLOCKED` (until five npm subjects plus GitHub have
  owned names, trusted publishing, and one qualified coordinator)
