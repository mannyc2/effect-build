# Provenance — blind shadow synthesis of the R1/R2 operation canon

Date: 2026-08-20.
Author: independent shadow synthesis session (second, blind construction).
Status: **must not be merged or treated as canonical before neutral comparison with the
primary synthesis.**

## Independence statement

This synthesis was produced in a fresh session that did **not** inspect, fetch, search for,
or read: branch `research/r1-r2-synthesis`; any PR created from it; the first synthesis
agent's conversation, output, summaries, or receipts; or any document produced by another
synthesis agent. No attempt was made to predict or match the primary synthesis. All content
derives bottom-up from the immutable corpus and the five frozen provider inputs identified
below.

## Immutable inputs

| Input | Identity |
|---|---|
| Immutable architecture base | `c4cefd0acc2b7854cc25513967af1a8d415ccab0` (equal to `claude/research-corpus-reconciliation-63pjhg` head at fetch time) |
| Bun supplement | `509d7d6b91c68da72903a0a7ab9f74e9b0230269` |
| Deno supplement | `34db6a6ee33629ad0f65a027ed4b6c6040c36633` |
| esbuild supplement | `c75e91b945b2e317b8d436c849b1e06ccfe773c2` |
| Node SEA supplement | `0274c35c9a5a1ada313cae8c6d55ec4801b29213` |
| Rolldown supplement | `6eedca3a4633ed04afd5d6ed3e02a8c7e320c4dc` |

Verification performed before any synthesis work:

- each supplement commit **descends from the immutable base** (`git merge-base --is-ancestor`);
- each supplement's diff against the base touches **only** its assigned directory
  `research/post-0.3/reconciliation/r2/<provider>/**`;
- all provider files were read from these exact Git trees (`git show <sha>:<path>`), never
  from mutable branch heads;
- the output branch `research/r1-r2-shadow-synthesis` did not exist anywhere on the remote
  before creation, and was created from the immutable base commit.

No provider commit was cherry-picked or merged into this branch; their identities are
recorded here as inputs only.

## Required reading performed (from the immutable base)

`AGENTS.md`; `corpus/GOVERNANCE.md`; `corpus/DECISION-RECORD.md`; `corpus/RECONCILIATION.md`
(schema and worked examples treated as hypotheses to test, not answers);
`corpus/RECONCILIATION-GATES.md`; R1/R2 in `corpus/RESEARCH-PROGRAM.md`; the 54-row
`provider-operation-inventory.csv`; the 35-row `operation-version-matrix.csv`;
lifecycle-observability `lifecycle-taxonomy.md` and `ownership-laws.md`;
provider-native-breadth `api-command-boundary.md` and `naming-and-public-surface.md`;
node-canon `legal-and-illegal-states.md`; browser-role `decision-table.md`;
compatibility-dx `preflight-and-mutation-order.md`; and all twenty-five files of the five
frozen provider supplements.

## Method

1. Atomic claims were derived bottom-up (`SOURCE-CLAIMS.csv`), each classified into exactly
   one of: operation, request mode, modifier, result field, sub-operation, relation, runtime
   capability, post-production mutation, external-platform-primitive, portable-role,
   architecture-law.
2. Request/configuration authority, transport lane, lifecycle, resource-result ownership,
   output-publication ownership, failure law, interruption law, provider implementation
   identity, host/target relations, compatibility owner, and evaluation phase were recorded
   per claim before any grouping into operations.
3. Claims were grouped into canonical operations (`CANONICAL-OPERATIONS.csv`) under three
   explicit grouping laws (GL-1 handle-method containment, GL-2 handle-bound promotion,
   GL-3 runtime-api discipline), with every nontrivial decision, rejected alternative, and
   falsifier recorded (`MERGE-SPLIT-DECISIONS.csv`).
4. The proposed identity key was adversarially tested (`SCHEMA-FALSIFICATION.md`); it
   survives with three arity-preserving amendments (A1 publication-owner split, A2
   handle-bound rule, A3 ownership/lifecycle pairing constraint).
5. Evidence coordinates were consolidated (`EVIDENCE-COORDINATES.csv`) keeping observed
   evidence strictly separate from support admission; all 35 matrix rows carried
   individually.
6. Every identifier in the immutable inputs is mapped in `REVERSE-INDEX.csv` (956 rows: 54
   inventory rows, 35 matrix rows, and every operation, claim, evidence row, and report
   candidate in the five supplements).
7. Dispositions (`SHIP-DEFER-REJECT.md`) and the consolidated probe queue
   (`EXECUTABLE-PROBE-QUEUE.md`) keep evidence provenance, semantic disposition, product
   priority, compatibility commitment, implementation status, and certification status
   independent throughout.

## Judgment-separation attestation

- No lack of adoption was used as architectural evidence.
- No upstream existence was converted into a support admission.
- No exact observed coordinate was widened into a range.
- Explicit `unknown` states are retained as valid coverage and never justify shipping.
- No conclusion freezes the 0.4 surface, decides an open maintainer question, invents
  package or export names, rewrites Plans 039–044, claims executable proof from
  documentation, authorizes implementation, or asserts agreement with any other synthesis.

## Output inventory

Exactly ten files under `research/post-0.3/reconciliation/r1-shadow/`:

```text
SOURCE-CLAIMS.csv
CANONICAL-OPERATIONS.csv
EVIDENCE-COORDINATES.csv
REVERSE-INDEX.csv
MERGE-SPLIT-DECISIONS.csv
SCHEMA-FALSIFICATION.md
SHIP-DEFER-REJECT.md
EXECUTABLE-PROBE-QUEUE.md
PROVENANCE.md
MANIFEST.sha256
```

`MANIFEST.sha256` records the SHA-256 of the other nine files. The pushed head SHA cannot
truthfully embed itself here; it is recorded by the remote ref and the draft PR metadata.

No production code, packages, plans, workflows, tests, exports, lockfiles, existing corpus
files, shared manifests, `AGENTS.md`, release configuration, tags, settings, or publication
state was modified. The environment's outbound network runs through a managed egress proxy;
all upstream facts herein are cited from the frozen supplements' own pinned evidence rather
than re-fetched, so no moving documentation was introduced.

## Unresolved empirical gates (summary)

The canon ships identities only. Every public support cell remains unadmitted pending the
probe families in `EXECUTABLE-PROBE-QUEUE.md`: interruption/remnants (PF-1), scoped-handle
races (PF-2), watch lifecycles (PF-3), selected-command TOCTOU (PF-4), acquisition/offline
(PF-5), permissions/authority (PF-6), output topology and result contracts (PF-7),
executable assembly and cross-target (PF-8), and the five-host (plus Bun-host) matrix
(PF-9). The two portable-role proof programs (D8) and the D15 Rolldown package gate remain
open in both directions.
