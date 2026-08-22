# Plan 044: perform the approved 0.4 hard cut and exact-head certification

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

Apply the maintainer-approved export/naming/versioning cut, remove obsolete surfaces without accidental dual implementations, and produce exact-head multi-platform certification before any release action.

## Dependencies

- Plans 039–043 complete with receipts
- Maintainer decisions recorded
- Fresh remote-head/scope check

## Intended repository destinations

- `packages/*/package.json`
- `packages/*/src/index.ts`
- `tooling/public-api.json`
- `docs/**`
- `.github/workflows/**`
- `research/post-0.3/certification/**`

## Scope

1. Update production export maps and package roots to approved explicit subpaths.
2. Remove or migrate `Integration`, `Provider`, `JavaScriptBundle.Artifact`, `withJavaScriptBundle`, ambiguous Compiler services, and rejected proposed paths according to the approved compatibility policy.
3. Regenerate public API/declaration fixtures and docs.
4. Run full provider/version/OS/browser/packed-consumer matrices.
5. Run repository-scope, release-line ancestry, and fresh remote-head certifiers.
6. Generate exact-head `certification.json` and a PR body from machine-readable results.
7. Keep publication/tag/release as a separate maintainer-authorized workflow.

## Invariants

- No legacy and new implementation may coexist as diverging sources of truth.
- Every export has declaration/runtime import tests from packed packages.
- All required receipts match one exact source SHA.
- No source/archive/toolchain cache substitutes for a receipt.
- Certification never grants release authority.

## Required gates

- [ ] All required CI jobs succeed at exact head on Linux/macOS/Windows and browser matrix.
- [ ] No skipped required matrix cells; artifact digests and job IDs recorded.
- [ ] Scope diff contains only approved production/docs/tests/workflows.
- [ ] Remote branch/PR head remains equal to certified SHA at aggregate time.
- [ ] Maintainer reviews migration/versioning/release cadence decisions.

## Stop conditions

- Remote head moves during certification.
- A required provider/OS/browser cell is skipped or unavailable.
- Public API differs from approved contract or packed declarations.
- Any publication/tag/release credential or workflow change is bundled without separate authority.
- The hard cut requires retaining ambiguous aliases contrary to the selected policy.

## Completion record required

A future implementation PR must record exact parent/head SHAs, changed paths, successful job/run IDs, package/declaration endpoints, provider versions, receipts, behavior deltas, and remaining exceptions. A plan checkbox or local prose is not completion evidence.
