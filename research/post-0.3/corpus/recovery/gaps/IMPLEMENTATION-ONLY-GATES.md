# Implementation-only gates

**Status:** reconstructed documentation; not recovered verbatim source.  
**Purpose:** Define work that cannot be completed by architecture recovery and must be satisfied by a future coding/certification effort.  
**Observed remote head:** `96e53a27be4ef96fb47f1a745480e0c5382640f2`  
**Last substantive research head:** `49cd5e1be7917bf14e89068afb4fa47cf78488fb`  
**Last fully reproduced receipt boundary:** `9b0d2f59567a7684b62df932c67b7a96050b605f`

This document does not assert that the described API is implemented, remotely certified at the current head, or ready to merge.


## Gate group 1 — authority and scope

- [ ] Maintainer approves Candidate C2 and the exact public subpaths.
- [ ] Implementation branch descends from `15c811bb9904142a33d119766b62082f3c689f13` and released source `f06f96ca88b6278e5f23a898d758b99fa9322108`.
- [ ] Fresh diff proves approved production/export scope before coding begins.
- [ ] Plans 039–044 are assigned explicit implementation authority in order.
- [ ] No closure transport payload is applied as trusted source; implementation is recreated from reviewed specifications.

## Gate group 2 — core implementation

- [ ] `Author/Tool` implements exact selection/version/capability/compatibility/no-fallback.
- [ ] `Author/BorrowedOutput` implements roots, containment, overlap, liveness, mutation/digest, closure authority, cleanup/Cause laws.
- [ ] `Author/Executable` implements same-parent staging, file/native/runtime inspection, digest, atomic commit.
- [ ] Official Effect platform/process APIs are used directly; no duplicate public process wrapper.
- [ ] All supported Effect endpoints compile and law tests execute remotely.

## Gate group 3 — provider-native breadth

- [ ] Bun API and selected-command requests/results/diagnostics/watch/compile are implemented without profile narrowing.
- [ ] Deno current experimental API/CLI and compile behavior are version-qualified and implemented without hidden grants/fallbacks.
- [ ] Esbuild build/transform/context/rebuild/watch/serve/cancel/dispose are exposed faithfully.
- [ ] Node SEA current CJS/ESM/assets/version-relation behavior is explicitly scoped.
- [ ] Every lane has complete compatibility policy, capability probes, declarations, and matrix maintenance.

## Gate group 4 — profiles and recipes

- [ ] Canonical `NodeMain` carries every required identity/target/import/producer/step/lifetime observation.
- [ ] Bun and Esbuild pass the Node-main law, including direct execution and importable-module falsifier.
- [ ] Node SEA passes authenticated assembly and builder/base relation tests; any second adapter is product-approved and pre-provisioned.
- [ ] `NodeSourceExecutable` selects no provider and keeps borrowed main within producer lifetime.
- [ ] Browser profile implements structural discovery, nested CSS/assets, dynamic chunks, rewrite, containment, maps, and borrowed manifest.
- [ ] Real browsers pass minified/unminified/source-map fixtures.
- [ ] Incremental profile remains deferred or gains two approved adapters and complete laws.

## Gate group 5 — lifecycle/platform behavior

- [ ] Child interruption/termination/force-kill/reaping passes on supported OSes.
- [ ] stdout/stderr backpressure and exit observation are tested.
- [ ] Direct multi-output partial outcomes are documented/tested.
- [ ] Matrices report committed cells and never claim transactionality.
- [ ] Linux/macOS/Windows executable staging, locks, replacement, cleanup, and native inspection pass.
- [ ] Future signing/mutation produces a new artifact and preserves original observation.

## Gate group 6 — packaging/public compatibility

- [ ] Runtime and declaration import tests cover every explicit subpath from packed packages.
- [ ] Package roots are discovery facades if approved; no hidden duplicate implementation.
- [ ] Bounded provider peer ranges and independent-version consumers pass.
- [ ] Protocol skew, duplicate-core, oldest/newest Effect endpoint, and no-runtime-host imports pass.
- [ ] 0.3 migration/removal policy is implemented exactly as approved.

## Gate group 7 — exact-head certification

- [ ] All receipts match one exact implementation head.
- [ ] Required provider/version/OS/browser jobs are successful, not skipped.
- [ ] Repository-scope and release ancestry certifiers pass.
- [ ] Fresh remote PR/branch head equals certified SHA at aggregate time.
- [ ] Aggregate `certification.json` records jobs/artifacts/digests/claims and passes fail-closed checks.
- [ ] Final PR body is generated/updated from exact evidence, not copied from stale prose.

## Gate group 8 — release separation

- [ ] Maintainer separately approves versions, changelog/migration text, release cadence, trusted publishing, tags, and GitHub Release.
- [ ] Certification workflow has no implicit publication authority.
- [ ] No package publication occurs merely because implementation/certification succeeds.
