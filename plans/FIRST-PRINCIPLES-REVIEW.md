# effect-build first-principles review — revision 3

Reviewed at commit `15b6abb` on branch `feat/effect-build-foundation`, against
`plans/FIRST-PRINCIPLES-REVIEW-BRIEF.md`. Revision 1 (2026-08-10) was audited
by the operator and corrected into revision 2; a second operator audit
accepted revision 2's findings as trustworthy and required targeted edits,
applied here as revision 3. **This review does not authorize Plan 010.**

Repository changes made by this revision: this file, and the Plan 007–010
status cells plus one intro sentence in `plans/README.md` (marked `BLOCKED`
so the review is operationally enforced, not just prose). No source files
were modified by any revision of this review. The repository separately
carries substantial pre-existing user WIP (README, docs, examples, config),
untouched.

## Revision 3 targeted edits (operator audit of revision 2)

1. Plans 007–010 are now `BLOCKED` in the actual plan index; review prose
   alone does not stop an executor.
2. Gate ordering corrected: gates 1–4 and 6 precede implementation; gate 5
   precedes deletion, not implementation.
3. Export-state statement corrected: the *managed* API is the current public
   surface; the *standalone* path is what stays internal until the deletion
   decision.
4. Kill-policy split corrected and source-verified: Effect supplies scoped
   finalization and the escalation mechanism, but `forceKillAfter` "Defaults
   to `undefined`, which means that no timeout will be enforced by default"
   (pinned `ChildProcess.ts`, KillOptions). Plan 008 chooses two seconds; the
   TERM→SIGKILL *policy* is therefore library-owned.
5. The library's existence is no longer presumed: gate 4 now asks whether the
   added behavior justifies a library over a documented Effect recipe, rather
   than asking the user to confirm a preselected pitch.
6. Absolutes narrowed: CI claim scoped to the checked-in workflow; the
   interruption-record finding sharpened to "no truthful record, possibly a
   later inaccurate normal record"; D/E "fail on evidence" softened to
   "currently unowned or costlier, not logically eliminated"; byte
   nondeterminism scoped to the reviewer's runs; the only-change claim scoped
   to this revision.
7. Documentation correctness separated from deletion: false guarantees in the
   README/docs need correcting even if Plan 010 is declined.
8. Result projection separated from validation cost: `target`/`tool` are free
   projections of work the guarantees already do; only `digest` adds a
   separate full read.

## Errata from revision 1 (operator verification, 2026-08-10)

| Revision 1 claim | Status after verification |
|---|---|
| "The managed guarantees were never implemented." | **Retracted.** Canonical build identity, opaque prepared authority, verified CAS reads, snapshots, durable no-replace commits, partial terminal records, artifact ingestion, cleanup, and atomic flat-path materialization exist and function. The contract is incomplete end-to-end and overstated publicly — not nonexistent. |
| "Deletion forfeits almost no working behavior." | **Retracted.** A forced real Bun 1.3.9 integration (operator-run, re-run by the reviewer: passes) reaches `BuildSucceeded` through the managed execution/CAS path and writes its record. Deletion removes working machinery. Whether that machinery has an owner is the real question. |
| Bun `--compile` implies minification, so `minify?: boolean` is unrepresentable. | **Refuted experimentally** (operator; reproduced by reviewer). Default compile output is *unminified* — a probe identifier survives in default and `--no-minify` binaries and disappears under `--minify`/`--production` — contradicting Bun 1.3.9's own help text ("Implies --production"). Both states are selectable; the option is representable. Replaced by a pinned regression test (§8). |
| Bun musl outputs are static ELF and would hit `AbiUnknown`. | **Refuted for Bun 1.3.9** (operator): both x64 and ARM64 musl outputs were dynamically linked and the existing inspector correctly returned `musl`. Static-ELF ambiguity is demoted to a defensive design note (§8), not an observed defect. |
| First user = the operator's release tooling; checksum manifests justify `digest`/`bytes`/`target`/`tool` as required Artifact fields. | **Retracted as fact; retained only as one candidate scenario.** The brief explicitly forbids specializing around `ts-release`. Which fields a generic Effect developer needs beyond `path` is an open decision gate (§12). |
| Common `compileExecutable(driver, input)` beats per-tool functions. | **Downgraded to an open decision.** Per-tool functions are simpler and separate options by construction; the common operation's extra benefit has no named consumer. Burden of proof sits on the common operation; see gate 1. |
| The Plan 009 matrices are "proof ratchet." | **Partly retracted.** The hermetic/offline framing belongs to the abandoned managed promise. But every *advertised* compiler, orchestrator runtime, and target needs ordinary compatibility testing — or the advertised support must narrow. Matrix size is a consequence of the support claim (gate 3). |
| Plan 010 is safely gated on deletion authorization. | **Corrected.** Plan 010 as written enforces no fresh user-approval gate. Its index row is now `BLOCKED` on a recorded operator authorization, and §10 requires the plan text itself gain that STOP clause before it is executable. |

Findings from revision 1 that survived verification: uncancellable child
processes; `unknown` public error channels; no truthful terminal recording
for interruption or infrastructure failure; version- and macOS/ARM-pinned
drivers; false-green integration tests; the native-executable inspector
existing but not wired into production output validation; Deno embedding the
compiler-visible output basename as application identity (so Plan 008's fixed
`staged.exe` is wrong — staging must preserve the final basename, with
Windows `.exe` normalization); Deno's bundle/minify correlation and
six-target set being correctly modeled.

## Evidence base

Tags: **[repo]** read from the tree at `15b6abb` plus the dirty worktree.
**[tool]** observed by the reviewer running local compilers (`bun 1.3.9`,
`deno 2.9.5`; the CI pin is Deno 2.9.3). **[op]** operator-verified
experiments reported 2026-08-10 (disposable directories; no repo changes).
**[user]** goals stated in the brief. Everything else is reviewer inference,
marked as such.

Verified state of the managed system:

- **Working** [op, partially re-run by reviewer]: `pnpm check`; `pnpm
  test:unit` (35 tests); the end-to-end happy path snapshot → plan → run →
  CAS ingest → terminal record with a real, forced Bun 1.3.9 (`BuildSucceeded`
  observed; reviewer re-ran: passes in ~1.5 s). The durable no-replace commit,
  content-addressed store with verified reads, canonical identity/digest,
  prepared-authority check, and flat-path atomic materialization exist and
  run. [repo/op]
- **Missing or overstated** [repo]: fiber interruption cannot kill a compiler
  (`src/internal/ProcessExecutor.ts:92` wraps spawn in `Effect.promise` with
  no abort wiring; the only "interruption" test asserts a wall-clock
  timeout). Public failure channels are `unknown` (`src/Build.ts`) —
  acknowledged in the user's own `docs/roadmap.md`. **No path writes a
  truthful interruption or infrastructure-failure record; worse, because the
  attempt body is an uncancellable promise, an interrupted build's compiler
  may run to completion and later write a normal executed/rejected record
  that misrepresents the attempt** (`src/BuildExecutor.ts:126–244`). Records
  have no read API. `materialize` does no post-write digest verification and
  fails for nested logical paths (roadmap-acknowledged). `ExecutionPlatform`
  layers read `process.platform`/`process.arch` globals rather than probing
  the configured executable (`src/ExecutionPlatform.ts:43–48`), against
  Plan 001's own rule. Both drivers hard-pin exact versions and
  `darwin`/`aarch64` (`src/bun/BunCli.ts:50,118`,
  `src/deno/DenoCli.ts:102,150`), so no driver can construct on Linux,
  including CI. The managed integration test, even when forced, does not
  materialize or execute the managed artifact — it executes the direct-CLI
  comparison output. [op]
- **Vacuous verification** [repo, op]:
  `test/integration/cross-driver-executable.test.ts` builds nothing;
  `publication-host.test.ts` reads a text fixture; the "host contract" spawns
  runtimes with raw `node:child_process` and never imports library code;
  `pnpm test:integration:all` passes without compiling anything when tool
  variables are absent [op]. The checked-in workflow provides no tool
  variables and its standalone `sudo unshare --net true` step proves nothing
  about later steps, so **the workflow as committed cannot require a compiler
  run**; historical CI runs were not available to this review.

Compiler behavior:

- **Bun minify** [op; reproduced by reviewer]: default `--compile` output is
  unminified despite help text; `--minify`/`--production` minify. Reviewer
  addition: byte equality across identical invocations was unstable in the
  reviewer's runs (two identical default builds differed), so byte comparison
  is not a valid regression oracle here; the regression test must assert on
  bundle content (identifier survival).
- **Bun musl** [op]: 1.3.9 musl outputs are dynamically linked; the existing
  inspector returns `musl` correctly.
- **Deno** [tool, consistent with official docs]: `compile` has `--bundle`
  (experimental) with `--minify` meaningful only alongside it; exactly six
  `--target` values, none musl; permission flags as modeled; and the
  executable's storage identity "defaults to the output file name," which is
  the concrete mechanism making staged-name divergence observable.
- **Kill escalation** [repo, reviewer-verified in pinned source]:
  `KillOptions.forceKillAfter` "Defaults to `undefined`, which means that no
  timeout will be enforced by default." Escalation is a mechanism Effect
  offers; enforcing TERM→SIGKILL within a bound is a policy the library must
  choose (Plan 008 chooses two seconds).

Corrected central finding:

> **The managed system is a functioning but incomplete private prototype
> whose public promises exceed its implementation.** The happy path works on
> the pinned toolchain and host. The advertised guarantees — typed failures,
> interruption ownership, complete truthful recording, portable drivers,
> validated outputs — are the parts that do not exist yet, and the test/CI
> surface is arranged so their absence does not show.

A hard cut may still be the right product decision. It does not follow
automatically from the defects, and it would delete real working machinery.

## 1. Verdict

**If a library is built at all**, the standalone thesis of Plans 007–008 —
one scoped, typed, atomically publishing compile operation — is the best
candidate shape: every defect verified above is a defect against exactly
those four guarantees, and none of the working managed machinery (identity,
CAS, records) has a named consumer. Whether the added behavior justifies a
library over a documented Effect recipe is itself now a gate (gate 4), not a
premise of this review.

This review does not authorize Plan 010. Four decisions the plans currently
treat as settled are reopened as gates preceding implementation:
library-versus-recipe, the API shape (per-tool vs driver-parameterized), the
result fields, and the honestly advertised support matrix. Deletion of the
managed system is a separate, explicit user decision to be made after one
real vertical slice is green, and Plan 010 must gain that gate in its own
text. Operationally, Plans 007–010 are marked `BLOCKED` in `plans/README.md`
as of this revision.

## 2. First user and job

The brief's question, answered honestly: the repository names no external
first user, and the brief forbids specializing around `ts-release`. What can
be said without invention:

- **Candidate profile** (inference): an Effect-adopting TypeScript developer
  who ships a CLI as a single native binary and wants the compile step to be
  a first-class Effect inside a larger program — concurrent multi-target
  builds, orchestration, tests — rather than a subprocess island.
- **Smallest successful interaction** (both API shapes under consideration):

  ```ts
  compileExecutable(Bun.driver, { entrypoint: "src/main.ts", outfile: "dist/app" })
  // or, per-tool:
  Bun.compileExecutable({ entrypoint: "src/main.ts", outfile: "dist/app" })
  ```

- **What they consume from the result** is the open question (gate 2). `path`
  is certainly needed. Of the rest: if target validation and tool probing are
  guarantees the product makes anyway, `target` and `tool` are free
  projections of already-done work and `bytes` is one stat — their real cost
  is API-surface commitment, not I/O. Only `digest` adds a separate full read
  of the output. See §8.

For contrast, the current public workflow requires roughly thirteen concepts
to compile hello.ts — three store roots, a controller-executable layer,
snapshot/`BuildContextRef`, a seven-field request envelope, the driver
service, `BuildOutcome`, re-decoding an unbranded `ArtifactRef`,
`materialize` — about 50 lines in the README's own quickstart. [repo] That is
the DX complaint, quantified, and it stands regardless of which new shape is
chosen.

## 3. Baseline competitor

The smallest idiomatic direct solution under the pinned Effect
(`effect@4.0.0-beta.106`, `effect/unstable/process`):

```ts
const compile = Effect.scoped(Effect.gen(function*() {
  const handle = yield* ChildProcess.make("bun",
    ["build", "--compile", "src/main.ts", "--outfile=dist/app"],
    { forceKillAfter: "2 seconds" })
  const [stderr, exitCode] = yield* Effect.all(
    [collectBounded(handle.stderr), handle.exitCode], { concurrency: 2 })
  if (exitCode !== 0) yield* new CompileFailed({ exitCode, stderr })
}))
```

~20 lines with `NodeServices.layer`. Scope closure kills the child; note the
escalation bound is opt-in (§4). What the baseline lacks, and what a careful
author must add: correct concurrent bounded drains; sibling staging plus
atomic rename so a failed build never tears the previous binary; staged
output validation and (if wanted) hashing; typed per-compiler options and
canonical targets; PATH/explicit probing with observed tool metadata; a
stable error vocabulary. Roughly 200–400 lines to do properly, once. **That
remainder is the entire library** — a packaged, maintained recipe. Whether
that recipe should be a package or a documented pattern is gate 4.

## 4. Unique value — split by who supplies it

| Guarantee | Effect already supplies | Library adds |
|---|---|---|
| Scoped process ownership | Scoped finalization and the escalation *mechanism* (`forceKillAfter` defaults to `undefined` — no bound enforced unless chosen) | The TERM→SIGKILL escalation *policy* (Plan 008's two seconds); correct concurrent bounded drains; tying staging cleanup to the same Scope |
| Atomic destination (previous-or-new complete file) | rename/temp-dir primitives | The staging protocol, its state table, and the promise itself |
| Typed failures + per-driver typed options | Schema/tagged errors as mechanism | The closed vocabulary; option/argv mappings kept current with two moving CLIs |
| Validated result | — | Existence/format checks, optional digest, observed tool/target |

Stated plainly: Effect supplies the mechanism for the first guarantee and the
library owns its policy; rows 2–4 are library-owned outright, and row 3 is
where the ongoing maintenance cost lives. This table is the input to gate 4 —
does this remainder justify a maintained package over a documented recipe? —
and it is why Alternative A must be named in any future README as the
~20-line floor the package improves on.

## 5. Wrong questions

Where the prior discussion optimized distinctions that were not load-bearing:
proof/evidence lattices (a library inside the builder cannot attest the
builder — the user's interruption was correct); canonical identity and
cache-eligibility semantics with no cache consumer; in-process capability
defense (WeakMap-guarded handles, forged-Layer rejection, fingerprint
commitments — defending against a caller who already has code execution);
byte-identity CLI parity and stable-vs-LTS channel provenance; crash-durable
records with no read API; portable-path lattices for a snapshot feature
nobody requested.

The diagnostic tell: **the public promises and the verification surface
outran the implementation.** The specs demand fsync protocols and truthful
terminal tables while the shipped executor cannot cancel a process and types
every public error `unknown`; the tests that would expose the gap are the
ones that turn out to be vacuous. When the paperwork and the test names
certify guarantees the code does not make, the paperwork was serving the
architecture's self-image.

## 6. Right questions

The decisions that must precede more architecture — these are the gates of
§12:

1. Is the smallest product per-tool Effect APIs, or one driver-parameterized
   operation?
2. Which result fields does a generic Effect developer actually need beyond
   `path` — noting that only `digest` carries a separate I/O cost?
3. Which orchestrator runtimes, compilers, and targets are honestly supported
   in V1 — with the corollary that everything advertised gets ordinary
   compatibility testing, and everything untested leaves the advertisement?
4. Does the library's own remainder (§4) justify a maintained package over a
   documented Effect recipe at all?
5. After one real vertical slice works, does the user explicitly want the
   managed product deleted?
6. What is the upgrade policy for `effect@4.0.0-beta.106` and
   `effect/unstable/process` — an unstable module of a beta underneath a
   public contract deserves an explicit "upgrade deliberately, never
   incidentally" rule in AGENTS.md.

## 7. Alternative comparison

| | User value | Concepts introduced | Behavior guaranteed | Maintenance | Deletion consequences |
|---|---|---|---|---|---|
| **A: no library** | Recipe documented once, re-implemented per project | 0 | Only what Effect's Scope gives (no escalation bound unless chosen) | N× across projects | None; managed question unchanged |
| **B: per-tool wrappers** (`Bun.compileExecutable(input)`) | The four §4 guarantees; simplest surface; option separation *by construction* | layer + input + result + errors | Same engine as C | Shared private engine | Same as C |
| **C: common operation** (`compileExecutable(driver, input)`) | B plus driver-generic composition | B + driver value + option-witness generics | Same as B | Slightly higher (generic machinery, inference risk) | Same as B |
| **D: simple API over retained managed internals** | Same surface, worse insides | Hidden CAS/snapshot/records under a two-field call | Weaker: the internals lack the missing guarantees the new API would advertise (no cancellation, untyped errors) and force concepts the call never asked for | Highest: two vocabularies indefinitely | Deferred |
| **E: two explicit products** | Managed tier currently has no named user | Everything, twice | Split | Two Artifacts, two driver contracts, double CI | Deferred |
| **F: one compiler first** | Fastest shippable slice | Subset | Subset | Lowest | Same as chosen shape, later |

**B vs C is genuinely open** (gate 1). The verifiable facts: B is one concept
smaller and gets cross-driver option safety without witness machinery; C's
extra cost is modest; C's extra benefit — code generic over the compiler —
has **no named consumer today**. Under this review's own rule ("may support X
later" is not a consumer), the burden of proof sits on C. **D and E are not
logically eliminated; they fail on current ownership and cost**: D would ship
machinery that lacks precisely the guarantees its API would advertise, and
E's managed tier has no current user of its distinctive capabilities — a
state that changes if a real owner appears. **F** remains the effort-pressure
fallback; the second compiler is what keeps any "common" semantics honest, so
choosing F also defers common-operation claims.

## 8. Minimal API recommendation — shape pending gates 1 and 4

Common to both shapes: required `entrypoint` and `outfile`; optional `cwd`,
optional canonical `target`, optional compiler-specific `options`;
provisioning in `layer({ executable? })` (PATH default, absolute override);
host services provided once at the application boundary; a closed error union
(Plan 007's nine tags are a reasonable draft; `OutputLocked` stands or folds
into `PublicationFailed` with gate 3's Windows decision); interruption never
an error member.

**Result**: `path` plus whichever fields gate 2 approves. The cost question
decomposes cleanly: if target validation and tool probing are guarantees the
product makes anyway (gates 3–4), then `target` and `tool` are free
projections of work already done and `bytes` is one stat — for these the real
question is committing API surface, not I/O. Only `digest` adds a separate
cost: one full sequential read of the output. Gate 2 therefore reduces mainly
to whether `digest` is default or opt-in, and which free projections the
product commits to keeping stable.

Amendments, corrected after verification:

1. **Bun minify regression pin.** Bun 1.3.9's observed default is unminified,
   contradicting its own help text. Expose `minify?: boolean` (render
   `--minify` when true; nothing or `--no-minify` when false) and pin the
   observed behavior with a regression test that compiles a probe entrypoint
   and asserts identifier survival/removal in the produced binary — not byte
   comparison, which was unstable across identical invocations in the
   reviewer's runs and is therefore not a valid oracle.
2. **ABI validation policy (defensive design note, not an observed defect).**
   Bun 1.3.9 musl outputs are dynamically linked and classify correctly [op].
   But the inspector's `AbiUnknown` path (static or unrecognized interpreter)
   will eventually be hit by some tool/version. Plan 008 must state the
   policy explicitly — validate format→OS and machine→arch always; treat ABI
   as evidence that can be `unknown`; define what `Artifact.target` reports
   in that case — rather than letting the answer be whatever reused code
   happens to throw.
3. **Stage under the final basename** (confirmed by [op]): Deno derives
   runtime storage identity from the compiler-visible output name, so
   Plan 008's fixed `staged.exe` is wrong. Stage as `<final-basename>` inside
   the scoped temp directory, appending `.exe` only for Windows targets, and
   rename to the caller's exact `outfile`.

## 9. Keep / delete / defer map — contingent on gate 5

Nothing here is deletion authority; it is the disposition map to execute *if*
gate 5 answers yes.

**Keep (adapt into the new implementation; named consumer in parentheses):**
`src/internal/NativeExecutableFormat.ts` (output validation + observed
target — verified correct on real musl binaries [op]); `src/Target.ts`'s
os/arch/ABI algebra (canonical Target); `test/fixtures/{bun,deno}-
executable/**` (real-compiler tests; the trap fixtures invert into
config-inheritance tests); the Schema/`@effect/vitest` discipline.

**Delete if authorized (working ≠ owned; per-item reason):** the managed
surface — `Build`, `BuildExecutor`, `BuildPlan/Request/Record/Outcome/
Context`, `ContentStore`, `Evidence`, `Environment`, `Toolchain`,
`Compatibility`, `Identifier`, `Diagnostic`, `BuildDriver`, managed
`CompileExecutable`, `ExecutionPlatform` — functioning in part, but its
distinctive capabilities (canonical identity, CAS, records, snapshots) have
no named consumer, and its incomplete guarantees are the ones the new product
must actually make. `ProcessExecutor.ts` (uncancellable; superseded by the
real scoped spawner). `DurableFileCommit.ts` (correct for no-replace CAS
commits; the destination needs replace semantics and no CAS remains).
Capability internals (`PreparedBuild`, `ManagedDriver*`,
`InvocationCapabilities`, `managed*`) — in-process capability defense.
`BunCli.ts`/`DenoCli.ts` (version- and darwin-pinned; force policy flags the
new product renounces). The vacuous tests, managed conformance/architecture
suites, compatibility generator/doc, `tooling/public-api.json`.

**Defer (do not build; do not carry vocabulary):** cache, remote execution,
watch sessions, durable records, native-parity lane, snapshots.

**User-owned prose** (README, docs/*, examples/*) — two separate duties:

- **Correctness now, independent of gate 5**: the README states guarantees
  the implementation does not make ("crash-durably persisted … before the
  outcome is returned", "publication that cannot corrupt", "every attempt is
  … persisted with its status"). Those claims should be narrowed — or the
  machinery completed — whichever way gate 5 goes, because they are false
  today.
- **The standalone-centric rewrite**: only this awaits deletion authorization
  and executes under Plan 010's checksum discipline.

## 10. Plan critique

Operational state: all four rows are `BLOCKED` in `plans/README.md` as of
this revision; the conditions below are what unblocking requires.

- **Plan 007 — hold until gates 1, 2, and 4; then keep with amendments.**
  Its Step 4 freezes the driver-parameterized shape (C) and its Artifact
  fixes all five result fields; both are now open gates, and gate 4 precedes
  the plan's premise that a library exists. If B is chosen, Step 4 becomes
  per-module input types and the option witness disappears. Add Amendment 2's
  ABI/target reporting semantics. Its prose describing the cut as
  "operator-authorized" must be reconciled with the gates — no such standing
  authorization exists. The AGENTS.md-first step remains right.
- **Plan 008 — keep; strongest plan.** Amend: stage under the final basename
  (§8.3); state the `AbiUnknown` validation policy (§8.2). Note its
  `forceKillAfter: "2 seconds"` is a real library-owned policy choice, not a
  restatement of an Effect default (§4). Its "Current state" description of
  the existing code is accurate and was the seed of revision 1's verified
  findings.
- **Plan 009 — revise around the advertise-equals-test principle.** Keep:
  probe-based discovery as Layer construction; typed options (with the minify
  regression pin, §8.1); the verified target maps; **non-skipping** real
  current-host compile-and-execute tests; config-inheritance tests. Drop the
  hermetic/offline framing (`unshare`, network denial) — that lane belonged
  to the managed promise. Size the host and cross-target matrices to gate 3's
  answer: every runtime/compiler/target the package will *advertise* gets an
  ordinary CI cell; anything without a cell leaves the docs rather than being
  silently claimed. The plan's account of the currently false-green CI is
  verified correct [op].
- **Plan 010 — not executable as written.** Required amendments before its
  row can unblock: (a) a drift-check/STOP clause requiring a **recorded,
  dated operator authorization for the deletion and for the
  standalone-centric rewrite of the user-owned README/docs/examples** — the
  current text sequences the cut after 007–009 but never collects fresh
  consent; (b) adopt this review's corrected premise (working-but-unowned
  prototype): "keeping it would leave two canonical representations with no
  owner" is the true justification; "it was never real" is not. Keep its
  checksum reconciliation, read-before-rewrite discipline, and retention of
  Plans 001–006 as history.

## 11. Smallest verified slice

Unchanged in shape, and explicitly **prior to any deletion**: (1) the frozen
contract + type tests (007, after gates 1/2/4); (2) the engine with real
fiber-interruption/orphan checks, the atomic-replace state table, and bounded
drains against a fake compiler (008); (3) a Bun vertical: driver plus a
required, non-skipping test that compiles a real entrypoint, executes the
returned artifact path, recomputes size/digest (if kept), and asserts
diagnostics on a broken entrypoint — on the macOS dev machine and on Linux CI
with the already-pinned Bun 1.3.9 fixture; (4) a Deno vertical activating the
cross-driver option separation for real modules. Completing the slice does
not delete anything; it *triggers gate 5*, where the user decides deletion
with a working alternative in hand.

## 12. Decision gates

Gates 1–4 and 6 precede implementation; a "no" on gate 4 moots gates 1–3.
Gate 5 precedes deletion and is answered only after the §11 slice is green.

1. **API shape**: per-tool `Bun.compileExecutable(input)` (simpler; option
   safety by construction) or common `compileExecutable(driver, input)`
   (driver-generic composition; requires naming who needs it)? Plan 007
   cannot execute before this answer.
2. **Result fields**: is `digest` default or opt-in (the only field with a
   separate full-read cost), and which free projections (`bytes`, `target`,
   `tool`) does the product commit to keeping stable?
3. **Advertised support**: which orchestrator runtimes, compilers, and
   targets are V1 — including whether Windows is inside the atomic-replace
   promise — accepting that each advertised cell is CI-tested and each
   untested cell is un-advertised.
4. **Library or recipe**: given §4's split — Effect supplies scoped
   finalization and the escalation mechanism; the library's own remainder is
   the escalation policy, atomic publication, the typed option/error
   vocabulary and its upkeep across two moving CLIs, and validated results —
   does that remainder justify a maintained package over a documented Effect
   recipe (Alternative A)? A "no" ends the product here: publish the recipe
   as documentation, and gate 5 becomes a question about archiving rather
   than replacing.
5. **Deletion**: after the §11 slice is green, explicitly authorize (or
   decline) Plan 010's deletion of the managed system and the
   standalone-centric rewrite of the user-owned README/docs/examples. Until
   the deletion decision, the standalone path remains internal and the
   managed API remains the current public surface unless separately
   de-exported. (The documentation-correctness duty in §9 applies regardless.)
6. **Effect beta policy**: pin `4.0.0-beta.106` through the cut; upgrades
   only as dedicated plans, recorded in AGENTS.md?

## How we got here (for the reader who wasn't)

The managed system (Plans 001–006) answered "how would a build system
represent builds carefully?" before "what does the first user type?", and its
proof-shaped features served consumers — cache, remote execution,
attestation — that do not exist. The user's DX complaint and then "who needs
proof?" collapsed that justification, producing the standalone thesis of
Plans 007–010. Revision 1 of this review endorsed that thesis but overstated
its decisive fact, claiming the managed engine was never implemented; the
operator's verification showed a working happy path through snapshot,
execution, content storage, and recording on the pinned toolchain. The
corrected finding is narrower and still sufficient to reopen the product
question honestly: the managed system is a functioning but incomplete
prototype whose public promises and green test suite overstate it, and whose
distinctive machinery has no named consumer. The standalone shape remains the
recommended candidate *if* a library is built; whether to build one, and
whether to delete the prototype, are decisions the user has not yet made —
and as of this revision, the plan index enforces that nothing proceeds until
they are.
