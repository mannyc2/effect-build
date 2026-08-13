# Plan 017: Adopt certified ts-release 0.2.0 for the Bun workspace release

> **Executor instructions**: This plan is externally gated. Do not copy API,
> config, Action, or workflow syntax from an unreleased branch or checkout.
> First prove that public `@mannyc1/ts-release@0.2.0`, Git tag and GitHub
> release `v0.2.0`, its live certificate, clean installed consumers, and
> separately certified multi-package coordination all exist. If any gate
> fails, leave effect-build release tooling unchanged and keep this plan
> `BLOCKED`. Never approximate the graph with three independent ts-release
> invocations, a shell loop, manual provider publication, or a fallback
> publisher.
>
> **Two-phase rule**: While this plan is `BLOCKED`, only the read-only
> qualification in Steps 1-3 and plan-only factual updates are executable. If
> every gate passes, a planning owner must restamp Steps 4-8 from the exact
> tagged artifacts, record immutable source/evidence/Action SHAs and exact
> released commands/schema fields, name the complete file inventory, and
> obtain a fresh cold review. No effect-build implementation edit is
> authorized until that restamp changes the index row to `TODO`.

## Drift check

```sh
pm_bun() { npm exec --yes --package=bun@1.3.14 -- bun "$@"; }
pm_bun --version
git status --short
git merge-base --is-ancestor \
  387bf243248447f2e34c26d3db3f2cee7067ff9c HEAD
rg '^\| 016 .*\| DONE \|$' plans/README.md
pm_bun run verify
git diff --check
```

Expected before implementation: Plan 016 is committed and `DONE`; its product
source remains `387bf243248447f2e34c26d3db3f2cee7067ff9c`; the worktree is
clean except for explicitly assigned plan work; and the ordinary Bun gate is
green under exact package-manager Bun 1.3.14. Plan 016 evidence is the native
GitHub metadata recorded in that plan, not a repository receipt-verifier
script.

## Status

- **Priority**: P1 after Plan 016
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: completed Plan 016 and every external gate below
- **Category**: release engineering
- **Restamped baseline**: Plan-016 product source
  `387bf243248447f2e34c26d3db3f2cee7067ff9c`; Plan-016 completion status
  commit `5949a83c6289cd8e28b159a33b3ec11dfaa37141`, 2026-08-13
- **Current status**: BLOCKED — public `@mannyc1/ts-release@0.2.0`, tag and
  release `v0.2.0`, terminal Plan-234 live certificate, and certified
  three-package coordination are absent

## Why this matters

Plan 016 created one lockstep source/version and three dependency-ordered npm
packages:

```text
effect-build-bun ──┐
                   ├──> effect-build
effect-build-deno ─┘
```

A release coordinator is useful only if it makes that graph more truthful. It
must prepare the exact three tarballs once, preflight every subject before the
first mutation, publish in strict core/Bun/Deno/GitHub order, retain every
outcome, and resume from the same prepared bytes. npm publication cannot be
atomic; the invariant is ordered, resumable, and never falsely successful.

ts-release is tooling around effect-build. It must not alter the two build
operations, Provider SPI, options, artifacts, errors, lifecycle, targets, or
package topology. Plan 016's manual, non-mutating candidate workflow remains
the only enabled release workflow while this plan is blocked.

## Live qualification audit (2026-08-13)

The current read-only checks establish all of the following:

- npm returns E404 for exact `@mannyc1/ts-release@0.2.0`.
- npm publishes only `0.0.0`, `0.0.1`, `0.0.2`, `0.0.3`, `0.0.5`, `0.0.6`,
  and `0.0.7`; `latest` is `0.0.7`.
- GitHub returns 404 for `refs/tags/v0.2.0` and no GitHub release exists for
  that tag.
- GitHub path history for
  `docs/release-program/remediation/234-live-release.md` is empty, so there is
  no immutable terminal live certificate to compare with a result commit.
- Public `main` resolves to immutable commit
  `c61669e7cedf105fdec81112ed6382e839e3233d`. Its root manifest says 0.2.0,
  but an unreleased manifest version is not a public release.
- At that immutable public SHA, `CandidateConfig` still has one singular
  `npmPackage` and one `publish.npm`; `lowerNpm` emits one
  `PackageRegistryRelease`. `projects` replicates a shared operation template
  across roots and qualifies ids, paths, and tags, but does not establish
  three distinct npm package names/subjects. This source inspection is a
  capability inference, not a substitute for the required released executable
  fixture and immutable multi-package certificate.
- With no public 0.2.0 artifact, its released README/schema/CLI/Action cannot
  be inspected and clean Bun/npm consumers cannot be run. Absence is the
  failed gate; development syntax is not a fallback.

Canonical result:

```text
BLOCKED: ts-release 0.2.0 cannot yet prove or represent the three-package effect-build release graph
```

No effect-build implementation, workflow, dependency, tag, release, package,
trusted-publisher relationship, or publication authority changed during this
qualification.

## Required released capability contract

Proceed only if the tagged public 0.2.0 product and immutable evidence prove
one prepared release with all of these properties:

1. one exact source commit and one lockstep version/tag;
2. three npm artifacts from explicit workspace-relative package paths;
3. total order `effect-build`, `effect-build-bun`, `effect-build-deno`, then
   one GitHub tag/release subject;
4. concrete packed provider dependencies `effect-build: ^<version>`;
5. three distinct npm subjects with per-subject observation and outcome;
6. npm trusted publishing with no repository `NPM_TOKEN`;
7. one GitHub tag/release, not one per package;
8. one canonical tarball producer whose immutable paths/digests are consumed
   by both publication and effect-build's consumer tests without repacking;
9. authoritative pre-observation of all four subjects plus validation of every
   package coordinate, toolchain, and trusted-publisher binding before the
   first mutation;
10. stop-on-first-non-equivalent semantics with every later subject recorded as
    `NotReached` after failure, conflict, or unknown outcome;
11. safe resume that observes equivalent earlier subjects and reuses the same
    prepared bundle; and
12. one CLI/Action coordinator result that is non-success until every subject
    is equivalent.

The singular self-release certificate is necessary for public artifact/source
identity but insufficient for multi-package behavior. The latter additionally
requires an immutable executed three-package fixture/certificate with
preflight, partial-failure, outcome-unknown, `NotReached`, and same-bundle
recovery cases.

## Commands for future requalification

```sh
npm view @mannyc1/ts-release@0.2.0 \
  version dist.integrity dist.shasum gitHead repository engines \
  peerDependencies --json
gh api repos/mannyc2/ts-release/git/ref/tags/v0.2.0
gh release view v0.2.0 --repo mannyc2/ts-release \
  --json tagName,publishedAt,targetCommitish,url,isDraft,isPrerelease
gh api \
  'repos/mannyc2/ts-release/commits?path=docs/release-program/remediation/234-live-release.md&per_page=1'
```

After resolving tagged/result commit X and certificate commit Y, require Y to
equal or descend from X, read the certificate at immutable Y, and prove npm,
tag, release, Action revision, package bytes, and certificate coordinates all
agree. Evidence-only Y must never be used as the Action pin merely because it
is newer.

## Current executable scope

### Step 1: Prove a real certified public 0.2.0 release

Query npm, peel the exact tag to commit X, require a non-draft release, resolve
the terminal live-certificate commit Y, prove Y equals or descends from X, and
compare all public coordinates and digests. This step currently fails at npm,
tag, release, and certificate existence.

### Step 2: Verify the shipped artifact in clean Bun and npm/Node consumers

Only after Step 1 passes, download the exact npm tarball into an owned temporary
directory. Inspect its packaged manifest, README, schema, CLI help, exports,
Action docs, and templates. Install those bytes in fresh Bun 1.3.14 and
npm/Node consumers; typecheck the released library surface; run only documented
non-mutating commands; and require one Effect tree compatible with
effect-build's bounded peer interval. Do not read syntax from the development
checkout. This step is currently non-executable because no released tarball
exists.

### Step 3: Prove coordinated multi-package behavior

Only after Steps 1-2 pass, construct a disposable core/Bun/Deno fixture and run
the exact released validation/preparation commands. Require one prepared graph
with three npm subjects followed by one GitHub subject and separately certified
fault/recovery behavior. A schema field alone, three configs, independent
bundles, or a shell loop fails this gate. This step is currently non-executable
because there are no released 0.2.0 commands or immutable multi-package
evidence.

If Steps 1-3 ever pass, stop implementation anyway. Record X, Y, the separate
multi-package evidence SHA, exact released commands/help/schema path and hash,
Action pin, prepared-report fields, canonical tarball behavior, and exact file
inventory in a plan-only restamp. Cold-review it. Only then mark this plan
`TODO` and authorize Steps 4-8.

## Provisional post-gate work (not authorized)

The successor restamp may authorize only the exact released surface needed to:

4. pin immutable public 0.2.0 npm and/or Action coordinates;
5. author one validated config for three npm subjects and one GitHub subject;
6. integrate non-mutating observation/preparation into the enabled manual
   workflow while keeping any mutating topology inert under `docs/release/`;
7. prove the exact prepared blobs through the existing six consumer fixtures
   and all ordinary effect-build gates without repacking; and
8. document trusted-publisher setup, first-publication bootstrap, partial
   publication, `NotReached`, unknown-outcome, and forward-recovery procedures
   without performing them.

The restamp must replace this summary with exact commands, schema fields,
workflow syntax, immutable SHAs, fixtures, and an exact create/modify inventory.

## Hard boundaries

- No changes under `packages/*/src/**` or to effect-build's public API.
- No independent package versions, changelog framework, binary assets,
  catalogs, PyPI, Homebrew, Scoop, signing, SBOM, or correction machinery.
- No three independent ts-release configs/invocations and no retained direct
  npm publisher.
- No floating Action ref, Git dependency, local checkout, GPU-branch syntax,
  or version beyond exact public 0.2.0.
- No mutating workflow under `.github/workflows` during this plan. Any eventual
  activation requires a separate, explicit operator-authorized plan.
- No publish, tag, GitHub release, trusted-publisher mutation, package-name
  bootstrap, push of another repository, or workflow dispatch as part of the
  blocked qualification.

## Done criteria

- [x] Plan 016 is committed, clean, and `DONE` with exact native CI/candidate
      evidence.
- [ ] npm, tag, GitHub release, and terminal certificate prove one public
      ts-release 0.2.0 identity.
- [ ] Clean Bun and npm/Node consumers install and run those released bytes.
- [ ] Immutable executable evidence proves one coordinated three-package
      release with the full failure/recovery contract.
- [ ] A cold-reviewed exact released-syntax restamp changes this plan to
      `TODO` before implementation.
- [ ] One immutable integration prepares core/Bun/Deno/GitHub in strict order
      with no fallback or second tarball producer.
- [ ] The enabled workflow remains non-mutating; any activation template is
      inert and separately governed.
- [ ] Ordinary deterministic, real-tool, target, Effect endpoint, packed
      consumer, and publication-host gates remain green.
- [ ] No live external mutation occurred.
- [ ] The index row is `DONE`; it remains `BLOCKED` while any external gate
      fails.

## STOP conditions

Stop without implementation if any of these holds:

- public npm 0.2.0, exact tag/release, or terminal certificate is absent;
- public identities/digests/Action revisions disagree;
- clean consumers fail or require an incompatible/duplicate Effect tree;
- only singular npm support exists, or immutable multi-package evidence is
  absent;
- coordination requires independent invocations, manual publication, multiple
  GitHub releases, a second ledger, or a second tarball producer;
- trusted publishing requires `NPM_TOKEN` or cannot bind all three subjects;
- strict core/Bun/Deno/GitHub order, complete preflight, `NotReached`, unknown
  outcomes, or same-bundle recovery cannot be represented;
- package-name bootstrap or any live mutation is required;
- adoption would weaken Plan 016 or alter product source/API; or
- the worktree contains unexplained concurrent changes.

The correct blocked outcome is to retain Plan 016's non-mutating candidate
workflow and wait for a certified ts-release release that fits the graph. Do
not weaken the graph to fit the tool.
