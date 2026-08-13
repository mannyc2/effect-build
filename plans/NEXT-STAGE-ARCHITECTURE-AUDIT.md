# effect-build next-stage architecture audit

> **Engagement**: read-only architecture and direction audit using the
> `improve`, `recover-deterministic-architecture`, and `effect-ts` workflows.
> No source code was changed.
>
> **Repository baseline**: commit
> `e4257ccc84db70a6966c163700c9423659f9a4fc`, branch
> `codex/effect-build-v0.2.0`, 2026-08-13.
>
> **Existing dirty work reconciled narrowly**: `plans/README.md` was already
> modified and `plans/015-widen-effect-v4-compatibility.md` was already
> untracked. Their planning-time SHA-256 values were respectively
> `51461cebd013a2e8531c0f4e09fdbc4cb1a589d4541bc9493b84602c31a0e6d6`
> and `0a06997ed582edd3701405bdfc7c17c8ec519e1d7cc207834715bf7bd00d9b14`.
> The only edit to pre-existing Plan 015 replaces a literal receipt placeholder
> that made its exactly-one-prefix verifier impossible; its reconciled SHA-256
> is `822951e4228d334aba8f6c9a4b2f1046dc419919ae5ddddc588fac36fd850112`.

## Verifiable success criteria

This program succeeds only if all of the following remain true:

1. **Public behavior and guarantees**: the exact root, Bun, and Deno public
   exports remain frozen; scalar and homogeneous-provider matrix calls retain
   their current inputs, typed failures, native target validation, optional
   digest, atomic replacement, cleanup, ordered results, and collect-all typed
   matrix failures. Any correction to an overstated interruption guarantee is
   deliberate, tested, and documented rather than hidden in a refactor.
2. **Cuts**: no generic build DAG, registry, automatic backend selection,
   public stable plan protocol, container/remote executor, CAS/cache, remote
   transport, package pipeline, watch mode, plugin system, automatic tool
   download, postject fallback, rollback, fail-fast, or publish-mode switch is
   introduced.
3. **Durable core**: only primitives that remove a named invalid state,
   duplicate representation/workflow, or unclear owner are accepted. The
   second pipeline remains two concrete operations: a continuation-owned
   structured esbuild library context (backed by esbuild's package-global
   native service) followed by exact selected CLI Node SEA construction. No
   arbitrary-source closure or per-operation service-process ownership is
   claimed.
4. **Public and release constraints**: the second pipeline and its provenance
   stay internal until both topologies work under real-tool evidence and Plan
   019's promotion gates are met. No change is folded into the completed
   `v0.2.0` tag. Plan 015's Effect range/current-RC migration lands first and
   keeps the Effect/platform family aligned.
5. **Compression objective**: Plan 016 targets **semantic compression**, not a
   feature or line-count reduction. Plans 017-018 are bounded feature growth.
   Plan 019 is an evidence decision, not public feature growth.

## Recon measurements

Measured separately at the planning baseline:

| Area | Files | Physical lines | Nonblank lines | Interpretation |
|---|---:|---:|---:|---|
| Production TypeScript (`src/`) | 22 | 1,841 | 1,665 | Lifecycle hotspot is the 509-line `CompilerEngine.ts` |
| Tests, type tests, fixtures (`test/**`, `typetest/**`, all file types) | 35 | 4,542 | 4,180 | Matrix semantics are strongly characterized; real matrix evidence is not committed |
| README/docs/examples (including `examples/README.md`) | 10 | 657 | 530 | Architecture prose overstates total scalar validation and interruption |
| Existing plans | 18 | 12,659 | 10,786 | Managed-build speculation was already removed and must not be recreated |
| Scripts/tooling manifests | 10 | 781 | 729 | Current real-tool gates cover Bun/Deno targets, not Node SEA |

Verified with Bun at this baseline:

- `bun run check` passed.
- `bun run test:unit` passed 89 tests with one Windows-only skip.
- `bun run test:architecture` passed 40 tests.
- The focused audit additionally exercised real current-host Bun and Deno
  scalar operations and live one-cell matrices. Those ad hoc results are audit
  evidence, not checked-in acceptance gates.

## End-to-end lifecycle trace

### Scalar Bun and Deno

```text
public Bun/Deno.compileExecutable(input)
-> selected provider Compiler Context.Service
-> Layer discovery/probe once (ToolDiscovery)
-> provider target + options validation only
-> PreparedCell
-> acquire sibling AtomicOutput in caller destination filesystem
-> provider renderArgv
-> scoped CLI child; bounded stdout/stderr drain; forced reap on interruption
-> require staged regular executable file
-> ranged ELF/Mach-O/PE byte inspection
-> infer/match canonical target
-> optional full-read SHA-256
-> atomic rename
-> public Artifact { path, bytes, digest?, target, tool }
```

Evidence: `src/Bun.ts:47-59`, `src/Deno.ts:61-73`,
`src/standalone/internal/ToolDiscovery.ts:15-64`, and
`src/standalone/internal/CompilerEngine.ts:337-452`.

Scalar preflight is not total. At `CompilerEngine.ts:426-452`, only target and
provider options are runtime-checked; entrypoint, outfile, cwd, and digest are
copied. A live audit call with `digest: "yes"` published successfully without a
digest. Adding total decoding would change the public failure contract and is
therefore excluded from the behavior-preserving refactor.

### Matrix Bun and Deno

```text
public Bun/Deno.compileExecutableMatrix(input)
-> same selected provider service and one Layer discovery/probe
-> total whole-request preflight before filesystem/process effects
-> canonical per-target destinations and collision checks
-> ordered PreparedMatrixCell list
-> bounded Effect.forEach over the same scalar cell lifecycle
-> pure typed failures captured per cell
-> defects/interruption re-failed as the original Cause; active siblings close
-> stable input-order fold
-> ordered artifacts or MatrixFailed { committed partial artifacts, failures }
```

Evidence: `CompilerEngine.ts:139-315,455-492` and
`CompileExecutableMatrix.ts:83-103`. The matrix proves cardinality policy and
reuse of one cell workflow; it is not a structurally different pipeline and
does not earn public lifecycle protocols.

### Difficult failure and interruption paths

| Path | Observed ownership and result |
|---|---|
| Tool discovery/probe failure | Layer acquisition fails before an operation or matrix cell exists |
| Matrix invalid input | Total preflight returns `InvalidMatrixInput`; no output directory, staging, or compile child |
| CLI typed failure | Staging scope closes; old destination remains; matrix records ordered cell failure |
| Missing/non-native/wrong-target output | File-level validation fails before rename; staging is removed |
| Pure typed matrix cell failures | All scheduled cells run within the concurrency bound; committed siblings remain |
| Defect in one matrix cell | Original cause escapes; active sibling is interrupted/reaped; queued cells do not start |
| Interruption before publication | Child is terminated/reaped and scoped staging removed; destination remains old |
| Interruption racing rename | Rename may already linearize although the fiber exit is interrupted; current docs incorrectly promise the destination is always unchanged |

The last row is inherent to an irreversible external rename. The correct
contract is a point of no return, not a rollback option.

## Compact representation and ownership map

| Concept | Current canon/owner | Invariant | Decision |
|---|---|---|---|
| Public executable request | `CompileExecutableInput` in `Driver.ts` | Provider target/options typed; other scalar fields trusted at runtime | Keep; project only a narrower adapter request |
| Matrix request | `CompileExecutableMatrixInput` plus `preflightMatrix` | Total validation, unique targets/paths, stable order | Keep local orchestration |
| Producer request | current adapter sees final outfile/cwd/digest through `PreparedCompileInput` | Adapter needs only entrypoint, target, validated options, staged output | Add one strict package-private projection; it removes direct-destination visibility rather than claiming total public validation |
| Selected tool | `DiscoveredCompiler` | real regular path, observed version and host OS | Keep provider/operation specific |
| Native target | root `Target` + `TargetCatalog` | one canonical OS/architecture/ABI identity | Reuse for SEA observation; reject peer `SystemTarget` |
| Native inspection | pure `NativeExecutable` parser plus engine file reader | ELF/Mach-O/PE observation independent of provider vocabulary | Keep pure parser; add one file-level validation owner |
| Candidate output | commit-bearing scoped `AtomicOutput` | destination/staged paths plus rename authority coexist before validation | Replace with opaque staged-path-only candidate; lifecycle identity retains destination/rename |
| Validated candidate | control flow only | successful regular/executable/native/target/bytes/digest observation before commit | Keep as one function's control flow; reject a branded peer with no separately typed consumer |
| Published output | public `Artifact` | destination committed, provider/target/tool correlation | Keep; reject separate `PublishedExecutable` |
| Matrix capability | `CompilerService` and peer `CompilerRunner` | same two methods with subtly different target width | Delete the peer runner; one internal service representation |
| JavaScript bundle | absent | one temporary JS output, Node resolution, format, literal syntax target, every esbuild-observed external accounted for | Add only inside a continuation in Plan 017; do not claim arbitrary source closure |
| Multi-stage provenance | absent; public Artifact has singular `tool` | ordered observations must not imply reproducibility | Keep internal exact tuple until Plan 019 gate |

## Capability-boundary matrix

| Surface | Status | Producer | Orchestrator evidence | Target boundary | Cleanup/publication |
|---|---|---|---|---|---|
| Bun scalar | Public | Bun CLI | Node supported; optional Bun/Deno host smoke | Provider-selected/inferred canonical target | Scoped child, native validation, atomic rename |
| Bun matrix | Public | Bun CLI per cell | Strong fake-tool semantics; no committed real-matrix gate | Homogeneous Bun target tuple | Ordered collect-all; independent commits |
| Deno scalar | Public | Deno CLI | Same | Provider-selected/inferred canonical target | Same lifecycle |
| Deno matrix | Public | Deno CLI per cell | Strong fake-tool semantics; no committed real-matrix gate | Homogeneous Deno target tuple | Same matrix policy |
| `Esbuild.withJavaScriptBundle` | Internal proof | Structured esbuild library context; package-global native service | Initially Node orchestrator only | Fixed Node resolution and literal `node26.7`; observed externals retained | Private Scope spans callback/context/temp JS; it does not own the global service process |
| `NodeSea.createExecutable` | Internal proof | Selected Node CLI `--build-sea` | Exact separate Node 26.7.0; required Linux x64 GNU lane | Selected binary and output must both inspect as the same canonical target | Scoped config/child/candidate; atomic final rename |
| Composite pipeline | Internal proof | esbuild -> Node SEA | Required exact Node 26.7/Linux x64 GNU real-tool vertical slice | One exact selected-host native executable | Intermediate disappears on all exits; final commit after validation |
| Public stages/plans/executors | Rejected now | — | No alternate-backend evidence | — | Promotion gates only |

### Producer-protocol verdict

The structured-library/Effect-owned-CLI distinction is real, but it does not
yet earn two producer protocol interfaces. `Esbuild.withJavaScriptBundle` has
context cancellation, structured build output, a package-global native service,
and continuation lifetime; Bun/Deno/Node SEA use
scoped children, exit status, and bounded streams. A shared `Producer` would
erase those differences, while separate `LibraryProducer` and `CliProducer`
interfaces would each have one implementation and remove no duplicate workflow.
Keep the concrete operations. The earned shared capability is only opaque
candidate allocation plus native validation/digest/publication; existing
`runProcess` remains the concrete CLI child helper.

### Target-vocabulary verdict

| Candidate distinction | Concrete operation need | Canonical representation |
|---|---|---|
| Provider target | Bun/Deno argv selection and provider/result correlation | Existing provider tables projected from root `Target` |
| Resolution target | esbuild module resolution | Fixed literal `node`; no type or field |
| Syntax target | esbuild emission checked against the SEA producer | Literal internal `"node26.7"` bundle fact; no public schema |
| Execution target | selected tool version/builtins/native host | Exact private `SelectedNodeSeaTool` state, not a portable target |
| System target | observed executable OS/architecture/ABI | Existing root `Target`/`TargetCatalog`; reject a peer `SystemTarget` |

Only syntax adds an artifact fact. Resolution is fixed, execution is concrete
service binding, and system identity already has a canon.

## Vetted findings and direction

| # | Finding | Category | Impact | Effort | Fix risk | Evidence |
|---|---|---|---|---|---|---|
| 1 | Publication needs a truthful interruption point of no return | correctness | HIGH | M | HIGH | `AtomicOutput.ts:65-71`; `CompilerEngine.ts:414-421`; `docs/architecture.md:70-76` |
| 2 | Standard fat Mach-O headers are decoded with reversed endianness | correctness | MED | S | LOW | `NativeExecutable.ts:106-121`; no matching fixture in `standalone-contract.test.ts:136-180` |
| 3 | A total prepared public request would encode a false scalar invariant, but the adapter currently sees final outfile/digest/cwd it does not need | architecture | HIGH | S | MED | scalar `CompilerEngine.ts:426-452`; `CompilerAdapter.ts:28-56`; Plan 016 projects one staged-output-only producer request |
| 4 | `CompilerRunner` duplicates `CompilerService` and widens scalar target typing | architecture | MED | S | LOW | `CompileExecutableMatrix.ts:70-81`; `Driver.ts:17-31`; pass-through at `CompilerEngine.ts:497-509` |
| 5 | Public matrix cells can encode acquisition/preflight errors that execution cannot produce | architecture | MED | S internal / M public | MED | `BuildError.ts:15-71`; `MatrixError.ts:75-96`; discovery/preflight sites above |
| 6 | Node 24 cannot prove the intended SEA boundary without postject and CJS-only branching | direction | HIGH | M | MED | `.github/workflows/ci.yml:17-20`; local `node --version`; official Node 24/25.7 SEA docs |
| 7 | Effect Scope does not statically prevent a returned temporary artifact from escaping after cleanup | architecture | HIGH | S | LOW | rc.108 `Effect.scoped` returns `A` unchanged at `.agent-sources/effect/packages/effect/src/Effect.ts:6427-6429`; its example returns a released resource |
| 8 | esbuild structured metadata cannot prove arbitrary JavaScript dependency closure | direction | HIGH | S characterization | HIGH if overclaimed | live 0.28.2 probes: indirect eval/Function/global require/computed require-resolve can leave no diagnostic/import edge; Plan 017 narrows the contract |
| 9 | esbuild's JavaScript API uses an unref'd process-global native service not owned by `BuildContext` Scope | direction | MED | S | HIGH if mislabeled | exact 0.28.2 `lib/main.js`; Fable raw answer; context cancel/dispose does not call global `stop()` |

Direction selected by the maintainer and upheld by the audit:

1. Land only rent-paying lifecycle separation first.
2. Prove one continuation-owned esbuild intermediate through its structured
   library API, retaining every external edge esbuild actually observes without
   claiming complete source closure or ownership of esbuild's global service.
3. Consume it with exact selected Node 26.7.0, validate those external
   specifiers and native target against the selected tool, and atomically
   publish an exact selected-host Linux x64 GNU executable.
4. Compare the direct and composed topologies before changing any public
   artifact, inspection, provenance, receipt, plan, or executor contract.

## Fable Max recommendation ledger

The consultation protocol is recorded in
`plans/research/2026-08-13-fable-max-consultation.md`; the exact final Fable
answer is preserved verbatim in
`plans/research/2026-08-13-fable-max-raw.md`.

| Recommendation | Verdict | Independent evidence and consequence |
|---|---|---|
| One caller-owned Scope; `bundleScoped` must not close before its path consumer | Corrected | Cleanup ownership is right, but rc.108 `Effect.scoped` can return `A` after closing its Scope. Plan 017 uses `withJavaScriptBundle(input, use)` with a private Scope spanning the callback and explicitly denies a linear/static non-escape guarantee |
| Use esbuild context, await `cancel()`, then `dispose()` | Accepted with exact failure/process policy | An uninterruptible release awaits cancel, uses `ensuring` to attempt dispose even if cancel rejects, and leaves cleanup rejection as a Cause-level defect. This owns the context, not esbuild's unref'd process-global native service; global `stop()` is rejected because it can disrupt concurrent callers |
| Distinguish the esbuild API boundary from OS-process topology | Accepted and made load-bearing | Live 0.28.2 confirms the JS API lazily owns a global native service child. Plans now call it a structured library operation, not an in-process producer, and state the wider lifetime explicitly |
| Add candidate and validated states | Corrected | Existing `AtomicOutput` is too weak because it exposes commit before validation and adapters see final outfile. Replace it with a staged-path-only candidate plus a strict adapter request; lifecycle identity retains destination/rename. A branded validated value with no independently typed consumer fails rent, so validation remains inside the sole publishing control-flow owner |
| Bundle artifact should be CommonJS only | Rejected | Direct SEA supports `mainFormat: "commonjs" | "module"`; ESM and CJS coexist in Node 25.7+. Preserve an exact `"cjs" | "esm"` format field and preflight equality |
| Keep resolved esbuild options and entrypoint as durable bundle provenance | Rejected | Neither Node SEA nor any receipt consumer needs them, and entrypoint/cwd are physical invocation facts. Retain only observed esbuild name/version; fixed options and validation oracles stay in operation/tests |
| Put explicit assets on the bundle artifact | Corrected | Assets are explicit Node SEA inputs. The bundle artifact has one JS output and no asset field; an always-empty/unused asset map fails Fable's own rent test |
| A four-field bundle plus esbuild metadata can prove no unresolved runtime imports | Corrected/rejected | Live 0.28.2 probes disprove arbitrary closure. Plan 017 retains a fifth rent-paying field, sorted `observedExternalImports`, because exact selected Node is the real builtin authority; eval/Function and other opaque runtime construction remain outside the guarantee |
| SEA needs blob injection, multiple child steps, and Darwin signing in the first slice | Rejected/corrected | Exact selected Node 26.7.0 uses one built-in `--build-sea` child. Linux x64 GNU is the first required lane; macOS signing is a STOP/scope gate, not an implicit third stage |
| Add both `SyntaxTarget` and `ExecutionTarget` types | Corrected | Literal `node26.7` survives on the bundle because Node checks it. Execution is exact selected Node service state containing version, builtin authority, and canonical target, not an artifact/public target type. Resolution is fixed `node`; existing `Target` owns system identity |
| Prove no universal producer adapter | Accepted | CLI compiler adapter requires provider target/options/argv/diagnostics; esbuild's structured API and package-global service lifecycle differ. Shared code stays ranged native inspection, file validation, and atomic publication only |
| Replace public singular `tool` with ordered stages and version receipts in the SEA release | Rejected as premature | Current exact public allowlists and singular provider `tool` are released contracts; the SEA proof is internal. Keep an internal exact two-stage tuple and let Plan 019 require a named consumer plus a deliberate replacing hard cut |
| Record fixed format/syntax/snapshot/cache settings on every stage | Rejected beyond tool observation | These settings are operation invariants with no durable consumer. An internal stage tuple needs operation plus observed tool; a future versioned receipt may add semantic facts only when its consumer is named |
| Artifact `bytes` may be a resident buffer and should be removed | Corrected factual premise | `Artifact.bytes` is already the safe integer file size observed by `stat` (`CompilerEngine.ts:384-386,415-421`), not a peer byte buffer |
| Define semantic equality with entrypoint/output paths and a requested Node | Rejected/corrected | A portable semantic plan cannot contain machine-local paths or a selected tool. It needs content-identified inputs/toolchain requirement and shared acceptance criteria; no such plan is earned now |
| A fake executor can prove an internal `BoundExecutionPlan` | Rejected | Fake-only evidence is insufficient. First require a real portable plan, then bind it to at least two real backends with distinct workspace/tool/backend facts |
| Make receipts public immediately but gate other abstractions | Rejected | There is no named durable-record consumer. Workflow receipts prove CI status only; they do not earn a build receipt schema |
| Treat no-clobber as a legitimate publication precondition | Deferred/rejected now | No caller requests it, and adding it would change output behavior. The first slice retains atomic replace and no publish-mode family |
| Reject fail-fast, rollback, publish modes, and unrequested dry-run | Accepted | Matrix and atomic publication already own one failure policy; switches multiply state without a named distinct operation, and rollback contradicts the rename point of no return |

## Upstream and Effect constraints

- The checkout and current CI use Node 24.14.1. It exposes only
  `--experimental-sea-config`; its SEA is CommonJS-only and the documented flow
  uses postject. Node 25.7 supports direct `--build-sea`, ESM/CommonJS
  `mainFormat`, explicit assets, and defaults snapshots/code cache off. The
  separately selected producer is therefore pinned independently of the Node
  24 orchestrator.
- The first required Linux producer is exact Node 26.7.0, the current official
  release observed on 2026-08-13. Its exact documentation retains direct
  `--build-sea` and both `mainFormat` values. Node 25.7 is the capability floor,
  not an accepted runtime range. The selected binary and produced output must
  both inspect as the exact required canonical target.
- macOS direct SEA documentation includes `codesign`. Since signing is outside
  the current product boundary, the first required proof is Linux x64 GNU;
  macOS support hits a STOP condition rather than silently adding a third stage.
- esbuild 0.28.2 is currently transitive only. Plan 017 makes the exact version
  direct, fixes bundle/splitting/platform/packages/write/metafile controls, and
  validates every fact its structured result can observe. It explicitly does
  not claim eval/Function or other opaque runtime dependency construction is
  closed.
- [tsdown's executable mode](https://tsdown.dev/options/exe) is experimental,
  requires Node >=25.7, hides the bundle-to-SEA boundary, and its cross-target
  mode downloads/caches Node. It justifies the probe but does not fit this
  program.
- Plan 015 must land first. At current beta.107 and the planned rc.108 line,
  live Effect source exposes `Schema.TaggedError`, not
  `Schema.TaggedErrorClass`. Executors must use the installed API, keep all
  Effect/platform packages aligned, and use `Schema.Class`/`TaggedClass` only
  where runtime schema identity actually removes a representation. Internal
  scoped handles should remain non-serializable module-private types.

## Compression ledger

| Change | Representation/workflow removed | State or branch removed | New cost deliberately accepted |
|---|---|---|---|
| Collapse runner into service | `CompilerRunner`, pass-through `makeCompilerService` | Broad default target peer; two names/factories for one capability | None |
| Strict adapter request plus opaque candidate | Commit-bearing `AtomicOutput` and adapter visibility of final outfile/cwd/digest | Orchestrator may transiently preflight resolved destination; producer/candidate cannot see it, only lifecycle identity retains it with rename, and only lifecycle code renames | One adapter projection and one package-private candidate; no validated/public state family |
| Internal reachable cell error | Full `BuildError` at the execution boundary | Acquisition and preflight variants cannot masquerade as cell execution | One type alias; public schema unchanged |
| File-level executable validator | Engine-owned stat/read/inspect/match/digest workflow | Bun/Deno/Node SEA cannot fork validation semantics | One package-private module/function |
| Continuation-owned bundle artifact | Raw temporary JS path returned without lifetime ownership | Split outputs, browser resolution, unobserved output edges, assets, unknown format/syntax cannot cross the callback boundary | One callback-only artifact, observed-external list, exact esbuild dependency |
| Concrete Node SEA operation | Opaque bundle-and-executable wrapper | Format/builtin/target mismatch, Node 24/postject fallback, target selection, snapshot/cache switches are unrepresentable | Exact Node 26.7 service and Linux x64 GNU lane |
| Promotion decision record | Speculative public abstractions | Public protocols remain absent until each observable gate is met | Documentation/evidence only |

Source compression is not promised. Plan 016 should keep production line growth
near neutral while reducing `CompilerEngine.ts` ownership; Plans 017-018 add a
real feature under explicit constraints.

## Explicitly rejected or deferred

- Public `Candidate`/`Validated`/`Published` classes.
- A raw `bundleScoped -> JavaScriptBundleArtifact` handle with a claimed static
  lifetime; Effect Scope does not provide linear non-escape typing.
- An arbitrary-JavaScript closure/hermeticity claim from esbuild metadata; only
  observed dependency edges are covered.
- A total prepared lifecycle/public request beside existing inputs. Plan 016's
  strict adapter-only `PreparedExecutableRequest` projection is accepted because
  it removes final-destination visibility and is never stored as a peer cell.
- A peer `SystemTarget`; public `ResolutionTarget` or `ExecutionTarget`.
- A universal compiler/producer/executor adapter.
- Per-operation ownership claims for esbuild's package-global service or a
  global `esbuild.stop()` that can disrupt concurrent callers.
- `postject` compatibility, Node download, automatic backend/tool selection.
- A runtime Node `>=25.7` range; the proof accepts only exact tested 26.7.0 on
  the exact required native target.
- Public plural provenance or a second Artifact representation.
- Versioned receipts before a named durable-record consumer.
- `SemanticPlan`, `BoundExecutionPlan`, or replaceable executors before closed
  input/toolchain identity and two real backends.
- Generic build DAG/language, registry, CAS/cache, remote transport,
  container/remote execution, npm packaging, watch, plugins, signing, snapshots,
  code cache, rollback, fail-fast, and publish-mode switches.

## Program dependency order

```text
Plan 015 (existing Effect compatibility migration)
  -> Plan 016 (behavior-preserving lifecycle compression + two corrections)
     -> Plan 017 (continuation-owned esbuild JavaScriptBundleArtifact)
        -> Plan 018 (exact Node 26.7 SEA + atomic executable publication)
           -> Plan 019 (compare topologies and decide public promotion gates)
```
