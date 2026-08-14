# Plan 021: Adopt the certified ts-release 0.2 line for the four-package release

> **Executor instructions**: Implement only after Plan 020 is green and a real
> public release from the `@mannyc1/ts-release` 0.2 line proves coordinated
> multi-package behavior. Qualify the exact current patch release; do not require
> nonexistent `0.2.0` bytes, copy development-branch syntax, run four independent
> invocations, retain a publisher fallback, or repack candidate bytes.

## Status

- **Priority**: P1 after Plan 020
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: completed Plan 020 and every external qualification below
- **Current state**: `BLOCKED: 0.2.2 is public, but its stock released surface is singular-package and its clean npm/Node install fails`

## Historical state at Plan 020 start

Public npm still exposes only `@mannyc1/ts-release@0.0.7` as latest and has no
0.2.0 artifact. Therefore no released 0.2 syntax or behavior is adopted yet.
Plan 020 proceeds with one manual, read-only candidate workflow containing no
publication authority.

Requalification after completed Plan 020 exact-SHA CI and candidate evidence on
2026-08-13 found the same external state: npm versions end at 0.0.7 with
`latest: 0.0.7`, and GitHub returns 404 for both release and tag `v0.2.0`. No
Plan 021 workflow or configuration edit is therefore authorized by the plan's
own qualification boundary.

## Exact 0.2-line requalification on 2026-08-14

The current public 0.2 release is `@mannyc1/ts-release@0.2.2`; neither 0.2.0 nor
0.2.1 was published. This satisfies the version-line requirement. The exact
release identity observed is:

- npm tarball integrity
  `sha512-FXVtZc1lRNqKDdbL5vmXPiGemZlokL4cRzhVpBGsVg2gxawq2pypotXBn1PFVHRFA7tzIT2Rrq6u+ws4ol7pRQ==`;
- lightweight tag `v0.2.2`, GitHub release, and source commit
  `528bdf9969985e2cb8238192d30c4a2f680ce8c3`;
- successful release run `31792827414`;
- machine-readable report artifact `9216262028`, digest
  `sha256:a38ec43a519cdbe3447b48c7dd2ef5185e61c920bcbcb160c67967db56cf8f96`;
- prepared artifact `9216233768`, digest
  `sha256:205d96a11414dfe697a3409113ebb6b6493a828f1f876df5da5fafe6e14fd470`,
  carrying prepared manifest hash
  `65461ba856ff53004261c699210d4c5964cdb7d3f0e1c091ed76dcd3332c96ad`.

The exact npm version and integrity-addressed tarball cannot be replaced in the
registry. The surrounding GitHub evidence is not immutable: `v0.2.2` is a
lightweight movable tag, the release reports `immutable: false`, and both
Actions artifacts expire on 2026-11-12. The SHA and digests identify what was
verified today; they do not turn those GitHub objects into permanent evidence.

The report truthfully records one GitHub subject and one npm subject, including
the npm `OutcomeUnknown` followed by exact reobservation and convergence. It is
valid single-package release evidence, not four-package evidence.

Two qualification failures remain:

1. A bare Bun 1.3.14 registry install, frozen reinstall, and imports of the
   package, Bun platform, and provider SDK pass with the beta.83 family aligned.
   A consumer that explicitly declares ts-release's required beta.83 peers emits
   `incorrect peer dependency`, resolves top-level
   `@effect/platform-node-shared@4.0.0-rc.109`, and retains a nested beta.83 copy
   under ts-release. A clean supported Node 24.15.0 plus npm 11.11.0
   `--strict-peer-deps` registry install fails `ERESOLVE`.
   `@effect/platform-bun@4.0.0-beta.83` permits a later
   `@effect/platform-node-shared`, npm selects `4.0.0-rc.109`, and that package's
   Effect peer conflicts with ts-release's exact `effect@4.0.0-beta.83`. Do not
   hide this with `--force`, legacy peers, a hand-authored override, or a copied
   offline dependency closure.
2. The exact released schema has singular `npmPackage` and `publish.npm`
   fields, and the installed npm capability emits one subject. The library-only
   provider SDK can install custom application adapters, but the stock CLI and
   Action install none and export no certified multi-package npm adapter. The
   aggregate example assertion covering nine npm subjects across separate
   examples is not one executed four-package candidate.

Therefore the exact released Action coordinate
`mannyc2/ts-release/apps/ts-release-action@v0.2.2` is not yet adopted in
effect-build, and Plan 020's non-mutating candidate workflow remains in force.

## Evidence standard

Compatibility evidence here means a clean registry install under each runtime
and package manager the tool claims to support, followed by a minimal import or
CLI smoke test. It does not require a bespoke receipt verifier per dependency
endpoint. Multi-package publication is a different claim: because it concerns
irreversible remote ordering and recovery, it needs one durable,
content-addressed executed report showing the whole subject graph. Unit tests or
four separate successful publishes cannot establish that claim.

## Required qualification

Before the first implementation edit, prove all of the following from public
artifacts with stable exact identity and durable content-addressed evidence:

1. one exact current `@mannyc1/ts-release@0.2.x` npm package, matching tag,
   non-draft GitHub release, machine-readable release report, and
   source/package/Action identity agree;
2. clean Bun 1.3.14 and npm/Node consumers install and run released syntax;
3. one candidate coordinates four explicit npm packages plus one GitHub
   tag/release in total order: core, Bun, Deno, Node SEA, GitHub;
4. it prepares each tarball once, rewrites provider dependencies to concrete
   `^0.3.0`, preflights every subject before mutation, and publishes the same
   bytes already consumed by Plan 020 tests;
5. per-subject outcomes include equivalent, conflict/failure, unknown outcome,
   and `NotReached`, with safe same-bundle resume;
6. trusted publishing covers all four npm subjects without repository tokens;
7. one coordinator result is non-success until all five subjects are
   equivalent; and
8. separate durable, content-addressed executed evidence proves four-package
   coordination, not
   only a schema field or four independent invocations.

After every gate passes, restamp this plan from the exact released CLI/schema/
Action surface, record exact SHAs/hashes and exact file inventory, cold
review it, and change the status to `TODO`. Until then, only read-only
qualification and plan-only factual updates are permitted.

## Activation boundary

The eventual qualified implementation replaces Plan 020's read-only candidate
workflow with one ts-release coordinator. It may prepare and observe without
mutation during verification. Actual npm publication, tag creation, GitHub
Release creation, trusted-publisher mutation, or workflow dispatch requires the
operator authority already granted for this execution and must still occur only
after exact-SHA required CI and candidate-byte verification.

There is no fallback publisher. If the current released 0.2 patch cannot pass
its claimed consumer surfaces or represent the four-package graph, leave the
candidate workflow intact, keep this plan blocked, and report the exact external
gate.

## Done criteria

- [x] Public package/tag/release/report identify exact 0.2.2 and its current
      SHA/digests.
- [ ] Released bytes pass clean Bun and npm/Node consumer qualification.
- [ ] Durable content-addressed evidence proves one coordinated four-package
      failure/recovery state machine and one GitHub subject.
- [ ] Exact released-syntax restamp and cold review precede code/workflow edits.
- [ ] One canonical preparation produces the four tarballs used by consumer
      tests and publication; no second packer or publisher remains.
- [ ] Exact-SHA effect-build gates remain green and the activated coordinator
      preserves strict dependency order and truthful outcomes.
- [ ] Authorized live release completes without reusing published effect-build
      `v0.2.0` or publishing
      any package version twice.
