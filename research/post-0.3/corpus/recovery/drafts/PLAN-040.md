# Plan 040: expose the permanent Esbuild API lane and Node-main adapter

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

Publish faithful Esbuild build/transform/context capabilities and implement only the Node-main profile projection proven by the role laws.

## Dependencies

- Plan 039 core invariants
- Pinned oldest/current Esbuild package declarations and real versions

## Intended repository destinations

- `packages/effect-build-esbuild/src/Api.ts`
- `packages/effect-build-esbuild/src/Profile/NodeMainProgram.ts`
- `packages/effect-build-esbuild/test/**`

## Scope

1. Expose native `build` and `transform` requests/results/diagnostics without narrowing options to the profile.
2. Expose scoped context with rebuild, watch, serve, cancel, and dispose under official lifecycle semantics.
3. Implement Esbuild `NodeMainProgram` adapter with authenticated borrowed bytes/file, import observations, target/format validation, and exact native error retention.
4. Implement provider-owned operation compatibility policies and declaration endpoint tests.
5. Preserve native direct-write partial-outcome semantics; prefer memory output for the portable adapter where truthful.

## Invariants

- No command executable selection in the Esbuild API package.
- Context cannot escape Scope with valid authority.
- Node-main adapter promises direct-main semantics only.
- Plugins/metafiles remain native values; no universal graph.

## Required gates

- [ ] Oldest/current/newest compatibility cells and negative capability/version cells pass.
- [ ] Build, transform, context rebuild/watch/serve/cancel/dispose execute against real Esbuild.
- [ ] Node-main substitution, expiry, mutation, imports, and Cause laws pass.
- [ ] Packed imports and independent provider/core version consumer pass.

## Stop conditions

- Adapter requires erasing a provider distinction that affects main execution.
- One-shot and context cancellation cannot be stated separately.
- Direct-write behavior would be mislabeled transactional.

## Completion record required

A future implementation PR must record exact parent/head SHAs, changed paths, successful job/run IDs, package/declaration endpoints, provider versions, receipts, behavior deltas, and remaining exceptions. A plan checkbox or local prose is not completion evidence.
