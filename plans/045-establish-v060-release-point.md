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
> reconciled. After Step 8, the exact reviewed contract delta is expected:
> `releaseCertification` is added; the private implementation register adds
> only the Notary submission, journal-codec, and rejection-fixture rows; and
> provenance changes only for the regenerated model/policy source digests. Any
> public/provider/capability/admission/reservation change or other drift stops.

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
- **Status**: LOCAL EFFECT-BUILD IMPLEMENTATION VERIFIED; external execution
  remains blocked at Step 2 feasibility. Guarded merge, exact-main ordinary CI,
  isolated worktree creation, the Apple probe-admission repair, the read-only
  authority auditor, contract, credential-free workflows, exact-shell fake
  boundaries, Apple-owned codec/receipt/submission boundary, aggregate
  validators, and local verification are complete as uncommitted working-tree
  changes. The exact 40-coordinate protected-body matrix passed, and the final
  pinned Bun 1.3.14 full gate passed. No npm identity, Apple credential,
  operational journal backend, external producer identity, hosted receipt, or
  repository setting was inferred or supplied. Protected dispatch, Apple
  submission, journal use, credentialed certification, and every remote
  mutation remain stopped until their recorded blockers and separate
  authorities are resolved
- **Publication authority**: NONE

## Why this matters

The v0.6.0 source hard cut is merged and exact-main ordinary CI is green, but
the repository cannot yet produce the pre-publication evidence packet described
by PR 24. Main now has the replacement eleven-package release workflow and no
temporary token bootstrap workflow. The replacement remains main-only and
publish-only: do-not-publish skips every job, while the only OIDC-enabled job
can execute npm publish. It is not a certification path and remains an explicit
DO-NOT-DISPATCH path until this plan earns a release point and a separate npm
publication decision. The local fake-registry qualification path has not been
hosted; it is not readiness-admissible. The distinct exact protected-body
certification path remains blocked and forbidden until external evidence
authentication is qualified. Current Apple CI explicitly excludes Developer ID
signing, notarization, stapling, Gatekeeper, and clean-host distribution.

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

1. R is the current remote main SHA and its tree is the reviewed inert
   release-readiness implementation, the separately reviewed Apple hosted
   producer/clean-host integration landed inert after its external interfaces
   are frozen, and one separately reviewed generated activation change. That
   activation must replace external-evidence authentication and exact-body
   certification from `blocked` to their closed supported states, replace
   Apple hosted execution from STOP-only to the supported required-artifact
   state, pin every exact producer/journal/runner/credential identity and source
   binding, and make final-public verification reachable under the same
   contract. There is no runtime flag, dispatch input, test override, or
   caller-authored fallback that can activate these paths.
2. Exact-main ordinary CI is terminal and successful for every applicable job.
   PR-head runs remain historical evidence and do not substitute for R.
3. One retained, downloaded candidate artifact contains exactly the eleven
   contract-admitted v0.6.0 tarballs plus one manifest. The manifest binds R,
   Bun 1.3.14, every name, byte size, SHA-256, SHA-512 integrity, and the exact
   42-module public projection. Each embedded package manifest has exactly
   `publishConfig: { access: "public", provenance: true }`, with no other
   publish configuration or registry-scoped authentication. It contains no
   Rolldown tarball.
4. After the contract-pinned external-evidence authentication policy is
   qualified with exact producer identities and provisioned signers and the
   generated supported activation is merged at R, but before the readiness
   aggregate is built, a test executes the exact protected
   publisher shell against a stateful fake registry and passes every success,
   conflict, partial, unknown-outcome, tag, reservation, and post-download case
   listed in Step 4. The resulting exact protected-body certification is one
   input to readiness; it never consumes the final aggregate that it helps
   establish. While external authentication is blocked, the real protected
   purpose proves only that its gate stops after exact read-only GitHub
   reauthorization but before candidate adoption, npm/registry work, or the
   first mutation. The sealed local qualification harness does
   execute the extracted protected bodies for all forty coordinates against
   credential-free fake GitHub/npm boundaries and cross-checks an independent
   state-machine oracle, but its protocol is non-admissible, has no hosted
   artifact, and is not exact protected-body certification. It cannot satisfy
   this item until the supported contract reruns the same forty coordinates in
   the exact certification workflow and emits the authenticated terminal
   artifact.
5. A protected non-publishing GitHub job obtains an OIDC token for the npm
   audience, validates its signature and exact claims without logging or
   retaining the token, rejects `NPM_ID_TOKEN`, `NPM_TOKEN`,
   `NODE_AUTH_TOKEN`, and `SIGSTORE_ID_TOKEN`, validates its subject against the
   re-observed repository OIDC subject policy, and emits only a redacted claims
   receipt.
   Pinned npm 11.11.0 then performs its package-specific OIDC exchange under
   `npm publish --dry-run` for each of the eleven exact tarballs. Private logs
   contain exactly one audited success marker per invocation, and immediate
   registry re-observation proves zero version, tag, or byte mutation. This is
   npm exchange acceptance at that instant, not tarball upload, provenance, or
   publication certification.
6. The npm environment and each of the eleven package settings are
   authenticated and observed with repository mannyc2/effect-build, workflow
   release.yml, environment npm, and publish permission. Every admitted
   package manifest has the exact repository URL. Authenticated repository and
   npm-environment secret-name inventories contain no `NPM_ID_TOKEN`,
   `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or `SIGSTORE_ID_TOKEN`; the observed legacy
   repository `NPM_TOKEN` has been deleted under separate secret-mutation
   authority rather than assumed unusable. The receipt explicitly says saving
   the publisher setting was not validation and links each observation to its
   successful non-publishing package exchange from item 5.
7. Credential-backed Apple evidence covers both arm64 and x64, every one of
   the thirteen public Apple capabilities, accepted and rejected notarization,
   fresh-runner continuation from an externally persisted submission
   reference, stapling, Gatekeeper, quarantine, and clean-host use of App, DMG,
   and PKG products. ZIP remains private Notary transport for an App and is
   never claimed as a public product. Secrets and private key coordinates are
   absent from receipts.
8. The downstream release owner has been qualified to persist and resume the
   exact Notary submission fields required by
   packages/effect-build-apple/README.md. A public npm version, an unreleased
   checkout, or a package name alone is not qualification.
9. One downloaded release-readiness aggregate authenticates the candidate
   separately and exactly seven ordered evidence roles: exact-main CI,
   exact protected-body fake-registry certification, npm authority,
   npm OIDC certification, Apple certification, operational journal, and
   GitHub Release governance. The npm OIDC artifact contains its two retained
   receipt files; Apple certification contains its clean-host evidence.
10. Anonymous npm observation still matches the contract's prior-latest and
    placeholder ledgers, all twelve names still lack 0.6.0, Rolldown remains
    reservation-only, and main has not advanced.

At this point nothing has been published to npm, tagged, or released on GitHub.
Apple notarization submissions do exist because they were separately
authorized certification mutations. The executor must present the
release-point packet and the exact proposed npm mutation command for a separate
publication decision.

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
- The isolated release-readiness worktree is
  /Users/cjpher/.codex/worktrees/v060-release-readiness/does-effect on branch
  codex/v060-release-readiness at the merge SHA. It now contains an uncommitted
  local release-certification contract hard cut; the three-mode Release
  workflow; separate fake-boundary, external-evidence ingress, Apple,
  readiness, and final-public workflows; the Apple probe/journal codec and
  exact 28-coordinate protocol;
  the read-only release-authority auditor; a contract-pinned Sigstore/DSSE
  verifier; and credential-free protocol, hostile-boundary, and workflow
  tests. The exact 40-coordinate matrix and final pinned Bun 1.3.14 local gate
  pass, including 254/254 architecture tests. None of this work is committed,
  pushed, opened as a PR, hosted-CI observed, protected-job executed,
  credential-certified, or release-point evidence. The generated external
  producer identity list remains empty, the
  current fake qualification protocol/path is explicitly
  local-qualification-only (no hosted artifact exists), and the
  exact fake-registry, readiness, Apple hosted, publication, and final-public
  artifact paths remain mechanically stopped.
- On current main, .github/workflows/release.yml blob
  4666c3b121c0477a6fcaac8223aa795fb21a033a gates every job on
  publish-exact-sha at lines 27, 90, and 146. Lines 99-121 require source_sha to
  equal current main. Lines 146-155 make publish the only npm-environment and
  id-token job. Lines 679-703 contain the one real publish loop and
  post-download proof.
- The exact current-main workflow tree contains only ci.yml and the
  eleven-package replacement release.yml; the temporary npm-bootstrap and
  research-export files are deleted at that SHA. GitHub's workflow inventory
  still returns two historical research-export records whose files are absent
  from current main. The current Release workflow remains a DO-NOT-DISPATCH
  path until a release point and separate publication decision exist.
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
  feasibility. The repository still has no self-hosted runners, main
  protection/ruleset, or required status checks.
- The 2026-08-31 repository Actions secret-name inventory contains one secret,
  `NPM_TOKEN`, updated 2026-08-28. No value was accessed. Remote main's
  deleted historical bootstrap workflow referenced it as `NODE_AUTH_TOKEN`;
  no file at current main references it, but PR 24 could not delete the
  persisted secret. Treat the secret as usable until separately authorized
  deletion and re-observed absence; never infer revocation or expiry from its
  name or age.
- Repository release immutability is now enabled and not owner-enforced. The
  ordinary workflow `GITHUB_TOKEN` returned HTTP 403 when reading
  `repos/mannyc2/effect-build/immutable-releases`; the endpoint requires
  repository Administration-read authority, which is not a workflow-token
  permission. Therefore governance evidence remains stopped until an explicit
  sealed, ephemeral Administration-read observation interface is qualified.
- This session's authenticated npm feasibility check is unresolved:
  `npm trust list effect-build --json` returned E401. Treat every package's
  publisher setting as unobserved until an operator establishes a supported
  interactive npm/2FA session; never infer the other ten from one package.
- Keep two npm clients distinct. Node 24.14.1/npm 11.11.0 remains the separately
  audited publication/OIDC-certification client. Current npm trusted-publisher
  documentation requires npm 11.15.0 or later, so authority observation is
  pinned separately to npm 11.19.1, integrity
  `sha512-ztsxKxt/kkIaAs+2i0GU6I+DRmUdrNasxTZKJe9TCdSjKxlhah/4r/hl5ygMD6XAg1qZ9c2TNomR4qgOydp10g==`.
  Its manifest, exact `bin/npm-cli.js` entry, command sources, and canonical
  1,943-file installed package-tree closure are contract-pinned. Every authority
  call launches that authenticated realpath through the pinned Node runtime;
  PATH `npm` is forbidden. This does not alter or requalify publication.
- Anonymous registry re-observation on 2026-08-31 found no 0.6.0 on any of the
  twelve names. The five established packages retain `latest=0.3.0`; all seven
  handoff placeholders are singleton `0.0.0-reserved.0` packages with exact
  contract bytes and `reserved` plus temporary `latest` tags; Rolldown remains
  reservation-only.
- The repository OIDC subject endpoint returned `use_default: true`,
  `use_immutable_subject: false`, and subject prefix
  `repo:mannyc2@126291407/effect-build@1331906770`. Re-observe this policy at R
  and validate the token's exact environment-qualified subject. Under the
  observed opt-out, GitHub's documented token format remains the name-based
  `repo:mannyc2/effect-build:environment:npm`; the returned immutable prefix is
  not the active `sub`. A separately authorized opt-in would change the
  expected subject and requires re-auditing npm trusted-publisher acceptance.
- Standard GitHub-hosted macOS labels provide arm64 macos-15 and Intel
  macos-15-intel runners. Use fresh hosted runners for clean-host evidence
  unless credential feasibility proves that a separately approved,
  pre-provisioned runner is required.
- The published downstream package re-observed on 2026-08-31 is
  @mannyc1/ts-release 0.2.2. Do not infer that it supports the v0.6 Apple
  journal. Qualify an exact released version or exact reviewed source commit.
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

## Step 2 feasibility audit result: EXTERNAL-EXECUTION STOP

The initial 2026-08-30 and current 2026-08-31 read-only observations produced
supported public baselines but did not resolve the four feasibility questions.
Protected or credentialed execution remains stopped here. Under the separately
granted local effect-build implementation authority, Steps 3-7 built and
fake-tested the repository-owned contract, workflows, exact shell bodies,
Apple codecs/receipts/submission boundary, and aggregate validators while
modeling each external dependency as unavailable. They did not add an
operational journal backend, credential fallback, placeholder success, or a
dispatch path that bypasses this STOP. Local success does not resolve a
feasibility question or earn release point R.

1. **npm trust and legacy identity**: all eleven public names plus the
   reservation-only Rolldown name still lack 0.6.0,
   their versions/tags match the contract, and all seven placeholder tarballs
   match the frozen byte ledger. All eleven local package manifests have the
   exact repository URL. The npm environment remains reviewer-protected and
   main-only, and the repository OIDC policy remains default/non-immutable.
   However, `npm whoami` returned E401, so none of the eleven current trusted
   publisher records is authenticatedly observed. The supported authority
   receipt must authenticate exact account `mannyc1`, prove its npm access-token
   inventory is exactly empty at `https://registry.npmjs.org`, prove `mannyc1`
   is the sole maintainer of all eleven public packages and reservation-only
   Rolldown, and separately prove all twelve packages have publishing access
   `Require two-factor authentication and disallow tokens`. Unknown/additional
   maintainers, an unknown token shape, a peer account's empty inventory, or a
   missing package policy is a STOP. Deleting the GitHub `NPM_TOKEN` secret is
   not npm-side revocation evidence and cannot satisfy this receipt.
2. **Apple execution backend**: the available keychain contains no Developer
   ID Application or Developer ID Installer identity; only an Apple Development
   identity of the wrong class is usable. The apple-certification environment,
   its credentials, rejection fixtures, and clean-host execution evidence do
   not exist. Bun 1.3.14 is now the canonical App/DMG/PKG lineage and Deno
   2.9.5 remains signed-App-only; this resolves the product choice but supplies
   no credential or host evidence. A keychain-profile Notary layer with one
   isolated ephemeral keychain is design-feasible but not
   credential-qualified.
3. **Apple tool execution defect**: Plan 046 now contains the local repair.
   One closed table owns canonical argv and exact admitted status for all
   eleven tools; callers cannot pass a second probe policy; unexpected statuses
   remain typed failures; and nonsecret observation evidence binds argv and
   status without output text. Local fake tests passed 30/30 and the complete
   real-native lane passed 4/4, including construction of every release layer.
   Exact hosted arm64/x64 CI for the uncommitted repair remains unexecuted, so
   this is a locally verified fix rather than release or Apple certification.
4. **Operational journal**: released
   `@mannyc1/ts-release@0.2.2` at provenance commit
   528bdf9969985e2cb8238192d30c4a2f680ce8c3 and current public ts-release main
   1e9efd717ff9d5dc2dbe5e079894cd8e92eb7ed3 contain no Notary journal.
   Current effect-build PR 22 is open, non-draft, conflicting at
   bda39cfd84bd15c0ab64be46b74381fc02dcf5a8; provisional commit
   c2ac4ee4e7f02d74a7a1ff435bdfeaca6890b720 in its broad history adds only a
   local SQLite journal. Plan 047 now selects a provider-neutral canonical-byte
   S3 journal to be implemented from exact ts-release main, with one dedicated
   Object-Lock/versioned namespace, GitHub OIDC plus prefix-scoped IAM,
   acknowledged pre-dispatch intent, conditional event/head writes,
   transaction/version/checksum ACK, bounded re-read, and fresh-process replay.
   It deliberately gives the journal job no GitHub contents authority and
   leaves every Apple field codec, correlation, and `SubmissionReference`
   derivation in effect-build-apple to avoid a release cycle. The Apple-owned
   codec and submission engine are implemented and locally verified in this
   worktree. The downstream ts-release journal backend, dedicated AWS
   authority, released owner version, and cross-process operational
   qualification do not exist yet.
   Any supported reusable journal identity must use an immutable
   `operational-journal.yml@<40-hex-commit>` workflow ref, because AWS IAM can
   condition on `job_workflow_ref` but not `job_workflow_sha`; keep the separate
   exact source-SHA equality as well. The journal job's own runtime is exact
   Node 22.22.2, not the effect-build npm-certification Node 24.14.1 pin.
5. **GitHub Release governance**: immutability is enabled and not owner-enforced,
   but its Administration-read observation interface remains unprovisioned and
   the ordinary workflow token is insufficient. Main remains unprotected with
   no rulesets. Any future settings change remains a separate exact-target act.

The final exact local Bun 1.3.14 gate passed contract 13/13, 16/16 type-test
files, 160/160 unit tests, 46/46 Apple package tests, the built consumer,
254/254 architecture tests, lint, and formatting. The exact protected-body
subset separately passed all 40 contract coordinates, and the native Apple
acceptance subset passed 4/4 on the local exact tools. That local evidence does
not waive any feasibility STOP, authenticate an external producer, or certify
Apple distribution.

## Authoritative constraints

- tooling/effect-build-contract.json remains the implementation, public
  projection, npm admission, reservation, and ownership authority.
- effect-build owns Apple operations and immutable artifact production.
  The downstream release owner owns the durable journal, continuation, and
  product publication.
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
- The generated contract owns the complete external signer authority: exact
  Node runtime; package/version/integrity and audited executed-source closure;
  GitHub OIDC audience, host/path/query, request-token and request-URL bounds;
  exact Fulcio/Rekor origins, paths, methods, success statuses (200/201), response bounds, JSON depth, TLS
  roots/minimum, and zero redirects/retries. The signer imports only the pinned
  `@sigstore/sign` internal DSSE primitive and uses repository-owned raw HTTPS
  Fulcio/Rekor clients. It rejects duplicate response headers, partial or
  length-ambiguous bodies, compression, redirects, duplicate JSON keys at every
  nesting level, endpoint-origin escape, and ambient Node/Actions/proxy/CA
  authority without retaining token-bearing errors.
- Each same-repository external producer is an `observe` -> `sign` -> `upload`
  hard cut. While external evidence is blocked, workflow-level and all three
  job permissions are empty, `observe` and `sign` are one-step inline STOPs
  with no third-party actions, and `upload` has no OIDC authority and can
  transport only bounded canonical signed-byte outputs under a fixed
  role/source-derived artifact name. A supported activation must first qualify
  exact Node 24.14.1 plus audited repository source closures for both the
  credentialed observer and isolated signer, with no third-party action in
  either authority TCB; then grant only `contents: read` to `observe` and only
  `id-token: write` to `sign`, atomically with all contract-pinned producer
  identities. No test, dispatch input, runtime flag, permission-only edit, or
  identity-only edit may activate an intermediate state.
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
| npm authority observation | node scripts/release/audit-release-authority.mjs --collect --source-sha R | repository collector immediately reauthenticates the entire pinned realpath npm 11.19.1 source closure before every authority call; no direct npm-cli invocation; local feasibility only until the isolated observer is qualified |

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

- .github/workflows/release.yml
- .github/workflows/release-certification.yml
- .github/workflows/release-evidence-ingress.yml
- .github/workflows/npm-authority.yml
- .github/workflows/github-release-governance.yml
- .github/workflows/release-readiness.yml
- .github/workflows/release-verification.yml
- .github/workflows/apple-certification.yml
- package.json and bun.lock, limited to the exact offline Sigstore verifier,
  pinned internal-DSSE signer, npm 11.19.1 authority-observation client, and
  exact TUF acquisition-provenance replay clients
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
- test/architecture/external-evidence-producer.test.ts
- test/architecture/external-evidence-producer-workflows.test.ts
- test/architecture/sigstore-tuf-provenance.test.ts
- test/architecture/tar-protocol.test.ts
- test/architecture/zip-protocol.test.ts
- test/architecture/ci-workflow.test.ts
- test/architecture/apple-certification-protocol.test.ts
- test/architecture/apple-certification-workflow.test.ts
- test/architecture/release-authority-audit.test.ts
- test/architecture/release-evidence-ingress.test.ts
- test/architecture/release-evidence-ingress-collector.test.ts
- test/architecture/github-read-only-boundary.test.ts
- test/architecture/npm-read-only-boundary.test.ts
- test/architecture/frozen-release-dependency-bootstrap.test.ts
- test/architecture/credential-free-consumer.test.ts
- test/architecture/terminal-observation.test.ts
- test/architecture/assert-current-main.test.ts
- test/architecture/post-upload-artifact-observation.test.ts
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
- plans/045-establish-v060-release-point.md
- plans/README.md
- plans/046-repair-apple-native-probe-admission.md
- plans/047-establish-canonical-operation-journal.md

**Evidence-only inputs; do not change unless a failure proves a production
defect and a new plan is approved**:

- tooling/public-api.json
- packages/*/package.json
- CHANGELOG.md

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
- Land the inert implementation and the later generated supported activation
  as separate reviewed changes. The inert merge is not R; the activation merge
  is eligible to become R only after exact-main CI and every Definition gate.
- Treat commit, push, PR creation, and merge as four separate acts. Do not
  perform any one of them, change repository settings, dispatch a credentialed
  workflow, or publish unless the operator has authorized that exact act.

## Dependency graph

    guarded PR 24 merge
              |
        exact-main CI/tree
              |
       release-readiness PR
                 |
       inert exact-main CI
        /        |         \
    npm trust  producer IDs  Apple/journal
        \        |         /
        supported activation PR
                 |
         exact-main SHA R freeze
        /        |         \
    fake npm  OIDC/settings  Apple evidence
        \        |         /
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

### Step 2: Resolve the four feasibility questions before protected execution

Repository-owned fail-closed implementation may proceed while these questions
remain blocked, but no protected/credentialed dispatch, external-evidence
activation, or readiness artifact may. Record answers with evidence and no
secret values.

1. **npm trust inventory**: authenticatedly inspect the Trusted Publisher and
   Publishing access settings for each of the eleven admitted packages. Record
   package, repository, workflow filename, environment, permission, observation
   time, and observer. Have the audited repository collector execute the pinned
   npm 11.19.1 `trust list --json` authority operation for the relationship fields;
   if allowed action is not projected there, observe it through npm's
   authenticated package settings/raw trust response rather than inventing a
   field. Separately record the exact GitHub npm-environment reviewer and
   main-only deployment policy. Confirm every package.json repository URL
   matches mannyc2/effect-build. Do not claim that a saved setting proves npm
   will accept the first publish. If any record is absent or differs, prepare
   the exact per-package replacement table and obtain separate npm
   package-settings authority before changing it; then re-observe all eleven.
   Never pass login material through a workflow or receipt. In the same gate,
   an authorized administrative observer must authenticate repository- and
   npm-environment-level Actions secret and variable *name* inventories
   without reading values. GitHub's workflow `GITHUB_TOKEN` exposes no
   Secrets/Variables permission and cannot perform those inventory calls; the
   protected workflow must not add a PAT, GitHub App token, or other hidden
   credential to pretend otherwise. Bind the administrative observation to a
   freshness-limited, contract-pinned authenticated external receipt before
   readiness can consume it. The currently observed
   repository `NPM_TOKEN` is a fail-closed legacy-auth blocker: prepare its
   exact GitHub-secret deletion and npm-token revocation procedure, obtain
   separate authority for each mutation that is actually required, then prove
   the repository and npm environment contain none of `NPM_ID_TOKEN`,
   `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or `SIGSTORE_ID_TOKEN`. A deleted GitHub
   secret is not proof that an npm token was revoked, and an npm revocation is
   not proof that the GitHub secret was deleted.
2. **Apple execution backend**: confirm Developer ID Application and Installer
   identities are available and prove their exact public class, common Team ID,
   SHA-1 fingerprint, validity interval at signing time, and private-key
   availability. Select one Notary credential-layer type and specify an
   ephemeral-keychain import/unlock/partition-list/cleanup lifecycle without
   exposing secret bytes. Record Bun or Deno as the one canonical executable
   whose paired Apps continue through DMG and PKG distribution; this is an
   explicit product choice, not a harness default. Freeze isolated, locally
   valid artifact defects for both architectures that Apple is expected to
   reject, their expected terminal status/log shape, and submission cost;
   inability to define safe rejection fixtures is a pre-submit STOP. Prefer
   GitHub-hosted macos-15
   arm64 and macos-15-intel x64 distribution jobs. Separately prove that fresh
   credential-free hosts can execute the exact App/DMG/PKG acquisition,
   quarantine, LaunchServices/mount/installer, sentinel, and removal flows. If
   certificate export policy blocks hosted distribution, write a separate
   runner-provisioning plan; this may not weaken clean-host isolation. If the
   clean-host user flows are infeasible on hosted images, stop and plan a
   distinct resettable clean-host backend. Because the apple-certification
   environment does not yet exist, present its exact reviewer, main-only branch
   policy, variable-name, and secret-name inventory for separate
   repository-settings and secret-provisioning authority. Record names and
   public facts, never values.

   **Canonical product decision recorded 2026-08-30**: Bun 1.3.14 is the one
   canonical executable lineage whose paired arm64/x64 Apps continue through
   private-ZIP App notarization, DMG, and PKG. The release contract and
   candidate preparation already make exact Bun 1.3.14 the pack/build
   authority, and Bun owns both public API and Command lanes. Deno 2.9.5 keeps
   its two signed-App coordinates so the independently selected Deno producer
   and App-signing path remain covered, but Deno Apps do not enter the
   rendezvous or become DMG/PKG products. This is a protocol decision only; it
   does not supply identities, credentials, executed rejection fixtures, clean
   hosts, or credential-backed Apple evidence.

   **Rejection-fixture decision recorded 2026-08-30**: derive one isolated Bun
   App for each architecture from the matching canonical unsigned App, then
   ad-hoc sign it with hardened runtime and no timestamp. Require local
   `codesign --verify --deep --strict` success before private ZIP transport.
   The ad-hoc identity makes acceptance invalid by construction without using
   or corrupting a Developer ID product. Under separate Apple-submission
   authority, submit each fixture exactly once and require terminal `Rejected`
   with provider status `Invalid`, a nonempty correlated Notary log issue set,
   and at least one signing/timestamp defect bound to the submitted bundle or
   executable. Messages are scrubbed evidence, not exact-match protocol text.
   The budget is exactly two rejected submissions total, one per architecture;
   they create no public product and may not share a journal operation with a
   successful lineage. This freezes safe fixture construction but remains
   unqualified until Apple actually returns the expected terminal evidence.
3. **Journal owner**: inspect the exact released and current reviewed
   mannyc2/ts-release source and identify the actual operational store, owner
   version/commit, envelope schema, auth credential type, retention, and
   concurrency policy. The store must conditionally create and acknowledge a
   pre-dispatch intent before any provider call, then persist only opaque
   consumer-encoded canonical bytes. Prove durable acknowledgments containing
   record digest plus sequence/transaction identity, immediate bounded re-read,
   CAS races, response loss, and fresh-process replay. Separately prove that the
   exact effect-build candidate's Apple-owned strict codecs decode and
   correlate every `Notary.Submission` field and alone derive
   `SubmissionReference`; ts-release may not import or mirror that unreleased
   schema. Qualify the exact released ts-release version/source and exact
   effect-build candidate/codec as one pair. Fault-inject death before provider
   dispatch, after provider response, and before/after journal acknowledgment.
   The package's post-intent/pre-first-ID response-loss gap remains an explicit
   `SubmissionOutcomeUnknown` STOP with no resubmit; neither this plan nor a
   journal can erase it. Plan 047 freezes the selected one-backend design. Stop
   Plan 045 before credentialed Apple certification until both halves and their
   integration are operationally qualified.
4. **GitHub Release governance**: re-observe
   `repos/mannyc2/effect-build/immutable-releases`. The recommended path is to
   enable release immutability under separate repository-settings authority
   before creating v0.6.0, because GitHub applies it only to future Releases.
   If that setting cannot be enabled, record the decision and remove every
   claim that GitHub Release assets themselves are immutable; candidate and npm
   byte identity remain mandatory either way.

**Verify**: update this plan's receipt section with a non-secret evidence
reference for all four decisions. The following returns no unresolved
feasibility marker:

    ! rg -n "(npm trust inventory|Apple execution backend|Journal owner feasibility|GitHub Release governance): FEASIBILITY-PENDING" \
      plans/045-establish-v060-release-point.md

Expected: four supported decisions or a documented STOP. Local unprivileged
and fake-boundary implementation may proceed, but it must not assume a
credential or journal backend and cannot authorize protected execution.

### Step 3: Specify the candidate and readiness artifact protocols with tests first

Add failing architecture tests before workflow changes.

1. Add one canonical `releaseCertification` object to the contract model. It
   freezes release.yml modes, candidate/readiness schemas, Node/npm identities,
   npm exchange evidence, fake-registry cases, and the Apple policy from Step
   6. Add mutation tests before generating the JSON; do not hand-edit it.
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
4. Retain the candidate long enough for Apple and human review. Use thirty days
   unless evidence supports a narrower bounded window.
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

This step is gated by the contract-pinned authenticated external-evidence
policy from Step 7: the verifier implementation, exact producer identities, and
provisioned signers must all be qualified. It is not gated by the final
readiness aggregate, because this certification is itself one readiness input.
Before that authentication policy is qualified, the exact protected body must
stop before candidate/network/npm work with zero npm mutations. The sealed
local qualification harness may exercise the extracted protected bodies across
all forty transitions below and cross-check a separate hypothetical oracle,
but it uses a non-admissible local protocol, has no hosted artifact, and must
not claim authenticated certification, upload, provenance, or publication. Do
not add a test-only runtime contract override or fallback; the supported test
contract must be generated through the same closed policy model.

Once the verifier is qualified, the test must exercise the exact shell bodies
extracted from the parsed workflow, not a friendly reimplementation.

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
   - a partial exact-byte publication resumes only missing names;
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
     exact-byte resume;
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

Expected while external authentication is blocked: the real protected purpose
finishes its exact authenticated read-only GitHub reauthorization and then
stops before candidate adoption or any npm/registry work, with zero mutations,
while the sealed local qualification executes the extracted bodies across all forty
coordinates and cross-checks the independent oracle with explicit mutation
counts and truthful non-certification claims. It emits no readiness-admissible
exact-certification artifact. Expected after qualification: the supported
exact certification workflow reruns all forty coordinates through those same
bodies; each has an explicit mutation-count assertion. Coverage by string
inspection alone is not completion.

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

### Step 6: Build the v0.6 Apple certification protocol from the current contract

Do not copy the v0.5 workflow's six-package candidate protocol, public-ZIP or
macOS Node SEA coordinates, universal receipt schema, or hard-coded 32-receipt
claim. Reuse only its unprivileged prepare -> protected native execution ->
secret-free clean host -> unprivileged aggregate trust topology.

#### 6.1 Freeze one canonical v0.6 protocol

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

#### 6.2 Freeze operation and verdict coverage

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

#### 6.3 Implement the one-byte-lineage job DAG

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

Expected: structural and local fake-runner tests pass before credentials are
used. Hosted completion requires the downloaded Apple aggregate to validate
against exact R and candidate bytes.

### Step 7: Build one fail-closed release-readiness aggregate

Create a read-only workflow or script that:

1. authenticates GitHub API metadata for every contributing run and artifact;
2. requires exact R, current main, attempt, success, non-expired artifacts, and
   expected workflow identities;
3. downloads and byte-validates the candidate separately plus exactly seven
   ordered evidence roles: exact-main CI, exact protected-body fake-registry
   certification, npm authority, npm OIDC certification, Apple certification,
   operational journal, and GitHub Release governance. The npm OIDC artifact
   contains claims plus eleven exchange entries in two retained files; Apple
   certification contains clean-host evidence;
4. independently re-observes npm public versions, tags, placeholder bytes,
   npm environment metadata, deployment branch policy, remote main, workflow
   blob, repository OIDC subject policy, and package repository URLs; consumes
   the private trusted-publisher/permission, exact empty `mannyc1` token
   inventory, exact twelve-package sole-maintainer projection, and exact
   twelve-package disallow-token publishing-access policy only through
   freshness-limited external receipts whose Sigstore/DSSE envelope,
   exact producer workflow identity, source SHA, receipt digest, observation
   time, and expiration are verified against the contract;
5. admits each of the three external roles only through a compact,
   transport-only `release-evidence-ingress.yml` artifact named by exact
   run/attempt/artifact/digest coordinates. The ingress workflow validates and
   byte-bounds canonical reference and Sigstore bundle inputs, uploads exactly
   two files, and grants them no authority; readiness re-downloads those exact
   bytes and the contract-pinned producer certificate identity remains the sole
   evidence authority;
6. parses every downloaded GitHub artifact ZIP before extraction using one
   repository-owned fail-closed reader: exact single-disk EOCD and central/local
   header correlation; unique flat UTF-8 expected names; only store or raw
   deflate; no encryption, Zip64, unsupported flags, prepended/trailing bytes,
   links, or device entries; one smallest contract-wide 64 MiB archive/aggregate,
   16 MiB compressed/uncompressed member, and compression-ratio cap plus each
   role's exact expected member set; and exact CRC-32. GitHub's
   observed data-descriptor form is admitted only when its descriptor, central
   sizes, local header, streamed bounded output, and CRC all agree. Never invoke
   an extractor against the destination tree before these checks;
7. emits `release-readiness.json`, an opaque evidence bundle, and the exact
   contract-pinned `sigstore-trusted-root.json` snapshot used for offline
   verification. Contract generation must first replay the exact pinned
   acquisition clients and same-lock-record integrities, embedded seed-root to
   rotated-root signatures, signed timestamp/snapshot/targets chain, versions,
   acquisition-time expiry of the active rotated root, timestamp, snapshot,
   and targets metadata, target descriptor, and target bytes from the retained
   evidence. The historical seed root is the retained rotation trust anchor and
   need not remain unexpired at acquisition. That replay authenticates the
   vendored root target; the root snapshot and retained TUF chain remain
   verifier inputs, not independent release evidence or authority;
8. states explicitly that the dry-run receipts prove package-specific npm OIDC
   exchange acceptance at that instant, while tarball upload, provenance
   generation, registry commitment, and publication completion remain proven
   only by the separately authorized real publish;
9. uploads one artifact with a retention window that covers approval; while
   any exact external producer identity or verifier is absent, it must exit
   nonzero and expose no upload path rather than accept caller-authored bytes;
10. also lands, before R is selected, a read-only final-public verification path
   that consumes exact R/candidate/tag/Release coordinates, fresh-downloads npm
   and Release bytes, verifies provenance and consumers, and emits the final
   receipt artifact. It has no credential, repository write, tag, Release, or
   registry mutation permission.

**Verify**: download the artifact by ID, compare the REST artifact digest,
extract it, validate the JSON schema, and independently recompute every
referenced digest.

Expected: one terminal success bound to R. A running aggregate, green
dependencies, or an artifact listing without downloaded byte validation is not
a release point.

### Step 8: Land release-readiness infrastructure through its own PR

1. Run pinned Bun 1.3.14 full verification, focused workflow tests, contract
   checks, shell syntax checks for every workflow run block, action pin checks,
   secret scans, and git diff checks. Require every checkout-capable release
   evidence or control-plane GitHub/npm read to import the sealed Node boundary.
   The sole package-manager exception is the separately closed, integrity-bound
   `dependencyBootstrap` above, which is never evidence. The no-checkout
   protected body must use a generated inline Node-HTTPS projection whose source
   digest and behavior are mechanically locked to that boundary; architecture
   tests reject raw curl for any real release evidence/control-plane
   GitHub/npm/OIDC read and allow it only as the exact credential-free fake
   executable.
2. Commit only the release-readiness scope from an isolated worktree, and only
   under exact commit authority.
3. Push that commit only under separate exact push authority.
4. Open a dedicated PR only under separate PR-creation authority. Obtain
   exact-head push and PR CI.
5. Merge only under separate merge authority with an exact-head guard.
6. Capture the inert infrastructure merge SHA and rerun exact-main CI. While
   external-evidence authentication remains generated as `blocked` with an
   empty producer-identity list, this SHA is not R and neither readiness nor
   final-public receipt production is reachable. Do not add an environment,
   dispatch, fixture, or shell override to promote it.

**Verify**:

    test "$(bun --version)" = "1.3.14"
    node scripts/release/install-frozen-release-dependencies.mjs
    bun run verify
    bun run check:contract
    bun run format:check
    git diff --check

Expected: clean worktree; exact-head hosted checks and exact-main hosted checks
successful; no public package-source, provider-operation, public-projection,
npm-admission, or reservation change. The generated combined-contract diff is
limited to the exact generated allowlist above. Public/provider/capability,
npm-admission, and reservation authority remain byte-for-byte unchanged.
Exact-main success here proves only the inert implementation.

### Step 9: Execute non-publishing certification and present the release point

1. Apply only the exact Step 2 npm package-setting, legacy npm-token
   revocation/secret deletion, Apple environment/policy,
   credential-provisioning, and journal-store changes that received separate
   authority. Re-observe public configuration and secret/variable names without
   reading values; stop on any extra, missing, or different setting.
2. After the exact journal/reusable-workflow, AWS, Apple credential, executor,
   and runner interfaces are frozen, implement and land the full Apple hosted
   producer, continuation, clean-host, verdict, and aggregate DAG in a separate
   reviewed PR while `releaseCertification.apple.hostedExecution` remains
   `blocked`. Its protected stage allowlist, no-checkout immutable inputs,
   atomic journal acknowledgment/re-read, no-blind-resubmit behavior, 28
   ordered receipts, full operation tool observations, and fresh-host flows
   must pass structural, source-backed, and hostile tests. The merged inert
   workflow must still stop before every protected or certifying action; this
   merge is not R.
3. After all three external receipt producers and signers and the inert Apple
   hosted integration are operationally qualified, generate one closed
   supported activation from the same contract
   model. It must pin the three role-specific Fulcio certificate identities,
   workflows, repositories, refs, and source bindings; change authentication
   to `supported` with artifact production required on terminal success;
   preserve the exact three-job topology and current-main dispatch identity;
   qualify the exact no-third-party observer and signer bootstraps; grant
   `contents: read` only to each `observe` job and `id-token: write` only to each
   dedicated `sign` job; keep every `upload` job OIDC-free; and make those
   changes atomic with all identities. No blocked intermediate commit may carry
   OIDC permission or claim a qualified bootstrap;
   change exact protected-body certification to its supported
   readiness-admissible state; change Apple hosted execution to its supported
   required-artifact state with the exact qualified journal, reusable-workflow,
   AWS, credential, executor, and runner identities; and make final-public
   verification `ready`/`allowed` while the shared authentication object stays
   `supported`/required-on-terminal-success.
   The supported fixture must rerun all forty stateful publisher cases and a
   same-contract test spanning exact-body certification, readiness adoption,
   real publication recovery, Apple admission, and final-public verification.
   Review, commit,
   push, open, and merge this activation only under separately granted exact
   authorities. No change beyond this closed external-authentication,
   exact-body, Apple-hosted, and final-public activation allowlist may ride
   with it.
4. Let candidate release SHA R be the supported activation merge SHA. Prove
   its exact merge tree, wait for exact-main ordinary CI, and freeze main. It
   has not yet earned release-point status. Any later source or workflow change
   invalidates R and all candidate/certification work.
5. Dispatch release.yml in prepare-exact-sha mode for R.
6. Download and independently validate its artifact and manifest.
7. Dispatch release.yml in certify-exact-sha mode against that exact candidate,
   then approve and run its protected GitHub claims plus eleven npm-exchange
   job. This approval does not authorize npm publication.
8. Dispatch the
   exact protected-body fake-registry certification against the exact candidate
   and download and validate its readiness-admissible artifact. The current
   local-qualification artifact cannot substitute for it.
9. Resolve GitHub Release governance before readiness. Under separate settings
   authority, either enable and re-observe immutability, or retain a signed,
   authenticated accepted-disabled decision that makes no immutability claim.
10. Under separate Apple-submission authority, approve and run Apple
   certification only after credential and journal feasibility is recorded.
11. Wait for terminal Apple and clean-host aggregates, download them, and
   validate bytes.
12. For each of `npm-authority`, `operational-journal`, and
   `github-release-governance`, dispatch exactly one
   `release-evidence-ingress.yml` run at R with the canonical signed logical
   reference and Sigstore bundle. Download and independently validate each
   exact two-file ingress artifact, then pass readiness only its compact
   run/attempt/artifact/digest coordinates; never pass caller-authored receipt
   bytes directly to readiness.
13. Run the readiness aggregate with those three exact ingress references and
   independently validate it.
14. Re-observe remote main and npm immediately before presenting the packet.
   Only when every Definition gate and the fresh terminal observations succeed
   is candidate SHA R promoted to the earned release point R.
15. Present R, all run IDs/attempts, artifact IDs/digests, eleven tarball
   digests, Apple aggregate identity, journal owner identity, environment and
   publisher observations, registry state, and the exact proposed publish
   dispatch.

**Verify**: every item in the Definition of the release point is checked and
the final main/npm observations are no older than the approval packet.

Expected: Plan status may become READY FOR PUBLICATION AUTHORIZATION. It must
not become RELEASED.

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
eligible for same-candidate resume. Any other partial state is a STOP requiring
a new recovery/version decision. Partial state is not release completion.

### Step 11: Create the tag and GitHub Release last

Require separate tag, draft-Release, and public-Release authorities after all
npm coordinates converge.

1. Re-observe and enforce the exact Step 9 governance decision already admitted
   by readiness. Any drift is a STOP. If the decision was
   `enabled-before-release`, immutability was already enabled and re-observed
   under separate settings authority before readiness. If it was
   `accepted-disabled-release-assets-not-claimed-immutable`, preserve that
   limitation and do not claim immutable Release assets. Step 11 may not make
   the first governance decision or mutate the setting after R is earned.
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
6. Under public-Release authority, publish only that exact verified draft:

       gh release edit v0.6.0 -R mannyc2/effect-build --draft=false

   Re-download release metadata. If immutability was enabled, require
   `immutable: true`; do not upload or edit any asset afterward.
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
3. Retain candidate, readiness, Apple, and final receipts at their exact named
   artifact/archive locations for the documented period and record expiry.
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
- Add test/architecture/apple-certification-workflow.test.ts. Generate its
  expected coverage from the canonical releaseCertification policy; require
  the exact ordered 28 coordinates, category field allowlists, A dependencies,
  pair-rendezvous DAG, environment/credential job allowlist, two-file aggregate,
  and rejection of public ZIP and macOS Node SEA cells.
- Extend test/architecture/ci-workflow.test.ts so ordinary credential-free CI
  cannot be mislabeled as distribution certification.
- Add local fake Apple tests for reference persistence, fresh-runner resume,
  redaction, architecture correlation, external journal ACK/re-read and crash
  points, locally-valid rejection, unknown outcome with no resubmit, clean-host
  pre/post state, and aggregate completeness. These do not substitute for
  hosted Apple evidence.
- Test the readiness aggregate with missing, duplicate, wrong-run, wrong-SHA,
  rerun, expired-artifact, changed-main, changed-registry, and changed-byte
  fixtures. Add hostile ZIP fixtures for duplicate/local-central name mismatch,
  traversal, invalid UTF-8, symlink/device attributes, encryption, unsupported
  methods/flags, Zip64, multidisk, prepended/trailing data, CRC mismatch,
  truncated descriptor, oversized members/aggregate, and high compression ratio;
  retain one real GitHub-style data-descriptor/store fixture as the positive
  boundary.
- Test the Sigstore/DSSE verifier against canonical v0.3 bundles, exact payload
  and certificate/OID bindings, malformed and noncanonical encodings, trust
  thresholds, and the real two-argument Sigstore verification API boundary.
- Test the generated signer independently: every repository Node launch is
  `env -i`; blocked workflows have no OIDC permission; arbitrary dispatch SHAs
  cannot execute repository code; request tokens/URLs and responses are bounded;
  Fulcio/Rekor never redirect or retry; TLS uses bundled roots, exact SNI, and
  no agent; duplicate/encoded/partial/truncated bodies and duplicate JSON keys
  at every nesting level fail; and `//host` endpoint mutation sends zero bytes.
- Test npm authority with the separately pinned npm 11.19.1 package integrity,
  manifest, trust-list/token-list sources, and explicit npmjs registry argv.
  Require exact `mannyc1`, exact empty token inventory, exact sole-maintainer and
  disallow-token publishing-access projections for all twelve authority
  packages, plus observation-credential destruction before signing. Peer users,
  ambient registry config, additional maintainers, any token entry, missing
  package policy, or deletion of a GitHub secret alone must remain blocked.
- Test retained Sigstore TUF provenance against seed/root signature rotation,
  timestamp/snapshot/targets signatures and hash/length/version links, active
  rotated-root/timestamp/snapshot/targets acquisition-time expiry, exact target
  bytes, and same-record client locator plus SHA-512 lock integrity. Relocated
  or swapped integrity text must fail; historical seed-root expiry alone must
  not invalidate an otherwise authenticated rotation.
- Test final-public validation and its workflow for exact readiness, npm, tag,
  Release, asset, provenance, and clean-consumer byte bindings while retaining
  read-only permissions and an unreachable upload while readiness authentication
  is blocked.
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
- [ ] After authenticated external evidence is qualified, the exact publisher
  shell passes every named stateful fake-registry case in the supported exact
  certification workflow. Until then, the real purpose proves only a
  post-reauthorization, pre-candidate, pre-npm zero-mutation STOP; the sealed local protocol executes those
  extracted bodies for all forty coordinates and cross-checks the oracle, but
  its non-admissible result is not a substitute.
- [ ] The one protected GitHub claims receipt and one npm OIDC exchange receipt
  containing eleven ordered entries are valid, contain no token, and bind an
  unchanged registry snapshot.
- [ ] All eleven trusted-publisher records and repository URLs are observed;
  setting-save insufficiency and the exact dry-run exchange evidence are both
  preserved.
- [ ] The legacy repository `NPM_TOKEN` is deleted under separate authority,
  any corresponding npm token is authenticatedly revoked, forbidden
  repository/environment secret names are absent, all tarballs have exact
  two-key `publishConfig`, and npm/Sigstore sources match the audited digests.
- [ ] Apple evidence covers both architectures, all thirteen capabilities,
  acceptance/rejection, fresh-runner continuation, staple, Gatekeeper,
  quarantine, private App ZIP transport, and six App/DMG/PKG clean-host
  coordinates within the exact 28-receipt matrix.
- [ ] The exact downstream journal owner is qualified.
- [ ] Downloaded readiness aggregate authenticates all run/SHA/attempt and
  artifact bytes at R.
- [ ] Anonymous registry and current-main observations are fresh and exact.
- [ ] Separate publication authorization is recorded before npm mutation.
- [ ] All eleven npm coordinates converge to candidate-exact bytes.
- [ ] Separate tag/GitHub Release authorization is recorded.
- [ ] Separate draft-Release and public-Release authorizations are recorded.
- [ ] GitHub Release immutability is enabled before v0.6.0 creation, or the
  explicit non-immutable governance decision and compensating receipt policy
  are recorded.
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
- a package trusted-publisher record cannot be authenticated, differs, or is
  only assumed from another package;
- npm, GitHub, or Apple observation is inconclusive;
- the journal owner cannot durably persist and resume the exact Notary fields;
- an Actions artifact is used as the first durable journal acknowledgment or
  the submit-response-to-upload crash gap remains open;
- Apple credentials, runners, team identity, product architecture, submission,
  stapling, Gatekeeper, quarantine, or clean-host evidence is unavailable;
- any secret or OIDC token appears in logs, artifacts, commands, or committed
  files;
- before protected certification or publication, a repository/environment
  `NPM_ID_TOKEN`, `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or `SIGSTORE_ID_TOKEN` secret
  remains, a protected process receives one of those variables, or a tarball
  contains non-canonical `publishConfig`;
- after external evidence authentication is qualified, fake-registry execution
  does not run the exact protected reauthorization and publisher bodies; while
  it remains blocked, the exact body reaches any registry mutation or helper
  coverage is described as exact-body certification;
- a conflict, newer npm version, prior-latest drift, wrong tag, wrong bytes,
  missing/foreign provenance, reservation drift, or unresolved unknown
  commitment exists;
- main advances after the release point and before the final public receipt;
- publication would require self-hosted npm OIDC, a manually provisioned or
  fallback token, login, stage, dist-tag repair, manual publish, repack, or
  unpublish;
- GitHub tag/Release would be created before all npm subjects converge;
- any requested action lacks exact same-session authority.

## Maintenance notes

- The certified dry-run proves the package-specific npm OIDC exchange at that
  instant. It does not prove upload, provenance, or publication; keep those at
  the separately authorized real-publish boundary.
- Re-run fake-registry cases whenever the inline publisher changes.
- Re-generate Apple coverage whenever the producer capability register changes.
- Requalify the journal owner whenever its released version or exact source
  commit changes.
- A new target version, package, tag policy, staged-publishing policy, workflow
  filename, environment, npm/Node client, or candidate schema invalidates the
  readiness protocol and requires a reviewed contract change.
- Keep GitHub Release last. That ordering makes a partial npm publication
  recoverable without falsely advertising a complete public release.

## Receipt

No release-point or publication receipt exists yet.

- Merge receipt: PR 24 merged at 2026-08-30T11:40:40Z as
  dd39bd6104645d79fa52f40d0bbf291b5bf8f3dc with parents
  4ad34423d84d17c959ace0d55af8623f336a68be and
  e4511f12f2afdab0090de73fd6bf4d1f226b4d88; its tree
  29cdac9bf9621aa3df12757e2720c093b17d742e equals the PR-head tree, and
  exact-main push run 33309530017 passed 33/33 jobs with no retained artifact
- Post-merge main SHA: dd39bd6104645d79fa52f40d0bbf291b5bf8f3dc;
  this is not release point R
- Final main SHA R: DECISION-PENDING
- Release-readiness implementation PR/head: LOCAL-UNCOMMITTED on
  codex/v060-release-readiness at
  dd39bd6104645d79fa52f40d0bbf291b5bf8f3dc; the release contract, workflows,
  Apple probe/journal boundary, Sigstore verifier, release-authority auditor,
  readiness/final-public validators, fixtures, and tests exist only as
  working-tree changes, and no implementation commit, push, or PR exists
- Current local release-readiness verification: PASSED under pinned Bun 1.3.14;
  contract 13/13, type-test files 16/16, unit 160/160, Apple package 46/46,
  built consumer, architecture 254/254, lint, formatting, and git diff check
  passed. The architecture total includes 78 publisher-boundary tests, a
  deliberate process-group timeout regression, and all 40 exact protected-body
  state-machine coordinates; the exact 40-coordinate subset also passed in a
  separate run. Local native Apple acceptance passed 4/4. This is local
  qualification of uncommitted bytes, not hosted certification, a release
  point, or publication evidence.
- Historical pre-hard-cut nonsecret authority audit: BLOCKED at
  2026-09-01T00:40:01.724Z for source
  dd39bd6104645d79fa52f40d0bbf291b5bf8f3dc. Its former 44 checks reported 20
  match, one mismatch, and 23 unobserved: the repository `NPM_TOKEN` name is the
  mismatch; npm authentication returned E401; and all eleven trusted-publisher
  plus allowed-action records remain unobserved. GitHub environment, branch
  policy, OIDC policy, no environment secrets/variables, and all public package
  repository URLs matched. The token identity/revocation and authenticated npm
  inventory remain unresolved. This receipt shape is now superseded and cannot
  satisfy the current 57-check protocol, which additionally requires exact
  `mannyc1` empty-token/sole-maintainer evidence plus twelve disallow-token
  publishing-access observations under the pinned authority-only client.
- Apple execution backend: PARTIALLY-RESOLVED; Bun 1.3.14 is the canonical
  App/DMG/PKG lineage and Deno 2.9.5 remains signed-App-only; the exact ad-hoc
  rejection fixtures are frozen; and Plan 046 passes local fake 30/30 plus
  real-native 4/4 including every release layer. Developer ID Application and
  Installer identities, environment/credentials, actual rejection outcomes,
  both hosted architectures, and clean-host feasibility remain absent.
- Journal owner feasibility: APPLE BOUNDARY IMPLEMENTED LOCALLY / EXTERNAL
  OWNER BLOCKED; effect-build-apple now owns the locally verified codec and
  submission engine. Plan 047 selects a provider-neutral canonical-byte S3
  journal from exact ts-release main, but the downstream implementation,
  dedicated bucket/Object-Lock/IAM/OIDC authority, released owner version, and
  cross-process qualification do not exist
- GitHub Release governance: OBSERVED-ENABLED / EXTERNAL READ BLOCKED;
  immutability is enabled and not owner-enforced, but a supported ephemeral
  Administration-read producer observation does not yet exist
- Candidate run/attempt/artifact ID/digest: DECISION-PENDING
- Fake-registry local qualification run: NOT-HOSTED; any future artifact uses
  effect-build/fake-registry-local-qualification@1 and is not readiness-admissible
- Exact protected-body fake-registry certification run: BLOCKED; protocol
  effect-build/fake-registry-exact-protected-body-certification@1 is forbidden
  until external producer identities and signers are qualified
- GitHub claims/npm OIDC exchange run/artifact: DECISION-PENDING
- npm publisher observation: DECISION-PENDING
- Apple run/attempt/aggregate ID/digest: DECISION-PENDING
- Journal owner exact identity: DECISION-PENDING
- Readiness aggregate run/artifact: DECISION-PENDING
- Publication authorization: NONE
- npm convergence receipt: NONE
- Tag/GitHub Release authorization: NONE
- Final public-release receipt: NONE
