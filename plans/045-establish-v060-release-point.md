# Plan 045: Establish the v0.6.0 release point and bounded publication handoff

> **Executor instructions**: Read this plan completely before acting. Run each
> verification gate and confirm its expected result before continuing. A green
> implementation or certification run grants no commit, push, PR-creation,
> merge, repository-settings, credential, npm-publication, tag, or GitHub
> Release authority. Obtain separate authority for each exact act at the
> checkpoint that names it. If a STOP condition occurs, stop
> and report the exact evidence; do not add a fallback or publish manually.
>
> **Drift check (run first)**:
>
>     git diff --stat e4511f12f2afdab0090de73fd6bf4d1f226b4d88 -- \
>       AGENTS.md package.json bun.lock tooling/effect-build-contract.json \
>       .github/workflows scripts/release scripts/apple-certification \
>       scripts/effect-build-contract scripts/test-built-consumer.mjs \
>       packages/effect-build-apple test/architecture \
>       test/integration/apple-native-real.test.ts test/fixtures/release \
>       plans docs/release-security.md CHANGELOG.md
>
> If any listed path changed before Step 1, re-run the read-only current-state
> audit. A changed public package, existing contract authority, release
> boundary, or Apple operation inventory is a STOP until this plan is
> reconciled. After Step 8, the reviewed contract includes
> `releaseCertification`, the private Apple implementation rows, and the
> 2026-09-01 npm-only scope hard cut. That hard cut retains eleven public npm
> packages including `effect-build-apple`, removes Apple certification and the
> operational journal from v0.6.0 readiness, and admits exactly three hosted
> evidence roles with no external ingress. Any public/provider/capability/npm
> admission/reservation change or other drift stops.

## Status

- **Priority**: P0 release readiness
- **Effort**: XL plus hosted certification and external-service time
- **Risk**: CRITICAL; credentials, eleven public npm coordinates, and a public
  GitHub Release are involved
- **Satisfied prerequisite**: PR 24 at exact head
  e4511f12f2afdab0090de73fd6bf4d1f226b4d88 merged under the exact-head guard
  as dd39bd6104645d79fa52f40d0bbf291b5bf8f3dc; exact-main push run
  33309530017 passed 33/33 jobs
- **Category**: release engineering, tests, security, and operational evidence
- **Planned at**: commit e4511f12f2afdab0090de73fd6bf4d1f226b4d88,
  2026-08-29
- **Cold-reviewed at**: 2026-08-31 against the exact PR-head and remote-main
  workflow blobs, npm 11.11.0 source, Apple contract/API, and live GitHub/npm
  read-only state
- **Status**: npm-only hosted-proof hard cut in implementation and verification.
  Guarded merge, exact-main ordinary CI, the Apple probe-admission repair,
  credential-free protocol work, and the exact-shell fake boundaries are
  complete history. The current cut removes unsupported external-observer
  roles and makes the canonical three-proof path directly executable. It must
  pass a fresh pinned Bun 1.3.14 full gate and hosted review before R can be
  selected.
  Credential-backed Apple certification was not run and has not passed; it and
  the AWS Notary journal are deliberately excluded from v0.6.0 readiness and
  outputs. No hosted readiness or publication receipt is implied by local work
- **Publication authority**: separately supplied by the operator; execution
  still stops on any failed protocol or external-service result

## v0.6.0 scope decision (2026-09-01)

Release exactly the eleven contract-admitted npm packages, including the
`effect-build-apple` API/library package. The release contains npm package
bytes, the candidate manifest, and the later GitHub Release assets copied from
that candidate. It contains no signed or notarized App, DMG, or PKG product.

Credential-backed Apple artifact certification is **deferred, not passed**.
Apple credentials, Developer ID signing, Notary submission, stapling,
Gatekeeper, quarantine/clean-host distribution, and AWS journal evidence are
not v0.6.0 readiness inputs or outputs. Do not provision AWS or dispatch Apple
certification for this release. Those products require a later, separately
qualified release with a newly reviewed contract, credentials, hosts, journal,
evidence, and publication decision. Existing Apple library code and
credential-free tests remain valid source qualification; they are not
credential-backed distribution evidence.

## Why this matters

The v0.6.0 source hard cut and inert release infrastructure are merged and
exact-main ordinary CI is green. The remaining release work must produce a
truthful pre-publication packet without depending on observer APIs that GitHub
or npm do not expose to the hosted workflow. The hard cut therefore admits only
three real hosted proofs: exact-main CI, exact protected-body fake-registry
execution, and eleven-package npm OIDC dry-run certification. Unsupported
administrative inventories and Apple/AWS evidence are explicitly excluded,
not modeled as permanently blocked evidence roles.

This plan defines how to resolve those unknowns without pretending they are
already certified. It separates:

1. merging reviewed source;
2. implementing release-certification infrastructure;
3. earning one exact non-publishing release point;
4. authorizing npm publication;
5. authorizing the tag and GitHub Release.

## Definition of the release point

Let R be one full Git commit SHA. The v0.6.0 **release point** is earned only
when all of the following are true at the same R:

1. R is the current remote main SHA and its tree is the reviewed npm-only
   release implementation. The canonical contract is directly executable;
   there is no generated activation fixture, caller override, or external
   observer that can promote a blocked peer policy.
2. Exact-main ordinary CI is terminal and successful for every applicable job.
   PR-head runs remain historical evidence and do not substitute for R.
3. One retained, downloaded candidate artifact contains exactly the eleven
   contract-admitted v0.6.0 tarballs plus one manifest. The manifest binds R,
   Bun 1.3.14, every name, byte size, SHA-256, SHA-512 integrity, and the exact
   42-module public projection. Each embedded package manifest has exactly
   `publishConfig: { access: "public", provenance: true }`. It contains no
   Rolldown tarball.
4. One protected hosted certification executes the exact publisher
   reauthorization and state-machine bodies against sealed fake GitHub/npm
   boundaries for every contract coordinate. The authenticated artifact binds
   R and the candidate and proves conflicts, partial publication, unknown
   outcomes, reservations, provenance, and exact-byte resume behavior within
   the same unexpired readiness packet.
5. A protected non-publishing GitHub job obtains an npm-audience OIDC token,
   validates its signature and exact claims without logging or retaining it,
   rejects ambient npm/Sigstore credentials, and runs pinned npm 11.11.0
   `npm publish --dry-run` for each exact tarball. Exactly one private
   package-specific token-retrieval marker per invocation and unchanged
   registry state prove exchange acceptance only—not upload, provenance, or
   publication.
6. One downloaded release-readiness aggregate authenticates the candidate
   separately and exactly three ordered evidence roles: `exact-main-ci`,
   `fake-registry`, and `npm-oidc-certification`. Direct current-main, GitHub
   policy, package-repository, and anonymous npm observations are collected
   inside readiness rather than accepted from caller-authored receipts.
7. npm administrative inventory is explicitly `not-observed` and
   `excluded-from-v0.6.0`: the gate does not claim exclusive trusted-publisher
   administration, absence of legacy tokens, package publishing-access policy,
   or account 2FA state. The hosted OIDC proof and later real publication are
   the admitted authority and mutation evidence.
8. Credential-backed Apple signed/notarized artifacts are deferred, not
   passed. No Apple certification, App, DMG, PKG, operational-journal, or AWS
   evidence appears in the candidate or readiness aggregate.
9. Anonymous npm state still matches the contract's prior-latest and
   placeholder ledgers, all twelve names still lack 0.6.0, Rolldown remains
   reservation-only, and main has not advanced.

At this point nothing has been published to npm, tagged, or released on GitHub.
Release immutability is an operator-admin preflight immediately before draft
creation and again before public publication; it is not a readiness role.
No Apple notarization submission or AWS journal mutation is part of earning R.

## Definition of release completion

Release completion is later than the release point. It requires:

1. all eleven admitted npm coordinates at 0.6.0 with candidate-exact bytes and
   latest tags;
2. Rolldown still only at its frozen reservation version and tags;
3. provenance bound to the approved workflow and R;
4. fresh npm and Bun consumers passing against registry downloads;
5. tag v0.6.0 targeting R;
6. a non-draft, non-prerelease GitHub Release created last, with assets copied
   from the certified candidate rather than repacked;
7. a final downloaded receipt binding public registry, tag, Release, assets,
   and smoke tests.

## Current state to re-observe

- PR 24 merged under the exact-head guard as
  dd39bd6104645d79fa52f40d0bbf291b5bf8f3dc. Its first parent is
  4ad34423d84d17c959ace0d55af8623f336a68be, its second parent is
  e4511f12f2afdab0090de73fd6bf4d1f226b4d88, its tree equals the PR-head
  tree, and exact-main push run 33309530017 passed 33/33 jobs.
- The working checkout for PR 24 is
  /Users/cjpher/.codex/worktrees/a63e/does-effect. Its intentional local state
  is exactly modified plans/README.md plus untracked
  plans/045-establish-v060-release-point.md; no source or workflow path is
  locally dirty. Preserve both planning files and the unrelated dirty original
  checkout.
- PRs 25-30 merged the inert release-readiness infrastructure and
  immutable-subject binding. At the 2026-09-01
  re-observation, `origin/main` is
  8a6022095807bf19a2953025e94e48fd0072f31e and exact-main run 33546598147
  passed all 33 jobs. The three-mode Release workflow; separate
  certification, readiness, and final-public workflows, contract-pinned
  Sigstore provenance verifier, and hostile-boundary tests are merged. The
  unsupported external-observer and ingress design is historical and is
  removed by the npm-only hosted-proof hard cut; it is not a release gate.
- The isolated npm-only scope worktree is
  /Users/cjpher/.codex/worktrees/v060-npm-only-release/does-effect on branch
  codex/v060-npm-only-release at that exact main SHA. Its reviewed local hard
  cut removes Apple/AWS evidence from the v0.6.0 gate while retaining the
  `effect-build-apple` npm API/library package. Until committed, pushed,
  reviewed, merged, and exact-main CI passes, those scope bytes are not remote
  implementation or release-point evidence.
- Current main contains the eleven-package Release workflow. It remains a
  DO-NOT-DISPATCH path until the npm-only three-proof cut is merged and exact
  release point R is established.
- test/architecture/release-workflow.test.ts lines 52-230 parses YAML and
  asserts strings and topology. It does not execute the publisher against a
  registry model.
- .github/workflows/ci.yml lines 280-329 explicitly label Apple evidence
  credential-free and leave Developer ID, notarization, stapling, Gatekeeper,
  and clean-host distribution external.
- tooling/effect-build-contract.json contains thirteen public Apple producer
  capabilities, exactly eleven public packages, forty-two public modules, and
  one reservation-only Rolldown package.
- packages/effect-build-apple/README.md lines 59-80 define credential and
  journal ownership. Lines 82-91 define the external acceptance boundary.
- The `apple-certification` environment now exists with the required reviewer
  and main-only deployment policy, but its secret/variable inventories are
  empty. This is inert policy scaffolding, not Apple credential or execution
  feasibility. It is not used by or required for the npm-only v0.6.0 release.
  The repository has no self-hosted runners. Main is now protected strictly,
  including administrators, by the three platform Verify checks; force pushes
  and deletion are disabled. Active tag ruleset 22007841 protects
  `refs/tags/v0.6.0` without bypass, update, or deletion.
- The 2026-08-31 repository Actions secret-name inventory historically
  contained `NPM_TOKEN`. A fresh authenticated administrative re-observation
  on 2026-09-01 reports zero repository Actions secrets and zero variables;
  no value was accessed. Treat GitHub-side absence only as proof of current
  GitHub state. It does not prove that any corresponding npm token was revoked;
  no npm token-absence claim is admitted by the v0.6.0 gate.
- Repository release immutability is now enabled and not owner-enforced. The
  ordinary workflow `GITHUB_TOKEN` returned HTTP 403 when reading
  `repos/mannyc2/effect-build/immutable-releases`; the endpoint requires
  repository Administration-read authority, which is not a workflow-token
  permission. Immutability is therefore re-observed by an operator-admin
  immediately before draft creation and again before public publication; it is
  not a hosted readiness role.
- A fresh interactive npm web login authenticated as `mannyc1` and was revoked
  after the feasibility check. npm 11.19.1 source confirms `trust list` is a
  supported authenticated read, but no supported read interface exists for the
  package publishing-access toggle, and web login itself creates a token.
  Consequently the contract records npm administrative inventory as
  unobserved/excluded rather than requiring an impossible empty-token or 2FA
  policy receipt. Node 24.14.1/npm 11.11.0 remains the audited hosted
  publication/OIDC-certification client.
- Anonymous registry re-observation on 2026-08-31 found no 0.6.0 on any of the
  twelve names. The five established packages retain `latest=0.3.0`; all seven
  handoff placeholders are singleton `0.0.0-reserved.0` packages with exact
  contract bytes and `reserved` plus temporary `latest` tags; Rolldown remains
  reservation-only.
- The repository OIDC subject endpoint now returns `use_default: true`,
  `use_immutable_subject: true`, and subject prefix
  `repo:mannyc2@126291407/effect-build@1331906770`. The active npm environment
  subject is therefore
  `repo:mannyc2@126291407/effect-build@1331906770:environment:npm`. Re-observe
  this policy at R and validate the token's exact environment-qualified
  subject. The generated contract and hostile fixtures must use this immutable
  ID-qualified form; falling back to the prior name-based subject is forbidden.
- For the later Apple-artifact release, standard GitHub-hosted macOS labels
  provide arm64 macos-15 and Intel macos-15-intel runners. Use fresh hosted
  runners for that future clean-host evidence unless credential feasibility
  proves that a separately approved, pre-provisioned runner is required.
- The published downstream package re-observed on 2026-08-31 is
  @mannyc1/ts-release 0.2.2. Do not infer that it supports the v0.6 Apple
  journal. Qualify an exact released version or exact reviewed source commit
  only before the later signed/notarized Apple-artifact release; this is not a
  v0.6.0 npm readiness prerequisite.
- npm documentation states that saved trusted-publisher configuration is not
  validated when saved. Pinned npm 11.11.0 currently performs the OIDC exchange
  before its dry-run mutation guard, then skips `libpub`; exchange failures are
  swallowed, so dry-run exit status alone is not evidence. Plan 045 therefore
  requires the exact private success marker, audited client-source digests,
  and unchanged registry state. Any npm client change requires re-auditing this
  ordering.
- The official npm 11.11.0 registry tarball and the local Node 24.14.1 bundle
  agree byte-for-byte for the audited sources. Current SHA-256 values are
  `publish.js=ba4afde95ca02334b0d221213907f458c4ba576c1c583b9d73c8ef99924ba26c`,
  `oidc.js=d3cdddc81b038ece6394323dfa2e1ec813b186d7965e0aea0cd2b1c39ce97ef9`,
  `libnpmpublish/publish.js=39b4994968f6699004c0200ae12cadf328c8d838534315c1978672bf3dd15401`,
  `libnpmpublish/provenance.js=ee9b1bc8e3f636fbaf5138a3e183ce3c6d42bb5dd57ab004578e534dd08da46b`,
  and
  `@sigstore/sign/identity/ci.js=23e3c7c5799a54f7818b3d8d8f0bf9980b8b61a1f0b39632b941c6fb82aca327`.
  The Sigstore provider uses `Promise.any` across GitHub request-token and
  `SIGSTORE_ID_TOKEN` sources, while provenance generation precedes registry
  PUT. A pre-supplied Sigstore token is therefore a pre-mutation STOP, not an
  input to verify after publication.

## Step 2 feasibility audit result: RESOLVED BY HOSTED-ONLY HARD CUT

The original five-role design was self-blocked by two observer interfaces that
the target platforms do not support. GitHub's workflow token cannot read the
repository Administration immutability endpoint. npm can authenticate trusted
publisher records, but npm 11.19.1 exposes no supported read for the package
publishing-access toggle; moreover, an interactive web login creates a token,
so a receipt requiring an ephemeral non-token session and an empty token
inventory was contradictory.

The v0.6.0 solution removes those unsupported claims rather than inventing an
API, PAT, secret, caller-attested receipt, or self-hosted observer. Readiness
has exactly three real hosted roles: exact-main CI, exact protected-body
fake-registry certification, and eleven-package npm OIDC dry-run
certification. The canonical contract is directly usable; no supported fixture
or generated activation can make a peer policy pass.

The npm administrative inventory is recorded as `not-observed` and
`excluded-from-v0.6.0`. The dry-run proves package-specific OIDC exchange
acceptance and unchanged registry state only. Real publication plus immediate
byte, tag, and provenance verification proves each mutation. GitHub Release
immutability is re-observed with operator Administration authority immediately
before draft creation and again before publication; final-public verification
requires the actual Release to report `immutable: true`.

Credential-backed Apple execution and the operational journal remain deferred
future-release work. No Developer ID identities, Notary outcomes, clean-host
aggregate, or qualified journal exists. Plan 046's native probe work and Plan
047's journal design are source/planning evidence only and do not enter the
v0.6.0 candidate or readiness aggregate.

## Authoritative constraints

- tooling/effect-build-contract.json remains the implementation, public
  projection, npm admission, reservation, and ownership authority.
- effect-build owns Apple operations and immutable artifact production. For a
  later signed/notarized macOS release, the downstream release owner owns the
  durable journal, continuation, and product publication. None of those future
  responsibilities is a v0.6.0 readiness role.
- The protected npm job executes no checkout, dependency install, or
  repository script. It consumes immutable artifacts and inline,
  workflow-reviewed validation only.
- The protected npm job uses exact Node 24.14.1 and requires its bundled npm
  11.11.0 before any registry request. A different observed client is a STOP,
  not permission to install another client in the protected job.
- The npm publisher stays on a GitHub-hosted runner. npm trusted publishing
  does not currently support self-hosted GitHub runners.
- Repository-owned read-only GitHub observations use one pinned Node HTTPS
  boundary with bundled trust roots, exact `api.github.com:443` origin, bounded
  responses, no ambient GitHub configuration, proxy, cookie, authentication,
  or extra-CA inheritance, and kind-specific redirect rules. Actions artifact
  downloads admit exactly one 302 to an exact subdomain of
  `blob.core.windows.net`; Release assets admit either the API-origin 200 or
  exactly one 302 to `release-assets.githubusercontent.com`. Authorization is
  never forwarded to the second hop.
- Anonymous npm observations use one pinned Node HTTPS boundary with bundled
  trust roots and exact `registry.npmjs.org:443`, with no redirect, query,
  userinfo, compression, ambient npm configuration, authentication, proxy, or
  extra CA. Fresh npm and Bun consumer processes run under empty project,
  user, and global configuration roots and re-audit their effective npm
  configuration before and after installation.
- Checkout-capable release jobs bootstrap their verifier graph only through
  `install-frozen-release-dependencies.mjs`: exact Bun 1.3.14, a canonical
  SHA-512 integrity for every non-workspace `bun.lock` entry, the exact
  auth-free project `.npmrc` and release-bootstrap `bunfig`, empty private
  user/global npm configuration, fresh private home/cache/temp roots, no
  inherited auth, proxy, extra CA, or `NODE_OPTIONS`, and lifecycle scripts
  disabled. This lock-resolved dependency bootstrap is never release evidence;
  the protected publisher remains checkout-free and performs no install.
- Aggregate and final-public collectors finish all byte, schema, Sigstore, and
  semantic validation first, then perform the exact authenticated current-main
  observation as their final external read. They return no success object or
  uploadable receipt if main changes during validation.
- Keep the sole npm mutation as explicit npm publish with latest. npm staged
  publishing is out of scope because the combined contract fixes npm-publish;
  changing that is a new architecture decision, not a release workaround.
- Never add or retain a manually provisioned, traditional, long-lived,
  persisted, logged, or fallback npm token. `NPM_TOKEN`, `NODE_AUTH_TOKEN`, a
  pre-supplied `NPM_ID_TOKEN`, and `SIGSTORE_ID_TOKEN` remain forbidden in both
  certification and publication. The short-lived package-scoped token returned
  inside the audited request-based npm OIDC exchange and the request-derived
  GitHub token used by Sigstore are the only admitted identities and must remain
  process-local. Every tarball's embedded `publishConfig` is exactly
  `{ access: "public", provenance: true }`; reject every additional key,
  especially registry-scoped auth. Never add login, manual publication,
  dist-tag repair, repack, retry fallback, or automatic package installation.
- The generated contract owns the complete shared provenance-verifier
  authority: exact runtime/client versions and integrity, trusted-root/TUF
  bytes, certificate bindings, network guard, and response bounds. Removing
  obsolete external receipt signing must not remove or weaken verification of
  real npm publication provenance.
- Every readiness producer is repository-owned and GitHub-hosted. Candidate and
  evidence authority comes only from authenticated run/artifact coordinates,
  exact workflow/source binding, and downloaded byte validation. There is no
  external ingress, secret-backed observer, caller-authored receipt, or test
  activation override.
- Never store or print signing certificates, certificate passwords, Notary
  API-key material, keychain-profile coordinates, OIDC tokens, cookies, or npm
  credentials.

## Commands the executor will need

| Purpose | Command | Expected success |
|---|---|---|
| Exact local tool | test "$(bun --version)" = "1.3.14" | exit 0 |
| Frozen install | node scripts/release/install-frozen-release-dependencies.mjs | exact integrity-bound graph installed, no authority-byte drift |
| Full source gate | bun run verify | exit 0 |
| Real provider gate | bun run verify:real | exit 0 on a supported host |
| Complete architecture gate | bun run test:architecture | every architecture test passes, including frozen bootstrap, sealed GitHub/npm boundaries, strict tar and ZIP readers, TUF/Sigstore, credential-free consumers, ingress, terminal observation, readiness, publisher, and final-public tests |
| Retained TUF replay | node scripts/release/verify-sigstore-tuf-provenance.mjs | retained seed/root/timestamp/snapshot/targets chain and target bytes replay exactly |
| Contract gate | bun run check:contract | exit 0 |
| Formatting | bun run format:check | exit 0 |
| Patch check | git diff --check | no output |
| Repository handoff compatibility check | pnpm verify | expected package-manager rejection because this repository declares Bun 1.3.14; record it, but do not substitute it for the Bun gate |
| Remote main | gh api repos/mannyc2/effect-build/git/ref/heads/main --jq .object.sha | one full SHA |
| PR state | gh pr view 24 -R mannyc2/effect-build --json state,headRefOid,baseRefOid,mergeable,mergeStateStatus,statusCheckRollup | exact expected refs and terminal checks |
| Environments | gh api repos/mannyc2/effect-build/environments | authenticated JSON |
| Repository secret names | gh api repos/mannyc2/effect-build/actions/secrets | names and timestamps only; never values |
| Runners | gh api repos/mannyc2/effect-build/actions/runners | authenticated inventory |
| npm state | npm view NAME versions dist-tags --json --registry https://registry.npmjs.org | parseable registry state |

Run the project-instruction `pnpm verify` handoff check once and record its
expected package-manager rejection. This repository intentionally declares Bun
1.3.14, so only the pinned Bun gate above can establish source verification.

## Suggested executor toolkit and references

- Use the effect-ts skill, if available, for any new Effect v4 harness code.
- Follow test/architecture/release-workflow.test.ts for workflow parsing and
  Vitest structure.
- Follow scripts/release/prepare-npm-candidate.mjs for combined-contract
  derivation and fail-closed package admission.
- Use the old v0.5 Apple workflow only as a question inventory, never as a
  drop-in implementation:
  /Users/cjpher/.codex/worktrees/v05-research-complete/does-effect/.github/workflows/apple-certification.yml
- npm trusted-publisher reference:
  https://docs.npmjs.com/trusted-publishers/
- GitHub OIDC claims reference:
  https://docs.github.com/en/actions/reference/security/oidc
- GitHub-hosted runner reference:
  https://docs.github.com/en/actions/reference/runners/github-hosted-runners
- GitHub immutable Release reference:
  https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/establish-provenance-and-integrity/prevent-release-changes

## Scope

**In scope for the release-readiness implementation**:

The current v0.6.0 gate covers the npm candidate/publisher, three-role hosted
readiness, operator immutability preflights, and final public verification.
Apple files listed below are retained only for
API/library source qualification and the deferred design record; they must not
produce or satisfy v0.6.0 readiness evidence.

- .github/workflows/release.yml
- .github/workflows/release-certification.yml
- .github/workflows/release-readiness.yml
- .github/workflows/release-verification.yml
- .github/workflows/apple-certification.yml
- package.json and bun.lock, limited to the exact offline Sigstore provenance
  verifier and exact TUF acquisition-provenance replay clients
- scripts/release/
- scripts/apple-certification/
- scripts/test-built-consumer.mjs, limited to sealed credential-free npm and
  Bun registry-consumer execution
- packages/effect-build-apple/, limited to the reviewed Plan 046 native-probe
  repair, the v0.6 Notary journal codec/receipt boundary, and bounded
  provider-native provenance-carrier composition needed to retain and project
  each operation's full exact tool lineage; no public field, operation, module,
  or API shape may change
- scripts/release/prepare-npm-candidate.mjs, limited to the reviewed candidate-v2
  hard cut
- scripts/effect-build-contract/model.mjs
- scripts/effect-build-contract/policy.mjs
- scripts/effect-build-contract/contract.test.mjs
- scripts/effect-build-contract/validate.mjs
- test/architecture/release-workflow.test.ts
- test/architecture/release-protocol.test.ts
- test/architecture/release-publisher-state-machine.test.ts
- test/architecture/release-certification-workflow.test.ts
- test/architecture/release-readiness-protocol.test.ts
- test/architecture/release-readiness-workflow.test.ts
- test/architecture/release-verification-workflow.test.ts
- test/architecture/final-public-verification.test.ts
- test/architecture/sigstore-dsse-verifier.test.ts
- test/architecture/sigstore-tuf-provenance.test.ts
- test/architecture/tar-protocol.test.ts
- test/architecture/zip-protocol.test.ts
- test/architecture/ci-workflow.test.ts
- test/architecture/apple-certification-protocol.test.ts
- test/architecture/apple-certification-workflow.test.ts
- test/architecture/github-read-only-boundary.test.ts
- test/architecture/npm-read-only-boundary.test.ts
- test/architecture/frozen-release-dependency-bootstrap.test.ts
- test/architecture/credential-free-consumer.test.ts
- test/architecture/terminal-observation.test.ts
- test/architecture/assert-current-main.test.ts
- test/architecture/post-upload-artifact-observation.test.ts
- test/architecture/terminal-reference-builder.test.ts
- test/architecture/core-hard-cut.test.ts, limited to Apple private-operation
  provenance-carrier assertions
- test/architecture/public-surface.test.ts, limited to proving the Apple
  journal/tool-lineage implementation remains package-private
- test/integration/apple-native-real.test.ts
- test/fixtures/release/
- tooling/sigstore/trusted_root.json, limited to the exact digest-pinned TUF
  trusted-root target used by the offline verifier
- tooling/sigstore/tuf/seed-root-v14.json.base64,
  tooling/sigstore/tuf/root-v15.json.base64,
  tooling/sigstore/tuf/timestamp-v769.json.base64,
  tooling/sigstore/tuf/snapshot-v165.json.base64, and
  tooling/sigstore/tuf/targets-v14.json.base64, limited to exact retained bytes
  for independent authenticated-target provenance replay
- tooling/effect-build-contract.json, limited to generated
  `releaseCertification`; private rows
  `PRIVATE-APPLE-NOTARY-SUBMISSION`, `PRIVATE-APPLE-NOTARY-JOURNAL-CODEC`, and
  `PRIVATE-APPLE-NOTARY-REJECTION-FIXTURE`; and the corresponding regenerated
  model/policy provenance digests
- docs/release-security.md
- one v0.6 release-readiness receipt document
- CHANGELOG.md
- plans/045-establish-v060-release-point.md
- plans/README.md
- plans/046-repair-apple-native-probe-admission.md
- plans/047-establish-canonical-operation-journal.md

**Evidence-only inputs; do not change unless a failure proves a production
defect and a new plan is approved**:

- tooling/public-api.json
- packages/*/package.json

**Out of scope**:

- public API, provider-operation, capability, or package-admission changes;
- publishing effect-build-rolldown;
- version changes away from 0.6.0;
- edits to mannyc2/ts-release without a separate cross-repository plan and
  authority;
- Apple App Store distribution;
- npm staged publishing or traditional token publication;
- manual tag repair, manual npm publication, or asset repacking;
- cleanup of unrelated dirty worktrees or stale worktree registrations.

## Git workflow

- Do not append release-readiness implementation commits to PR 24 merely to
  avoid a second PR; that would change its exact head and invalidate its
  current evidence.
- After separately authorized merge and exact-main verification of PR 24,
  create an isolated worktree from the new remote main on branch
  codex/v060-release-readiness.
- Preserve the two reviewed local planning changes in the a63e worktree. Copy
  those exact files into the new isolated release-readiness worktree after it is
  created; do not clean, reset, commit, or repurpose the PR 24 worktree merely
  to make its status empty.
- Use conventional commits, matching recent repository history. Keep tests,
  implementation, workflow wiring, and final evidence docs in reviewable
  logical commits.
- Land the canonical three-proof hard cut as one reviewed change. Its merge is
  eligible to become R only after exact-main CI and every Definition gate.
- Treat commit, push, PR creation, and merge as four separate acts. Do not
  perform any one of them, change repository settings, dispatch a credentialed
  workflow, or publish unless the operator has authorized that exact act.

## Dependency graph

    guarded PR 24 merge
              |
        exact-main CI/tree
              |
       npm-only hard-cut PR
                 |
         exact-main SHA R freeze
          /              \
      fake npm         npm OIDC
          \              /
          readiness aggregate
                  |
        RELEASE POINT earned at R
                  |
        explicit npm authority
                  |
      exact-byte npm convergence
                  |
       explicit tag/Release authority
                  |
         public smoke and receipt

## Steps

### Step 1: Re-observe state and obtain merge-only authority

1. Verify the PR head, base, mergeability, reviews, and every exact-head check.
2. Verify live remote main still equals the recorded base and npm still has no
   0.6.0 for all twelve names. Authenticate the exact remote-main Release and
   bootstrap blobs recorded above and do not dispatch either one.
3. Require the a63e worktree's entire short status to be exactly the two
   intentional planning paths below, with no source, workflow, contract, or
   other drift. Preserve those files and the unrelated dirty original checkout:

       M plans/README.md
       ?? plans/045-establish-v060-release-point.md
4. Present the exact merge command and state explicitly that it will not
   dispatch Release, mutate npm, tag, or create a GitHub Release.
5. Only after merge-only authorization, merge with a merge commit and the
   exact-head guard:

       gh pr merge 24 -R mannyc2/effect-build \
         --merge \
         --match-head-commit e4511f12f2afdab0090de73fd6bf4d1f226b4d88

6. Capture the new main SHA, wait for its push CI, download relevant retained
   artifacts, and prove the merge tree equals the PR-head tree. Leave PR 22
   untouched until the administrative closure step.

**Verify**:

    test "$(git status --short)" = $' M plans/README.md\n?? plans/045-establish-v060-release-point.md'
    MERGE_SHA="$(gh api repos/mannyc2/effect-build/git/ref/heads/main --jq .object.sha)"
    git fetch origin "$MERGE_SHA"
    test "$(git rev-parse "$MERGE_SHA^1")" = "4ad34423d84d17c959ace0d55af8623f336a68be"
    test "$(git rev-parse "$MERGE_SHA^2")" = "e4511f12f2afdab0090de73fd6bf4d1f226b4d88"
    test "$(git rev-parse "$MERGE_SHA^{tree}")" = \
      "$(git rev-parse e4511f12f2afdab0090de73fd6bf4d1f226b4d88^{tree})"
    git diff --exit-code e4511f12f2afdab0090de73fd6bf4d1f226b4d88 "$MERGE_SHA"

Expected: empty tree diff and one exact-main push run with all applicable jobs
successful. Any merge-tree difference stops the plan.

### Step 2: Freeze the truthful npm-only evidence boundary

1. Set readiness to exactly three authenticated GitHub-hosted roles:
   `exact-main-ci`, `fake-registry`, and `npm-oidc-certification`.
2. Delete external-observation roles, evidence ingress, external producer
   identities/signers, and the supported-fixture activation path. A caller may
   provide only exact run/artifact coordinates; readiness performs its own
   direct current-main, policy, and anonymous registry observations.
3. Preserve the pinned Sigstore verifier and trusted root under shared
   publication/provenance policy. Removing obsolete evidence signing must not
   weaken verification of real npm provenance.
4. Record npm administrative inventory as unobserved and excluded. Do not
   claim exclusive trusted-publisher administration, empty token inventory,
   publishing-access policy, or account 2FA state from unsupported reads or
   from the OIDC dry-run.
5. Keep Apple/AWS evidence explicitly deferred. Do not provision AWS, Apple
   credentials, runners, or journal infrastructure for v0.6.0.
6. Treat GitHub Release immutability as an operator-admin preflight immediately
   before draft creation and again before publication. Final-public
   verification must reject `immutable: false`.

**Verify**: contract mutation tests reject any extra, missing, or reordered
readiness role; workflow tests find no external ingress or activation branch;
the exact 28 Apple coordinates remain unique with N=2, P=10, G=6, A=10.

Expected: the canonical policy is directly executable and makes only the
claims supported by hosted evidence.

### Step 3: Specify the candidate and readiness artifact protocols with tests first

Add failing architecture tests before workflow changes.

1. Add one canonical `releaseCertification` object to the contract model. It
   freezes release.yml modes, candidate/readiness schemas, Node/npm identities,
   npm exchange evidence, fake-registry cases, and the explicit v0.6.0 scope:
   eleven npm packages including `effect-build-apple`, with credential-backed
   Apple products and AWS journal evidence deferred and excluded. The Apple
   protocol record in Step 6 remains future design only. Add mutation tests
   before generating the JSON; do not hand-edit it.
2. Define one candidate-only path, available only for a full current-main SHA,
   that performs frozen install, full verify, exact packing, and artifact
   upload without id-token permission or npm mutation.
3. At candidate creation and again inside every protected adopter, parse each
   tarball in memory through the one contract-owned
   `effect-build/strict-npm-package-ustar-gzip@1` reader before extracting only
   `package/package.json`. The protected no-checkout body imports a byte- and
   digest-pinned projection of that exact repository source. Require one fixed
   RFC 1952 member with exact deflate consumption, CRC-32 and ISIZE; bounded
   compressed, expanded, per-entry, aggregate, manifest, and entry-count
   sizes; exact checksummed POSIX ustar; safe unique `package/` paths; and only
   regular files/directories. Reject PAX/GNU/base-256 extensions, links,
   devices, duplicate/traversal names, trailing members/data, nonzero padding,
   or filesystem extraction. Then require `publishConfig` to equal exactly
   `{ access: "public", provenance: true }`. Reject absent, additional, renamed,
   registry-scoped, authentication, certificate, key, OTP, config-path, proxy,
   retry, force, tag, or registry keys even when the same setting also appears
   as a CLI flag. npm 11.11.0 deliberately flattens arbitrary `publishConfig`
   after initial configuration capture, so pre-invocation config inspection is
   not a substitute for this embedded-manifest allowlist.
4. Retain the candidate long enough for human review and publication approval.
   Use thirty days unless evidence supports a narrower bounded window.
5. Define a release-readiness aggregate schema that contains evidence
   identities and digests, not credentials or Apple private response bodies.
6. Canonicalize every GitHub artifact digest as `sha256:` plus 64 lowercase hex
   in contracts, dispatch inputs, receipts, and REST comparisons. Accept the
   upload-artifact action's bare 64-hex output only at that pinned action
   boundary, prefix it immediately, require REST metadata to equal the canonical
   value, and require downloaded ZIP bytes to hash to its suffix. Reject
   uppercase, double-prefixed, algorithm-mismatched, or mixed-form values.
7. Require any publish dispatch to name the exact candidate run, attempt,
   artifact ID/digest, readiness run, attempt, and artifact ID/digest.
8. Make the protected publisher authenticate and consume those exact prior
   bytes. It must not checkout, install, execute a repository script, or
   repack.
9. Pin the protected runtime through exact Node 24.14.1 setup and fail unless
   npm is exactly 11.11.0. Include both versions in the readiness receipt.
10. Hard-cut the misleading do-not-publish option. The one release.yml workflow
   has exactly three fail-closed modes: prepare-exact-sha creates the
   unprotected candidate; certify-exact-sha consumes that exact candidate and
   runs the protected GitHub claims proof plus eleven dry-run npm exchanges but
   cannot reach npm publication; publish-certified-bytes consumes exact
   candidate and readiness coordinates and contains the sole real mutation.
   Unknown modes and mode-inapplicable inputs fail before any job with elevated
   permissions.

**Verify**:

    bunx vitest run test/architecture/release-workflow.test.ts

Expected: new tests initially fail on the current topology, then pass with one
candidate-only path, one protected claims path, one protected publisher, and
no extra mutation command.

### Step 4: Execute the exact publisher against a stateful fake registry

This certification is itself one readiness input, so it does not consume the
final readiness aggregate. The canonical policy runs it directly on GitHub at
R; there is no external authentication switch or test-only supported contract.
The harness must exercise the exact shell bodies extracted from the parsed
workflow, not a friendly reimplementation.

1. Select the exact protected reauthorization step and the exact publisher
   step by their frozen YAML names. Fail unless each selector resolves exactly
   once. Execute both unchanged bodies in workflow order; a rename, split, or
   duplicate must break the harness rather than leave stale code under test.
2. Build deterministic fixture candidate bytes and one self-consistent test
   clone of the combined contract whose placeholder hashes are derived from
   the fixture tarballs. Candidate v2 has only its closed candidate fields and
   never embeds a duplicate registry object. Serve the authoritative registry
   policy only through authenticated contract bytes at the fake GitHub API/curl
   boundary. Keep separate static tests asserting the production contract's
   real frozen ledgers.
3. Build fake GitHub responses for artifact, environment, deployment policy,
   contract, and current-main reads. Reject any unrecognized endpoint or URL.
4. Build one stateful fake npm executable supporting only the commands used by
   the protected script. Persist state in a temporary directory and record
   every attempted mutation.
5. Execute and assert these cases:
   - all eleven targets absent with exact prior latest, then full convergence;
   - a partial exact-byte publication resumes only missing names while the
     original readiness packet remains valid;
   - exact target bytes exist but latest is wrong;
   - target version exists with conflicting bytes;
   - exact target bytes and latest exist but provenance is missing,
     unverifiable, bound to a different workflow/SHA, carries the wrong source
     OID, or duplicates the source OID;
   - prior latest drift before first mutation;
   - any version newer than 0.6.0;
   - an inconclusive non-404 registry read;
   - failure before registry commitment;
   - response loss after registry commitment, followed by observation-driven
     exact-byte resume within the original readiness validity window;
   - response loss after bytes/tag commitment but before valid provenance,
     which must stop rather than publish a later package;
   - placeholder or reservation tag drift;
   - Rolldown contains any non-placeholder version;
   - any tarball has missing, additional, or non-canonical `publishConfig`,
     including registry-scoped auth;
   - any protected invocation receives `NPM_ID_TOKEN`, `NPM_TOKEN`,
     `NODE_AUTH_TOKEN`, or `SIGSTORE_ID_TOKEN`;
   - post-publish downloaded bytes, integrity, or size differ;
   - main advances before the first mutation;
   - registry state drifts after the first committed mutation;
   - main advances after the first committed mutation;
   - release authority drifts after the first committed mutation;
   - candidate ZIP, manifest, tarball, or readiness digest differs.
6. Assert every failing case performs no later mutation. Assert fake-registry
   retries never repack, dist-tag, unpublish, or use any external credential.

**Verify**:

    bunx vitest run \
      test/architecture/release-publisher-state-machine.test.ts \
      test/architecture/release-certification-workflow.test.ts \
      test/architecture/release-workflow.test.ts

Expected: the canonical protected certification executes all forty coordinates
through the same extracted reauthorization and publisher bodies, cross-checks
the independent oracle, asserts explicit mutation counts, and emits the
readiness-admissible authenticated artifact. Coverage by string inspection or a
different helper implementation is not completion.

### Step 5: Certify GitHub claims and all eleven npm OIDC exchanges without publication

1. Run only on workflow_dispatch from current main and require environment npm.
2. Grant id-token: write and the minimum read permissions. Do not checkout.
3. Use one inline Node 24 program with only built-in `https`, bundled TLS roots,
   and `crypto` to request a token for audience npm:registry.npmjs.org through
   the contract-pinned exact-origin, no-redirect, inactivity-bounded and
   total-sequence-bounded transport. `fetch` remains only the generated fake
   boundary projection; do not install or load verifier code from the
   repository.
4. Fetch GitHub's OIDC discovery document and JWKS. Allow only RS256, require
   exactly one matching RSA signing `kid`, reject header-directed key URLs,
   verify the JWT signature, and enforce explicit skew-bounded `nbf`, `iat`,
   and `exp` bounds. Then validate issuer, audience, repository,
   repository IDs, subject, ref, SHA, workflow_ref, environment, event name,
   ref type, workflow SHA, repository owner ID, public repository visibility,
   `runner_environment=github-hosted`, run ID, and attempt. Bind the expected
   subject to the freshly observed repository OIDC subject policy. Derive the
   exact name-based or immutable-ID form from the observed
   `use_immutable_subject` value; never treat the returned immutable prefix as
   active while that value is false. Canonicalize sorted-key JSON before
   hashing the claims receipt.
5. Pin and preflight Node 24.14.1 and npm 11.11.0. Re-observe and record
   SHA-256 for npm's installed `publish.js`, `oidc.js`, bundled
   `libnpmpublish/lib/publish.js`, `libnpmpublish/lib/provenance.js`, and
   `@sigstore/sign` CI identity provider. Architecture tests must lock the
   audited exchange-before-dry-run ordering, exact
   `Successfully retrieved and set token` marker, provenance-before-registry-PUT
   ordering, and Sigstore provider set/order. Any source or dependency change
   requires a new audit.
6. Fail if `NPM_ID_TOKEN`, `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or
   `SIGSTORE_ID_TOKEN` is present, if captured npm configuration contains
   preexisting registry authentication, or if any embedded `publishConfig` is
   not the exact two-key allowlist. Use exact empty temporary user/global
   configs so npm must use GitHub's request endpoint; never print the captured
   configuration.
7. For each of the eleven candidate tarballs, in canonical order, run the same
   explicit publish arguments as the real path plus `--dry-run` and
   `--loglevel=verbose`. Use `--ignore-scripts`, an empty temporary npm user
   config, and a temporary cache/log directory. Disable command tracing and
   capture all output privately.
8. Require exactly one success marker in each private invocation log. Exit zero
   without the marker is failure. Immediately prove that package's 0.6.0
   version remains absent and its prior `latest` value remains exact; after all
   eleven, compare the complete version/tag/placeholder/Rolldown observation to
   the pre-certification snapshot.
9. Never print or upload the GitHub JWT, the exchanged npm token, or private npm
   logs. Upload only canonical `github-oidc-claims` and
   `npm-oidc-exchange-accepted` receipts containing expected claims, safe
   client/source digests, package names, observation digests, and an explicit
   `registryMutation: false`. Do not label either receipt
   npm-publication-certified or provenance-certified.

**Verify**:

    bunx vitest run test/architecture/release-workflow.test.ts
    ! rg -n "npm-publication-certified" .github scripts test

Expected: workflow tests pass; dedicated no-secret tests prove that the request
token, JWT, exchanged npm token, and private marker logs cannot reach stdout,
stderr, command tracing, environment snapshots, step outputs, summaries, npm
user config, cache retained after the trap, or artifacts. Exactly two retained
files exist: one GitHub claims receipt and one npm exchange receipt containing
eleven ordered package-specific entries. Registry state is byte-for-byte
unchanged, and no tarball upload or provenance generation occurred.

### Step 6: Deferred Apple-artifact certification design record

**SUPERSEDED FOR v0.6.0 ON 2026-09-01. Do not execute this step for v0.6.0.**
Credential-backed Apple artifact certification was not run and has not passed.
The v0.6.0 release publishes the `effect-build-apple` API/library package but
no signed/notarized App, DMG, or PKG. Its readiness aggregate accepts no Apple
or AWS journal evidence.

The detailed design below is preserved as historical question coverage for a
later, separately qualified Apple-artifact release. Its v0.6-specific protocol
names, artifact names, coordinates, and commands are not current release
instructions; that future release must re-review and re-version them against
its exact source, credentials, hosts, journal, and product scope.

Do not copy the v0.5 workflow's six-package candidate protocol, public-ZIP or
macOS Node SEA coordinates, universal receipt schema, or hard-coded 32-receipt
claim. Reuse only its unprivileged prepare -> protected native execution ->
secret-free clean host -> unprivileged aggregate trust topology.

#### 6.1 Historical proposed v0.6 protocol (deferred)

Add a narrowly scoped `releaseCertification` policy to the generated combined
contract. It may derive from the existing operation register but may not change
any provider operation, public projection, npm admission, or reservation. The
policy is the single source for workflow matrices, validators, and tests and
hard-cuts these protocol identities:

- `effect-build/apple-certification-request@3`
- `effect-build/apple-certification-receipt@3`
- `effect-build/apple-certification-evidence@3`
- `effect-build/apple-certification-prior-evidence@2`
- `effect-build/apple-certification-bundle@3`
- `effect-build/apple-certification-index@2`

The final artifact is named `effect-build-v0.6.0-apple-certification`, is
retained for thirty days, and contains exactly
`apple-certification-index.json` and
`effect-build-v0.6.0-apple-certification.bin`. The index canonically binds the
opaque bundle. Only attempt 1 is admissible. There is no legacy decoder,
version coercion, alternate filename, or reconstructed evidence path.

Freeze the following exact coordinate order:

    N-native-mechanics|macos-aarch64
    N-native-mechanics|macos-x64
    P-signed-bun-app|macos-aarch64
    P-signed-bun-app|macos-x64
    P-signed-deno-app|macos-aarch64
    P-signed-deno-app|macos-x64
    P-notarized-stapled-app-private-zip|macos-aarch64
    P-notarized-stapled-app-private-zip|macos-x64
    P-notarized-stapled-dmg|macos-aarch64
    P-notarized-stapled-dmg|macos-x64
    P-notarized-stapled-pkg|macos-aarch64
    P-notarized-stapled-pkg|macos-x64
    G-app|macos-aarch64
    G-app|macos-x64
    G-dmg|macos-aarch64
    G-dmg|macos-x64
    G-pkg|macos-aarch64
    G-pkg|macos-x64
    A0
    A1
    A2
    A3
    A4
    A5
    A6
    A7
    A8
    A9

That is exactly 2 native, 10 distribution, 6 clean-host, and 10 verdict
receipts. No macOS Node SEA or ZIP product/G-ZIP coordinate is admitted.
Private App transport and clean-host acquisition envelopes may retain ZIP
digests as evidence, but they are never products or distribution coordinates.

All receipt variants share only protocol, coordinate, R, candidate and
workflow run/attempt/artifact bindings, certifier or verifier digest, runner
identity, evidence digest, dependency links, and verdict. `runnerIdentity` is
mandatory on every one of the 28 N/P/G/A receipts.
Define strict tagged variants with required-and-forbidden fields:

- N requires native tool/operation facts plus exact Bun and Deno
  hashed-executable identities for its host architecture, and forbids
  certificate, credential, journal, and submission fields.
- P-signed-App requires architecture, paired-App manifest, artifact identity,
  public certificate class/Team ID/fingerprint/validity, hardened-runtime,
   secure-timestamp, and verifier facts; it forbids Notary fields.
- P-notarized product requires the applicable P-signed dependency, artifact and
  pair identities, public certificate facts, externally acknowledged journal
  reference, accepted info/log facts, staple ticket, assessment, and exact tool
  observations. Private logs remain in the opaque bundle by digest only.
- G requires the exact P producer link, acquisition-transport and extracted
  product identities, quarantine propagation, host image/architecture/UID,
  normal user-flow steps, sentinel or install evidence, and cleanup. It forbids
  credentials, signing identities, journal ownership, and submission fields.
- A requires an exact ordered dependency set plus named claims and forbids
  product output, credential, and submission-owner fields.

#### 6.2 Historical operation and verdict coverage (deferred)

Map the thirteen public operations without an “at least one” escape hatch:
`buildAppBundles` feeds both Bun and Deno paired-App manifests; `signApp` feeds
all six P App cells; `createDiskImages`/`signDiskImage` feed both P-DMG cells;
`buildInstallerPackages`/`signInstallerPackage` feed both P-PKG cells;
`submitApp` feeds the private-ZIP App cells; `submit` feeds DMG and PKG;
`info`/`log` feed all six notarized product cells and A7; `stapleApp` feeds App;
`stapleFile` feeds DMG and PKG; and `assess` feeds all six products.

Every operation receipt derives its lineage from
`releaseCertification.apple.operationToolLineage.byOperationId` in exact
`first-executed-distinct-tool` order. Each lineage component is exactly
`name` plus `capabilityId`; the corresponding receipt observation retains
`name`, `version`, `executableDigest`, `observationDigest`, and the full
provider-native `nativeObservation`. Validators reject reordered, missing,
extra, duplicated, or capability-substituted tools.
The frozen operation/product table is:

- 001 App: `plutil/plist-lint`;
- 002 App: `codesign/developer-id-signing`;
- 003 DMG: `codesign/developer-id-signing`;
- 004 PKG: `productsign/installer-signing`, then
  `pkgutil/package-signature-verification`;
- 005 DMG: `codesign/app-signature-verification`, then
  `hdiutil/udzo-image`;
- 006 PKG: `codesign/app-signature-verification`,
  `pkgbuild/component-package`, `productbuild/flat-package`, then
  `pkgutil/payload-verification`;
- 007 DMG: `codesign/signature-verification`, then
  `notarytool/notarization`; PKG: `pkgutil/package-signature-verification`, then
  `notarytool/notarization`;
- 008 App: `codesign/signature-verification`, `ditto/archive-transport`, then
  `notarytool/notarization`;
- 009 and 010 App/DMG/PKG: `notarytool/notarization`;
- 011 App: `codesign/signature-verification`, then
  `stapler/ticket-stapling`;
- 012 DMG: `codesign/signature-verification`, then
  `stapler/ticket-stapling`; PKG: `pkgutil/package-signature-verification`, then
  `stapler/ticket-stapling`;
- 013 App/DMG: `spctl/gatekeeper-assessment`, then
  `codesign/signature-verification`; PKG: `spctl/gatekeeper-assessment`, then
  `pkgutil/package-signature-verification`.

Freeze the A-cell dependencies and claims:

- A0: R/current-main, exact-main CI, candidate, contract/public surface,
  lockfile, certifier, clean-host verifier, and protocol identities.
- A1: both N receipts and exact native tool observations.
- A2: the four Bun/Deno P-signed-App receipts.
- A3: both P-notarized-App and both G-App receipts; exact
  sign/submit/accept/staple/assess/launch chain.
- A4: both P-notarized-App receipts; each private ZIP digest projects to the
  same App manifest and no public ZIP/G-ZIP claim exists.
- A5: both P-DMG and both G-DMG receipts.
- A6: both P-PKG and both G-PKG receipts.
- A7: all six notarized product receipts plus accepted, pending, rejected on
  both architectures,
  info/log, fresh-runner resume, service-failure, interruption, and
  pre-ack/unknown-outcome evidence. Adverse evidence is subordinate evidence,
  not an extra receipt.
- A8: all ten P receipts plus certificate class/Team ID/fingerprint/validity,
  distinct Application/Installer identities, both Notary credential-layer
  construction/redaction tests, the selected live Notary type, and the exact
  protected-job allowlist.
- A9: all 18 N/P/G receipts plus A0-A8; exact cross-links, immutable inputs,
  newly created outputs, no duplicates, and complete finalization.

#### 6.3 Historical one-byte-lineage job DAG (deferred)

1. An unprivileged Ubuntu admission/prepare job authenticates exact R/current
   main, attempt 1, exact-main CI, candidate bytes, Bun 1.3.14, contract, and
   lockfile. It builds immutable certifier, minimal clean-host verifier,
   fixtures, and ledgers with distinct digests. Protected jobs never checkout,
   install, or execute repository source.
2. Fresh native arm64 and x64 jobs execute credential-free N mechanics from the
   exact candidate tarballs, compile one frozen fixture with the exact admitted
   Bun and Deno tools, and retain the two finalized hashed executables for their
   host architecture in mode-preserving authenticated envelopes. A separate
   secret-free native pair-builder consumes all four authenticated N outputs
   and emits one unsigned paired-App manifest for each provider.
3. Four protected per-architecture signers reauthenticate the certifier and
   paired manifests, import only the required Developer ID Application material
   into an ephemeral keychain, sign the Bun and Deno Apps, record public
   certificate facts, and delete the keychain under a trap.
4. After both signed Apps for the chosen canonical provider exist, one
   secret-free native rendezvous job downloads them through a
   symlink-preserving authenticated envelope and runs each pair-only
   `createDiskImages` and `buildInstallerPackages` operation exactly once. It
   emits one cross-linked DMG pair and one PKG pair manifest. Two independently
   constructed single-architecture outputs are invalid.
5. Six protected per-architecture product jobs consume those exact lineages.
   App jobs use the already signed canonical App; DMG jobs sign with the
   Application identity; PKG jobs sign with the distinct Installer identity.
   Before any submit, each conditionally creates one canonical operation journal
   intent, receives its record-digest plus sequence/transaction acknowledgment,
   and re-reads it. Only that acknowledged intent authorizes exactly one submit
   using the selected Notary credential, with App using only its private ZIP
   transport and DMG/PKG using direct file submission. An acknowledged intent
   without an acknowledged provider receipt is an unknown-outcome STOP.
6. Immediately after a native `Submission` is returned, effect-build-apple
   alone strictly encodes it. The job appends those opaque bytes and exact codec
   ID to the qualified external journal, receives a second record-digest plus
   sequence/transaction acknowledgment, and re-reads the same chain before
   polling or uploading an Actions artifact. ts-release never interprets or
   remodels a Notary field. Missing/unknown provider response, write result,
   acknowledgment, or re-read is an unknown-outcome STOP with no resubmit. This
   deliberately does not claim to close the post-intent/pre-first-ID gap.
7. Fresh protected continuation jobs receive only the selected Notary
   credential, never signing identities. They verify the journal envelope and
   digest, then the exact effect-build-apple codec strictly decodes, correlates,
   and derives `SubmissionReference` from the opaque acknowledged bytes. They
   run bounded info/log observation, narrow accepted results, staple, assess,
   and emit P receipts. Separate, pre-frozen locally valid rejection fixtures
   on both architectures produce A7 adverse evidence without altering any
   successful artifact.
8. `environment: apple-certification` is allowed only on signing, submission,
   and Notary-continuation jobs. Pair builders, N jobs, G jobs, A jobs, and the
   aggregate are environment- and secret-free. Architecture tests assert this
   exact allowlist and step-local credential references.
9. Fresh arm64 and x64 G jobs use only the minimal verifier. Before acquisition
   they record a fresh image/UID and absence of target signing identities,
   Notary profiles, bundle IDs, package receipts/files, and prior product state.
   They authenticate a symlink-preserving acquisition envelope, apply and prove
   quarantine propagation, exercise product-normal App LaunchServices, DMG
   mount/App launch, and PKG installer flows, require a launch sentinel or
   install receipt/files, and prove unmount/removal afterward. They may not
   remove quarantine, disable Gatekeeper, override a rejection, or reuse a
   distribution runner.
10. Secret-free A0-A9 jobs authenticate exact prerequisite receipts and emit
    only their frozen claims. The final unprivileged aggregate requires all 28
    coordinates in exact order and rejects missing, extra, duplicate,
    wrong-run, wrong-attempt, wrong-architecture, wrong-pair, wrong-candidate,
    or expired evidence.

**Verify**:

    bunx vitest run \
      test/architecture/apple-certification-workflow.test.ts \
      test/architecture/ci-workflow.test.ts
    bun run verify

Expected for v0.6.0: this step is not executed and produces no artifact.
Structural and local fake-runner tests may continue to qualify API/library
source, but they do not satisfy credential-backed Apple distribution. Any
future hosted completion belongs to the separately qualified Apple-artifact
release.

### Step 7: Build one fail-closed release-readiness aggregate

Create a read-only workflow or script that:

1. authenticates GitHub API metadata for the candidate and each contributing
   run/artifact;
2. requires exact R, current main, attempt, success, non-expired artifacts,
   workflow identity, REST digest, and canonical `sha256:` byte identity;
3. downloads the candidate separately plus exactly three ordered evidence
   roles: exact-main CI, exact protected-body fake-registry certification, and
   npm OIDC certification;
4. independently re-observes anonymous npm versions/tags/placeholder bytes,
   current main, workflow blob, repository OIDC subject policy, npm environment
   metadata, deployment policy, and package repository URLs;
5. parses every GitHub artifact ZIP with the contract-pinned bounded reader
   before extraction and rejects unsupported topology, encoding, size, CRC,
   compression, or path forms;
6. emits exactly two files: `release-readiness.json` and the opaque evidence
   bundle. The publisher and final verifier load the exact contract-pinned
   Sigstore trusted root independently from authenticated source SHA R; it is
   not a third readiness file;
7. records npm administrative inventory as unobserved/excluded and states that
   dry-run evidence proves exchange acceptance and no registry mutation—not
   upload, provenance, or publication;
8. rejects every external-observation, ingress, Apple certification,
   operational-journal, App, DMG, PKG, or AWS reference; and
9. uploads one retained aggregate artifact with no credential, mutation, or
   caller-authored evidence path.

**Verify**: download by artifact ID, compare the REST digest, validate the
manifest and bundle schemas, and independently recompute every referenced
digest.

Expected: one terminal success bound to R. A running aggregate or an artifact
listing without downloaded byte validation is not a release point.

### Step 8: Land the npm-only hosted-proof cut through its own PR

1. Run pinned Bun 1.3.14 full verification, focused workflow/contract tests,
   action-pin checks, secret scans, formatting, and `git diff --check`.
2. Require the generated contract and workflows to agree on the exact
   three-role order and directly active canonical policy.
3. Require no external-observation/ingress/activation path, no Apple/AWS
   readiness input, no public API or package-admission drift, and no Rolldown
   publication admission.
4. Preserve the shared pinned Sigstore trusted root and real-publication
   provenance verification after deleting obsolete evidence signing.
5. Commit, push, open, review, and merge only the isolated release-readiness
   worktree. Capture the exact merge SHA and wait for exact-main CI.

**Verify**:

    test "$(bun --version)" = "1.3.14"
    bun run verify
    bun run check:contract
    bun run format:check
    git diff --check

Expected: clean reviewed branch, exact-head and exact-main hosted checks green,
and no source/provider/public-projection/npm-admission/reservation drift. The
merge SHA is a candidate for R but does not earn R until Step 9 succeeds.

### Step 9: Execute non-publishing certification and present the release point

1. Let candidate release SHA R be the exact npm-only hard-cut merge SHA. Prove
   its merge tree, wait for exact-main ordinary CI, and freeze main. Any later
   source or workflow change invalidates R and all candidate/certification work.
2. Dispatch `release.yml` in `prepare-exact-sha` mode for R. Download and
   independently validate the exact candidate artifact and manifest.
3. Dispatch the exact protected-body fake-registry certification against that
   candidate. Download and validate its authenticated artifact.
4. Dispatch `release.yml` in `certify-exact-sha` mode against the same
   candidate, approve the protected npm environment, and run GitHub claims plus
   all eleven package-specific npm OIDC dry runs. This approval authorizes no
   registry mutation.
5. Dispatch readiness with the candidate and exactly the three authenticated
   evidence coordinates. Download and independently validate the aggregate.
   Construct every dispatch reference only after its named run attempt has
   completed successfully. The repository-owned builder reads the exact run
   and artifact through the sealed read-only GitHub boundary, downloads and
   strictly parses the raw artifact ZIP, re-reads current main, and emits only
   canonical reference JSON. Supply the canonical REST artifact digest,
   including its `sha256:` prefix; never paste an upload-action bare digest.

       R=<40-lowercase-main-sha>
       CI_RUN_ID=<push-run-id>
       CI_RUN_ATTEMPT=<push-run-attempt>
       CANDIDATE_RUN_ID=<prepare-run-id>
       CANDIDATE_RUN_ATTEMPT=<prepare-run-attempt>
       CANDIDATE_ARTIFACT_ID=<candidate-artifact-id>
       CANDIDATE_ARTIFACT_DIGEST=sha256:<64-lowercase-hex>
       FAKE_RUN_ID=<fake-registry-run-id>
       FAKE_RUN_ATTEMPT=<fake-registry-run-attempt>
       FAKE_ARTIFACT_ID=<fake-registry-artifact-id>
       FAKE_ARTIFACT_DIGEST=sha256:<64-lowercase-hex>
       NPM_OIDC_RUN_ID=<npm-oidc-run-id>
       NPM_OIDC_RUN_ATTEMPT=<npm-oidc-run-attempt>
       NPM_OIDC_ARTIFACT_ID=<npm-oidc-artifact-id>
       NPM_OIDC_ARTIFACT_DIGEST=sha256:<64-lowercase-hex>
       READINESS_RUN_ID=<readiness-run-id>
       READINESS_RUN_ATTEMPT=<readiness-run-attempt>
       READINESS_ARTIFACT_ID=<readiness-artifact-id>
       READINESS_ARTIFACT_DIGEST=sha256:<64-lowercase-hex>

       ACTIONS_READ_TOKEN="$(gh auth token)" \
         node scripts/release/build-terminal-reference.mjs \
           --kind candidate --source-sha "$R" \
           --run-id "$CANDIDATE_RUN_ID" --run-attempt "$CANDIDATE_RUN_ATTEMPT" \
           --artifact-id "$CANDIDATE_ARTIFACT_ID" \
           --artifact-digest "$CANDIDATE_ARTIFACT_DIGEST" \
           > candidate-reference.json

       ACTIONS_READ_TOKEN="$(gh auth token)" \
         node scripts/release/build-terminal-reference.mjs \
           --kind exact-main-ci --source-sha "$R" \
           --run-id "$CI_RUN_ID" --run-attempt "$CI_RUN_ATTEMPT" \
           > exact-main-ci-reference.json

       ACTIONS_READ_TOKEN="$(gh auth token)" \
         node scripts/release/build-terminal-reference.mjs \
           --kind fake-registry --source-sha "$R" \
           --run-id "$FAKE_RUN_ID" --run-attempt "$FAKE_RUN_ATTEMPT" \
           --artifact-id "$FAKE_ARTIFACT_ID" \
           --artifact-digest "$FAKE_ARTIFACT_DIGEST" \
           > fake-registry-reference.json

       ACTIONS_READ_TOKEN="$(gh auth token)" \
         node scripts/release/build-terminal-reference.mjs \
           --kind npm-oidc-certification --source-sha "$R" \
           --run-id "$NPM_OIDC_RUN_ID" --run-attempt "$NPM_OIDC_RUN_ATTEMPT" \
           --artifact-id "$NPM_OIDC_ARTIFACT_ID" \
           --artifact-digest "$NPM_OIDC_ARTIFACT_DIGEST" \
           > npm-oidc-certification-reference.json

       ACTIONS_READ_TOKEN="$(gh auth token)" \
         node scripts/release/build-terminal-reference.mjs \
           --kind readiness --source-sha "$R" \
           --run-id "$READINESS_RUN_ID" --run-attempt "$READINESS_RUN_ATTEMPT" \
           --artifact-id "$READINESS_ARTIFACT_ID" \
           --artifact-digest "$READINESS_ARTIFACT_DIGEST" \
           > readiness-reference.json

   The candidate, exact-main, fake-registry, and npm OIDC files are the four
   JSON inputs to the readiness dispatch. The candidate and readiness files
   are the two retained artifact inputs to publication and final-public
   verification. Re-run the builder rather than hand-editing a reference when
   a validity window expires.
6. Re-observe remote main and anonymous npm immediately before presenting the
   packet. Confirm no 0.6.0 exists, prior-latest/placeholder ledgers are exact,
   and Rolldown remains reservation-only.
7. Present R, run/attempt/artifact IDs and digests, eleven tarball digests, the
   explicit limits of the npm dry-run, and the explicit Apple/AWS deferred
   statement. Only then is R an earned release point.

**Verify**: every item in the release-point definition is checked and final
main/npm observations are fresh.

Expected: READY FOR PUBLICATION. Nothing is yet published, tagged, or released.

### Step 10: Publish only the certified bytes after explicit authorization

Require an explicit instruction naming repository mannyc2/effect-build,
version 0.6.0, exact R, eleven npm packages, and the intended publish workflow.

1. Dispatch publish-certified-bytes with the exact candidate and readiness
   coordinates.
2. Review the pending npm environment deployment and approve it as the second
   publication act.
3. Before any npm or Sigstore request, rerun the exact forbidden-environment,
   empty-config, embedded-`publishConfig`, and pinned-source checks from Step 5.
   This real mode must reject `SIGSTORE_ID_TOKEN`; dry-run evidence cannot prove
   that publication-time provenance used GitHub's request-derived identity.
4. Keep main frozen. Watch to terminal completion.
5. Before the first missing package is published, require every already present
   0.6.0 coordinate to have candidate-exact bytes, `latest=0.6.0`, and a valid
   registry attestation whose subject digest, GitHub workflow identity
   `https://github.com/mannyc2/effect-build/.github/workflows/release.yml@refs/heads/main`, and
   source commit equal the candidate and R. Missing, foreign, or inconclusive
   provenance is not repairable by publishing a later package.
6. After each real publish, independently verify that package's bytes, tag, and
   Sigstore-backed provenance/attestation before allowing the next mutation.
7. If a command response is lost or a later package fails, stop. Re-observe
   every coordinate and rerun only when the exact-byte recovery decision says
   which packages remain missing and proves all existing-prefix provenance.
   Never manually repair tags, provenance, or repack.

**Verify**: anonymously download all eleven 0.6.0 tarballs, compare size,
SHA-256, and SHA-512 integrity to the candidate, check latest, inspect registry
attestation metadata, run signature/provenance verification from a fresh npm
cache, and recheck all Rolldown reservation invariants.

Expected: eleven converged npm coordinates or an explicitly partial state whose
published prefix has exact bytes, tags, and provenance and is therefore
eligible for same-candidate resume only while the original readiness packet is
still valid. After that packet expires, or for any other partial state, stop
and require a new-version decision. Never repack, manually repair tags, or
bypass readiness. Partial state is not release completion.

### Step 11: Create the tag and GitHub Release last

Require separate tag, draft-Release, and public-Release authorities after all
npm coordinates converge.

1. With operator Administration-read authority, re-observe repository Release
   immutability immediately before draft creation and require `enabled: true`.
   This live preflight is deliberately outside hosted readiness because the
   workflow token lacks that permission. Any false or inconclusive result is a
   STOP; do not create the draft.
2. Under tag authority, create the same lightweight-tag form used by v0.3.0.
   Re-observe exact main. An absent remote tag may be created; an existing
   lightweight tag is resumable only if it already resolves directly to R; any
   other state is a STOP:

       test "$(gh api repos/mannyc2/effect-build/git/ref/heads/main --jq .object.sha)" = "$R"
       REMOTE_TAG="$(git ls-remote --tags origin refs/tags/v0.6.0 | awk '{print $1}')"
       if [[ -z "$REMOTE_TAG" ]]; then
         ! git rev-parse --verify --quiet refs/tags/v0.6.0
         git tag v0.6.0 "$R"
         git push origin refs/tags/v0.6.0:refs/tags/v0.6.0
       else
         test "$REMOTE_TAG" = "$R"
         git fetch origin refs/tags/v0.6.0:refs/tags/v0.6.0
         test "$(git cat-file -t refs/tags/v0.6.0)" = commit
         test "$(git rev-parse refs/tags/v0.6.0)" = "$R"
       fi
       test "$(git ls-remote --tags origin refs/tags/v0.6.0 | awk '{print $1}')" = "$R"

   Never force or move a tag. Any existing mismatched tag is a STOP.
3. Build an explicit `ASSET_PATHS` array from the already downloaded and
   revalidated candidate manifest: exactly eleven `.tgz` paths in canonical
   package order plus its manifest path. Reject duplicates, symlinks, extra
   files, or any changed digest; do not glob and do not invoke a pack command.
4. Under draft-Release authority, create only a draft and require the existing
   tag so the CLI cannot synthesize one. If no Release exists, run:

       gh release create v0.6.0 "${ASSET_PATHS[@]}" \
         -R mannyc2/effect-build \
         --draft \
         --verify-tag \
         --title 'effect-build v0.6.0' \
         --notes-file "$RELEASE_NOTES"

   If a response is lost or a draft already exists, re-observe it. Resume only
   when it is still draft, non-prerelease, names exact tag v0.6.0, the
   independently authenticated lightweight tag still resolves directly to R,
   and every existing asset is candidate-exact; an unexpected public or
   mismatched Release is a STOP. GitHub CLI's `--target` controls automatic tag
   creation and has no binding role because `--verify-tag` requires this tag to
   preexist. REST `target_commitish` is default-branch presentation metadata,
   not the resolved tag target; record its exact canonical value but never use
   it instead of the authenticated tag ref.

5. While still draft, authenticate its tag and release metadata, require
   exactly twelve assets, compare every API digest/size to the candidate, and
   download every asset into a fresh directory for byte comparison. A mismatch
   is repaired only by deleting the draft under separate destructive authority
   and restarting; never patch an ambiguous draft in place.
6. Repeat the operator-admin immutability preflight immediately before public
   publication and again require `enabled: true`. Under public-Release
   authority, publish only that exact verified draft:

       gh release edit v0.6.0 -R mannyc2/effect-build --draft=false

   Re-download release metadata and require `immutable: true`; do not upload or
   edit any asset afterward.
7. Run the pre-merged read-only final-smoke workflow against R. From fresh npm
   and Bun caches, cover every public package and representative composed
   pipelines, verify npm signatures/provenance, and compare registry downloads
   plus all twelve Release assets to the candidate.
8. Produce one canonical final public-release receipt as a retained Actions
   artifact, download it, and copy it to the predeclared operator-controlled
   evidence archive with its digest. Do not advance main merely to write the
   receipt.

**Verify**: tag target equals R; Release asset digests equal the candidate;
npm downloads equal those same bytes; public consumers pass; main and the
worktree remain clean.

### Step 12: Close the program without erasing evidence

1. Keep the completed receipt in the final artifact and predeclared evidence
   archive; do not edit main after R merely to fill the template below. After
   the public receipt is terminal and the release freeze ends, a separate
   post-release docs PR may update this plan and plans/README.md only under
   explicit commit/push/PR/merge authority. It does not change R or v0.6.0.
2. Close superseded PR 22 with a factual link to merged PR 24 and v0.6.0 only
   under separate PR-mutation authority naming PR 22. Do not merge it or delete
   its branch.
3. Retain candidate, readiness, and final receipts at their exact named
   artifact/archive locations for the documented period and record expiry.
   Preserve historical/local Apple evidence separately as source-qualification
   history; it is not a v0.6.0 release receipt.
4. Separately propose main protection against force-push/deletion and required
   PR/CI gates. Repository-settings changes require their own approval.
5. Do not delete evidence branches, workflows, environments, runners, or
   credentials as part of release completion. Retirement is a separate
   dependency and authority audit.

## Test plan

- Extend test/architecture/release-workflow.test.ts with topology, permission,
  candidate/readiness admission, exact-script fake-registry, npm 11.11 source
  ordering, exact embedded-`publishConfig` admission, all-eleven dry-run
  exchange, `NPM_ID_TOKEN`/`NPM_TOKEN`/`NODE_AUTH_TOKEN`/`SIGSTORE_ID_TOKEN`
  rejection in both protected modes, pinned Sigstore provider ordering,
  provenance-before-next-mutation, bare-action-to-canonical-REST artifact digest
  normalization, no-secret, and no-repack assertions.
- Add stateful fake npm/curl fixtures under test/fixtures/release. Every
  failure case asserts registry state and exact mutation count.
- Add hostile sealed-network tests for exact GitHub/npm/OIDC origins, paths,
  queries, bundled roots, response bounds, partial/compressed bodies, userinfo,
  ports, redirects, authorization stripping, ambient proxy/CA/config, and
  generated inline-projection drift. Reject every real raw-curl read in release
  workflows; retain `curl` only as the exact fake-boundary executable.
- Test the single strict npm tar reader and its protected byte projection with
  a real npm-packed positive fixture plus gzip bombs, concatenated/trailing
  streams, truncated/invalid headers and trailers, PAX/GNU/base-256 records,
  links/devices, duplicate/traversal/type-confused names, invalid checksums,
  nonzero padding, missing/duplicate/oversized manifests, excessive entries,
  and compressed, expanded, per-entry, and aggregate bound failures. Assert
  that no protected release body invokes `tar` or extracts a candidate tree.
- Test the frozen dependency bootstrap against missing/noncanonical integrity,
  VCS/file/hostile registry locators, workspace escapes, config-digest drift,
  ambient auth/proxy/extra-CA/`NODE_OPTIONS`, wrong Bun, lifecycle scripts, and
  source-authority mutation. Require every checkout-capable release workflow to
  use that one helper and the protected publisher to use none.
- Retain test/architecture/apple-certification-workflow.test.ts as
  source/library and deferred-design qualification. Its historical 28-coordinate
  coverage must not be consumed by v0.6.0 readiness. Add current-scope tests
  proving Apple and operational-journal references are rejected and no App,
  DMG, PKG, or Apple aggregate can enter v0.6.0 outputs.
- Extend test/architecture/ci-workflow.test.ts so ordinary credential-free CI
  cannot be mislabeled as distribution certification.
- Retain local fake Apple tests for reference persistence, fresh-runner resume,
  redaction, architecture correlation, external journal ACK/re-read and crash
  points, locally-valid rejection, unknown outcome with no resubmit, clean-host
  pre/post state, and aggregate completeness. These do not substitute for
  hosted Apple evidence and are not a v0.6.0 gate.
- Test the readiness aggregate with missing, duplicate, wrong-run, wrong-SHA,
  rerun, expired-artifact, changed-main, changed-registry, and changed-byte
  fixtures. Add hostile ZIP fixtures for duplicate/local-central name mismatch,
  traversal, invalid UTF-8, symlink/device attributes, encryption, unsupported
  methods/flags, Zip64, multidisk, prepended/trailing data, CRC mismatch,
  truncated descriptor, oversized members/aggregate, and high compression ratio;
  retain one real GitHub-style data-descriptor/store fixture as the positive
  boundary.
- Test the retained Sigstore provenance verifier against exact npm payload and
  certificate/OID bindings, malformed and noncanonical encodings, trust
  thresholds, and the real verification API boundary. No external receipt
  signer remains in the v0.6.0 gate.
- Test that npm OIDC dry-run receipts cannot claim upload, provenance,
  publication, exclusive publisher inventory, token absence, package policy,
  or account 2FA state. The registry snapshot must remain unchanged.
- Test retained Sigstore TUF provenance against seed/root signature rotation,
  timestamp/snapshot/targets signatures and hash/length/version links, active
  rotated-root/timestamp/snapshot/targets acquisition-time expiry, exact target
  bytes, and same-record client locator plus SHA-512 lock integrity. Relocated
  or swapped integrity text must fail; historical seed-root expiry alone must
  not invalidate an otherwise authenticated rotation.
- Test final-public validation and its workflow for exact readiness, npm, tag,
  Release, asset, provenance, and clean-consumer byte bindings while retaining
  read-only permissions and mandatory `immutable: true` final metadata.
- Run full verify after focused tests. No test may require live credentials.

## Done criteria

All boxes are conjunctive:

- [x] PR 24 is merged under exact-head guard and its merge tree plus exact-main
  CI are verified: merge dd39bd6104645d79fa52f40d0bbf291b5bf8f3dc,
  tree 29cdac9bf9621aa3df12757e2720c093b17d742e, push run 33309530017,
  33/33 jobs successful.
- [ ] Release-readiness infrastructure is separately reviewed, merged, and
  exact-main green at R.
- [ ] Candidate artifact contains exactly eleven certified 0.6.0 tarballs plus
  manifest; no Rolldown tarball.
- [ ] The canonical exact publisher shell passes every named stateful
  fake-registry case in the hosted certification workflow and emits the
  authenticated artifact at R.
- [ ] The one protected GitHub claims receipt and one npm OIDC exchange receipt
  containing eleven ordered entries are valid, contain no token, and bind an
  unchanged registry snapshot.
- [ ] All eleven package repository URLs and exact two-key `publishConfig`
  values are validated; the npm dry-run's narrow exchange/no-mutation claim and
  excluded administrative inventories are explicit.
- [x] The v0.6.0 scope includes all eleven npm packages, including the
  `effect-build-apple` API/library, and explicitly marks credential-backed
  signed/notarized Apple artifacts and AWS journal evidence deferred, not
  passed, excluded from readiness, and targeted to a later separately
  qualified release.
- [ ] Downloaded readiness aggregate authenticates the candidate plus exactly
  three ordered hosted evidence roles at R; it rejects external ingress, Apple
  certification, and operational-journal references.
- [ ] Anonymous registry and current-main observations are fresh and exact.
- [ ] Separate publication authorization is recorded before npm mutation.
- [ ] All eleven npm coordinates converge to candidate-exact bytes.
- [ ] Separate tag/GitHub Release authorization is recorded.
- [ ] Separate draft-Release and public-Release authorizations are recorded.
- [ ] GitHub Release immutability is observed enabled immediately before draft
  creation and public publication; final metadata reports `immutable: true`.
- [ ] v0.6.0 tag, Release, assets, provenance, and fresh consumers are verified.
- [ ] Rolldown reservation remains unchanged.
- [ ] Final worktree is literally clean and all receipts are retained.

## STOP conditions

Stop and report; do not improvise if:

- remote main, the PR head, workflow blob, any existing contract authority,
  public projection, version, package list, prior-latest ledger, repository OIDC
  subject policy, or candidate bytes drift outside the reviewed generated
  allowlist (`releaseCertification`, the three named private Apple rows, and
  their model/policy provenance digests);
- any source or workflow changes after R is selected and before the final
  public receipt is terminal;
- ordinary CI or an applicable host/capability receipt is skipped or fails;
- an admitted hosted GitHub/npm observation is inconclusive;
- any v0.6.0 candidate, readiness input, or GitHub Release asset claims or
  contains a signed/notarized App, DMG, PKG, Apple certification receipt, or
  AWS operational-journal evidence;
- Apple credential or AWS journal setup is made a prerequisite for v0.6.0
  instead of remaining deferred to a later separately qualified release;
- any secret or OIDC token appears in logs, artifacts, commands, or committed
  files;
- before protected certification or publication, a repository/environment
  `NPM_ID_TOKEN`, `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or `SIGSTORE_ID_TOKEN` secret
  remains, a protected process receives one of those variables, or a tarball
  contains non-canonical `publishConfig`;
- fake-registry certification does not run the exact protected
  reauthorization and publisher bodies or does not emit the authenticated
  candidate-bound artifact;
- a conflict, newer npm version, prior-latest drift, wrong tag, wrong bytes,
  missing/foreign provenance, reservation drift, or unresolved unknown
  commitment exists;
- main advances after the release point and before the final public receipt;
- publication would require self-hosted npm OIDC, a manually provisioned or
  fallback token, login, stage, dist-tag repair, manual publish, repack, or
  unpublish;
- GitHub tag/Release would be created before all npm subjects converge;
- either pre-draft or pre-publication immutability preflight is not exactly
  enabled, or final Release metadata is not `immutable: true`;
- any requested action lacks exact same-session authority.

## Maintenance notes

- The certified dry-run proves the package-specific npm OIDC exchange at that
  instant. It does not prove upload, provenance, or publication; keep those at
  the separately authorized real-publish boundary.
- Re-run fake-registry cases whenever the inline publisher changes.
- Same-candidate partial-prefix recovery is deliberately bounded by the
  original readiness validity. Expiry is a STOP requiring a new-version
  decision, not authority to mint post-publication readiness or repair state
  manually.
- Re-generate Apple coverage whenever the producer capability register changes,
  but do not admit it to v0.6.0 readiness.
- Requalify the journal owner whenever its released version or exact source
  commit changes before a future signed/notarized Apple-artifact release; the
  journal is outside v0.6.0.
- A new target version, package, tag policy, staged-publishing policy, workflow
  filename, environment, npm/Node client, or candidate schema invalidates the
  readiness protocol and requires a reviewed contract change.
- Keep GitHub Release last. That ordering makes a partial npm publication
  recoverable without falsely advertising a complete public release.

## Receipt

No v0.6.0 release-point or public-release receipt existed when this plan
revision was written.

- PR 24 merged at 2026-08-30T11:40:40Z as
  dd39bd6104645d79fa52f40d0bbf291b5bf8f3dc with parents
  4ad34423d84d17c959ace0d55af8623f336a68be and
  e4511f12f2afdab0090de73fd6bf4d1f226b4d88; its tree matched the PR head and
  exact-main push run 33309530017 passed 33/33 jobs.
- PRs 25-30 merged release infrastructure through
  8a6022095807bf19a2953025e94e48fd0072f31e; exact-main run 33546598147 passed
  33/33. The npm-only three-proof cut requires its own review, merge, and
  exact-main receipt before that merge SHA can become R.
- Credential-backed Apple artifact certification: DEFERRED / NOT RUN / NOT
  PASSED. No Apple or AWS evidence is admitted by v0.6.0 readiness.
- npm administrative inventory: NOT OBSERVED / EXCLUDED FROM v0.6.0. A
  temporary interactive `mannyc1` web login used for feasibility was revoked;
  it is not release evidence.
- GitHub Release immutability: last observed enabled and not owner-enforced;
  mandatory operator-admin re-observations remain immediately before draft
  creation and publication.
- Candidate, three hosted evidence roles, readiness aggregate, npm convergence,
  tag, GitHub Release, and final-public receipt: PENDING.
