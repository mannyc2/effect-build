# Post-0.3 executable architecture research

These files do not themselves change a production export. The completed
research program now includes the authoritative future-0.4 freeze at
[`freeze/SURFACE.json`](freeze/SURFACE.json) and the exhaustive 0.3 hard-cut map
at [`freeze/MIGRATION.json`](freeze/MIGRATION.json). Production remains the
released 0.3 surface until Plans 039-044 implement and certify that exact map.

The durable source reports, recovery ledgers, and cross-lane limitations are indexed in
[`corpus/README.md`](corpus/README.md). That corpus is reference evidence, not a canonical architecture or successful
certification result.

Current post-import governance and reconciliation begin at
[`corpus/GOVERNANCE.md`](corpus/GOVERNANCE.md), followed by the
[`maintainer decision record`](corpus/DECISION-RECORD.md), the
[`operation reconciliation`](corpus/RECONCILIATION.md), the
[`remaining product decisions`](corpus/PRODUCT-DECISIONS-REMAINING.md), and the
[`bounded research program`](corpus/RESEARCH-PROGRAM.md). These documents record product intent and research status;
historical evidence does not override active repository instructions or certify
an implementation. The freeze artifacts agree with the cut-over `AGENTS.md` and
authorize Plan 039 to begin; they do not authorize merge or release mutation.
`freeze/PRODUCT-DECISIONS.md` remains byte-pinned as the pre-cutover research
decision record: its "until the freeze is complete" condition is satisfied by
the frozen `SURFACE.json`, complete `MIGRATION.json`, active instructions, and
exact-head freeze certificate. M1 is therefore activated at this freeze; the
historical wording is not a current Plan 039 blocker.

The one-shot write-capable canonical-closure workflow and its bundled patch
transport were retired at the freeze. Architecture research now certifies a
checked-out exact head through read-only workflows; it cannot rewrite that
head.

The harness separates:

- law tests for compatibility, ownership, and lifecycle state machines;
- concrete TypeScript API prototypes;
- real Bun, Deno, Esbuild, Node SEA, Rolldown, and `@yao-pkg/pkg` probes;
- representative Node-main, static-web, declaration, executable, watch, and incremental consumers;
- an independent provider/core package-versioning fixture.

A failed conformance comparison is a research result, not a reason to weaken the
candidate contract. Infrastructure failures still fail the workflow.
