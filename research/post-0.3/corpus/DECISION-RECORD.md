# Post-0.3 maintainer decision record

Date: 2026-08-18.
Decided by: the maintainer, in an interactive decision session against the research corpus.
Amended: 2026-08-18 after cross-lane audit corrected the authority, adoption, stability,
compatibility, signing, matrix, receipt, and Rolldown consequences without reversing the recorded
product choices.
Status: **maintainer product decisions**. These supersede competing proposals in the corpus and in
`plans/` where they conflict as statements of product intent. They do not override an active
repository or session instruction at a higher authority level. When product intent and an active
execution instruction conflict, implementation is blocked until that instruction is separately
updated by an authorized maintainer. These decisions do not certify an implementation or authorize
merge, publication, tags, or releases.

Reading rule: chronology is not authority. A later report wins only when it contains stronger,
applicable evidence or records a maintainer product decision. Otherwise the disagreement stays
open. Plans 039-044 must be reconciled against the evidence and this record before implementation.

## Decisions

### D1 — Authority baseline

The active execution instructions remain binding until changed through their own authority path.
This record cannot make them historical by declaration. It instead records the intended 0.4
product boundary and identifies any conflict that must be resolved before Plan 039 can start.

The released 0.3 surface is a compatibility contract for the 0.3 release line. It is not a veto on
an explicitly announced pre-1.0 0.4 hard cut. Every 0.4 retraction must be named, documented, and
tested as a removal; it must not silently alter a 0.3.x release.

### D2 — Macro-architecture: C2 approved

Provider-native semantics are the permanent base of the product. An `Api` operation calls an
upstream in-process API; a `Command` operation selects and runs the provider's CLI. Those are two
transport lanes, not a claim that the provider is a compiler and not a requirement that every
operation exist in both lanes.

Host/API lanes preserve upstream request and result types wherever Effect lifecycle does not
require a wrapper. Command lanes expose provider-owned typed requests and observations while
preserving native configuration authority, diagnostics, streams, exit status, and process
lifecycle; they do not pretend a CLI returned the provider's TypeScript result object. A small,
finite set of portable roles may be added only after each role's laws pass an adversarial proof
program (D8).

The product uses official Effect primitives directly for process, Scope, streams, and telemetry.
Shared machinery stays narrow but includes the invariants providers genuinely share: selected-tool
authority and observation, borrowed-output ownership, executable inspection, and durable
publication. The generalized build algebra and **mandatory provider-wide mirroring** of `Api` and
`Command` remain rejected by FAL-001 and FAL-002; useful operation-specific lanes are not rejected.

A direct native/FFI lane exists only if an upstream provider publishes a supported embeddable ABI
with lifecycle and compatibility contracts. Binding Bun's internal Zig functions (or equivalent
provider internals) is not treated as a cheaper command transport: without that ABI, effect-build
would own an unstable foreign binding and effectively reimplement the provider's public host API.

### D3 — Audience: public `Author/*` with a major-only breaking-change promise

Third-party integration authors are part of the 0.4 product. The initial public-author candidates
are exactly `Author/Tool`, `Author/BorrowedOutput`, and `Author/Executable`; research program R4 must retain
only candidates with a distinct invariant and executable laws. `Author/Command`,
`Author/CommandCompiler`, and an open-ended `Author/*` catch-all stay withdrawn.

No existing external adopter is required to validate an author primitive. Architectural validity
comes from coherent laws, honest failure and ownership, reduced invalid state, and adversarial
unchanged-consumer demonstrations across independent implementations or constructed external
adapters. Adoption affects priority, not validity.

Starting with the 0.4 public freeze, these author contracts receive the stronger project promise
intended by this decision: a breaking change requires the next major (`1.0`), despite ordinary
SemVer permitting more latitude before 1.0. Third-party packages declare tested core peer ranges;
first-party lockstep pins are governed by D10. No runtime protocol machine ships merely to restate
npm versions. It may be proposed later only for an independently versioned semantic handshake that
peer ranges and conformance tests cannot express.

R4 must settle the borrowed-output close/acquire race and the exact hashed/unhashed result
types from D12 before the public freeze.

Provider-specific policy data and evaluation code remain owned by each integration. The public
`Author/Tool` contract must nevertheless let an external adapter supply finite identity,
capability, relation, and refusal logic under the same laws, without access to first-party internals
and without creating a global registry or user-authored policy DSL.

### D4 — Migration: hard cut

0.4 removes replaced names and shapes at once. No deprecated aliases. The exact removal list
(including `withJavaScriptBundle`, `Integration`, `Provider`, ambiguous `Compiler` names) is
produced by the reconciliation surface map, not by this record.

### D5 — 0.4 scope: broad native coverage, evidence-gated

The 0.4 target is broad coverage of the native provider operation inventory. Research assigns each
candidate an explicit `ship`, `defer`, or `reject` disposition before the implementation surface is
frozen. Implementation and release certification then test that frozen surface. Certification may
fail a candidate; it may not silently make a failing operation disappear from the promised release.

"Broad" means every truthful operation that completes its evidence gate before freeze, not every
upstream feature without proof. The breadth supplement (Bun transpiler/scan, Deno
transpile/declaration modes, esbuild host variants and service lifecycle, Node SEA
loader/asset/snapshot/cache/injection and target-specific correctness repair) and the recorded
execution probes are required pre-freeze research. Plans 040-043 grow accordingly. Distribution
trust and Apple packaging are a separate research/product boundary under D11.

### D6 — Deno experimental surface: mirror upstream

Every `Deno.bundle()` and `deno bundle` operation ships explicitly experimental and is supported
only at listed exact provider identities, including channel/build identity when relevant. This is
an operation-level status, not a status inherited by the entire `Api` or `Command` module. Stable
operations such as `deno compile` retain the ordinary wrapper stability promise independently.
Even an experimental upstream operation has a documented effect-build wrapper/error shape; any
change to that wrapper follows the package's stated stability policy while upstream behavioral
claims remain limited to the tested coordinates.

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
event correctness under rapid change bursts, dependency discovery and graph changes,
dirty-during-build/coalescing behavior, output self-trigger loops, failed-build recovery,
interruption during active rebuild on all hosts, platform file-event semantics, and one shared
event vocabulary across routes 1-2 without erasing provider semantics. Route 1 must own an explicit
watch set and trigger policy; it may not guess a provider's source graph.

The 0.4 raw command-watch operation returns Effect's scoped child-process handle and byte streams.
It adds provider request validation, selected-tool authority, and argv rendering, but no parallel
effect-build watch handle, `Ready`, or `Rebuilt` protocol. Provider-direct writes may leave partial
durable output after failure or interruption and must say so.

### D8 — Portable roles: both proofs, ship-if-pass

Both role candidates — the Node sealed-main program and the narrow browser module payload — run
their adversarial unchanged-consumer substitution proofs during 0.4. A role that passes ships; a
role that fails stays a recorded proposal with its falsifier. The core browser-role contract earns
its own stability classification from its laws and proof maturity. Deno's adapter remains
experimental independently; it does not automatically make the provider-neutral role or Bun
adapter experimental. A real browser engine is part of the proof required before the role can
pass, not a matrix added only after success.

### D9 — Compatibility: exact executed points, plus one escape flag

Exact executed coordinates are the initial support allowlist, but a version string is not the
complete identity or safety model. Each provider privately evaluates the minimum facts already
required by observed failures:

- exact selected provider identity, including channel/revision/binary coherence where applicable;
- provider, operation, lane, host, and target coordinate;
- known-incompatible holes and bounded required-capability observations;
- non-overridable relations such as legacy Node SEA separate-builder/base equality;
- package peer and selected portable-profile compatibility where applicable; and
- selected-command content identity again immediately before provider launch when replacement can
  occur.

CI records exact observed evidence coordinates; a reviewed provider policy separately admits or
rejects them. An admitted exact coordinate passes only when its required gates pass. Known
incompatibility, missing or indeterminate required
capability, failed relation, incompatible peer/profile, or changed selection fails before provider
work or destination mutation. One Layer-scoped escape flag may transform only
`unknown coordinate + required capabilities present + all relations satisfied` into an explicit
`untested-override` warning and observation. It cannot override any other state.

This evaluator is integration-owned policy, not a public relation DSL or universal protocol
machine. Release and packed-consumer CI prove package/Effect declaration and runtime endpoints;
installation enforces npm peers. Layer acquisition selects and observes one canonical tool and
rejects selection/global-identity failures, but it does not decide an operation/target-dependent
unknown-version override. Operation preflight decides admission once lane, host, target,
capabilities, relations, and profile inputs are known. A replaceable command is reauthenticated by
full content identity immediately before launch. No automatic installation, fallback, or hidden
substitution is introduced.

### D10 — Release cadence: lockstep

First-party packages release in lockstep: one version number, released together, with exact
same-version peer pins. Accepted cost: a widening for one provider bumps all first-party packages.
If `effect-build-rolldown` ships under D15, it becomes a sixth first-party package in this train.

Third-party integration packages are not part of the maintainer's release train. They declare and
test an explicit compatible core peer range. Lockstep npm versions deliberately remove a runtime
protocol negotiation state for first-party packages; they do not prove semantic compatibility for
independently versioned external adapters.

### D11 — Signing: two layers, separate operation family

Layer 1 (candidate correctness): before durable publication, each executable-producing operation
performs only the target-specific validity repair proven necessary for that candidate. The known
example is macOS Node SEA ad-hoc re-signing after injection; the operation is a no-op where no such
repair is required. It makes no identity or distribution-trust claim and remains inside the
provider assembler/pipeline that invalidated the candidate. A cross-target build-host cell that
cannot perform or prove required repair is unsupported or must model a later compatible-host
correctness-finalization stage; it may not publish an unverified candidate under the same claim.

Layer 2 (distribution trust) contains different operation kinds that must not be flattened:

- code signing, container construction, and stapling mutate bytes and return a new artifact plus
  input/output digests and a provenance edge;
- notarization is a credentialed remote job returning a submission identity and terminal
  result/ticket bound to the unchanged input digest; and
- local verification/assessment returns a host/tool/policy observation bound to the input digest.

Secure timestamping is part of the signing policy rather than a separate generic transformation.
In-place mutation of caller input is rejected for mutating operations. These operations do not live
in `effect-build-node-sea`.

The packaging home remains a research and product-boundary question. The study must distinguish a
raw executable, `.app` bundle, ZIP containing signed inner contents, notarized/stapled artifact,
`.pkg` installer, and
DMG; Developer ID Application and Developer ID Installer credentials; hardened-runtime and
entitlement authority; and Gatekeeper verification. It must compare a dedicated Apple/trust
package with leaving release-distribution orchestration to consuming systems.

### D12 — Digests: per-claim requirement, caller choice elsewhere

Plan 034's implemented mechanics stand as 0.3 history. The 0.4 design follows the lifecycle lane's
refined laws: each observation type declares by its semantic claim whether a digest is required.
Plain artifact production keeps hashing as a caller choice. The API uses distinct hashed and
unhashed observation variants rather than `digest?:`; mutation detection, provenance, signing, and
certification claims always select the hashed variant.

Digests are algorithm-qualified (`{algorithm, value}`). When a digest is produced, byte count and
digest come from the same content traversal. Stat facts never substitute for content digests, and
signing produces new digests with provenance edges (D11). R4 must choose streaming hashing,
an explicit size bound with typed failure, or deferral for arbitrary-size integrity claims;
unbounded whole-file buffering is not an implicit contract.

### D13 — Certification host matrix: five hosts

Linux x64, Linux arm64, macOS arm64, macOS x64, Windows x64. Windows arm64 is a candidate addition
when runner support is routine. For each compatibility widening, CI executes every applicable
provider/operation/lane cell on every host that operation claims to support. Unsupported cells are
explicit exclusions and never count as a pass. Build-host coverage is separate from the artifact
target, architecture, ABI/libc, and cross-target execution matrix.

Browser engines are part of D8's proof program. If the role ships, the selected exact engine set
becomes recurring release certification; engine proof is not circularly postponed until after the
role passes.

### D14 — Receipts: retained on a separate repository evidence ref

Release-significant CI receipts (small JSON: exact tool identities, hosts, source SHA, assertions)
must survive artifact retention, but they must not make certification self-referential. CI first
certifies one immutable source SHA and may tag/release that SHA. A separately authorized,
least-privilege archival job then copies the receipt idempotently to an orphan, receipt-only,
append-only ref in this repository (initially `evidence/receipts-v1`), keyed by the certified source
SHA. The archival commit has a different SHA and is never presented as the certified source. Its
push must not trigger certification; workflow exclusions and the isolated ref enforce this, with
`GITHUB_TOKEN` event suppression only as defense in depth. The candidate/default/release branch is
not mutated by this archival step. Moving evidence to a separate repository would require a later
explicit decision.

The exact evidence-ref topology and workflow permissions require a separate maintainer operations
approval before implementation. This applies only to the project's own release evidence. An
optional product-side provenance receipt requested by a library user is a distinct API concept
governed by the lifecycle model.

### D15 — Adapter promotion: Rolldown

Rolldown is promoted toward a first-party `effect-build-rolldown` package in 0.4 through its own
dossier, native-operation laws, applicable five-host cells, packed-consumer checks, namespace,
release, and trusted-publisher gates. If it passes, it is the sixth lockstep package under D10;
Plans and tooling that hard-code five packages must be updated before freeze.

This provider-package gate is independent from the portable `IncrementalNodeMain` profile gate.
The profile ships only if unchanged consumers conform across Rolldown and esbuild against the
corrected Node-main canon. A profile failure does not invalidate a truthful provider-native
Rolldown package, and package success does not prove the profile.

Recorded execution at Rolldown 1.2.4 demonstrated scoped build/generate/close behavior with
repeated production after source mutation and enforced release, so its earlier deferral was
scope-based rather than an adoption veto. `@yao-pkg/pkg` stays research-only until Q10 proves a
mode consuming one already-sealed main with no hidden acquisition, traversal, or semantic rewrite;
its default mode conflicts with the no-hidden-acquisition law.

### D16 — `withJavaScriptBundle` removed at the hard cut

Decided 2026-08-18 in reconciliation question batch 1. The Bun bundle continuation is removed in
0.4, superseded by the native bundle operations and the borrowed-output laws. This retracts
released 0.3 behavior (per D1's flagging rule). Deferred by the maintainer in the same batch,
still open: the public name of the native compile operations, and the fate of
`compileExecutableMatrix`. Withdrawn from the maintainer list as misclassified: per-service
service-vs-function verdicts are pre-freeze R4 design analysis under the evidence-backed service test,
not maintainer preference.

## Dissolved questions

- Coordinated-major cadence: dissolved by D10.
- Protocol-version/npm relationship for first-party packages only: exact lockstep peers plus
  conformance tests remove the need for an additional runtime protocol. Independently versioned
  third-party adapters still require explicit peer compatibility and may later earn a semantic
  handshake if npm metadata is insufficient.
- Node SEA CJS-vs-ESM and asset/cache/snapshot scope are evidence-gated under D5 rather than
  maintainer taste. The proven subset may be selected before freeze; additions require exact
  evidence.

## Required research work list

1. Breadth supplement (D5): the named provider-operation holes and exact lane availability.
2. Compatibility reconciliation (D9): provider identities, capabilities, holes, relations,
   evaluation timing, and applicable-host support cells.
3. Typed watch protocol program (D7): routes, authority, and experiments as listed.
4. Role proof programs (D8): Node sealed-main and browser module payload adversarial matrices.
5. Rolldown provider dossier and independent profile gates (D15); pkg Q10 only if revisited.
6. Apple distribution/trust boundary study (D11), including package-home options and
   credential-backed probes.
7. Receipt archival operations design and authorization (D14).
8. Cross-lane reconciliation per `RECONCILIATION.md`, yielding the frozen 0.4 surface map and
   D4 removal list before Plans 039-044 are rewritten.

## Standing process rules reaffirmed

- Evidence axes stay separate: provenance vs disposition; adoption is priority, not validity.
- Ship-if-pass discipline for every gated candidate; a failed gate produces a recorded falsifier.
- Implementation success does not authorize merge or release; those remain separately authorized.
