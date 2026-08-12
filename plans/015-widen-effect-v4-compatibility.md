# Plan 015: Support the evidenced Effect 4.0 line and develop against the current v4 RC

> **Executor instructions**: Follow this plan step by step. Add the compatibility
> assertions before changing the manifest, then make each new gate pass. Do not
> widen the peer beyond the exact range below, add an Effect 3 compatibility
> layer, or weaken the exact development lock. If a tested endpoint needs a
> production-source compatibility branch, stop and report instead of adding a
> fallback.
>
> **Drift check (run first)**:
>
> ```sh
> test "$(git rev-parse 'v0.2.0^{commit}')" = \
>   "29f8cfb0d6fae0a3caa13562ee510d192ed09003"
> git diff --stat 29f8cfb..HEAD -- \
>   package.json pnpm-lock.yaml README.md scripts test/architecture \
>   .github/workflows
> git status --short
> rg -q '^\| 014 \|.*\| DONE \|$' plans/README.md
> pnpm install --frozen-lockfile
> pnpm verify
> node scripts/verify-workflow-receipt.mjs \
>   --receipt-file plans/014-hard-cut-typed-matrix-public-api.md \
>   --prefix 'Final target evidence:'
> ```
>
> Expected: the completed `v0.2.0` tag still points exactly to `29f8cfb`; Plan 014
> is `DONE`; the install and deterministic gate pass; and its recorded workflow
> remains valid under the existing receipt contract. The worktree is clean or
> its only changes are `plans/README.md` plus this file. If product, test,
> workflow, or manifest files have changed since `29f8cfb`, reconcile every
> excerpt below against the live file and stop on a semantic mismatch.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/014-hard-cut-typed-matrix-public-api.md`
- **Category**: dependencies / migrations / test coverage / CI
- **Product baseline**: completed `v0.2.0` tag at commit `29f8cfb`, 2026-08-12
- **Planning baseline**: commit `e4257cc`, 2026-08-12
- **Required final receipt**: pending. Completion requires one green required
  workflow for the exact source commit, including both Effect endpoint cells,
  recorded below as one unbulleted line beginning `Effect compatibility
  evidence:` followed by the run URL, ` @ `, and the full source SHA.

## Why this matters

`effect-build` currently peers on exactly `effect@4.0.0-beta.107`. That rejects
older v4 betas which already provide every API the package uses and the current
v4 release candidate, even though disposable endpoint checks found both ends
compatible. Merely changing the peer string is not enough: the release gates
currently install and test only one frozen dependency tree, so a widened range
could silently become false.

This plan makes the consumer contract and maintainer baseline intentionally
different:

- consumer peer: `>=4.0.0-beta.104 <4.1.0-0`;
- exact minimum compatibility fixture: `4.0.0-beta.104`;
- exact current development and current endpoint fixture: `4.0.0-rc.108`.

The upper bound is deliberately the Effect 4.0 release line, not
`^4.0.0-beta.104`. The caret would admit stable Effect 4.x minors through v5's
boundary, while `src/standalone/internal/Process.ts` imports the explicitly
unstable `effect/unstable/process` subpath. A later 4.1 widening must be another
evidence-backed dependency change.

## Current state and verified audit evidence

### Manifest and documentation are exact-version-only

`package.json:57-71` currently has one exact consumer peer and one exact
development family:

```json
"peerDependencies": {
  "effect": "4.0.0-beta.107"
},
"devDependencies": {
  "@effect/platform-bun": "4.0.0-beta.107",
  "@effect/platform-deno": "4.0.0-beta.107",
  "@effect/platform-node": "4.0.0-beta.107",
  "effect": "4.0.0-beta.107"
}
```

`README.md:11-19` repeats that exact stack in the only install command:

```sh
pnpm add effect-build effect@4.0.0-beta.107 @effect/platform-node@4.0.0-beta.107
```

The official npm tags observed during planning were:

- `effect@latest = 3.22.1`;
- `effect@beta = 4.0.0-beta.107`;
- `effect@rc = 4.0.0-rc.108`;
- matching `@effect/platform-node`, `@effect/platform-bun`, and
  `@effect/platform-deno` packages exist at `4.0.0-rc.108`.

Therefore `@latest` is not the requested upgrade path: it selects Effect 3.
Use the exact v4 RC version in this plan. Registry references:

- `https://registry.npmjs.org/-/package/effect/dist-tags`
- `https://registry.npmjs.org/-/package/%40effect%2Fplatform-node/dist-tags`
- `https://registry.npmjs.org/-/package/%40effect%2Fplatform-bun/dist-tags`
- `https://registry.npmjs.org/-/package/%40effect%2Fplatform-deno/dist-tags`

### The source establishes a real beta.104 floor

`src/standalone/BuildError.ts:15-55` and
`src/standalone/MatrixError.ts:40,127` define the public error classes with
`Schema.TaggedError`. Effect renamed `Schema.TaggedErrorClass` to
`Schema.TaggedError` between beta.103 and beta.104; the upstream change is
`https://github.com/Effect-TS/effect/commit/592dd361645739ac0cd8e6babb084cd27403c172`.

During this audit, disposable copies of commit `29f8cfb` were installed with
matching `effect` and all three official platform packages at each candidate:

- beta.103 failed source compilation because `Schema.TaggedError` did not exist;
- beta.104, beta.105, beta.106, beta.107, and rc.108 passed `pnpm check` and the
  public TSTyche contract;
- beta.104 and rc.108 each passed all 89 runnable unit tests, with the one
  expected OS-specific skip, plus build and packed-consumer verification.

Those disposable observations justify the endpoints; they do not replace the
checked-in gates this plan adds. If the executor cannot reproduce both endpoint
results, narrow or abandon the range rather than preserving the claim.

### The current consumer test cannot prove a peer range

`scripts/test-built-consumer.mjs:13-30` packs the project but manually symlinks
the workspace's one installed `effect` and `@effect/platform-node` into the
temporary consumer. The consumer declares no dependencies and never asks a
package manager to resolve `effect-build` with a candidate peer.

`test/architecture/generated-and-ci.test.ts:422-438` freezes the old model by
requiring both `peerDependencies.effect` and `devDependencies.effect` to equal
the same exact beta.107 string.

`.github/workflows/ci.yml:10-27` has one `quality` job using the frozen lockfile.
Neither CI nor `.github/workflows/release.yml` has a minimum/current Effect
dimension. Keep `pnpm verify` deterministic against one exact lock; add a
separate compatibility gate rather than making development dependencies loose.

### Repository conventions which remain binding

`AGENTS.md:3-11` fixes exactly two public operations, provider-local compiler
selection, platform-neutral source, scoped process ownership, and `pnpm verify`
as the handoff gate. This plan changes no public operation, result, error,
compiler, artifact target, or lifecycle behavior.

The existing test conventions to match are:

- `scripts/test-built-consumer.mjs` for packed type/runtime assertions;
- `test/architecture/generated-and-ci.test.ts` for exact manifest and workflow
  shape;
- `test/architecture/docs-contract.test.ts` for user-facing support claims;
- `scripts/verify-workflow-receipt.mjs` and
  `test/architecture/workflow-receipt.test.ts` for exact required-CI evidence.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install locked baseline | `pnpm install --frozen-lockfile` | exit 0, no lockfile change |
| Deterministic gate | `pnpm verify` | type, unit, packed consumer, architecture, lint, and format gates pass |
| One endpoint | `node scripts/verify-effect-compatibility.mjs --effect-version 4.0.0-beta.104` | disposable install and all endpoint checks pass |
| Both endpoints | `pnpm verify:effect` | beta.104 and rc.108 pass in isolated temporary copies |
| Real compilers/current host | `pnpm verify:real` | pinned Bun/Deno and Node-host checks pass |
| All evidenced targets | `pnpm verify:targets` | 12/12 pinned compiler target cells pass on Linux x64 |
| Package inspection | `npm pack --dry-run` | only intended package files appear |

`pnpm verify:targets` requires the documented Linux x64 host and external binary
tools. When that host is unavailable, required GitHub CI is the acceptance
gate; a local skip is not a pass.

## Suggested executor toolkit

- Use the `effect-ts` skill, if available, only to investigate a surprising
  Effect API incompatibility. This plan does not authorize production Effect
  source changes; stop if such a change appears necessary.
- Use official npm metadata and the Effect repository as technical sources. Do
  not infer the v4 line from the `latest` dist-tag.

## Scope

**In scope** (the only product/test/workflow paths to modify):

- `package.json`
- `pnpm-lock.yaml`
- `README.md`
- `scripts/test-built-consumer.mjs`
- `scripts/verify-effect-compatibility.mjs` (create)
- `scripts/verify-workflow-receipt.mjs`
- `test/architecture/generated-and-ci.test.ts`
- `test/architecture/docs-contract.test.ts`
- `test/architecture/workflow-receipt.test.ts`
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `plans/015-widen-effect-v4-compatibility.md` (receipt/status only after source
  CI is green)
- `plans/README.md` (Plan 015 status/receipt reconciliation only)

**Out of scope** (do not touch):

- all files under `src/`;
- public exports, schemas, inputs, outputs, errors, and operation count;
- Bun 1.3.9, Deno/denort 2.9.3, target tables, or compiler support claims;
- adding official platform packages as runtime dependencies or peer
  dependencies;
- Effect 3 compatibility, aliases, conditional imports, or fallbacks;
- widening the peer through Effect 4.1 or v5;
- making development dependencies ranges;
- bulk upgrades of TypeScript, Vitest, oxlint, dprint, pnpm, or Node types;
- `package.json.version`, the `v0.2.0` tag, or completed v0.2.0 release commits;
- multiplying the 12 compiler-target cells by Effect versions;
- changing the supported Node orchestrator or experimental Bun/Deno
  orchestrator-host policy;
- publishing, tagging, pushing, or opening a PR without explicit operator
  authorization.

## Git workflow

- Work on the current feature branch or `advisor/015-effect-v4-compatibility` if
  a separate branch is required.
- Follow the repository's conventional commit style, for example
  `feat!: publish typed executable target matrices` and
  `chore(release): prepare v0.1.0`.
- Keep the compatibility implementation in one reviewable source commit before
  appending its workflow receipt. The receipt/status-only follow-up must not
  change product or verification files.
- `v0.2.0` is already complete and tagged at `29f8cfb`. Do not move or reuse that
  tag, rewrite its product/release commits, republish `effect-build@0.2.0`, or
  bump `package.json.version` inside this compatibility implementation. A later
  explicitly authorized release task must choose the next package version.

## Fixed compatibility contract

The implementation must encode exactly these facts:

| Role | Version/range | Meaning |
|---|---|---|
| consumer peer | `>=4.0.0-beta.104 <4.1.0-0` | supported Effect 4.0 line |
| minimum required cell | `4.0.0-beta.104` | earliest matching family with the required public APIs |
| current required cell | `4.0.0-rc.108` | current v4 RC and exact development baseline |

The compatibility cells install matching exact versions of `effect`,
`@effect/platform-node`, `@effect/platform-bun`, and
`@effect/platform-deno`. They prove core source/types/unit behavior and the
Node-host packed consumer. They do not advertise Bun or Deno as supported
orchestrator hosts.

## Steps

### Step 1: Specify the new manifest, documentation, workflow, and receipt contracts

Update `test/architecture/generated-and-ci.test.ts` before the implementation:

1. Replace the old same-exact-version assertions with exact assertions that:
   - `peerDependencies.effect` is
     `">=4.0.0-beta.104 <4.1.0-0"`;
   - `devDependencies.effect` and all three official platform packages are
     `"4.0.0-rc.108"`;
   - `scripts["verify:effect"]` invokes both exact endpoints;
   - CI has a required `effect-compatibility` matrix on Ubuntu with
     `fail-fast: false` and the exact ordered endpoint list;
   - each cell calls the compatibility verifier with its matrix value and has
     no `if`, `continue-on-error`, or unpinned action;
   - release has the same matrix after `preflight`; and
   - `publish-npm.needs` includes `effect-compatibility`.
2. Extend the local `Workflow` test interface only as needed for an `effect`
   matrix key. Do not weaken existing exact assertions for quality, real tools,
   publication hosts, or target support.

Update `test/architecture/docs-contract.test.ts` to require the bounded peer
range and the current exact RC install example. Do not turn the current npm
dist-tag layout into a permanent documentation contract; the explicit version
already prevents `effect@latest` from selecting the wrong major.

Extend `test/architecture/workflow-receipt.test.ts` with a second receipt
contract named `effect-v1`. Preserve the existing target receipt behavior and
prove that `effect-v1` additionally requires exactly:

- `effect-compatibility (4.0.0-beta.104)`; and
- `effect-compatibility (4.0.0-rc.108)`.

Test missing, duplicate, failed, and skipped compatibility cells. Do not make
historical Plan 013/014 receipts fail because their old runs predate these jobs.

**Verify**:

```sh
pnpm build
pnpm exec vitest run \
  test/architecture/generated-and-ci.test.ts \
  test/architecture/docs-contract.test.ts \
  test/architecture/workflow-receipt.test.ts
```

Expected: the new assertions fail for the missing range, RC baseline,
compatibility verifier/jobs, docs, and `effect-v1` receipt contract; existing
unrelated assertions remain green.

### Step 2: Add a true fresh-install mode to the packed-consumer verifier

Refactor `scripts/test-built-consumer.mjs` without changing its default mode:

- Default `pnpm test:consumer` must retain the current symlinked, deterministic
  packed-consumer check. It remains part of `pnpm verify` and must not gain a
  network dependency.
- Add one explicit `--fresh-install` mode. After packing, create a temporary
  consumer whose manifest declares exact dependencies on the tarball,
  `effect`, and `@effect/platform-node`, plus the exact TypeScript/Node types
  needed by the existing typecheck.
- Derive the exact Effect/platform version from the isolated workspace's
  installed package metadata and require the two versions to be identical.
- Run `pnpm install --strict-peer-dependencies` in that consumer. Do not symlink
  dependencies in this mode. A peer-range mismatch must fail installation.
- Run the existing representative scalar/matrix type assertions and exact
  runtime import assertions against the fresh install.
- Assert the resolved consumer copies of `effect` and
  `@effect/platform-node` equal the requested candidate; do not allow an
  ambient workspace package to satisfy the check.
- Preserve temporary-directory cleanup in `finally` and never delete outside a
  directory created by this invocation.

Add `test:consumer:fresh` to `package.json`, but do not add it to the
deterministic `verify` script. It is owned by the networked compatibility lane.

**Verify**:

```sh
pnpm test:consumer
pnpm test:consumer:fresh
```

Expected: default mode still reports `packed consumer verified`; fresh mode
performs a real strict peer install and reports the exact beta.107 baseline it
resolved before the manifest upgrade. No temporary consumer remains.

### Step 3: Build the isolated Effect endpoint verifier

Create `scripts/verify-effect-compatibility.mjs` as a pure Node orchestration
script with these exact behaviors:

1. Accept either `--effect-version <exact-endpoint>` or `--all`; reject missing,
   duplicate, combined, unknown, ranged, or extra arguments.
2. The only accepted endpoints are beta.104 and rc.108. `--all` runs both in
   ascending order and reports each label separately.
3. For each endpoint, create a unique directory under the OS temporary
   directory and copy the current repository contents while excluding `.git`,
   `node_modules`, `dist`, and any generated compatibility temporary root.
   The copy must include current uncommitted in-scope source during local
   development; do not use `git archive HEAD`.
4. Rewrite only the temporary `package.json`: set `effect` and all three
   official platform dev dependencies to the selected exact endpoint. Keep
   `peerDependencies.effect` byte-for-byte equal to the source manifest; the
   verifier must test the declared peer, not silently replace it with its own
   range.
5. In the temporary copy run:
   - `pnpm install --no-frozen-lockfile --strict-peer-dependencies`;
   - `pnpm check`;
   - `pnpm test:types`;
   - `pnpm test:unit`; and
   - `pnpm test:consumer:fresh`.
6. Preserve the caller environment and package-manager executable, but place any
   task-specific cache/output directory under the created temp root. Do not
   replace `PATH` or reuse broad environment variables as deletion targets.
7. Always remove only the validated temp root in `finally`. On failure, include
   the endpoint and failed command without dumping environment values.

Export small pure helpers for argument parsing and temporary-manifest rewriting
if needed so the architecture test can cover invalid inputs without invoking
the network. Add `verify:effect` to `package.json` as the exact `--all` command.

**Verify**:

```sh
node scripts/verify-effect-compatibility.mjs --effect-version 4.0.0-beta.103
node scripts/verify-effect-compatibility.mjs --effect-version 4.0.0-beta.104
```

Expected before Step 4 changes the manifest: the first command exits non-zero
before copying/installing and names the two allowed endpoints; the second gets
as far as strict fresh-consumer resolution and fails because the source manifest
still peers on exact beta.107. That failure is the range regression this plan is
about, not permission to relax peer enforcement. `pnpm verify:effect` becomes a
green gate only after Step 4.

### Step 4: Widen only the peer and update the exact reference stack

Change `package.json` to the fixed contract table above. Keep every unrelated
script and dependency exact and unchanged. Regenerate `pnpm-lock.yaml` with
pnpm; do not hand-edit package resolutions.

Recommended sequence:

```sh
pnpm install --no-frozen-lockfile
pnpm install --frozen-lockfile
pnpm list effect @effect/platform-node @effect/platform-bun @effect/platform-deno --depth 0
```

Expected: the lock importer and all resolved Effect-family development packages
are exactly rc.108; the peer is the bounded range; the frozen reinstall makes
no changes and reports no peer conflict.

Now run the endpoint verifier against the real widened manifest:

```sh
pnpm verify:effect
```

Expected: beta.104 then rc.108 independently pass, including their strict fresh
consumer installs. If either fails, stop; do not proceed to documentation or CI
with an unproved range.

Do not add Effect or platform packages to `dependencies`, and do not add
platform peers. Applications continue to provide one official host platform
Layer at composition time.

### Step 5: Document the supported interval and current install without overstating it

Update the README install section to:

- show exact rc.108 `effect` and `@effect/platform-node` packages in the command;
- state that `effect-build` declares the bounded Effect 4.0 interval from
  beta.104 up to, but not including, 4.1 prereleases/releases, with beta.104 and
  the current RC as required endpoint evidence;
- distinguish the package peer interval from the exact reference version;
- state that minimum/current endpoint CI covers Node-host composition, without
  promoting experimental Bun/Deno orchestrator hosts.

Do not change compiler fixture prose at `README.md:51-64`: Bun/Deno executable
versions are an independent evidence axis and runtime still does not reject an
otherwise compatible installed compiler version.

**Verify**:

```sh
pnpm exec vitest run test/architecture/docs-contract.test.ts
rg -n '4\.0\.0-beta\.107|4\.0\.0-beta\.104|4\.0\.0-rc\.108|4\.1\.0' \
  README.md package.json
```

Expected: docs contract passes; beta.107 remains nowhere as the active manifest
or install baseline; the README contains the bounded support statement and the
exact current RC command.

### Step 6: Make both endpoint cells required in CI and release

Add an `effect-compatibility` job to `.github/workflows/ci.yml`:

- `runs-on: ubuntu-24.04`;
- `strategy.fail-fast: false`;
- exact matrix values beta.104 and rc.108;
- the repository's already-pinned checkout, Node setup, and pnpm setup actions;
- no `if`, `continue-on-error`, or dynamically selected package version; and
- one run step invoking the verifier for `${{ matrix.effect }}`.

Add the same job to `.github/workflows/release.yml` with `needs: preflight`, and
add its job id to `publish-npm.needs`. Do not multiply `real-tools`,
`target-support`, or `publication-hosts` by Effect versions.

Extend `scripts/verify-workflow-receipt.mjs` with an explicit versioned receipt
contract option:

- existing/default `target-v1` keeps the exact seven historical required job
  names so Plan 013/014 evidence remains re-verifiable;
- new `effect-v1` requires those seven plus the two exact compatibility matrix
  job names;
- reject unknown or duplicate contract arguments.

Use an explicit `--contract effect-v1` in this plan's final receipt command.
Keep old calls without `--contract` equivalent to `target-v1`; do not infer a
contract from a receipt prefix.

**Verify**:

```sh
pnpm build
pnpm exec vitest run \
  test/architecture/generated-and-ci.test.ts \
  test/architecture/workflow-receipt.test.ts
node scripts/verify-workflow-receipt.mjs \
  --receipt-file plans/014-hard-cut-typed-matrix-public-api.md \
  --prefix 'Final target evidence:' \
  --contract target-v1
```

Expected: workflow/receipt architecture tests pass and the historical Plan 014
receipt remains valid under `target-v1`.

### Step 7: Run local package, compatibility, and current-tool gates

Run the deterministic gate before the networked endpoint gate:

```sh
pnpm install --frozen-lockfile
pnpm verify
pnpm verify:effect
npm pack --dry-run
git diff --check
git status --short
```

Expected: every command exits 0; beta.104 and rc.108 each pass in isolated
copies with a strict fresh consumer; package contents are intentional; and only
the in-scope files are modified.

On a provisioned Linux x64 executor, also run:

```sh
pnpm verify:real
pnpm verify:targets
```

Expected: current rc.108 remains compatible with both pinned real compilers,
the Node host smoke test, and all 12 compile/header cells. Do not run the full
compiler-target matrix once per Effect endpoint.

### Step 8: Record exact required CI evidence before marking the plan done

Commit the complete Plan 015 source/workflow change. With explicit push
authority, observe `.github/workflows/ci.yml` for that exact source SHA. Require
all existing jobs plus both exact Effect endpoint cells to complete successfully.

Append exactly one receipt line to this file:

```text
Effect compatibility evidence: https://github.com/<owner>/<repo>/actions/runs/<id> @ <40-character-source-sha>
```

Then verify it:

```sh
node scripts/verify-workflow-receipt.mjs \
  --receipt-file plans/015-widen-effect-v4-compatibility.md \
  --prefix 'Effect compatibility evidence:' \
  --contract effect-v1
compat_sha="$(sed -n 's/^Effect compatibility evidence: https:\/\/github.com\/.* @ \([0-9a-f]\{40\}\)$/\1/p' plans/015-widen-effect-v4-compatibility.md)"
test -n "$compat_sha"
git diff --exit-code "$compat_sha" -- \
  package.json pnpm-lock.yaml README.md scripts test/architecture \
  .github/workflows
```

Expected: the verifier confirms the exact run URL, workflow path, source SHA,
successful run, and all nine `effect-v1` jobs; the scoped diff from the source
SHA is empty. Only then mark Plan 015 `DONE` in `plans/README.md`.

If there is no remote/push authority, leave Plan 015 `IN PROGRESS` after all
local gates and report the single external acceptance gate. Do not reuse Plan
014's receipt or call implementation complete.

## Test plan

- Manifest contract: exact bounded peer, exact rc.108 development family, and
  no runtime/platform dependency growth.
- Version floor: beta.103 is rejected by the verifier; beta.104 is the minimum
  required endpoint.
- Current endpoint: rc.108 is both the exact lock baseline and a required
  compatibility endpoint.
- Endpoint isolation: each candidate gets a temporary working copy, matching
  Effect/platform family, strict install, source check, typetest, 89 runnable
  unit tests, build, and fresh packed consumer.
- Consumer resolution: the temporary app installs the tarball normally, fails
  on peer mismatch, and proves the exact resolved Effect/platform versions.
- Default consumer regression: ordinary `pnpm test:consumer` remains
  symlinked/deterministic and network-free.
- CLI validation: missing, duplicate, combined, unknown, ranged, and extra
  compatibility arguments fail before filesystem or network work.
- CI contract: exact two-cell compatibility matrix in both CI and release, no
  escape hatch, and npm publication depends on it.
- Receipt versioning: target-v1 historical evidence remains valid; effect-v1
  rejects a missing, duplicate, failed, or skipped endpoint cell.
- Docs: exact current install and bounded support interval, without changing
  compiler-version or orchestrator-host claims.
- Current real behavior: existing real compiler, Node host, publication-host,
  and 12 target gates remain green once on rc.108.

## Done criteria

- [ ] `peerDependencies.effect` is exactly
      `>=4.0.0-beta.104 <4.1.0-0`.
- [ ] Development `effect` and all three official platform packages resolve
      exactly to `4.0.0-rc.108` under the frozen lock.
- [ ] `effect@latest` was not used to select v4 and Effect 3 has no compatibility
      shim or claim.
- [ ] The normal packed-consumer test remains deterministic and network-free.
- [ ] Fresh consumer mode performs strict package-manager resolution and proves
      the exact installed endpoint.
- [ ] beta.104 and rc.108 each pass source check, TSTyche, unit tests, build, and
      fresh packed-consumer verification in isolated temporary copies.
- [ ] beta.103 is rejected before compatibility work starts.
- [ ] CI and release contain the exact required two-cell Effect matrix with no
      skip/continue escape.
- [ ] npm publication depends on the Effect compatibility job.
- [ ] Historical target-v1 receipts remain verifiable and the new effect-v1
      contract requires both endpoint cells.
- [ ] README distinguishes the bounded peer interval and exact reference RC
      without changing compiler support claims or freezing a volatile dist-tag.
- [ ] No file under `src/` or public API/runtime behavior changed.
- [ ] `pnpm verify`, `pnpm verify:effect`, `npm pack --dry-run`, and
      `git diff --check` pass.
- [ ] Required CI for the exact source SHA is green, including current real
      compilers, publication hosts, all targets, and both Effect endpoints.
- [ ] This file contains the verified `effect-v1` workflow receipt and the
      source/verification diff from its SHA is empty.
- [ ] Only then, Plan 015 is marked `DONE` in `plans/README.md`.

## STOP conditions

Stop and report; do not improvise if:

- Plan 014 is not `DONE` or its recorded source state no longer matches the
  excerpts above;
- any step would move or reuse `v0.2.0`, rewrite its completed product/release
  commits, republish `effect-build@0.2.0`, or require selecting the next release
  version inside this compatibility implementation;
- beta.104 or rc.108 fails source check, public typetests, unit behavior, build,
  or strict fresh-consumer installation twice after fixing only the test
  harness;
- compatibility requires editing `src/`, conditional imports, version checks,
  aliases, or fallbacks;
- the earliest matching platform family is no longer beta.104;
- npm registry metadata no longer exposes rc.108 as the current v4 endpoint;
- the desired range would need to include Effect 4.1, v5, or Effect 3;
- a fresh consumer can pass only through workspace symlinks or relaxed peer
  enforcement;
- adding the CI job would weaken or skip an existing real-tool, target,
  publication, or quality gate;
- a verification command fails twice after a reasonable in-scope correction;
  or
- an unrelated dirty file would need to be overwritten, formatted, staged, or
  deleted.

## Maintenance notes

- The peer range is a tested consumer promise; exact dev dependencies are a
  reproducible maintainer environment. Do not make them the same kind of
  declaration again.
- When a newer Effect 4.0 prerelease or stable release becomes the current
  endpoint, update the exact development family and current cell together. Keep
  beta.104 as the floor until that cell fails or a deliberate breaking release
  raises it.
- Before admitting Effect 4.1, inspect `effect/unstable/process`, run a new
  endpoint, and change the upper bound in one dedicated plan.
- Official platform packages stay test-only. Applications own the platform
  Layer, so adding platform peers would falsely force a host choice.
- Compiler fixtures are independent from Effect compatibility. Keep their
  checksummed, 12-cell evidence separate and run it once on the current locked
  Effect baseline.
- TypeScript, Vitest, oxlint, dprint, pnpm, and Node type upgrades are separate
  maintainer-tool migrations. They do not widen consumer Effect support and
  should be updated in attributable batches rather than folded into this plan.
