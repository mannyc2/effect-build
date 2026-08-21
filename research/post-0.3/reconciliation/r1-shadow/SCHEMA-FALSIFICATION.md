# Schema falsification report — shadow synthesis

Date: 2026-08-20.
Status: **blind shadow synthesis work product.** Produced without inspecting the primary
synthesis. Not canon, not a decision record, not an authorization.

Hypothesis under test (from `RECONCILIATION.md` §1):

```text
semantic identity = provider / operation / lane / lifecycle
                    / {resource-result, output-publication}

evidence coordinate = provider-implementation-identity
                      × host × requested-target × non-semantic-option-mode
                      × evaluation-phase
```

This report records every falsification attempt run against the five frozen provider
supplements plus the original 54-row inventory and 35-row matrix, and the verdict.

## 1. Collision search: two operations sharing a key with different laws

Search: any two rows in the shadow canon (`CANONICAL-OPERATIONS.csv`) sharing the complete
key while differing in authority, failure, cancellation, or result law.

**Result: no surviving collision.** Three apparent collisions were found and each resolved:

- **F1 — Bun command compile (OP-BUN-012 vs OP-BUN-013).** The Bun supplement carries two
  rows sharing `bun / compile-executable / selected-command / one-shot / {caller-owned-value, …}`
  and differing only in publication (`provider-direct-durable` vs `atomic-published-durable`).
  Formally the pair differs inside the key, so it is not a literal collision — but the
  difference is not a provider fact. It is the effect-build wrapper's staging policy. The same
  latent ambiguity appears with opposite resolutions in the other supplements: Deno and Node
  SEA folded the wrapper's atomic publication *into* the provider-native row, while esbuild and
  Rolldown recorded only provider-native publication. Five supplements, three different
  conventions. This is the schema's one genuine soft spot: **the publication half of the
  ownership pair is ambiguous between "what the provider does" and "what the product
  promises."** See amendment A1.
- **F2 — Deno compile atomicity.** `DENO-OP-010/011` label the *native* `deno compile` and
  `compile --watch` as `atomic-published-durable`. The supplement's own atomic claims support
  atomicity only for the denort *cache* write (DENO-CL-041), not the output executable
  (DENO-CL-047 stops at "steps occur before publication"). This is an
  evidence-coordinate-to-guarantee conversion, exactly the failure mode the mandate asks to
  hunt. Corrected in the shadow canon (MSD-02); a falsifier probe (interrupt `deno compile`
  mid-write and inspect the destination) is queued.
- **F3 — esbuild `build-direct-write` in two lanes.** Same operation name, same lifecycle,
  same ownership pair in `in-process-api` and `selected-command`. Not a collision: lane is in
  the key, and the lanes genuinely differ in authority (callbacks/plugins vs selected binary,
  cwd/env), diagnostics (structured `Message[]` vs human bytes), and identity model
  (five-component package identity vs content digest of the selected file). The key handled
  this correctly.

## 2. Splits driven only by non-semantic modes

- **F4 — Bun HTML/full-stack/standalone rows.** `RECONCILIATION.md` §3's provisional
  crosswalk lists seven HTML/full-stack identities
  (`html-bundle-memory`, `html-bundle-direct-write` ×2 lanes, `full-stack-html-executable` ×2
  lanes, plus implied standalone). The Bun supplement's atomic decomposition
  (C-BUN-066..077) shows an HTML or full-stack entry changes the graph root and the result
  composition but **no identity-bearing law** (authority, lifecycle, ownership, publication,
  failure). The shadow canon therefore demotes them to request modes (MSD-12). The crosswalk
  over-split. Falsifier queued: if HTML mode exhibits a distinct partial-output law, the mode
  is re-promoted.
- **Bun compile memory/direct-write candidate splits** in §3 are dropped: no memory result
  mode for compile is evidenced anywhere (implicit-or-explicit `outfile` always; MSD-07).
- Bun `scan` vs `scanImports` was tested as a candidate over-split and retained: the
  documented accuracy/speed tradeoff and different result surfaces are a result-law
  distinction (MSD-26).

## 3. Modes that must be operations (correctly promoted)

Confirmed promotions, all forced by lifecycle or publication changes:

- esbuild `--watch`/`--serve` argv modifiers → scoped-process operations (MSD-15).
- esbuild `write:true` with no destination → the rejected `build-host-stdout` identity with
  `{none, none}` ownership — a mode the imported inventory and the provisional crosswalk both
  miss entirely (MSD-14).
- Deno `--declaration` on bundle → operation (new failure class + distinct durable topology);
  `--check` correctly stays a sub-operation (MSD-05).
- Rolldown `generate` vs `write` → handle-bound operations, because Rolldown selects
  publication **per call**, not per handle. This is the one place the key needed a
  clarification rather than a new dimension: see amendment A2.

## 4. Provider primitives vs portable roles

No confusion survived into the shadow canon: all portable roles (NodeMainProgram,
BrowserModulePayload, BunRuntimeExecutable, IncrementalNodeMain, SourceTransform/ImportScan,
HTMLResourceGraph) are held as proof-program candidates outside the operation table (MSD-25).
The falsified roles (RuntimeExecutable, CLI-text TypedWatchEvents) remain falsified. One
supplement-level slip was corrected: the Bun supplement recorded `compileExecutable`'s current
enumerated-target adapter as an operation *contract* fact; the shadow canon records the
role-flavored parts (BunRuntimeExecutable) in the role register only.

## 5. Internal sub-operations promoted to public operations

- Rolldown `close-reusable-build`, `close-watch-session`, `close-dev-engine` were operations in
  the supplement; the shadow canon demotes all three to release sub-operations — a release is
  the boundary of its owner's lifecycle, not an operation (MSD-06).
- Node SEA `generate-preparation-blob` was tested for demotion and retained as an operation
  with internal visibility: it is a separately invoked provider command with its own
  participants and relations (MSD-27).
- Deno denort acquisition and the esbuild package-owned native child both stayed
  non-operations (MSD-19, MSD-16).

## 6. API and command lanes

No supplement merged API and command lanes. All four merged `API/command` rows in the original
inventory (B07, B08, B09, B10, D06) are resolved by lane splits or mode demotions in the
shadow canon. The lane-mismatch structural holes (esbuild CLI has no rebuild API; plugins have
no command form; `*Sync` absent on two hosts) are encoded as holes, not version failures.

## 7. Provider semantics erased by generic names

- The three-axis "target" problem (esbuild syntax targets vs Bun OS/arch/libc/CPU tuples vs
  Node SEA base-executable coupling vs Deno target triples) is preserved by keeping target
  vocabulary provider-local in `request_authority`/`host_target_relations` (SC-E-30, SC-B-27/28,
  SC-D-19, SC-S-20).
- Generic operation names (`build`, `compile-executable`) are safe because provider is in the
  key; result schemas are all provider-verbatim.

## 8. Evidence silently converted into support

Found and corrected:

- Deno native compile atomicity (F2 above).
- The Deno supplement's six advertised target triples are labeled *advertised capability*,
  never support (EC-DEN-TARGETS).
- The Bun supplement's `compatibility_commitment: source-exact-v1.3.14` label reads like a
  commitment but is a provenance statement; the shadow canon renames all such values into
  `uncommitted`/`observed-not-admitted`/`current-pin-acceptance` forms.
- Upstream CI platform coverage (Node SEA) and upstream-declared-support matrix rows
  (CM-31..35) are carried as `upstream-surface-only`.

## 9. Illegal states still representable

Three found:

- **F5 — `{long-lived-handle, one-shot}` pairing.** The Bun supplement's
  `create-transpiler / one-shot / {long-lived-handle, none}` is expressible under the schema
  but incoherent: a long-lived handle implies a release law and one-shot has none, and the
  object declares no release. Amendment A3 adds the constraint; the shadow canon reclassifies
  such objects as `caller-owned-value` reusable configured objects (MSD-09).
- **F6 — mode-dependent publication.** Rolldown DevEngine's publication depends on configured
  callbacks; the supplement invented `mixed-configured`, which the closed vocabulary rightly
  refuses. The schema's correct behavior is to refuse the row until the mode split is done —
  the shadow canon holds it as `candidate-unresolved` (CU-ROL-01). The schema worked as a gate
  here; no amendment needed beyond A2.
- **F7 — open vocabulary drift.** The Rolldown supplement invented six lifecycle values, one
  lane value (`scoped-handle`, explicitly retired by the base document), two resource-result
  values, and one publication value. Every one maps losslessly into the closed sets (MSD-08).
  The closed vocabularies survive, but the drift shows the schema needs its vocabulary
  enforced by validation, not convention.

## 10. Missing and redundant dimensions

- **Missing: publication owner.** The one genuine missing distinction (F1/F2/F3 in §1). Fixed
  by amendment A1 below, which splits the field rather than adding a key dimension.
- **Missing (clarification only): artifact-runtime phase discipline.** `runtime-api` was used
  by the Bun supplement for a build-host ambient API (`Bun.plugin`). Grouping law GL-3
  (adopted in MSD-11) pins `runtime-api`/`runtime-lookup` to capabilities invoked inside a
  produced artifact; ambient host APIs are `host-api`. No new dimension — a definition
  tightening.
- **Redundant: none found.** Every key dimension did discriminating work somewhere: lane
  (esbuild direct-write pair), lifecycle (watch vs one-shot), resource-result (blob vs
  executable in Node SEA), publication (memory vs direct-write everywhere). The evidence
  coordinate's `non-semantic-option-mode` and `evaluation-phase` axes were both exercised
  (permission modes; first-use vs layer-acquisition coherence checks).

## 11. Verdict

**The proposed key survives, with three amendments that preserve its arity:**

- **A1 — publication-owner split.** Replace the single `output-publication` field with
  `provider_publication` (evidence-owned: what the provider natively does) and
  `published_contract` (product-owned: what the public operation promises), plus an
  `identity_owner` marker (`provider-native` | `product-wrapper-over-provider-command`).
  Semantic identity is carried by `published_contract`; `provider_publication` is mandatory
  evidence. Affected operations: CO-BUN-12, CO-DEN-10, CO-DEN-11, CO-SEA-01, CO-SEA-03 (the
  five where the two values differ); every other operation has identical values in both
  fields. Without A1, the five supplements cannot be filed under one key without either
  double rows (Bun) or over-claims (Deno).
- **A2 — handle-bound operation rule (GL-2).** A method of a scoped state owner is promoted
  to an operation if and only if it carries a semantic-identity fact (publication or
  ownership law) not determined by its owning handle; otherwise it is a sub-operation. Its
  lifecycle is that of its owner (`scoped-context`). This resolves Rolldown generate/write vs
  esbuild rebuild consistently and is a clarification of the existing key, not a new
  dimension.
- **A3 — ownership/lifecycle pairing constraint.** `long-lived-handle` requires a
  `scoped-context` or `scoped-process` lifecycle; a returned reusable object with no release
  law is `caller-owned-value`. Closes the F5 illegal state.

Definition tightenings (no schema change): GL-3 runtime-api discipline (§10);
`in-process-api` = installed-library API regardless of child-process vs in-process native
binding (MSD-04).

Not adopted: any new key dimension, any reopening of the lane/lifecycle vocabulary beyond the
closed sets, and any wrapper/provider split that would duplicate rows.
