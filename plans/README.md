# effect-build implementation plans

Originally reconciled by the `improve` skill on 2026-08-09 at commit `15b6abb`
after a product-direction interview and source/verification audit. Re-audited
with the same read-only planning workflow on 2026-08-12 at commit `eb2995c`
after a target-matrix design review. Plans 001-006 record the original
managed-proof design. Plans 007-010 record the hard cutover to the standalone
compile operation. Plans 011-014 are the completed typed-target and matrix
program. Re-audited again on 2026-08-12 against the completed `v0.2.0` product
tag at commit `29f8cfb` and planning baseline `e4257cc` for dependency
compatibility; Plan 015 is the active, bounded Effect 4.0 range and current-RC
upgrade.
Re-audited on 2026-08-13 at the same source commit `e4257cc` for the next
architecture stage. `NEXT-STAGE-ARCHITECTURE-AUDIT.md` records the live
lifecycle trace, correctness findings, capability/ownership maps, primary-
source Node/esbuild constraints, and independently vetted Fable Max advice.
Plans 016-019 are the selected four-plan program: behavior-preserving lifecycle
compression, one continuation-owned esbuild artifact, one internal exact Node
SEA vertical slice, then an evidence-only public-promotion decision. Plan 015 remains the required
first dependency. Its user-owned content was preserved except for one
plan-only receipt-placeholder correction required to make its exactly-one
receipt verifier executable.
The decision gates opened by
`FIRST-PRINCIPLES-REVIEW.md` (operator-audited, 2026-08-10) were answered by
the operator on 2026-08-11 and are recorded under **Gate decisions** below.
Plans 007-010 were executed on 2026-08-11: Plans 007-009 delivered the
standalone contract, engine, and drivers, and Plan 010 performed the hard
cutover under the gate 5 authorization recorded below. Plans 007-010 remain
execution history; Plans 011-014 deliberately supersede only the target-support
and public-operation freezes identified below. Plans 001-006 remain a
historical decision record of the removed managed design.

Read the assigned plan fully before changing code. Honor its drift checks, dirty
worktree boundary, verification gates, and STOP conditions. Do not add
compatibility aliases, legacy fallbacks, a parallel “advanced” managed tier, or
a raw-argv escape hatch.

Plans 016-019 invoke build/test gates through Bun. Plan 017 uses the declared
`pnpm@10.17.1` exactly once to add esbuild and update the authoritative
`pnpm-lock.yaml`; using `bun add` there would create a parallel lockfile. The
package's existing `verify` script may internally invoke pnpm sub-scripts; do
not rewrite that unrelated contract inside this program.

## Gate decisions (recorded 2026-08-11)

The operator answered the decision gates of `FIRST-PRINCIPLES-REVIEW.md` §12 on
2026-08-11:

1. **API shape: per-tool operations (Alternative B).** Each tool module exports
   its own verb: `Bun.compileExecutable(input)` requiring `Bun.Compiler`, and
   `Deno.compileExecutable(input)` requiring `Deno.Compiler`. There is no
   driver value parameter. Basis: the pinned Effect source never selects an
   implementation through a value argument — the ai package's common verb
   (`LanguageModel.generateText`) takes no provider parameter, provider
   specifics live in provider modules, and even its first-class `Model` value
   is a `Layer` subtype, not a call argument. Per-tool service tags are also
   the only shape that makes cross-tool option mixing a type error at the call
   site. A driver-generic common verb may be layered on later if a concrete
   consumer appears; that direction is additive, while the reverse is a break.
   Where older prose in Plans 007-010 says "driver", read the per-tool module
   (`effect-build/bun`, `effect-build/deno`); the driver *value* is removed.
2. **Result fields.** `path`, `bytes`, `target`, and `tool` are committed
   `Artifact` fields — free projections of validation the engine performs
   anyway. `digest` is opt-in via the call input (`digest?: boolean`, default
   false); it is the only field whose cost is a separate full read of the
   output.
3. **Advertised V1 support.** Node orchestrator host; Bun and Deno compilers;
   current-host artifact targets. Every advertised cell gets an ordinary,
   non-skipping CI cell; every untested cell stays out of the docs. Bun/Deno
   host runs and foreign-target cells may exist as optional lanes but are
   neither advertised nor required in V1.
   The first public v0.1.0 release narrows the advertised cell to Node on Linux
   x64 GNU with either compiler, matching the required real-tool runner.
   macOS/Windows atomic-publication jobs and foreign-target mappings remain
   useful verification, but are experimental rather than advertised support.
4. **Library, not recipe.** The operator confirmed a maintained package over a
   documented Effect recipe, with themselves as the first user.
5. **Deletion — authorized 2026-08-11.** The operator's instruction, “Full
   executor approval for everything - implement all plans,” explicitly
   authorizes both deletion of the managed system and the standalone-centric
   rewrite of the user-owned README/docs/examples. The authorization was
   recorded as effective only after Plans 007-009's vertical slice was green;
   that condition has now passed.
6. **Effect baseline.** Pinned to `effect@4.0.0-beta.106` and reference
   checkout `df431ae` through the cutover; upgrades happen only as dedicated
   plans, never incidentally.

## Planned gate resolutions (recorded 2026-08-12)

These decisions govern Plans 011-014. They do not rewrite the evidence or basis
of the 2026-08-11 gates:

1. **Gate 1 remains closed.** Target matrices are per-tool operations:
   `Bun.compileExecutableMatrix` and `Deno.compileExecutableMatrix`. There is
   still no driver value, registry, fallback, or generic root build verb.
2. **Gate 2 remains closed.** Scalar and matrix artifacts retain `path`,
   `bytes`, `target`, `tool`, and opt-in `digest`; no provenance or release
   record is added.
3. **Gate 3 is superseded by exact provider-target evidence.** Plan 011 defines
   the provider tables privately; Plan 013 proved every table literal through a
   required, non-skipping real compiler/header CI cell; Plan 014 alone publishes
   the provider-owned schemas. The first exact-source run narrowed the
   provisional Bun table to six targets; Deno remains six.
   Node remains the only supported orchestrator host, and only current-host
   artifacts are executed. This replaces the current-host target subset without
   weakening the original advertise-equals-test rule.
4. **Gate 4 remains a library decision with a higher existence test.** The
   matrix earns its public operation because it centralizes provider typing,
   canonical naming, whole-request collision preflight, bounded collect-all
   execution, and target-attributed failures. Concurrency alone would remain an
   `Effect.all` recipe.
5. **Gate 5 remains complete.** None of Plans 011-014 restores managed proof,
   stores, plans, records, publication, or compatibility fallbacks.
6. **Gate 6 has one recorded exception.** The active baseline is the installed
   `effect@4.0.0-beta.107` and matching official platform packages. That upgrade
   landed inside broad release-preparation commit `eb2995c`, not in the
   dedicated numbered plan required by the original gate. Its peer tree,
   deterministic gate, real-tool gate, and fresh consumer were reverified, so
   Plans 011-014 accept it as an audited exception rather than retroactively
   calling it compliant. Future Effect upgrades still require dedicated work.
7. **Plan 010's operation-count and exact runtime-key freezes are approved for
   one narrow supersession.** The planned public product has exactly two
   provider-local operations over one executable lifecycle: scalar
   `compileExecutable` and homogeneous `compileExecutableMatrix`. Plan 014 alone
   may add the provider `Target`, matrix operation, and root `MatrixError` keys.
   Bundling, type checking, task graphs, caching, publication, watch/dev servers,
   and generic Build services remain out.

## Next-stage direction decisions (recorded 2026-08-13)

These decisions govern Plans 016-019 and do not authorize a public API cut:

1. **Level 1 is earned narrowly.** Keep the existing prepared-cell
   representation, project one adapter request containing only semantic
   compiler fields plus staged output, replace commit-bearing `AtomicOutput`
   with an opaque staged-path-only candidate, keep destination/rename inside
   one finalize operation, and delete the peer runner/service. A branded
   validated peer with no separate consumer is rejected. Correct fat
   Mach-O endianness and document rename's irreversible interruption boundary
   in the same behavior-preserving plan.
2. **Scalar total preflight is not current behavior.** Scalar runtime input
   validates target/options only; matrix total preflight remains distinct.
   Strengthening scalar decoding would require a separate public error/behavior
   decision and is not hidden in Plan 016.
3. **The second pipeline remains two concrete internal operations.** The
   structured-library `Esbuild.withJavaScriptBundle` runs a consumer while one
   temporary Node-compatible JS artifact is live; esbuild's unref'd global
   native service remains package/host-process-owned. Exact selected CLI
   `NodeSea.createExecutable` consumes it. Effect Scope does not statically
   prevent returned-handle escape, so a raw `bundleScoped -> artifact` API is
   rejected. Neither operation becomes a generic producer/compiler/executor
   protocol.
4. **The first SEA proof uses a separate direct-capable Node.** Repository and
   orchestrator CI remain Node 24.14.1. The required producer lane pins Node
   26.7.0 on exact Linux x64 GNU, uses built-in `--build-sea`, validates
   observed externals against that Node's builtin authority and output target
   against its inspected binary, and stops instead of accepting a version
   range, postject, automatic downloads, cross-target output, or macOS signing.
5. **Multi-stage provenance stays internal.** The proof records an exact ordered
   esbuild/Node observation without changing public Artifact's singular `tool`
   or claiming hermeticity/reproducibility. Public artifacts and receipts must
   be one later replacing hard cut, not parallel fields/types.
6. **Levels 2-3 remain evidence-gated.** Public inspection, artifacts, receipts,
   SemanticPlan, BoundExecutionPlan, and replaceable executors require the
   observable gates in Plan 019. Two local producers are not two backends;
   closed inputs, content-identified toolchain requirements, binding, workspace,
   transport, and real alternate-backend evidence are still absent.

## Execution order and status

| Plan | Title | Priority | Effort | Depends on | Status |
|---|---|---:|---:|---|---|
| 001 | Govern the managed architecture and executable proof | P1 | L | 002-006 | REJECTED: superseded by standalone hard cutover |
| 002 | Bootstrap the package and lock the managed model contract | P1 | M | - | DONE (historical) |
| 003 | Build content identity, prepared execution, and records | P1 | L | 002 | DONE (historical) |
| 004 | Add the managed Bun CLI executable driver | P1 | M | 003 | REJECTED: managed release contract superseded |
| 005 | Add the managed Deno CLI executable driver | P1 | M | 004 | REJECTED: managed release contract superseded |
| 006 | Freeze the managed API, compatibility evidence, and CI | P1 | M | 005 | REJECTED: managed release contract superseded |
| 007 | Freeze the standalone compile contract | P1 | M | - | DONE |
| 008 | Build the Effect-native compile and atomic publication engine | P1 | L | 007 | DONE |
| 009 | Add discoverable Bun/Deno drivers and exercise all three axes | P1 | L | 008 | DONE |
| 010 | Hard-cut the public API and delete the managed proof system | P1 | L | 009 | DONE |
| 011 | Centralize provider target authority behind the public API | P1 | M | 010 | DONE |
| 013 | Prove every provider target with required real evidence | P1 | L | 011 | DONE |
| 012 | Build the typed executable target matrix | P1 | L | 013 | DONE |
| 014 | Hard-cut the typed target matrix into the public product | P1 | M | 012, 013 | DONE |
| 015 | Support the evidenced Effect 4.0 line and current v4 RC | P1 | M | 014 | DONE |
| 016 | Compress the executable lifecycle behind one validated publication boundary | P1 | M | 015 | DONE |
| 017 | Build one continuation-owned esbuild JavaScript bundle artifact | P1 | M | 015, 016 | TODO |
| 018 | Consume the temporary bundle with exact Node SEA and atomically publish an executable | P1 | L | 015-017 | TODO |
| 019 | Compare both executable topologies and decide public promotion by evidence | P2 | M | 015-018 | TODO |

Status values: `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED: <reason>`, or
`REJECTED: <reason>`. A historical `DONE` says
the implementation happened; it does not make that design part of the active
product.

**Historical note (hard cut, 2026-08-11).** The managed proof system built by
Plans 002-005 was a functioning prototype: its happy path through snapshot,
execution, content storage, and recording worked on the pinned toolchain. It
was removed because it was a second product — its own request, identity,
store, artifact, outcome, record, driver, and publication concepts — with no
named consumer and no owner, and keeping it would have preserved two canonical
representations of every concept plus the ceremony that prompted the redesign.
The deletion was an ownership decision executed under the recorded gate 5
authorization, not a judgment that PATH discovery, ordinary CLI config
behavior, or the standalone operation invalidated that earlier work.

## Dependency notes

- Plan 007 first replaces the repository's superseded managed execution rules,
  then freezes types and the service/Layer shape without exporting a second
  public API.
- Plan 008 implements the shared child/staging/publication lifecycle through
  Effect's abstract host services.
- Plan 009 supplies Bun and Deno behavior and must pass the provisioned local
  equivalents of its required offline and cross-target CI jobs, not only unit
  tests, before it becomes `DONE`. Pushing and observing remote CI remain an
  operator action, not a dependency cycle with Plan 010.
- Plan 010 performs one coordinated public cutover, deletes the managed system,
  reconciles dirty documentation/example WIP, and freezes the final package.
- Plan 011 removes duplicated target support/mapping representations while
  retaining the root target catalog as shared vocabulary. One package-private
  table per compiler derives literals, membership, and CLI mapping; provider
  exports and the broad root Artifact schema remain unchanged.
- Plan 013 runs next and proves every private table literal with real compiler
  output and an independent external binary oracle. A mismatch changes the
  private table before any matrix or public support promise exists.
- Plan 012 runs only after that evidence is green and adds the matrix lifecycle
  behind package-private boundaries. It does not alter provider services or
  entry points.
- Plan 014 is the only public cut. It publishes provider Target schemas, narrows
  scalar inputs/artifacts, correlates the root Artifact schema, wires the matrix
  into the existing services, and freezes packed-consumer behavior, examples,
  docs, and the repository execution rule together.
- Plans 011-014 were one no-publish migration program. Intermediate commits
  were reviewed and run in CI without tags or publication; their final green
  state at `29f8cfb` is the completed `v0.2.0` release. Plan 015 is post-release
  work and must not move, reuse, or rewrite that tag or its release commits.
- Plan 015 runs only after that public surface is frozen. It separates the
  consumer peer interval from the exact development lock, updates the complete
  Effect/platform development family to rc.108, and makes beta.104 plus rc.108
  fresh-consumer lanes required before publication. It does not multiply the
  compiler-target matrix or change an operation, schema, host, or target claim.
- Plan 016 runs after Plan 015 so its Effect API and verification excerpts do
  not drift across the rc.108 cut. It preserves the released surface while
  narrowing adapter visibility to a staged-output request, collapsing
  `CompilerRunner` into `CompilerService`, establishing one publication owner
  and file inspector, fixing fat Mach-O endianness, and specifying the rename
  point of no return. Completion evidence: `bun run verify` and the locally
  selected `EFFECT_BUILD_DENO_VERSION=2.9.5 bun run verify:real` passed on
  2026-08-13; architecture tests retained the exact public surface.
- Plan 017 depends on that lifecycle boundary and adds an exact direct esbuild
  dependency. It proves one continuation-owned structured-library operation
  and one five-field internal JavaScript artifact, including the external edges
  esbuild actually observed. It explicitly does not claim arbitrary JavaScript
  closure or ownership of esbuild's package-global service and adds no public
  bundle operation.
- Plan 018 is the sole complete second-pipeline proof. It retains Node 24 as
  orchestrator, selects exact Node 26.7.0 as a separate Linux direct-SEA
  producer, consumes Plan 017's artifact, and reuses Plan 016's native
  validation/publication without a postject or download fallback.
- Plan 019 runs only after both topologies have required real evidence. It
  creates a consumer/gate/representation decision record and changes no source
  or public API. An unmet gate stays internal/rejected rather than generating
  another speculative plan.
- Temporary internal coexistence during Plans 007-009 is implementation
  sequencing. It is never a shipped tier or compatibility promise.

## Planned product contract

Two cardinalities per tool over one executable lifecycle:

```ts
Bun.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app"
})

Bun.compileExecutableMatrix({
  entrypoint: "src/main.ts",
  outdir: "dist",
  name: "app",
  targets: ["macos-aarch64", "linux-x64-gnu", "windows-x64"],
  concurrency: 2
})
```

Fundamental options are deliberately few:

| Kind | Fields | Rule |
|---|---|---|
| project | `entrypoint`, `outfile`, optional `cwd` | shared by every compiler |
| artifact | optional canonical `target` | independent from host runtime |
| result detail | optional `digest` (default false) | the only field costing a separate full read |
| compiler | optional `options` typed by the tool module | Bun and Deno stay different |
| matrix | `outdir`, `name`, non-empty provider `targets`, optional positive `concurrency` | canonical `<name>-<target>[.exe]`, ordered collect-all |
| provisioning | PATH discovery or explicit Layer executable | never a call field |
| orchestrator | official Node/Bun/Deno services | supplied once by the app |

The scalar result remains one plain serializable
`Artifact { path, bytes, target, tool }`, plus `digest` exactly when requested,
with the unchanged closed `BuildError`. The matrix returns provider-narrowed
Artifacts in target input order. Its separate closed `MatrixError` reports all
preflight issues or all typed cell failures plus committed partial artifacts.
Fiber interruption remains interruption for both operations.

## Architectural north star

```text
application chooses official Node/Bun/Deno host services
-> explicitly selected compiler Layer discovers/probes Bun or Deno
-> the provider table resolves typed target vocabulary to native CLI tokens
-> scalar validates one destination, or matrix preflights every target/name
-> matrix traverses prepared scalar cells with bounded collect-all semantics
-> core acquires sibling staging in the outfile filesystem
-> Effect Scope spawns one compiler and drains bounded diagnostics
-> failure or interruption kills/reaps child and removes staging
-> success validates native output, hashes it, and atomically renames it
-> return one Artifact, an ordered matrix, or contextual matrix failure
```

The three axes are independent:

1. **Orchestrator runtime**: which runtime executes the Effect program.
2. **Build tool**: Bun or Deno performs compilation.
3. **Artifact target**: the OS/architecture/ABI of the output.

Changing the orchestrator is only a host Layer change. Changing the build tool
changes the imported tool module, its provider Target, and its typed options.
Changing the artifact target is input data resolved by that tool module's sole
target table. Cross-provider or heterogeneously named work composes scalar
calls rather than widening the matrix.

## Effect API baseline

The hard cut was implemented against `effect@4.0.0-beta.106` and local reference
checkout `df431ae`. The broad v0.1.0 release-preparation commit upgraded Effect
and all official platform packages together to `4.0.0-beta.107` after a fresh
npm consumer exposed beta.106's loose shared-platform resolution as an invalid
peer tree. The exact beta.107 peer, deterministic gate, real-tool gate, and
fresh npm consumer installation were reverified together. This is the single
recorded gate-6 exception above, not a dedicated upgrade plan. Future Effect
upgrades remain dedicated changes that must reconcile every API and test.

Reusable library code depends on `ChildProcessSpawner`, `FileSystem`, `Path`,
and `Crypto`. A live compiler Layer captures those dependencies and provides a
compiler whose methods require `R = never`. Applications provide
`NodeServices.layer`, `BunServices.layer`, or `DenoServices.layer` at the outer
composition boundary. No library source uses raw Node APIs.

## Historical dirty-worktree boundary

At planning time the worktree already contained modified README/docs/package
configuration and untracked docs/examples. Those changes argue for the old
managed-proof product but remain user-owned. Plans 007-009 preserve them; Plan
010 records exact checksums, reads them fully, and semantically reconciles them
with the authorized hard cutover. No executor may restore, broadly format,
stage, or overwrite them without that reconciliation.

The 2026-08-12 planning baseline is clean release-preparation commit `eb2995c`,
which includes the ranged-native-inspection work recorded with hashes in Plan
011. Plans 011-014 use that commit for ancestry/drift checks and must preserve
those semantics. New or modified files appearing during execution remain
user-owned unless explicitly listed in the assigned plan.

## Findings considered and rejected

- **Keep the managed system as an advanced tier**: rejected. It would preserve
  a second planner, Artifact, driver contract, store, record model, and product
  vocabulary with no current owner.
- **Thin convenience wrapper over `Build.run`**: rejected. It would still
  snapshot, plan, store, return an ArtifactRef, and require materialization.
- **Universal `BuildOptions` or lowest-common-denominator flags**: rejected.
  Options are inferred from the explicitly selected driver.
- **Automatic driver selection/fallback**: rejected. The call names one driver;
  Layer failure does not try another tool.
- **Raw argv/shell escape hatch**: rejected. It erases typed option/error and
  lifecycle value and makes inert invocation untestable.
- **Tool/env/config/cwd policy modes**: rejected for V1. `cwd` is an optional
  project fact; tool path belongs to Layer provisioning; environment and project
  config follow ordinary CLI behavior.
- **Exact runtime version rejection**: rejected. Record the observed tool;
  checksum-pinned versions remain CI fixtures, not runtime provenance policy.
- **Byte-identical parity with direct CLI**: rejected as a blanket claim.
  Sibling staging can be observable to compilers. Test runtime behavior,
  published bytes/digest, and target; document the divergence.
- **Proof/attestation/security lattice**: rejected. Library code on the builder
  cannot independently attest an untrusted builder. Artifact digest is
  useful data, not proof.
- **Cache, remote execution, DAG, watch mode, auto-install**: deferred until a
  standalone use case demonstrates a distinct operation/lifecycle. None shapes
  V1.
- **A generic `Build` service or standalone `bundle` verb**: rejected for this
  program. The product remains executable compilation; compiler-native bundle
  and transform behavior stays provider options inside that operation.
- **`TypeScript.check` as a sibling now**: deferred outside this package plan.
  It has different inputs, outputs, diagnostics, executable ownership, and no
  shared atomic publication lifecycle. Symmetry with compiler modules does not
  earn it.
- **Matrix as raw `Effect.all`**: rejected because it cannot own canonical
  filenames, total collision preflight, provider target correlation, or stable
  target-attributed collect-all failure. Those are the matrix operation's
  existence test.
- **Per-cell outfiles/options, naming callbacks, arbitrary IDs, or multiple
  entrypoints**: rejected for the first matrix. They duplicate scalar call
  configuration and destroy the homogeneous target-set invariant.
- **Fail-fast mode or matrix-wide rollback**: rejected. Typed cell failures are
  accumulated; committed artifacts remain committed. Fiber interruption still
  interrupts and cleans active staging without pretending the matrix is a
  transaction.
- **Delete the root Target catalog**: rejected. It is the canonical shared
  target vocabulary and metadata source; provider tables narrow that vocabulary
  and alone own support/CLI mapping.
- **Interruption as `BuildError`**: rejected. Scope finalization runs and the
  interrupt cause stays an interrupt.
- **No-replace/fsync content-store commit reused for outfile**: rejected.
  Outfile needs same-filesystem atomic replace; crash durability is a different
  cost/guarantee.
- **`effect@latest` as the Effect 4 upgrade selector**: rejected. On the
  2026-08-12 audit date that tag resolves to Effect 3.22.1; the current v4 line
  is the explicit rc.108 channel and matching platform family.
- **Effect beta.103 or earlier**: rejected. The current source uses
  `Schema.TaggedError`, introduced under that name in beta.104, and the matching
  Deno platform family also begins at beta.104.
- **A broad `^4.0.0-beta.104` peer through every stable v4 minor**: rejected for
  Plan 015. The package imports `effect/unstable/process`; the first evidenced
  range stops before 4.1 and can be widened deliberately later.
- **Loose Effect/platform development dependencies**: rejected. Exact rc.108
  pins and a frozen lock are the reproducible reference environment; consumer
  breadth belongs in the peer range and isolated endpoint lanes.
- **Cross-product Effect endpoints with all 12 compiler targets**: rejected.
  These are independent axes; endpoint source/unit/fresh-consumer checks run at
  both bounds, while real compiler/target evidence runs once on the current
  locked Effect baseline.
- **Bulk latest-tooling upgrades inside Plan 015**: deferred. TypeScript,
  Vitest, oxlint, dprint, pnpm, and Node types are development-only migrations
  with separate cross-major risks and do not widen the consumer Effect range.
- **A total prepared lifecycle request or public candidate/validated/published
  family**: rejected. Prepared cells and public `Artifact` remain canonical.
  Plan 016 accepts only a transient adapter projection that removes final
  outfile/cwd/digest visibility, replaces commit-bearing `AtomicOutput` with a
  staged-path-only private candidate, and keeps validation/publication in one
  owner. It adds no validated or public state class.
- **A peer `SystemTarget`, public `ResolutionTarget`, or public
  `ExecutionTarget`**: rejected. Root `Target` already owns system identity,
  Node resolution is fixed, and the selected Node tool owns execution binding.
  Only bundle syntax survives as a real downstream compatibility fact.
- **Node 24/postject compatibility or automatic Node acquisition**: rejected.
  The proof selects a direct-SEA-capable tool explicitly and stops on absence.
- **A raw returned temporary bundle or an esbuild-only closure claim**:
  rejected. Effect Scope does not make returned values linear, and esbuild
  cannot observe arbitrary eval/Function/runtime module construction. The
  continuation owns lifetime and records only observed external edges.
- **Per-operation ownership of esbuild's native service**: rejected for this
  producer mechanism. Context cancel/dispose is scoped; the exact package's
  global unref'd service is wider. Calling global `stop()` could break
  concurrent users and is not disguised as operation cleanup.
- **A Node SEA runtime range beginning at 25.7**: rejected. The historical
  capability floor does not prove every later active-development release; the
  first slice accepts only exact tested 26.7.0/`linux-x64-gnu`.
- **Immediate public plural provenance or versioned receipts**: rejected until
  the complete internal topology works and a named durable consumer meets Plan
  019's replacing-hard-cut gates.
- **Fake-only SemanticPlan/BoundExecutionPlan/executor evidence**: rejected.
  Portable plans require closed content identities and real multiple bindings;
  replaceable executors require genuinely different backends.

## Quality bar

Every active plan must leave a machine-checkable green slice, preserve dirty
WIP outside scope, and identify exact real-tool/host acceptance separately from
deterministic local tests. Final completion requires `pnpm verify`, required
real Bun/Deno integration, the required Node host run, atomic publication on
each advertised OS, a packed consumer, and no stale managed names or proof
claims. Under Plan 013, all six Bun and six Deno provider targets are
required compile-plus-header gates; only current-host artifacts are executed.
Optional Bun/Deno orchestrator-host lanes remain non-gating
(gate 3: advertise-equals-test).
