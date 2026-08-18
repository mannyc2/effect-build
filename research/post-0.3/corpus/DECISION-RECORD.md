# Post-0.3 maintainer decision record

Date: 2026-08-18.
Decided by: the maintainer, in an interactive decision session against the research corpus.
Status: **maintainer decisions**. These supersede the competing proposals in the corpus and in
`plans/` where they conflict. They do not certify any implementation, and they do not authorize
merge, publication, tags, or releases.

Reading rule: the research lanes postdate the numbered plans (039-044). When a plan and a lane
disagree, the lane's later evidence wins and the plan must be amended, not the reverse.

## Decisions

### D1 — Authority baseline

No historical rule document is authority for the future public surface. The committed `AGENTS.md`
at the PR head and the narrower workspace session instruction are both historical records. The
released 0.3 surface is a fact, not a commitment: any later decision that retracts released
behavior must be flagged as a retraction. Every part of the future public surface was open at the
start of this series, including `compileExecutable`.

### D2 — Macro-architecture: C2 approved

Provider-native semantics are the permanent base of the product. Each public operation keeps its
provider's native request and result types. A small, finite set of portable roles may be added,
one at a time, only after each role's laws pass an adversarial proof program (see D8). The product
uses official Effect primitives directly for process, scope, streams, and telemetry. Shared
machinery stays narrow: ownership and publication. The generalized build algebra and mirrored
`Api`/`Command` namespaces remain rejected per their recorded falsifiers (FAL-001, FAL-002).

### D3 — Audience: public `Author/*` with ordinary semver

Third-party integration authors are part of the 0.4 product. The `Author/*` contracts are public,
governed by ordinary semver discipline: peer ranges, documentation, breaking changes only in major
versions. No formal protocol machine ships unless a real invariant and a real consumer earn it
(per the corpus's own primitive-rent rule). Consequence: the unresolved contract details — the
borrowed-output close/acquire race policy and the digest policy — must be settled inside Plan 039,
before the public freeze. `Author/Command` and `Author/CommandCompiler` stay withdrawn.

### D4 — Migration: hard cut

0.4 removes replaced names and shapes at once. No deprecated aliases. The exact removal list
(including `withJavaScriptBundle`, `Integration`, `Provider`, ambiguous `Compiler` names) is
produced by the reconciliation surface map, not by this record.

### D5 — 0.4 scope: broad native coverage, evidence-gated

The 0.4 target is broad coverage of the native provider operation inventory. Each operation still
passes its own evidence gate; an operation that fails its gate is excluded at certification.
"Broad" means everything that earns its place, not everything without proof. Consequences: the
breadth supplement (Bun transpiler/scan, Deno transpile/declaration modes, esbuild host variants
and service lifecycle, Node SEA loader/asset/snapshot/cache/injection/signing) and the recorded
execution probes are **required** pre-freeze research, and Plans 040-042 grow accordingly.

### D6 — Deno experimental surface: mirror upstream

The Deno bundle lane ships public and marked experimental, excluded from the semver stability
promise, supported only on exact CI-executed Deno versions. The stable Deno command lane carries
the normal promise.

### D7 — Watch and serve: honest forms now, typed protocol as research

0.4 exposes esbuild context watch and serve as native operations, and Bun/Deno raw scoped command
watch as process handles with byte streams. 0.4 makes no typed cross-provider event promise; the
CLI-text-parsing route stays falsified. A bounded research program pursues a future typed protocol
through honest routes:

1. a product-owned watch loop over native one-shot operations (typed lifecycle events emitted by
   the product's own loop; payloads stay provider-native);
2. in-process provider callbacks (esbuild rebuild results) feeding the same events;
3. upstream structured watch output from Bun/Deno, adopted version-gated when it appears.

Required experiments: rebuild-latency comparison (cold one-shot loop vs warm provider `--watch`),
event correctness under rapid change bursts, interruption during active rebuild on all hosts, and
one shared event vocabulary across routes 1-2 without erasing provider semantics.

### D8 — Portable roles: both proofs, ship-if-pass

Both role candidates — the Node sealed-main program and the narrow browser module payload — run
their adversarial unchanged-consumer substitution proofs during 0.4. A role that passes ships; a
role that fails stays a recorded proposal with its falsifier. The browser role, if shipped,
carries the experimental marking inherited from its Deno dependency (D6).

### D9 — Compatibility: exact executed points, plus one escape flag

A provider operation is supported only on the exact tool versions CI executed. Any other version
fails preflight with a clear error naming the executed versions. One documented escape flag admits
an untested version with a clear warning; known-bad versions stay blocked regardless of the flag.
Consequences: CI widening is a standing routine (detect new provider releases, execute the matrix,
release a widened point list), and the support list is data updated by ordinary releases. The
research's full hybrid model (capability probes, immutable-observation override keys, relation
machines, per-operation digest re-checks) is deferred until a real failure earns each part.

### D10 — Release cadence: lockstep

The packages release in lockstep: one version number, released together, with the release tooling
as qualified today. Accepted cost: a widening for one provider bumps all packages. Peer ranges
between the packages are exact same-version pins.

### D11 — Signing: two layers, separate operation family

Layer 1 (correctness): the build pipeline applies the minimal re-signature required for every
produced executable to run on its platform (in particular after Node SEA injection on macOS).
Layer 2 (trust): distribution signing, notarization, verification, and timestamping form an
explicit, separate, privileged operation family. Each such mutation consumes an immutable observed
artifact and produces a new artifact, new digest, and a provenance edge (operation, input digest,
output digest, tool identity, time). In-place mutation is rejected. This family does not live in
`effect-build-node-sea`; its packaging home (including a dedicated platform-trust package) is a
research question.

### D12 — Digests: per-claim requirement, caller choice elsewhere

Plan 034's implemented mechanics stand as 0.3 history. The 0.4 design follows the lifecycle lane's
refined laws: each observation type declares by its semantic claim whether a digest is required —
never ambiguously optional. Plain artifact production keeps digest as a caller choice. Digests are
algorithm-qualified (`{algorithm, value}`), bytes and digest come from one traversal, stat facts
never substitute for content digests, and signing produces new digests with provenance edges
(D11). Incremental hashing stays open against upstream Effect. Plan 039 must incorporate these
laws.

### D13 — Certification host matrix: five hosts

Linux x64, Linux arm64, macOS arm64, macOS x64, Windows x64. Windows arm64 is a candidate addition
when runner support is routine. Browser engines enter only if the browser role passes its proof
(D8). Every compatibility widening (D9) runs on all five hosts.

### D14 — Receipts: committed to this repository

Release-significant CI receipts (small JSON: exact tool versions, hosts, source SHA, assertions)
are committed into this repository by the release workflows instead of living only as expiring
GitHub artifacts. This applies to the project's own evidence only; the product never touches a
user's version control. The product-side provenance receipt (an optional user-requested output
file) is a separate concept governed by the lifecycle lane's model.

### D15 — Adapter promotion: Rolldown

Rolldown is promoted toward product status in 0.4 through the full evidence gates (dossier,
probes, five-host matrix), ship-if-pass. Evidence basis: recorded remote execution at Rolldown
1.2.4 demonstrated the scoped build/generate/close handle with repeated production after source
mutation and enforced release; its earlier deferral was scope-based, not evidence-based. Its
promotion reopens the deferred incremental Node-main profile for evaluation. `@yao-pkg/pkg` stays
research-only until open question Q10 (a mode consuming one already-sealed main with no hidden
acquisition, traversal, or semantic rewrite) is answered; its default mode conflicts with the
standing no-hidden-acquisition law.

### D16 — `withJavaScriptBundle` removed at the hard cut

Decided 2026-08-18 in reconciliation question batch 1. The Bun bundle continuation is removed in
0.4, superseded by the native bundle operations and the borrowed-output laws. This retracts
released 0.3 behavior (per D1's flagging rule). Deferred by the maintainer in the same batch,
still open: the public name of the native compile operations, and the fate of
`compileExecutableMatrix`. Withdrawn from the maintainer list as misclassified: per-service
service-vs-function verdicts are Plan 039 design analysis under the evidence-backed service test,
not maintainer preference.

## Dissolved questions

- Protocol-version/npm relationship: dissolved by D3 + D10 (ordinary semver, lockstep pins).
- Coordinated-major cadence: dissolved by D10.
- Node SEA CJS-vs-ESM and asset/cache/snapshot scope: evidence-gated under D5, not a standing
  choice; the proven subset ships, additions require exact evidence.

## Required research work list

1. Breadth supplement (D5): the named provider-operation holes.
2. Recorded execution probes retained as UNKNOWN in the lanes (D5, D9's widening baseline).
3. Typed watch protocol program (D7): routes and experiments as listed.
4. Role proof programs (D8): Node sealed-main and browser module payload adversarial matrices.
5. Rolldown product dossier and gates (D15); pkg Q10 if and when revisited.
6. Signing packaging-home study (D11), including the dedicated trust-package option.
7. Cross-lane reconciliation per `RECONCILIATION-GATES.md`, producing the canonical operation
   model and the 0.4 surface map (which also yields D4's removal list).

## Standing process rules reaffirmed

- Evidence axes stay separate: provenance vs disposition; adoption is priority, not validity.
- Ship-if-pass discipline for every gated candidate; a failed gate produces a recorded falsifier.
- Implementation success does not authorize merge or release; those remain separately authorized.
