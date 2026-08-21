# Interface-mechanism research evidence

This directory executes
[`INTERFACE-MECHANISM-RESEARCH-PROMPT.md`](../INTERFACE-MECHANISM-RESEARCH-PROMPT.md)
as a research-only study. It does not itself authorize or begin Plan 039, and
does not modify production, public API, package, CI, or release state. The
immutable study baseline records the independently integrated freeze with
Plan 039 `READY`; the separate live implementation PR later records Plan 039
`DONE`. Neither state is attributed to this study, and the publication branch
remains rooted at the pre-implementation study baseline.

## Read first

- [`REPORT.md`](./REPORT.md): direct answer, provider findings, architecture
  comparison, operation-level portfolio, freeze disposition, and open gates.
- [`GROUND-TRUTH.json`](./GROUND-TRUTH.json): exact repository, release, PR,
  freeze, tool, and local-host coordinates.
- [`CURRENT-TS-TRACE.csv`](./CURRENT-TS-TRACE.csv): every current
  TypeScript-facing operation traced to its actual engine/process/filesystem
  boundary.
- [`OPERATION-INVENTORY.csv`](./OPERATION-INVENTORY.csv): reconstructed
  provider operation inventory.
- [`MECHANISM-COVERAGE.csv`](./MECHANISM-COVERAGE.csv): 45 operations x 12
  required mechanism families, including bounded negatives.
- [`DECISION-MATRIX.csv`](./DECISION-MATRIX.csv): 45 operations x six
  materially different architecture candidates.
- [`SOURCES.md`](./SOURCES.md): exact upstream and repository evidence.
- [`PROBES.md`](./PROBES.md): probe commands, assertions, and limitations.
- [`EXPECTED-CONCLUSIONS.json`](./EXPECTED-CONCLUSIONS.json): conclusions the
  receipts and structural validator must fail closed against.

## Reproduce

Regenerate the two derived ledgers:

```sh
node research/post-0.3/interface-mechanisms/generate-ledgers.mjs
```

Run the probes only with explicitly selected exact tools:

```sh
BUN_EXE=/absolute/path/to/bun-1.3.9 \
BUN_EXPECTED_VERSION=1.3.9 \
BUN_EXPECTED_SHA256=<sha256-of-selected-bun> \
NODE_267_EXE=/absolute/path/to/node-v26.7.0 \
NODE_267_EXPECTED_SHA256=<sha256-of-selected-node> \
POSTJECT_ROOT=/absolute/path/to/postject-1.0.0-alpha.6 \
POSTJECT_EXPECTED_API_SHA256=<sha256-of-postject-dist-api.js> \
node research/post-0.3/interface-mechanisms/run-probes.mjs
```

The runner refuses ambient Bun, Node, or postject selection, excludes the
ambient esbuild binary override, content-binds the default esbuild native
binary, and publishes receipts only as one source-hashed cohort. Browser
Chromium and the exact research dependencies recorded in
[`PROBES.md`](./PROBES.md) must already exist; the runner does not install
tools.

Validate the complete evidence set and the no-production-change boundary:

```sh
node research/post-0.3/interface-mechanisms/validate.mjs
```

The validator checks the Cartesian ledgers, exact expected conclusions, every
probe assertion, the immutable study baseline, frozen admitted operations,
report coverage, and local links. Before publication it permits exactly the
two untracked research roots at the exact study/review base. After publication
it requires a clean, merge-free descendant and inspects every post-base commit;
only the prompt and `interface-mechanisms/` roots may change, and the
production/package delta from the study baseline must remain empty.
