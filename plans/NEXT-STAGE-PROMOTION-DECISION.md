# Next-stage public promotion decision

Evaluated at program-start commit
`61d1c0c9f04c4a4254163d4f85ebf6248a67b9bf`, against implementation receipt
source `577ffa7016a7236edba26d82c549bdfc70fdce4f` and the evidence packet at
`plans/research/next-stage-promotion-evidence.md`.

## Decision

No candidate is promoted. The released surface remains the Bun/Deno scalar and
homogeneous-matrix operations. The internal esbuild/Node SEA pipeline earns
shared native validation/publication as a package-private primitive, but it
does not earn a public inspector, common artifact, build receipt, semantic or
bound plan, or replaceable executor interface.

One unmet required criterion is decisive; criteria are not averaged.

| Candidate | Decision |
|---|---|
| Shared file-level inspection/validation | NOT MET for public promotion; MET only as an internal shared capability |
| Public artifact/provenance | NOT MET; retain the exact private stage tuple |
| Versioned build receipts | NOT MET; retain workflow verification as workflow evidence only |
| `SemanticPlan` | REJECTED now |
| `BoundExecutionPlan` | REJECTED now |
| Replaceable executors | REJECTED now |

## Gate 1: public executable inspection/validation

| Required criterion | Verdict | Evidence |
|---|---|---|
| Direct Bun/Deno output and Node SEA output use one file-level validator with identical regular/executable/native/target/bytes semantics | MET | Both call `validateAndPublishExecutable`; only `ExecutableLifecycle.ts` owns produced-file inspection and rename |
| Real tests cover every native format/host claimed by a public inspector, including corrected thin/fat Mach-O behavior | NOT MET | Internal fixtures and three-host publication tests are strong implementation evidence, but no independently specified public support/ranged-I/O contract exists |
| A named caller needs inspection without compilation/publication | NOT MET | Consumer inventory: none |
| Error schema, ranged-I/O contract, and target/ABI ambiguity policy are independently useful without exposing lifecycle state | NOT MET | The file inspector returns a plain internal error and is coupled to candidate validation/Node selection; no consumer validates a separate contract |
| Promotion creates no second target canon or provider-specific branch | MET | `NativeExecutableObservation` and existing target tables remain the only internal authorities |

Overall: **NOT MET**. Internal sharing is earned; public inspection is not.

## Gate 2: public artifact types and provenance

| Required criterion | Verdict | Evidence |
|---|---|---|
| Both topologies pass required real-tool gates and return one common durable semantic result without scoped paths | NOT MET | Both topologies pass, and neither durable result leaks the bundle/config path, but public `Artifact` and private `PipelineExecutableArtifact` intentionally have different shapes |
| A named external consumer needs to persist, transport, or inspect both topology results | NOT MET | Consumer inventory: none |
| One versioned hard cut can replace singular `tool` with ordered stages without peer representations | NOT MET | No maintainer-selected cut, migration contract, or consumer exists; adding `stages` now would create peers |
| Provider-target correlation, digest optionality, schema round trips, packed types, and migration are specified/tested for the common result | NOT MET | These are tested for current public Artifact only; there is no common public schema or migration |
| Stage observations avoid closure, reproducibility, attestation, and byte-stability overclaims | MET | Internal types and architecture text describe only observed operations and selected tools |

Overall: **NOT MET**. The two-stage result remains package-private.

## Gate 3: versioned receipts

| Required criterion | Verdict | Evidence |
|---|---|---|
| A named consumer needs a durable record separate from returned Artifact | NOT MET | Consumer inventory: none |
| A receipt records observed stages, acceptance, and backend identity without overclaim | NOT MET | No build-receipt representation exists; the private stage tuple is not a receipt |
| Version discriminator, canonical encoding, Schema round trip, unknown-version policy, and migration fixtures exist | NOT MET | No build-receipt schema exists |
| Workflow-test evidence is explicitly distinct from a build receipt | MET | Plans 015/018 and the evidence packet make the distinction explicit |
| Two producer topologies exercise the same receipt evolution tests | NOT MET | Both pipelines have runtime tests, but neither emits a versioned build receipt |

Overall: **NOT MET**. The `effect-v1` and `node-sea-v1` values validate CI runs;
they are not product receipts.

## Gate 4: `SemanticPlan`

| Required criterion | Verdict | Evidence |
|---|---|---|
| Every input is closed/content-identified, with no ambient cwd, project config, PATH, environment, implicit import, or scoped path | REJECTED | Direct compilers intentionally preserve ambient project config/environment; bundle resolution and Node selection use physical paths |
| Required toolchain is identified semantically rather than by selected local path/version observation | REJECTED | Direct tools are discovered/probed; Node stage records a canonical physical path and exact observed version |
| A versioned canonical encoding and backend-independent acceptance contract exist | REJECTED | No such representation exists |
| Portable representation excludes output/workspace/tool/backend/transport facts | REJECTED | No portable representation exists, and current operations accept physical entry/output/cwd paths |
| The same encoding is consumed by at least two real binders | REJECTED | No encoding or binder exists; two compilers and two producers do not satisfy this criterion |

Overall: **REJECTED now**. Creating this value would mislabel ambient physical
inputs as portable intent.

## Gate 5: `BoundExecutionPlan`

| Required criterion | Verdict | Evidence |
|---|---|---|
| `SemanticPlan` is already earned | REJECTED | Gate 4 is rejected |
| One explicit binding operation adds tool paths, workspace/output, backend, and transport facts | REJECTED | No binder exists; current services select and execute directly |
| Bound and semantic values cannot be confused or encoded as each other | REJECTED | Neither representation exists |
| Rebinding preserves acceptance while producing distinct values, with two real bindings exercised | REJECTED | No portable plan or two real bindings exist; fake seams are test controls only |

Overall: **REJECTED now**. A fake executor cannot earn a bound-plan model.

## Gate 6: replaceable executors

| Required criterion | Verdict | Evidence |
|---|---|---|
| The same versioned semantic plan executes on two genuinely different backends | REJECTED | No semantic plan exists; all producers use the local process/filesystem backend |
| Both backends enforce the same acceptance and emit backend-specific observed receipts | REJECTED | One shared native acceptance owner exists, but there are neither two backends nor build receipts |
| Real failure/cancellation, workspace, transfer, retrieval, and credential/transport boundaries are tested | REJECTED | Local interruption/workspace cleanup is tested; transport and credentials do not exist |
| Backend selection is explicit without registry/fallback | REJECTED | Compiler selection is explicit, but it selects producers, not interchangeable execution backends |

Overall: **REJECTED now**. Bun versus Deno and direct versus composed are
producer differences, not replaceable backend evidence.

## Three equalities kept separate

| Equality | Meaning | Does not imply |
|---|---|---|
| Same semantic request | Equal versioned portable intent, closed input identities, toolchain requirement, and acceptance criteria | same local tool/path, environment, workspace, backend, argv, or bytes |
| Same invocation | Same semantic request plus the same bound toolchain, backend, materialization, argv/config, and declared environment | same output bytes unless measured |
| Same output bytes | Equal accepted content digest under one named algorithm | same request, invocation, provenance, behavior, or safety |

The current optional SHA-256 can establish only the third equality for outputs
that were actually hashed. It cannot establish either of the first two.

## Transaction and maintenance decision

No fail-fast, rollback, publish-mode, registry, retry, or fallback switch is
added. Matrix cells retain independent atomic commits. Before rename begins,
interruption preserves the old destination; after rename starts, publication
may linearize without an Artifact reaching the interrupted caller, and no
rollback is claimed.

Re-evaluate these gates only when a named consumer or genuinely different
backend appears. If a future maintainer selects an Artifact hard cut, it must
replace singular representation in one versioned migration rather than add a
plural peer. No follow-on implementation plan is created by this decision.
