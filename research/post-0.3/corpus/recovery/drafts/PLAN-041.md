# Plan 041: add permanent Bun API/Command lanes and profile adapters

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

Expose Bun native breadth, selected-command build/compile/watch behavior, and truthful Node-main/browser adapters without treating Bun executables as Node or runtime-neutral artifacts.

## Dependencies

- Plan 039
- Approved Bun compatibility policy
- Plan 043 browser contract may be developed in parallel but profile export waits for its laws

## Intended repository destinations

- `packages/effect-build-bun/src/Api.ts`
- `packages/effect-build-bun/src/Command.ts`
- `packages/effect-build-bun/src/Profile/NodeMainProgram.ts`
- `packages/effect-build-bun/src/Profile/BrowserModuleApplication.ts`
- `packages/effect-build-bun/test/**`

## Scope

1. Expose `Bun.build()` native request/result/plugins/outputs/diagnostics, including compile mode.
2. Expose selected-command build/compile/matrix operations with exact executable/version and Bun target/runtime semantics.
3. Expose provider-native raw command watch through scoped Effect process streams/exit/kill/reap only.
4. Implement Bun `NodeMainProgram` adapter.
5. Implement Bun `BrowserModuleApplication` adapter only against the general discovery/rewrite contract.
6. Maintain independent API and command compatibility policies/declaration tests.

## Invariants

- No API↔command fallback.
- Bun-runtime executable identity is explicit.
- No typed rebuild/readiness protocol derived from terminal output.
- Compile matrix cells commit independently and report partial committed results.
- Native plugins/options remain available even when profiles exclude them.

## Required gates

- [ ] Host/API and command version matrix passes with exact observations.
- [ ] Node main and browser real-execution/profile laws pass.
- [ ] Command interruption terminates/reaps child on all supported platforms.
- [ ] Bun compile artifacts are runtime/target inspected before durable commit.

## Stop conditions

- API cancellation/rollback would need to be invented.
- Bun executable is projected as generic or Node runtime.
- Watch correctness depends on parsing unstable human text.
- Browser adapter uses fixture-specific recursive copy or markup injection.

## Completion record required

A future implementation PR must record exact parent/head SHAs, changed paths, successful job/run IDs, package/declaration endpoints, provider versions, receipts, behavior deltas, and remaining exceptions. A plan checkbox or local prose is not completion evidence.
