# Plan 043: publish canonical Node profiles, browser application role, and Node-source executable recipe

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

Implement the core profile protocols/adapters’ conformance harnesses, the canonical Node main pipeline, and the general browser discovery/rewrite contract.

## Dependencies

- Plan 039
- Provider adapters from Plans 040–042
- Node SEA adapter implementation

## Intended repository destinations

- `packages/effect-build/src/Profile/NodeMainProgram.ts`
- `packages/effect-build/src/Profile/NodeMainExecutable.ts`
- `packages/effect-build/src/Profile/BrowserModuleApplication.ts`
- `packages/effect-build/src/Recipe/NodeSourceExecutable.ts`
- `packages/*/src/Profile/**`
- `packages/*/test/profile-*.test.ts`

## Scope

1. Implement canonical protocol/version checks and observation types.
2. Implement `NodeMainProgram`, `NodeMainExecutable`, and `NodeSourceExecutable` recipe without provider selection.
3. Require canonical Node main identity, imports, Node target, producer/steps, scoped acquisition, expiry, and mutation/authentication checks.
4. Implement `BrowserModuleApplication` HTML/CSS/JS/asset discovery, mapping, rewrite, containment, source-map observations, and borrowed manifest.
5. Build provider-neutral law suites and provider-specific adapters.
6. Document incremental Node main as deferred unless a second supported product adapter is approved.

## Invariants

- Profile requests contain only role semantics.
- Providers preserve native errors/diagnostics and may expose richer native operations separately.
- Node main means main entry, not arbitrary importable module.
- Browser output is borrowed and browser-executed; no directory transaction.
- Recipe selects no provider and imports no sibling integration.

## Required gates

- [ ] Two independent adapters pass every published profile law or the profile is deferred/narrowed.
- [ ] Real Node execution and Node SEA assembly pass exact target/relation tests.
- [ ] Real Chromium/Firefox/WebKit browser fixtures cover dynamic chunks, nested CSS/assets, minify/maps.
- [ ] Packed declaration/runtime imports and protocol-skew failures pass.

## Stop conditions

- Any profile requires provider fallback or hidden project authority.
- A preserved application observation differs between adapters.
- Canonical Node main can be reconstructed only by ambient path guessing.
- Browser implementation relies on fixture-specific copying/injection.
- Directory atomicity or typed watch events become implicit requirements.

## Completion record required

A future implementation PR must record exact parent/head SHAs, changed paths, successful job/run IDs, package/declaration endpoints, provider versions, receipts, behavior deltas, and remaining exceptions. A plan checkbox or local prose is not completion evidence.
