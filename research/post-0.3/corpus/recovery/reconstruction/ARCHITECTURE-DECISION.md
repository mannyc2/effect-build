# Architecture decision

**Status:** reconstructed documentation; not recovered verbatim source.  
**Purpose:** Recover the evidence-backed decision, compare genuinely different candidates, and state the recommendation without converting repository prose into execution evidence.  
**Observed remote head:** `96e53a27be4ef96fb47f1a745480e0c5382640f2`  
**Last substantive research head:** `49cd5e1be7917bf14e89068afb4fa47cf78488fb`  
**Last fully reproduced receipt boundary:** `9b0d2f59567a7684b62df932c67b7a96050b605f`

This document does not assert that the described API is implemented, remotely certified at the current head, or ready to merge.


## Governing rule

> Existing consumers affect product priority, not architectural validity. Architectural validity depends on coherent laws, honest failures, clear ownership, truthful substitution, and reduced invalid state.

That rule is a **prescriptive reconstruction** of the user-supplied governing principle. It agrees with the branch's revised evidence rule, which explicitly separated architectural validity from current adoption.

> **Provenance:** `PRESCRIPTIVE-RECOMMENDATION` · recommendation · confidence **high** · user-provided governing principle plus PR #4 body


## Decision

Recommend **Candidate 2 / C2: permanent provider-native surfaces plus role-specific profiles and ordinary Effect recipes**.

```text
permanent provider-native Effect APIs
  + explicit host-API and selected-command lanes
  + a small invariant-owning author core
  + durable output observations
  + law-tested portable role profiles
  + provider-neutral recipes
  + provider-owned compatibility policies
```

The recommendation is not based on adopter count. It is based on the remotely exercised findings that three useful roles survived falsification—Node main production, Node main assembly, and a narrowed browser module application—while broader runtime-neutral executable, generic declaration-set, broad static-web, and typed portable watch-event contracts did not.

> **Provenance:** `REMOTE-EXECUTED` · observation · confidence **high** · Actions runs 31971764975 and 31971767617; preserved receipts at evidence/receipts/run-31971764975 and run-31971767617


> **Provenance:** `PRESCRIPTIVE-RECOMMENDATION` · recommendation · confidence **high** · https://github.com/mannyc2/effect-build/blob/49cd5e1be7917bf14e89068afb4fa47cf78488fb/plans/POST-0.3-NATIVE-CAPABILITY-ARCHITECTURE.md#L22-L120


## Candidate comparison

| Candidate | Concepts introduced | Canonical representations | Invalid states representable | Provider semantics | Ownership/public commitment | Extension path | Evidence verdict |
|---|---|---|---|---|---|---|---|
| **1. Provider-native only** | Provider packages, `Api`, `Command` | Native request/result/handle and selected command | Low inside each provider; applications duplicate provider choice and composition | Preserved maximally | Lowest common-profile commitment; provider APIs still permanent commitments | Add provider operations directly | Semantically sound, but loses proven substitution opportunities |
| **2. Provider-native + profiles + recipes** | Candidate 1 plus finite role protocols, borrowed outputs, durable artifacts, recipes | Native values remain native; portable values use role-specific canonical contracts | Moderate and bounded by profile laws; invalid provider-specific requests are excluded from profiles | Preserved on direct surfaces; intentionally projected only inside a role | Explicit borrowed/durable ownership; profile protocols become public compatibility commitments | Add a profile only after law/falsifier evidence; otherwise add native capability | **Recommended**; best evidence/complexity balance |
| **3. General transformation/executable algebra** | Generic nodes, transformations, executors, artifact graph, event model, perhaps cache/provenance | One generalized graph/value algebra | High: meaningless transformations, incompatible target/runtime combinations, false transactionality, ambiguous ownership | Commonly erased or pushed into escape hatches | Highest lifecycle, serialization, compatibility, and extension commitment | Every provider feature must be encoded in the algebra | Not justified; Effect already supplies composition and provider domains do not share one honest algebra |

### Candidate 1: provider-native-only surfaces

**Strengths.** It preserves every provider request/result distinction, has the smallest public ontology, and avoids premature cross-provider promises. It remains the correct fallback whenever a portable law is not demonstrated.

**Why it is not selected alone.** Remote receipts show that Bun and Esbuild can satisfy one Node-main-entry role, Node SEA and the research `pkg` topology can satisfy one already-bundled Node-main assembly role, and Bun/Deno can satisfy a narrowed HTML module application role. Requiring a consumer to name a provider when it depends only on one of those demonstrated roles is unnecessary coupling.

> **Provenance:** `REMOTE-EXECUTED` · observation · confidence **high** · existing-provider-research.json, external-provider-research.json, profile-refinement.json in the preserved 9b0d receipt sets


### Candidate 2: native surfaces plus role profiles and recipes

**Key constraint.** Profiles are additive projections, never a “preferred high-level tier” that deprecates or narrows native modules. A provider can be complete while implementing zero profiles.

**Why it wins.** The profile boundary is finite and falsifiable: request domain, output domain, runtime/target meaning, ownership, failure normalization, and substitutability observations must be enumerated. The recipe remains ordinary Effect composition rather than a new build-plan language.

### Candidate 3: generalized transformation/executable algebra

A generalized algebra would have to represent provider plugins, project authority, runtime acquisition, HTML graphs, declarations, native executable assembly, watch sessions, direct writes, matrices, and future signing. The resulting graph would admit combinations with no provider meaning, such as runtime-neutral executables whose embedded runtime is not neutral, atomic multi-output publication without a commit protocol, or typed watch events derived from human terminal text.

> **Provenance:** `FALSIFIED` · observation · confidence **high** · preserved claims runtime-neutral-executable, broad-static-web, declaration-output-set, and portable-command-watch-events


Effect already supplies Effects, services, Layers, Scope, Stream, and ordinary functional composition. A second transformation algebra adds compatibility rent without a new demonstrated invariant.

> **Provenance:** `OFFICIAL-UPSTREAM-CONTRACT` · observation · confidence **high** · Effect Effect/Scope/Stream/Context documentation listed in evidence/UPSTREAM-SOURCES.md


## Permanent provider-native policy

A provider-native surface is a long-lived product surface, not a temporary escape hatch:

- `Api` preserves an official in-process API in the current host, including native request/result types, callbacks, plugins, diagnostics, and scoped handles. It does not fall back to a command.
- `Command` invokes exactly one selected executable through Effect process services. It preserves command/project/config authority, selected-tool identity, stdout/stderr/exit behavior, and command interruption. It does not fall back to an API or sibling provider.
- Provider options, diagnostics, project authority, cancellation, direct writes, and watch behavior must not be normalized merely because two outputs have similar file shapes.

> **Provenance:** `REPOSITORY-DOCUMENTED` · observation · confidence **high** · https://github.com/mannyc2/effect-build/blob/49cd5e1be7917bf14e89068afb4fa47cf78488fb/plans/POST-0.3-NATIVE-CAPABILITY-ARCHITECTURE.md#L84-L120


## What the missing consolidation was apparently trying to express

The truncated patch and path-triggered workflow show that the missing closure intended to consolidate, compile, regenerate, certify, and commit a canonical graph under `research/post-0.3/canonical/**`, update the research workflow, and revise Plan 039. The recoverable bytes do **not** reveal the complete canonical contracts or all affected paths. The architecture in this package therefore derives from the pushed plans, prototypes, receipts, later expected-conclusion files, and current upstream contracts—not from an invented continuation of the missing patch.

> **Provenance:** `RECONSTRUCTED-INFERENCE` · inference · confidence **medium** · evidence/recovered-part-00/partial-closure.patch plus the apply workflow at 11617dd…


## Decision boundaries

This decision does not establish:

- a production implementation or export map;
- current-head TypeScript correctness;
- exact-head Linux/Windows/aggregate certification;
- a transactional directory artifact;
- a portable watch event protocol;
- a universal signing profile;
- support for every version between two exercised boundary points;
- a general browser discovery/rewrite implementation.

Those boundaries are implementation or evidence gates, not footnotes.
