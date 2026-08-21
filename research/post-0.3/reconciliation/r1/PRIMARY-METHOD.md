# R1 canonical operation package

Date: 2026-08-21. Immutable architecture base: `c4cefd0acc2b7854cc25513967af1a8d415ccab0`.

Status: **primary synthesis complete; shadow comparison is recorded separately**. This package is research data, not an export freeze, implementation authorization, compatibility admission, or certification.

## Independent construction rule

The primary model was constructed only from the immutable c4 reconciliation and the five integrated R2 dossiers. Shadow files were opened only after the primary CSVs passed their own coverage, vocabulary, identity, and evidence-reference checks. The comparison section now reads the immutable shadow package solely to reproduce and validate the later neutral comparison.

## Canon

The semantic identity is `provider / operation / lane / lifecycle / {resource-result, published-contract}`. `provider_publication` separately records what the upstream operation does, while `published_contract` records what the effect-build operation promises; `identity_owner` makes the wrapper boundary explicit. Evidence coordinates remain separate links. Provenance, semantic disposition, product priority, freeze recommendation, compatibility commitment, implementation, and certification are independent columns.

A `freeze_recommendation=ship` is an exact candidate-surface selection, not merely priority, but it is not yet a frozen public commitment. Every ship row here is `blocked-pending-executable-proof`: D5 requires its named evidence gate to close before surface freeze, and R2 documentation/source evidence does not by itself establish lifecycle, interruption, or remnant behavior. A failed or still-missing gate blocks freeze unless an explicit pre-freeze disposition revision records the evidence and falsifier; it may not silently shrink the selected surface. Product priority remains a separate axis.

M8's namespace-only root recommendation is made exact in `ROOT-NAMESPACE-MAP.csv`. Each selected operation-specific subpath has one root namespace key with the form `export * as <Key> from "./<Key>"`; no function is exported directly at a package root. The Rolldown provider root is explicitly empty because its package gate remains deferred. These are candidate names, not an M8 approval or surface freeze.

The canonical register contains 67 identities: Bun 14, Deno 11, esbuild 19, Node SEA 3, and Rolldown 20. Recommendations are ship 29, defer 27, and reject 11.

The original inventory is covered by 73 atomic mappings over all 54 source rows. Composite rows are split; each atom has exactly one allowed classification. The 70 R2 operation rows are all reverse-mapped. Rolldown DevEngine is the only one-to-many supplemental split because its dossier used `mixed-configured` publication; c4 requires memory/callback and durable-write publication to be separate identities.

## Important normalizations

- Bun global plugin mutation uses the Bun host API lane, not the produced-artifact runtime lane. It remains rejected for missing scoped ownership.
- Deno compile watch is provider-direct durable. Repeated native command writes cannot inherit the one-shot wrapper's atomic replacement claim.
- Rolldown is an installed library and therefore uses `in-process-api`, not `host-api`; generate/write remain handle-bound operations within `scoped-context`, while close methods are release sub-operations rather than invented transport lanes or root operations.
- Reusable objects without a release protocol (Bun.Transpiler and Rolldown ResolverFactory) are caller-owned values, not long-lived handles.
- No operation uses `host-api-or-command`, `mixed-configured`, `borrowed`, or an open-ended lifecycle value.
- Deno's D6 product intent is retained as `ship-experimental-after-gate` while the R2 freeze recommendation remains `defer` until exact runtime proof. This is not a contradiction: priority is not certification.

## Files

- `CANONICAL-OPERATIONS.csv`: one row per complete semantic identity and all independent status axes.
- `CROSSWALK.csv`: atomic forward map for the original 54 rows and every R2 operation row.
- `NON-OPERATION-REGISTER.csv`: explicit request modes, modifiers, result fields, sub-operations, relations, runtime capabilities, post-production mutations, platform primitives, portable roles, and architecture laws.
- `REVERSE-INDEX.csv`: operation-to-source reconstruction index.
- `EVIDENCE-COORDINATES.csv`: operation-to-exact-R2-evidence-row links; linked evidence does not admit support.
- `SHIP-DEFER-REJECT.csv`: one explicit freeze recommendation per identity.
- `ROOT-NAMESPACE-MAP.csv`: exact candidate root namespace keys, operation subpaths, members, and the explicitly empty Rolldown root.
- `PRIMARY-VS-SHADOW.csv`: neutral field comparison and evidence-based resolution.
- `REVIEW-ATTESTATIONS.md`: two independent reconstruction reviews and the R1 stop-condition result.
- `MANIFEST.sha256`: LF-byte hashes for the package.
