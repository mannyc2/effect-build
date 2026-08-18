# Post-0.3 executable architecture research

These files are research-only. They do not define or change a production export.

The durable source reports, recovery ledgers, and cross-lane limitations are indexed in
[`corpus/README.md`](corpus/README.md). That corpus is reference evidence, not a canonical architecture or successful
certification result.

Current post-import governance and reconciliation begin at
[`corpus/GOVERNANCE.md`](corpus/GOVERNANCE.md), followed by the
[`maintainer decision record`](corpus/DECISION-RECORD.md), the
[`operation reconciliation`](corpus/RECONCILIATION.md), the
[`remaining product decisions`](corpus/PRODUCT-DECISIONS-REMAINING.md), and the
[`bounded research program`](corpus/RESEARCH-PROGRAM.md). These documents record product intent and research status;
they do not override active repository instructions or certify an implementation.

The harness separates:

- law tests for compatibility, ownership, and lifecycle state machines;
- concrete TypeScript API prototypes;
- real Bun, Deno, Esbuild, Node SEA, Rolldown, and `@yao-pkg/pkg` probes;
- representative Node-main, static-web, declaration, executable, watch, and incremental consumers;
- an independent provider/core package-versioning fixture.

A failed conformance comparison is a research result, not a reason to weaken the
candidate contract. Infrastructure failures still fail the workflow.
