# Contradictions and evidence evolution

**Status:** reconstructed documentation; not recovered verbatim source.  
**Purpose:** Record conflicting source coordinates, distinguish genuine contradiction from versioned evolution, and state the resolution rule.  
**Observed remote head:** `96e53a27be4ef96fb47f1a745480e0c5382640f2`  
**Last substantive research head:** `49cd5e1be7917bf14e89068afb4fa47cf78488fb`  
**Last fully reproduced receipt boundary:** `9b0d2f59567a7684b62df932c67b7a96050b605f`

This document does not assert that the described API is implemented, remotely certified at the current head, or ready to merge.


## Resolution rule

Prefer, in order:

1. exact remote execution at the exact source/version being discussed;
2. exact remote compilation for type-level claims;
3. current official upstream contract for current capability claims;
4. immutable repository source at a named SHA for design intent;
5. transparent reconstruction;
6. local/unpublished prose only as an unverified lead.

A newer source does not retroactively change what an older version did; it changes current product design requirements.

## Register

| Topic | Source A | Source B | Classification | Resolution |
|---|---|---|---|---|
| “Final research head” | PR body says `af4887c36753a82c3c97fafc54b3c368cd98b34d` | Live branch/PR head is `96e53a27be4ef96fb47f1a745480e0c5382640f2`; substantive evidence continues to `49cd5e1be7917bf14e89068afb4fa47cf78488fb` | Genuine stale metadata | Use live head for state, 49cd for last substantive, 9b0d for receipt boundary |
| “Final certification” | Commit/prose names use “certify/final” | 49cd job failed TypeScript and emitted no receipt; current checks fail | Genuine evidence conflict | Never infer certification from names/prose |
| Provider-native command watch | Earlier selected architecture text said no Bun/Deno `Command.watch` ships in 0.4 | Later watch prototype/expected claim preserves raw scoped process watch | Design evolution, not semantic contradiction | Raw provider watch can be permanent; no typed portable events; re-execute before shipping |
| Portable typed watch events | Rebuilds occurred for Bun/Deno | No machine-readable protocol existed | Apparent success versus semantic falsifier | Raw process behavior passed; typed event profile failed |
| Deno bundle API in compiled executables | Deno 2.9.3 probe reported `Deno.bundle` absent | Current official Deno docs expose experimental `Deno.bundle()` and `deno bundle` | Versioned upstream evolution | Preserve historical receipt; design current API lane from current official/versioned probes |
| Deno permission comments | Declarations/comments described permission authority | 2.9.3/2.9.5 probes read/wrote locally without explicit grants | Contract-comment versus observed behavior | Do not invent a failure contract; probe exact supported versions and document upstream semantics |
| Node SEA main format | Branch profile evidence centered on one already-bundled CJS-style main | Current Node 26 docs support CJS and ESM `mainFormat` | Upstream evolution/scope expansion | Keep proven subset; add ESM only through new exact evidence |
| Node builder/base mismatch | Builder accepted mismatched base | Produced executable did not run; current docs require matching binary version | Validation acceptance versus product validity | Enforce equality before mutation; no override |
| Version “ranges” | Boundary versions passed | Intervening/prerelease versions were not all executed | Overclaim risk | Record exact points; ranges are explicit provider policy with maintained matrices/holes |
| Browser application | Narrow module-reachable fixtures passed | Broad top-level stylesheet fixture failed; general rewrite algorithm absent | Contract narrowing | Publish only after general discovery/rewrite/browser gates; never call fixture copying general |
| Plans 039–044 status | Files exist and contain detailed steps | Every plan says TODO/no publication authority; user states Plan 039 not started | No contradiction after status qualification | Treat as planning only |
| Production scope | PR prose says no production/export changes | No final base-to-current scope certificate survived | Evidence gap, not observed contradiction | Current source snapshots support the claim, but future certifier must prove exact diff |

## Important non-contradiction: validity versus priority

A profile can be architecturally valid but deferred. The incremental Node-main probe is the key example: Esbuild and Rolldown lifecycle/output laws conformed, while the absence of a Rolldown product package made it lower priority for 0.4. Treating “no adopter/package” as a semantic falsifier would contradict the governing rule.

> **Provenance:** `REMOTE-EXECUTED` · observation · confidence **high** · external-provider-research receipt at 9b0d

