# Plan 021: Adopt certified ts-release 0.2.0 for the four-package release

> **Executor instructions**: Implement only after Plan 020 is green and a real
> public `@mannyc1/ts-release@0.2.0` release proves coordinated multi-package
> behavior. Do not copy development-branch syntax, run four independent
> invocations, retain a publisher fallback, or repack candidate bytes.

## Status

- **Priority**: P1 after Plan 020
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: completed Plan 020 and every external qualification below
- **Current state**: `BLOCKED: public ts-release 0.2.0 is not yet available`

## Live state at Plan 020 start

Public npm still exposes only `@mannyc1/ts-release@0.0.7` as latest and has no
0.2.0 artifact. Therefore no released 0.2 syntax or behavior is adopted yet.
Plan 020 proceeds with one manual, read-only candidate workflow containing no
publication authority.

Requalification after completed Plan 020 exact-SHA CI and candidate evidence on
2026-08-13 found the same external state: npm versions end at 0.0.7 with
`latest: 0.0.7`, and GitHub returns 404 for both release and tag `v0.2.0`. No
Plan 021 workflow or configuration edit is therefore authorized by the plan's
own qualification boundary.

## Required qualification

Before the first implementation edit, prove all of the following from immutable
public artifacts:

1. npm `@mannyc1/ts-release@0.2.0`, tag `v0.2.0`, non-draft GitHub release,
   live terminal certificate, and source/package/Action identity agree;
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
8. separate immutable executed evidence proves four-package coordination, not
   only a schema field or four independent invocations.

After every gate passes, restamp this plan from the exact released CLI/schema/
Action surface, record immutable SHAs/hashes and exact file inventory, cold
review it, and change the status to `TODO`. Until then, only read-only
qualification and plan-only factual updates are permitted.

## Activation boundary

The eventual qualified implementation replaces Plan 020's read-only candidate
workflow with one ts-release coordinator. It may prepare and observe without
mutation during verification. Actual npm publication, tag creation, GitHub
Release creation, trusted-publisher mutation, or workflow dispatch requires the
operator authority already granted for this execution and must still occur only
after exact-SHA required CI and candidate-byte verification.

There is no fallback publisher. If 0.2.0 is absent or cannot represent the
four-package graph when Plan 020 completes, leave the candidate workflow intact,
keep this plan blocked, and report the exact external gate.

## Done criteria

- [ ] Public package/tag/release/certificate identify one immutable 0.2.0.
- [ ] Released bytes pass clean Bun and npm/Node consumer qualification.
- [ ] Immutable evidence proves one coordinated four-package failure/recovery
      state machine and one GitHub subject.
- [ ] Exact released-syntax restamp and cold review precede code/workflow edits.
- [ ] One canonical preparation produces the four tarballs used by consumer
      tests and publication; no second packer or publisher remains.
- [ ] Exact-SHA effect-build gates remain green and the activated coordinator
      preserves strict dependency order and truthful outcomes.
- [ ] Authorized live release completes without reusing `v0.2.0` or publishing
      any package version twice.
