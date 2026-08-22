# Plan 039: establish core tool, borrowed-output, executable, compatibility, and observability laws

**Status:** reconstructed documentation; not recovered verbatim source.  
**Purpose:** Reconstructed implementation plan. Status is TODO; no repository write or implementation occurred during recovery.  
**Observed remote head:** `96e53a27be4ef96fb47f1a745480e0c5382640f2`  
**Last substantive research head:** `49cd5e1be7917bf14e89068afb4fa47cf78488fb`  
**Last fully reproduced receipt boundary:** `9b0d2f59567a7684b62df932c67b7a96050b605f`

This document does not assert that the described API is implemented, remotely certified at the current head, or ready to merge.


## Status

- Priority: P0/P1 architecture migration
- Status: **TODO / not started**
- Publication authority: **NONE**
- Research source: `49cd5e1be7917bf14e89068afb4fa47cf78488fb` plus this recovery package

## Objective

Extract only the invariant-owning core authorities from v0.3 internals while using official Effect platform/process services directly and preserving v0.3 characterization until the hard cut.

## Dependencies

- Maintainer approval of C2 architecture
- Fresh ancestry/scope check from `15c811bb9904142a33d119766b62082f3c689f13`
- Reproduction of the preserved ownership and compatibility laws

## Intended repository destinations

- `packages/effect-build/src/Author/Tool.ts`
- `packages/effect-build/src/Author/BorrowedOutput.ts`
- `packages/effect-build/src/Author/Executable.ts`
- `packages/effect-build/test/**`

## Scope

1. Freeze v0.3 runtime/declaration/error/lifecycle behavior as characterization fixtures.
2. Implement provider-neutral `Author/Tool` selection, version/capability policy, structured override warning, and no-fallback law.
3. Implement `Author/BorrowedOutput` for contained files/trees, cleanup-root claims, destination overlap, liveness, mutation/digest, and closure-owned acquisition.
4. Implement `Author/Executable` for same-parent staging, native/runtime inspection, optional digest, and atomic single-file commit.
5. Use Effect `Path`, `FileSystem`, `Command`/`CommandExecutor`, `Scope`, `Stream`, logging, and spans; keep process helpers private.
6. Define canonical observations/protocol compatibility vocabulary without implementing provider profiles yet.
7. Add in-memory tracing/logger tests and exporter-neutral annotations.

## Invariants

- No provider names/imports in core author implementation.
- No public duplicate process handle or command compiler factory.
- Planning/version rejection happens before output mutation.
- Borrowed authority expires deterministically and preserves exact callback Cause.
- Atomic rename is the only durable commit.
- No durable directory transaction or provenance claim.

## Required gates

- [ ] All ownership/compatibility/Cause/duplicate-core laws pass.
- [ ] Linux/macOS/Windows single-file publication and lock/cleanup tests pass.
- [ ] All supported Effect declaration endpoints compile.
- [ ] No production/export changes outside approved Plan 039 scope.
- [ ] Telemetry redaction and no-semantic-change laws pass.

## Stop conditions

- Official Effect process APIs cannot preserve child interruption/reaping without a second public handle.
- Borrowed containment/mutation cannot be implemented through platform-neutral Effect services.
- Any v0.3 behavior changes before the approved hard cut.
- Compatibility cannot reject known-bad/incapable tools before mutation.

## Completion record required

A future implementation PR must record exact parent/head SHAs, changed paths, successful job/run IDs, package/declaration endpoints, provider versions, receipts, behavior deltas, and remaining exceptions. A plan checkbox or local prose is not completion evidence.
