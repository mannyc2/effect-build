# Cross-lane reconciliation: canonical operation model

Date: 2026-08-18.
Status: **reconciliation work product** under the protocol recorded in `DECISION-RECORD.md`.
Every determination below is labeled `forced-by-decision(D-n)`, `forced-by-evidence`,
`pending-maintainer`, or `pending-research`. Nothing labeled pending is canon.

Inputs reconciled: `lanes/provider-native-breadth/provider-operation-inventory.csv` (54 rows),
`lanes/compatibility-dx/operation-version-matrix.csv` (35 rows), `api-command-boundary.md`,
`naming-and-public-surface.md`, the lifecycle lane's taxonomy and ownership laws, and
`RECONCILIATION-GATES.md`.

## 1. Canonical operation key — forced-by-evidence

The gates require one key carrying provider, operation, lane, host, target, lifecycle, ownership,
and evaluation phase. The two datasets show these do not belong in one flat tuple: the breadth
inventory is host-agnostic per operation, while the compatibility matrix repeats the same
operation once per host/version observation. Flattening them is what produced the original
mismatch. The canonical key therefore has two parts:

```text
semantic identity  = provider / operation / lane / lifecycle / ownership
evidence coordinate = host x target x tool-version-identity x evaluation-phase
```

An operation has exactly one semantic identity. Evidence (CI points per D9, receipts, probes)
attaches at evidence coordinates. Two rows that differ only in evidence coordinates are the same
operation; two rows that differ in any semantic-identity field are different operations and must
never share a policy or a name silently.

### Lane vocabulary — forced-by-evidence

Normalized from breadth ("host API", "selected command", "scoped handle", the illegal
"API/command") and compatibility ("host-api", "selected-command", "in-process-js-api",
"compiled-runtime-api", "CLI"):

| Canonical lane | Meaning | Absorbs |
|---|---|---|
| `host-api` | In-process API of a host runtime (Bun.build, Deno.bundle) | breadth "host API"; compat "host-api" |
| `in-process-api` | In-process API of an installed library with its own native child (esbuild JS API) | compat "in-process-js-api"; breadth esbuild "host API" rows |
| `selected-command` | Explicitly selected external binary run as a scoped child | both lanes' "selected command/CLI" |
| `runtime-api` | API available inside a produced artifact at its runtime (node:sea getAsset, compiled-runtime Deno.bundle) | compat "compiled-runtime-api"; breadth "runtime observation" |
| `external-mutation` | Privileged post-production mutation by external tooling (signing family, D11) | breadth "external post-processing" |

"Scoped handle" is not a lane: it is a lifecycle. The esbuild context is `in-process-api` lane
with `scoped-context` lifecycle. This separation removes the double-counting between the lanes.
The merged breadth surface value "API/command" is retired; every such row splits below.

### Lifecycle classes — forced-by-evidence (D7, lifecycle lane)

`one-shot` · `scoped-context` (rebuild/serve handle; invalid after release) · `scoped-process`
(watch child; scope closure terminates) · `pipeline-stage` (SEA assembly steps; partial products
are not artifacts) · `runtime-lookup` (asset access inside produced artifact). Publication
semantics are selected per lifecycle class, per the gates: the universal
stage→verify→atomic-publish sequence applies only where the class produces a durable file claim.

### Ownership classes — forced-by-evidence (gates §ownership)

`caller-retained-memory` · `scoped-temporary` (borrowed; expires with scope) ·
`provider-direct-durable` (provider writes destination itself; no atomic claim) ·
`atomic-published-durable` (staged, verified, atomically renamed) · `long-lived-handle`.
The word "borrowed" without one of these classes is retired.

### Evaluation phases — simplified, forced-by-decision(D9, D10, D3)

The gates' six phases survive, but D9 (exact points), D10 (lockstep pins), and D3 (ordinary
semver) collapse their machinery: (1) release certification runs the five-host matrix (D13);
(2) package installation is npm peer = exact lockstep pin; (3) Layer acquisition performs tool
selection and the exact-point check with the escape flag; (4) operation execution re-checks
nothing version-related (no per-operation re-verification, per the gates' anti-repetition rule);
(5) receipts record what ran (D14). The five-machine protocol stays retired unless a machine
earns rent individually.

## 2. Worked examples: the released operations

### `compileExecutable` (Bun, Deno)

Canonical identities — forced-by-evidence (boundary doc: Deno compile has no host twin; Bun
compile exists in both transports):

```text
bun  / compile-executable / selected-command / one-shot / atomic-published-durable
bun  / compile-executable / host-api         / one-shot / (probe: Bun.build compile support)  [pending-research]
deno / compile-executable / selected-command / one-shot / atomic-published-durable
```

The capability survives 0.4 — forced-by-decision(D5) plus forced-by-evidence (native to both
providers; observed CI points exist). The current request shape (entry, output, target) is close
to native for the selected-command lane; the reviewed sources show no smoothing that erases
provider semantics. Whether the public name stays `compileExecutable` is **pending-maintainer**
(question batch 1). The historical `compileExecutableMatrix` homogeneous wrapper is a separate
case below.

### `compileExecutableMatrix`

Not a provider operation: no provider offers a multi-target matrix natively. It is Effect
composition (`Effect.forEach` over targets) packaged as a public operation, plus a homogeneous
`MatrixError`. Under D2 (use ordinary Effect composition directly) and the breadth surface rule
(a wrapper must remove real duplication), the default disposition is removal at the hard cut,
with the composition shown in documentation. Retention as a convenience is **pending-maintainer**
(question batch 1). Note per D1: removal is a retraction of released behavior.

### `withJavaScriptBundle` (Bun bundle continuation)

Canonical mapping: `bun / bundle / selected-command / one-shot / scoped-temporary` consumed by a
continuation. Superseded by the native bundle operations (B01-B04 below) which expose the same
capability without restricting consumers to a continuation shape; the corpus already lists the
name as a likely hard-cut removal. Disposition: remove at the cut, replaced by native bundle
operations plus `Author/BorrowedOutput` laws — **pending-maintainer** confirmation
(question batch 1).

## 3. Canonical operation table

Columns: canonical semantic identity → 0.4 disposition (label). Evidence coordinates stay in the
source CSVs; this table is the identity map. Split rows carry the original merged id.

### Bun

| Identity | Disposition |
|---|---|
| bun/bundle/host-api/one-shot/caller-retained-memory (B01, B02) | in scope — forced-by-decision(D5); cancel semantics pending-research (probe) |
| bun/bundle-direct-write/host-api/one-shot/provider-direct-durable (B03) | in scope — D5; no atomic claim, forced-by-evidence |
| bun/bundle/selected-command/one-shot/provider-direct-durable (B04) | in scope — D5 |
| bun/bundle-watch/selected-command/scoped-process/long-lived-handle (B05) | in scope — forced-by-decision(D7) raw handle form |
| bun/plugins-loaders/host-api/(modifier, not operation) (B06) | native options passed through — forced-by-evidence (naming doc); no separate public operation |
| bun/html-graph-bundle/host-api/one-shot (B07a) | in scope — D5; split from merged row, evidence inherited |
| bun/html-graph-bundle/selected-command/one-shot (B07b) | in scope — D5; probe required for parity, pending-research |
| bun/splitting-chunks-assets-maps-metafile (B08) | request options of bundle operations, not separate operations — forced-by-evidence (boundary rule) |
| bun/compile-executable/selected-command/one-shot (B09b) | in scope — D5; released capability continues |
| bun/compile-executable/host-api/one-shot (B09a) | pending-research: confirm and probe host-api compile support at pinned version |
| bun/full-stack-html-executable (B10) | provider-only distinction; in scope only if its own gate passes — D5; pending-research |

### Deno

| Identity | Disposition |
|---|---|
| deno/bundle/host-api/one-shot/caller-retained-memory (D01) | in scope, experimental-marked — forced-by-decision(D6) |
| deno/bundle-write/host-api/one-shot/provider-direct-durable (D02) | in scope, experimental-marked — D6 |
| deno/bundle/selected-command/one-shot (D03, D04) | in scope, experimental-marked — D6 |
| deno/bundle-watch/selected-command/scoped-process (D05) | in scope, experimental-marked — D6+D7 |
| deno/bundle-declarations (D06) | split retired; declaration modes pending-research (breadth supplement, D5) |
| deno/compile-executable/selected-command/one-shot (D07) | in scope, stable lane — D5; released capability continues |
| deno/compile-runtime-acquisition (D08) | sub-operation: declared+preflighted, never hidden — forced-by-evidence (no-hidden-acquisition law) |
| deno/bundle/runtime-api (D09) | known-incompatible at observed point — forced-by-evidence; excluded, re-probe per version |
| deno/bundle-permission-boundary (D10) | operation input documentation, not an operation — forced-by-evidence |

### esbuild

| Identity | Disposition |
|---|---|
| esbuild/build/in-process-api/one-shot (E01) | in scope — D5 |
| esbuild/transform/in-process-api/one-shot (E02) | in scope — D5 |
| esbuild/context/in-process-api/scoped-context (E03-E08 as one identity with handle methods) | in scope — D5+D7; rebuild/watch/serve/cancel/dispose are handle methods, not separate public operations — forced-by-evidence (boundary doc); dispose/cancel races pending-research |
| esbuild/plugins-loaders (E09) | native options pass-through — forced-by-evidence |
| esbuild/metafile-analyze (E10) | result data of build operations — forced-by-evidence |
| esbuild/cli/selected-command (E11) | out of 0.4 scope: known-incompatible context lifecycle, human streams duplicate in-process lane — forced-by-evidence; pending-maintainer only if demand appears |
| esbuild/native-child (E12) | package implementation detail, never public — forced-by-evidence |

### Node SEA

| Identity | Disposition |
|---|---|
| node-sea/assemble/selected-command/pipeline-stage (S01, S08) | in scope — D5; direct `--build-sea` preferred, legacy injection per evidence |
| node-sea/main-cjs (S02) | in scope, proven subset — D5 |
| node-sea/main-esm (S03) | evidence-gated addition — D5; pending-research (exact probe) |
| node-sea/assets (S04) | build config + runtime-api lookup, two identities — D5; pending-research |
| node-sea/code-cache (S05), startup-snapshot (S06) | evidence-gated — D5; host/version-sensitive, pending-research |
| node-sea/exec-argv (S07) | config surface — D5; pending-research |
| node-sea/signing (S09) | external-mutation family — forced-by-decision(D11); not in effect-build-node-sea |
| node-sea/builder-base-relation (S10) | preflight equality law, enforced before mutation — forced-by-evidence (mismatch receipt) |

### Effect rows (F01-F07)

Not operations. Direct use of official Effect primitives — forced-by-decision(D2). They appear in
no operation table and receive no wrapper.

### Cross-provider rows (R01-R05)

R01 NodeMainProgram, R02 BrowserModuleGraphApplication: proof programs, ship-if-pass —
forced-by-decision(D8). R03 RuntimeExecutable, R04 TypedWatchEvents: stay falsified; D7's
research program is the only open path for R04. R05 (operation-owned surface boundary): adopted —
it is this document's key.

### Rolldown (D15)

New identities to be authored in the promotion dossier using this key. Known from evidence:
rolldown/build-generate/in-process-api/scoped-context; declaration output self-contained at the
probed point. Full table is part of the D15 gate work — pending-research.

## 4. Gate closure status

| Gate | Status |
|---|---|
| Canonical operation identity | **Closed** by §1 of this document |
| Provider breadth supplement | Open — required research (D5) |
| Ownership vocabulary | **Closed** by §1 (five classes) |
| Lifecycle-specific publication | **Closed** as a rule (per lifecycle class); per-operation assignments in §3, gaps marked pending-research |
| Compatibility evaluation phases | **Closed**, simplified by D9/D10/D3 |
| Compatibility primitive rent | **Dissolved** by D9 (exact points) and D3 (no protocol machine) |
| Public vs internal authorship | **Closed** by D3 |
| Portable-profile proof programs | Defined as work — D8 |
| Evidence normalization | **Closed**: provenance/disposition labels retained; this table cites them |

## 5. Maintainer question batch 1 — outcomes (2026-08-18)

1. Public name of the native compile operations: **deferred by the maintainer** ("not sure yet").
   Stays pending-maintainer; does not block research or Plan 039 design. Revisit with the
   surface-map naming batch.
2. `compileExecutableMatrix`: **deferred by the maintainer** ("not sure"). Stays
   pending-maintainer. Default on the table remains removal per D2 and the wrapper rule; a
   retraction per D1 either way it resolves.
3. `withJavaScriptBundle`: **resolved — remove at the hard cut** (decision D16 in
   `DECISION-RECORD.md`). Superseded by native bundle operations plus borrowed-output laws.
   A retraction of released behavior, acknowledged per D1.
4. Existing `Compiler` services: **withdrawn from the maintainer list — misclassified.** The
   service test itself is forced-by-evidence (a service must own canonical selected state; a
   stateless forwarder becomes a function). Applying the test per service is code analysis
   inside Plan 039's `Author/Tool` design, so per-service verdicts are pending-research, not
   pending-maintainer. Note: the 0.3 `Compiler` service plausibly passes the test — its Layer
   owns discovered-binary and probed-version state.
5. (Batch 2, lower stakes, still pending) esbuild CLI lane demand, B10 full-stack executable
   priority, exact module naming per package, `HostPath.Observed` public or internal.

## 6. What this unlocks

With §1 closed, the breadth supplement and all probes can file results under stable identities;
the D15 Rolldown dossier has its schema; Plans 039-044 can be amended against §3's dispositions;
and the 0.4 surface map is §3 plus the answers to §5.
