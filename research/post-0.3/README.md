# Post-0.3 executable architecture research

These files are research-only. They do not define or change a production export.

The harness separates:

- law tests for compatibility, ownership, and lifecycle state machines;
- concrete TypeScript API prototypes;
- real Bun, Deno, Esbuild, Node SEA, Rolldown, and `@yao-pkg/pkg` probes;
- representative Node-main, static-web, declaration, executable, watch, and incremental consumers;
- an independent provider/core package-versioning fixture.

A failed conformance comparison is a research result, not a reason to weaken the
candidate contract. Infrastructure failures still fail the workflow.
