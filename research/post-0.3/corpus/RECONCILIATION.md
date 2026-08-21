# Cross-lane reconciliation: canonical operation model

Date: 2026-08-18.
Status: **completed reconciliation work product; superseded for future-0.4 surface authority by
`../freeze/SURFACE.json` and `../freeze/MIGRATION.json`** under the protocol recorded in
`DECISION-RECORD.md`. Determinations state whether they follow from a decision,
evidence, maintainer choice, or open research; table rows also keep evidence, priority,
compatibility, implementation, and certification status separate. Historical pending rows below
are not the frozen surface.

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
semantic identity = provider / operation / lane / lifecycle
                    / { resource-result, output-publication }

evidence coordinate = provider-implementation-identity
                      x host
                      x requested-target
                      x non-semantic-option-mode
                      x evaluation-phase
```

An operation has exactly one semantic identity. Evidence (CI points per D9, receipts, probes)
attaches at evidence coordinates. Two rows that differ only in evidence coordinates are the same
operation only when the differing option does not change authority, lifecycle, resource ownership,
output publication, result law, or failure law. A mode that changes one of those facts is promoted
into semantic identity. Two rows that differ in any semantic-identity field are different
operations and must never share a policy or a name silently.

`provider-implementation-identity` is deliberately broader than a CLI version: it is selected
command bytes/version/revision for a command, the host runtime for Bun/Deno host APIs,
package/API/native-binary coherence for esbuild, and builder plus base identities for legacy Node
SEA. A version string alone is never substituted for this identity.

Observed evidence coordinates and reviewed support admission are separate records. CI can create
evidence; it cannot silently authorize its own coordinate as a public compatibility commitment.

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

"Scoped handle" is not a lane: it is a lifecycle. The esbuild context is `in-process-api` lane
with `scoped-context` lifecycle. This separation removes the double-counting between the lanes.
The merged breadth surface value "API/command" is retired; every such row splits below.
Likewise, "external mutation" is an operation effect, not a transport lane: a signing operation
uses `selected-command`. A future direct remote service API remains provisional until M4 selects a
concrete Apple operation and transport; it is not part of the closed 0.4 lane vocabulary.

### Lifecycle classes — forced-by-evidence (D7, lifecycle lane)

The closed current vocabulary is `one-shot` · `scoped-context` (rebuild/serve handle; invalid after
release) · `scoped-process` (watch child; scope closure terminates) · `runtime-lookup` (asset access
inside a produced artifact). `remote-job` is a provisional Apple lifecycle pending M4.

`pipeline-stage` is composition metadata, not a lifecycle: an internal blob-generation step is
still one-shot. Partial stage products are not public artifacts. Publication semantics are selected
separately: stage→verify→atomic-publish applies only where the public operation promises one durable
file. It is false for memory, streams, provider-direct trees, watch/serve, and remote jobs.

### Ownership classes — forced-by-evidence (gates §ownership)

Resource result and output publication are two independent axes:

```text
resource-result:
  caller-owned-value | scope-borrowed-value | runtime-borrowed-view
  | long-lived-handle | none

output-publication:
  none | provider-direct-durable | atomic-published-durable
```

A watch can therefore return `long-lived-handle` while producing
`provider-direct-durable` outputs. The word "borrowed" without authority and expiry is retired. An
upstream request that selects memory or direct-write output is split because its failure and
publication laws differ.

### Evaluation phases — reconciled by D3, D9, D10, D13, and D14

The evaluator stays small but cannot collapse facts that fail at different times:

1. **Release CI:** compile declarations, check package/Effect peers, run every applicable evidence
   coordinate, and publish the exact supported-coordinate data.
2. **Installation graph:** npm enforces exact same-version peers for first-party packages and the
   declared range for third-party adapters.
3. **Layer acquisition:** select one canonical tool, record its exact identity and global
   capabilities, and reject selection or global-identity failures. It does not make an
   operation/target-dependent override decision.
4. **Operation preflight:** consult that immutable observation, operation/lane/host/target policy,
   known holes, bounded required capabilities, and non-overridable relations. This is where an
   admitted coordinate or D9's narrow unknown-but-capable override is decided.
5. **Launch boundary:** when selected command replacement is possible, authenticate the full
   executable content identity immediately before provider work. Do not repeat probes whose
   authority and complete cache key cannot have changed.
6. **Certification/archive:** receipts name the immutable source SHA and observations; D14 archives
   them separately without changing the certified source.

This is provider-private compatibility policy. A public matcher DSL and a universal runtime
protocol remain unearned, but the observed failure states above are not deferred.

## 2. Worked examples: the released operations

### `compileExecutable` (Bun, Deno)

Canonical identities — forced-by-evidence (boundary doc: Deno compile has no host twin; Bun
compile exists in both transports):

```text
bun  / compile-executable / selected-command / one-shot / {caller-owned-value, atomic-published-durable}
bun  / compile-executable-memory / host-api / one-shot / {caller-owned-value, none}              [candidate mode]
bun  / compile-executable-direct-write / host-api / one-shot / {caller-owned-value, provider-direct-durable} [candidate mode]
deno / compile-executable / selected-command / one-shot / {caller-owned-value, atomic-published-durable}
```

The capability survives 0.4 — forced-by-decision(D5) plus forced-by-evidence (native to both
providers; observed CI points exist). Bun host-API compile is source-established, but its exact
output ownership, cancellation, and mutation laws remain unproved. The current request shape
(entry, output, target) is close to native for the selected-command lanes; the reviewed sources
show no smoothing that erases provider semantics. Whether the public name stays `compileExecutable` is **pending-maintainer**
(question batch 1). The historical `compileExecutableMatrix` homogeneous wrapper is a separate
case below.

### `compileExecutableMatrix`

Not a provider operation: no provider offers a multi-target matrix natively. It is a
provider-neutral orchestration convenience. It is **not** equivalent to an unqualified
`Effect.forEach`: the released wrapper may own deterministic cell identity, concurrency bounds,
independently committed outputs, a complete per-cell success/failure report, and a defined caller
interruption law. Retention is justified only if those invariants are desired as product behavior;
otherwise documentation can show ordinary Effect composition. The choice remains
**pending-maintainer** (question batch 1), and removal is a named 0.4 retraction under D1.

### `withJavaScriptBundle` (Bun bundle continuation)

Canonical mapping:
`bun / bundle / selected-command / one-shot / {scope-borrowed-value, none}`, consumed by a
continuation. It is superseded by native bundle operations (B01-B04 below) which expose the same
capability without restricting every consumer to that continuation shape. Disposition: remove at
the cut, replaced by native bundle operations plus `Author/BorrowedOutput` laws — **resolved by
decision D16**.

## 3. Provisional operation crosswalk

This is not yet a frozen export map. It normalizes the source inventory without turning upstream
existence into a compatibility promise. Every row separates evidence from product priority. Unless
explicitly stated otherwise, implementation is `not-started`, certification is `not-certified`,
and compatibility is `uncommitted pending the D9 matrix`. Parenthetical ids refer to the imported
breadth inventory.

### Bun

| Complete semantic identity | Evidence and semantic status | Product priority / remaining gate |
|---|---|---|
| bun/bundle-memory/host-api/one-shot/{caller-owned-value,none} (B01, B02) | source-established; cancellation and interruption effects unknown | 0.4 candidate by D5; execute virtual/mixed graph, plugin, cancellation, and retained-result tests |
| bun/bundle-direct-write/host-api/one-shot/{caller-owned-value,provider-direct-durable} (B03) | source-established; no atomicity claim | 0.4 candidate; prove partial writes, pre-existing destination, and interruption remnants |
| bun/bundle-direct-write/selected-command/one-shot/{caller-owned-value,provider-direct-durable} (B04) | source-established; command authority differs from API | 0.4 candidate; prove config/env/signal/diagnostic behavior |
| bun/bundle-watch/selected-command/scoped-process/{long-lived-handle,provider-direct-durable} (B05) | source-established; typed rebuild boundary falsified | 0.4 raw-handle candidate by D7; prove termination, reaping, and partial output laws |
| bun/html-bundle-memory/host-api/one-shot/{caller-owned-value,none} (B07) | source-established as a mode; broad portable HTML role falsified | provider-native 0.4 candidate; normalize no resources outside Bun's own graph |
| bun/html-bundle-direct-write/host-api/one-shot/{caller-owned-value,provider-direct-durable} (B07) | source-established as a mode | provider-native 0.4 candidate; output/remnant proof required |
| bun/html-bundle-direct-write/selected-command/one-shot/{caller-owned-value,provider-direct-durable} (B07) | lane source-established; exact option parity unproven | 0.4 candidate; command-lane probe required |
| bun/compile-executable/selected-command/one-shot/{caller-owned-value,atomic-published-durable} (B09) | released wrapper plus upstream source evidence | 0.4 candidate; exact target/runtime/interruption matrix required |
| bun/compile-executable-memory/host-api/one-shot/{caller-owned-value,none} (B09 candidate split) | host compile is source-established; support for this result mode is not yet established | priority set by D5; retain only if output-topology probe confirms the mode |
| bun/compile-executable-direct-write/host-api/one-shot/{caller-owned-value,provider-direct-durable} (B09 candidate split) | host compile is source-established; support for this result mode is not yet established | priority set by D5; retain only if output-topology and interruption probes confirm the mode |
| bun/full-stack-html-executable/host-api/one-shot/{caller-owned-value,provider-direct-durable} (B10 candidate split) | provider capability source-established; exact API output ownership still open | high research priority under D5; prove routing/assets/runtime/output law before freeze |
| bun/full-stack-html-executable/selected-command/one-shot/{caller-owned-value,provider-direct-durable} (B10 candidate split) | provider capability source-established; command lane not yet independently proved | high research priority under D5; prove lane existence and native authority before freeze |

Plugins/loaders (B06) and splitting, chunks, assets, maps, and metafiles (B08) are native request
options or result fields of the operations above, not standalone operations. They remain visible in
the upstream types and must not be normalized away.

### Deno

| Complete semantic identity | Evidence and semantic status | Product priority / remaining gate |
|---|---|---|
| deno/bundle-memory/host-api/one-shot/{caller-owned-value,none} (D01) | source-established experimental operation; permission behavior contradicts declarations | 0.4 experimental candidate by D6; permission/cancel/config matrix required |
| deno/bundle-direct-write/host-api/one-shot/{caller-owned-value,provider-direct-durable} (D02) | source-established experimental operation; atomicity unproven | 0.4 experimental candidate; partial-write and permission proof required |
| deno/bundle-stdout/selected-command/one-shot/{caller-owned-value,none} (D03) | source-established experimental operation; candidate collects finite stdout before returning | 0.4 experimental candidate; bound/memory, stderr, and interruption proof required; a raw stream would instead require a separate scoped-process identity |
| deno/bundle-direct-write/selected-command/one-shot/{caller-owned-value,provider-direct-durable} (D04) | source-established experimental operation | 0.4 experimental candidate; project precedence and partial-write proof required |
| deno/bundle-watch/selected-command/scoped-process/{long-lived-handle,provider-direct-durable} (D05) | source-established experimental operation; typed event boundary falsified | 0.4 raw-handle candidate by D7; signal/reap/failure-remnant proof required |
| deno/compile-executable/selected-command/one-shot/{caller-owned-value,atomic-published-durable} (D07) | stable upstream operation and released wrapper | 0.4 candidate; offline/cache/permission/target/denort relation matrix required |

Declaration/check modes (D06) must be split by lane and output topology during the breadth
supplement. Runtime acquisition (D08) is a declared internal sub-operation of compile, never a
hidden fallback. Permission authority (D10) is part of each request/evidence coordinate rather than
a standalone operation. The compiled-runtime `Deno.bundle` observation (D09) belongs in a runtime
capability map, not the production-operation table; it is known unavailable at the observed
coordinate and must be re-probed for any new identity without inventing a portable error.

### esbuild

| Complete semantic identity | Evidence and semantic status | Product priority / remaining gate |
|---|---|---|
| esbuild/build-memory/in-process-api/one-shot/{caller-owned-value,none} (E01) | source-established stable operation | 0.4 candidate by D5; interruption/native-child/plugin proof required |
| esbuild/build-direct-write/in-process-api/one-shot/{caller-owned-value,provider-direct-durable} (E01) | source-established stable mode; no atomicity claim | 0.4 candidate; partial-write/remnant proof required |
| esbuild/transform/in-process-api/one-shot/{caller-owned-value,none} (E02) | source-established stable operation | 0.4 candidate; large-input interruption and diagnostics proof required |
| esbuild/context-memory/in-process-api/scoped-context/{long-lived-handle,none} (E03-E08 candidate split) | source-established state owner | 0.4 candidate by D5+D7; rebuild/watch/serve/cancel/dispose are handle methods; race laws remain open |
| esbuild/context-direct-write/in-process-api/scoped-context/{long-lived-handle,provider-direct-durable} (E03-E08 candidate split) | source-established state owner with different output law | 0.4 candidate; partial-write and context race laws remain open |
| esbuild/analyze-metafile/in-process-api/one-shot/{caller-owned-value,none} (E10) | source-established provider-native analysis operation | 0.4 candidate; preserve native schema and diagnostics |
| esbuild/build-stdout/selected-command/one-shot/{caller-owned-value,none} (E11) | selected-binary/process authority is real; candidate collects finite stdout before return | 0.4 candidate under D5; bound/memory, stderr, and interruption proof required; raw streaming would be a separate scoped-process identity |
| esbuild/build-direct-write/selected-command/one-shot/{caller-owned-value,provider-direct-durable} (E11) | source-established lane; no API parity claim | 0.4 candidate; config/env/signal/remnant proof required |
| esbuild/build-watch/selected-command/scoped-process/{long-lived-handle,provider-direct-durable} (E11) | source-established process lane distinct from context watch | 0.4 raw-handle candidate under D7; no typed event claim |
| esbuild/serve/selected-command/scoped-process/{long-lived-handle,none} (E11) | source-established process lane distinct from context serve | 0.4 candidate; network/process lifecycle proof required |

Plugins/loaders (E09) remain upstream request authority. Metafile production is a build-result
field; `analyzeMetafile` is the distinct operation above. The JS API's native child (E12) remains
an implementation detail owned by esbuild rather than an effect-build process abstraction.

### Node SEA

| Complete semantic identity | Evidence and semantic status | Product priority / remaining gate |
|---|---|---|
| node-sea/assemble-direct/selected-command/one-shot/{caller-owned-value,atomic-published-durable} (S01) | direct `--build-sea` is source-established; exact host/version proof open | preferred 0.4 assembler candidate under D5 |
| node-sea/generate-blob/selected-command/one-shot/{scope-borrowed-value,none} (S08 internal stage) | legacy first step source-established | internal compatibility step only where direct build is unavailable; exact need and cleanup proof required |
| node-sea/inject-blob/selected-command/one-shot/{caller-owned-value,atomic-published-durable} (S08) | legacy mutation path source-established; injector varies | compatibility path; sentinel, tool, correctness repair, and rollback proof required |
| node-sea/get-asset/runtime-api/runtime-lookup/{runtime-borrowed-view,none} (S04) | source-established runtime capability | provider-native candidate; encoding/missing/no-copy/large-asset proof required |

CJS/ESM main format (S02/S03), asset embedding (the build half of S04), code cache (S05), startup
snapshot (S06), and exec-argv policy (S07) are distinct config modes with different admissibility
relations, not standalone generic operations. Each receives its own evidence coordinates before
being included in the assembler request. Builder/base equality (S10) is a non-overridable D9
relation only for the legacy separate-base injection path; direct `--build-sea` has one selected
Node identity. Target-specific ad-hoc correctness repair is an internal stage of the producing
assembler, with `codesign` as a selected tool, not a public Apple operation. Distribution identity
signing, notarization, stapling, and packaging are not Node SEA operations; their
provider/lane/lifecycle map is pending M4.

### Effect rows (F01-F07)

Not operations. Direct use of official Effect primitives — forced-by-decision(D2). They appear in
no operation table and receive no wrapper.

### Cross-provider rows (R01-R05)

R01's sealed-main producer role plus canonical `NodeMain` value, and R02's narrower successor
`BrowserModulePayload`: proof programs, ship-if-pass — forced-by-decision(D8). R03
RuntimeExecutable and the current CLI-derived R04
TypedWatchEvents stay falsified; D7's
research program is the only open path for R04. R05 (operation-owned surface boundary): adopted —
it is this document's key.

### Rolldown (D15)

New identities must be authored in the promotion dossier using this key. Existing evidence supports
at least `rolldown/build-context/in-process-api/scoped-context/{long-lived-handle,none}`; its
generate/write result modes must be split by publication ownership. Declaration output was
self-contained at one probed point,
which is evidence for that coordinate rather than a general profile commitment. The full table is
part of the independent D15 provider-package gate.

## 4. Gate closure status

| Gate | Honest status |
|---|---|
| C2 macro-direction | **Closed** by D2 |
| Mandatory provider-wide `Api`/`Command` mirroring | **Closed as rejected**; operation-specific lanes survive |
| Canonical coordinate schema | **Closed as vocabulary** by §1 |
| Complete canonical operation map | **Open**; §3 contains explicit candidate splits and breadth gaps |
| Ownership vocabulary | **Closed as vocabulary** by §1; per-operation proof remains open |
| Lifecycle-specific publication | **Closed as a general rule**; assignment and interruption evidence remain open per operation |
| Exact-version allowlist as the complete model | **Closed as falsified** by D9 and the compatibility lane |
| Minimum private identity/holes/capabilities/relations evaluator | **Required architecturally**; exact provider implementations remain open |
| Public compatibility matcher/protocol | **Not earned**; no public DSL selected |
| Third-party integration authors as audience | **Closed** by D3 |
| Exact public `Author/*` surface | **Open until research program R4's law/rent audit**; three finite candidates named in D3 |
| Current generic typed Bun/Deno CLI-watch protocol | **Closed as rejected**; D7 defines a distinct future research path |
| Portable-profile conformance | **Open** under D8 |
| Evidence-normalization vocabulary | **Closed**; applying exact provenance/disposition to every normalized row remains open |
| 0.4 surface freeze and removal map | **Open**; must precede implementation and certification under D5 |

## 5. Maintainer question batch 1 — outcomes (2026-08-18)

1. Public name of the native compile operations: **deferred by the maintainer** ("not sure yet").
   Stays pending-maintainer; does not block R1-R6 research. Revisit with the
   surface-map naming batch.
2. `compileExecutableMatrix`: **deferred by the maintainer** ("not sure"). Stays
   pending-maintainer. §2 now records the strongest retention case—independent cell commits,
   complete outcomes, and interruption law—rather than dismissing it as `Effect.forEach`.
3. `withJavaScriptBundle`: **resolved — remove at the hard cut** (decision D16 in
   `DECISION-RECORD.md`). Superseded by native bundle operations plus borrowed-output laws.
   A retraction of released behavior, acknowledged per D1.
4. Existing `Compiler` services: **withdrawn from the maintainer list — misclassified.** The
   service test itself is forced-by-evidence (a service must own canonical selected state; a
   stateless forwarder becomes a function). Applying the test per service is code analysis
   inside R4's pre-freeze `Author/Tool` design, so per-service verdicts are pending-research, not
   pending-maintainer. Note: the 0.3 `Compiler` service plausibly passes the test — its Layer
   owns discovered-binary and probed-version state.
5. Esbuild CLI "demand" and B10 priority are withdrawn as maintainer questions. D5 already makes
   truthful native breadth a research priority, and selected-binary/process authority is a real
   semantic distinction. Exact module naming waits for the completed operation map.
6. `HostPath.Observed` public versus internal is a primitive-rent/design finding for R4, not
   a maintainer preference unless two equally truthful designs remain after the law audit.

## 6. What this unlocks

The R1-R7 program completed the sequence below. Every candidate received an explicit final
disposition, M1-M8 were decided, the exact surface and migration maps were frozen, the active
instruction was cut over, and Plans 039-044 were rewritten. Plan 039 is now ready; implementation
and certification have not begun.

```text
completed operation crosswalk and bounded research
  -> record every ship/defer/reject disposition
  -> answer the genuine maintainer questions
  -> authorize the active-instruction cutover
  -> freeze one public surface and removal map
  -> rewrite Plans 039-044
  -> [next] implement Plans 039-044
  -> [next] certify the frozen candidate
```
