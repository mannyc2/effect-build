# `effect-build` post-0.3 research synthesis

## Status

This package synthesizes four read-only research archives supplied on 2026-08-17. It is an architecture decision aid, not recovered source, implementation, certification, merge authority, or release authority.

The exact live GitHub state observed during synthesis was:

| Item | Observation |
|---|---|
| Repository | `mannyc2/effect-build` |
| Draft PR | `#4`, open, draft, unmerged |
| Research branch/head | `codex/post-0.3-native-capability-architecture` at `96e53a27be4ef96fb47f1a745480e0c5382640f2` |
| Base/head | `codex/granular-integration-program` at `15c811bb9904142a33d119766b62082f3c689f13` |
| Ordinary PR CI | run `31990684160`, failure |
| Architecture PR research | run `31990684158`, failure |
| Exact-head architecture receipt | none |
| Exact-head durable artifact | source export only, artifact `9275193303` |
| Production/package files in PR diff | none; changed paths are `.github`, `plans`, and `research` |
| Plan 039 | `TODO`; publication authority `NONE` |

## Executive decision

The research supports **C2 as the macro-architecture**, but it does not support the exact C2 contract graph or the previously claimed set of accepted 0.4 profiles.

The defensible architecture is:

```text
provider-native semantics as the permanent baseline
  + finite role-specific capabilities when their laws are coherent
  + official Effect lifecycle and process primitives
  + narrowly shared ownership/publication machinery
  + ordinary Effect composition
  + provider-owned operation-specific compatibility
```

Five corrections are required:

1. **Provider-native semantics remain the product foundation.** Profiles are additive and cannot demote native behavior. Broader public `Api` and `Command` namespaces are only an architectural candidate: the governing workspace instruction for this synthesis authorizes one provider-selected public operation, `compileExecutable`, and the dedicated provider-breadth study was not supplied. The live PR head contains an older, different `AGENTS.md`; that authority mismatch must be reconciled before implementation.
2. **The current `NodeMain` representation is too weak.** Replace the bag of `resolutionTarget`, external-import observations, path/format, and steps with an opaque, profile-specific sealed main capability negotiated against semantic assembler terms. Its initial SEA profile should exclude unrepresentable load/resource states rather than merely record them.
3. **Withdraw the broad `BrowserModuleApplication` claim.** The strongest candidate is a narrower `BrowserModulePayload`: explicit browser-module entries, provider-owned graph construction and rewriting, caller-owned HTML, bounded output associations, and one borrowed output snapshot. It remains semantically proposed, not portable-demonstrated.
4. **Use Effect directly for process, Scope, streams, and telemetry.** Reject public `Author/Command`, `Author/CommandCompiler`, and a universal `SourceLocator`. `Tool`, borrowed-output authority, and single-file executable publication have plausible distinct invariants, but the exact public author contracts remain unresolved.
5. **Do not turn observability into correctness.** Raw watch process facts, provider graphs, source maps, durable provenance, and OpenTelemetry are separate information classes.

## Most important evidence boundary

The current PR head is not green or certified. Older receipts remain useful only for their exact source SHA, versions, fixtures, hosts, and assertions. Expected-conclusion JSON, test source, workflow names, and PR prose are not execution receipts.

The synthesis therefore uses these status terms:

- `semantically-proposed`: coherent law and falsifiers, no adapter conformance claim;
- `provider-demonstrated`: one exact provider/version passed the complete role matrix;
- `portable-demonstrated`: at least two providers passed one unchanged role law;
- `release-approved`: maintainer accepted the compatibility commitment and release scope;
- `implemented`: production source and exports exist;
- `exact-head-certified`: fail-closed receipts certify one exact implementation SHA.

Adoption is deliberately absent from this status chain. Existing consumers affect priority, not semantic validity.

## Package contents

- `INPUT-AND-METHOD.md` — archive integrity, evidence hierarchy, and known source defects.
- `LIVE-GITHUB-STATE.json` — live GitHub observation used by this synthesis.
- `ARCHITECTURE-SYNTHESIS.md` — candidate comparison and recommended target machine.
- `NODE-CANON-DECISION.md` — corrected Node main and SEA composition model.
- `BROWSER-ROLE-DECISION.md` — corrected browser role and ownership law.
- `LIFECYCLE-AND-OBSERVABILITY-DECISION.md` — Effect shapes, primitive rent, watch, source traces, and provenance.
- `PUBLIC-API-DECISION-MATRIX.md` — exact disposition of proposed surfaces without pretending exports are final.
- `SEMANTIC-COMPRESSION-LEDGER.md` — state-space reductions and explicit non-claims about source size.
- `CONTRADICTIONS-AND-EVIDENCE-LIMITS.md` — disagreements, stale claims, and prohibited overclaims.
- `DECISIONS-AND-GATES.md` — maintainer decisions, missing research, and future execution gates.
- `EVIDENCE-LEDGER.json` — machine-readable material conclusions and sources.
- `SOURCE-BIBLIOGRAPHY.md` — primary sources and input coordinates.
- `NEXT-AGENT-BRIEF.md` — bounded documentation-only handoff.
- `inputs/` — byte-identical copies of all four supplied research archives, so a fresh session needs only this package.
- `manifest.sha256` — hashes of every other package member.

## Authority

No GitHub mutation, workflow dispatch, implementation, package change, merge, tag, release, or publication was performed during synthesis.
