# Plan 042: add permanent Deno bundle/compile command lanes and refresh the experimental API lane

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

Implement Deno against current official bundle/compile contracts, explicitly version experimental API/CLI behavior, and preserve project/permission/runtime distinctions.

## Dependencies

- Plan 039
- Current official Deno bundle/API/compile review
- Plan 043 browser contract for the portable adapter

## Intended repository destinations

- `packages/effect-build-deno/src/Api.ts`
- `packages/effect-build-deno/src/Command.ts`
- `packages/effect-build-deno/src/Profile/BrowserModuleApplication.ts`
- `packages/effect-build-deno/test/**`

## Scope

1. Refresh isolated Deno bundle API declarations and unstable-capability checks against every supported host endpoint.
2. Expose current experimental `Deno.bundle()` natively where admitted; do not assume the 2.9 compiled-host absence is timeless.
3. Expose selected-command bundle, compile, matrix, and raw watch with project/config/includes/workers/runtime acquisition and diagnostics.
4. Implement Deno `BrowserModuleApplication` adapter using the general graph algorithm.
5. Define permission behavior from observed current operations; never promise failures solely from declaration comments.
6. Define strict API/command compatibility policies with experimental/remediation warnings.

## Invariants

- No automatic unstable-flag enablement, permission grant, runtime download, or hidden fallback unless the native command itself owns and reports it.
- Deno executable identity remains Deno-specific.
- Current official API/CLI and historical branch observations are version-qualified.
- No typed portable watch events.

## Required gates

- [ ] Oldest/current/newest host and command cells pass, including API presence/absence and declaration imports.
- [ ] Read/write/permission behavior is probed explicitly.
- [ ] Compile runtime/target/acquisition behavior and interruption are tested.
- [ ] Browser profile passes real-browser graph/asset/source-map tests.

## Stop conditions

- The package cannot state which unstable API/CLI versions it supports.
- Permission or acquisition behavior must be fabricated or silently altered.
- The browser adapter cannot preserve discovered resources/references.
- API and command would silently substitute for one another.

## Completion record required

A future implementation PR must record exact parent/head SHAs, changed paths, successful job/run IDs, package/declaration endpoints, provider versions, receipts, behavior deltas, and remaining exceptions. A plan checkbox or local prose is not completion evidence.
