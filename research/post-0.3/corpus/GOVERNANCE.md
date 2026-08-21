# Post-0.3 architecture governance and reading order

Date: 2026-08-18.

This file explains how the hand-authored reconciliation documents relate to the authenticated
research import. It does not change repository execution authority.

## Reading order

1. `GOVERNANCE.md` — authority and status boundaries.
2. `DECISION-RECORD.md` — maintainer product decisions, including explicit amendments.
3. `RECONCILIATION.md` — canonical vocabulary and the provisional operation crosswalk.
4. `PRODUCT-DECISIONS-REMAINING.md` — only questions that require maintainer preference.
5. `RESEARCH-PROGRAM.md` — evidence work needed before the 0.4 surface freeze.
6. Imported synthesis and lane reports — evidence, alternatives, and falsifiers.
7. `../freeze/SURFACE.json` and `../freeze/MIGRATION.json` — exact future-0.4 authority.
8. Plans 039-044 — rewritten execution sequence for that exact frozen scope.

`IMPORT-MANIFEST.sha256` authenticates the original corpus import. The hand-authored documents
added after that import are intentionally outside it; modifying the import manifest to make a new
decision look like archived evidence would erase provenance.

## Authority boundary

`DECISION-RECORD.md` is authoritative for maintainer **product intent**. It is not a mechanism for
overriding an active `AGENTS.md`, session instruction, branch rule, release gate, or publication
approval. When they disagree, the conflict is a blocker and must be resolved through the authority
that owns the active instruction.

The 2026-08-21 freeze commit completes the required authority cutover. Its `AGENTS.md`,
`../freeze/SURFACE.json`, `../freeze/MIGRATION.json`, and rewritten Plans 039-044 agree: five
first-party packages remain, Rolldown and portable profiles are deferred, the bundle continuation
is removed at the 0.4 hard cut, and the executable matrix is retained only with the independently
committing result redesign. Plan 039 is ready to begin. No merge, publication, tag, release, or
Plan 039 production change occurred as part of the research/freeze commit.
The temporary write-capable canonical-closure workflow and bundled patch
transport were removed; current research workflows are read-only and certify
the checked-out head rather than rewriting it.

The 0.3 public surface remains the contract for 0.3.x. The proposed 0.4 hard cut can retract named
0.3 APIs only in 0.4, with migration documentation and negative export/type tests.

## Evidence rule

No source receives authority merely because it is newer. Resolve conflicts in this order:

1. direct current upstream contract or exact recorded execution applicable to the claim;
2. a maintained architecture law derived from that evidence;
3. an explicit maintainer product decision among semantically valid alternatives;
4. product priority and release sequencing.

Keep provenance and disposition separate:

```text
provenance: github | official-upstream | recorded-execution | archive | inference
disposition: established | proposed | unknown | falsified
```

An existing adopter is never required to establish architectural validity. An abstraction instead
needs coherent laws, honest ownership/failure, reduced invalid state, and adversarial proof.
Adoption affects product priority. Conversely, a coherent abstraction does not automatically earn
a public compatibility commitment.

## Freeze rule

The only valid sequence into implementation is:

```text
research and normalize
  -> decide ship / defer / reject for every candidate
  -> answer remaining product questions
  -> authorize instruction cutover
  -> freeze exact packages, exports, types, laws, support cells, and removals
  -> rewrite Plans 039-044
  -> implement
  -> certify without changing the frozen scope
```

Certification may fail the candidate. It may not silently omit a failed operation and call the
smaller accidental result the certified architecture.
