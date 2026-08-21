# Interface mechanisms beyond CLI versus host API

Status: completed research report; no production or release authority.

Baseline: `codex/v0.4-surface-freeze` at `a3017657e0851530892a9f3d2d55ac5736769881` on 2026-08-21.

## 1. Direct answer

Yes: `CLI versus an existing TypeScript API` is an unjustified top-level binary. It conflates caller syntax with execution location, transport, selection authority, and lifetime. The correction is material in four places:

1. The esbuild JavaScript API is not an in-process compiler. It is a supported JavaScript caller surface over a package-module-global native child and an undocumented bidirectional framed protocol. Each resolved module instance owns its shared service; this is not process-wide uniqueness. The official Go API really does link the compiler into the Go process, and the official browser package runs a reduced engine in a WebAssembly worker.
2. A Bun- or Deno-hosted sidecar can expose a genuine provider API to a Node orchestrator. This is not a CLI boundary when the sidecar invokes `Bun.Transpiler`, `Bun.build`, or experimental `Deno.bundle` and defines its own structured protocol. It is useful only for serializable operations and does not transparently preserve plugin closures.
3. Node's direct SEA builder has no supported function API, but the Node-owned `postject` project exposes a real programmatic Promise/Wasm injector for the legacy blob flow. That is a distinct mechanism, although it does not replace `node --build-sea`.
4. Rolldown's JavaScript API is a same-process N-API/Rust engine, not a compiler child. This refutes the binary as a taxonomy even though Rolldown remains deferred from the 0.4 package train.

No single alternative wins across providers. Selected commands remain the best current boundaries for Bun/Deno executable compilation and direct Node SEA assembly. Esbuild's supported JavaScript API remains the best TypeScript boundary for structured results, plugins, and contexts. Provider-host sidecars are justified only for a narrow future set of serializable host-only operations. The recommended architecture is an operation-specific portfolio with semantic public operations and package-private mechanisms.

## 2. Exact disposition of the 0.4 freeze

**Disposition on the final `a301765` baseline: unchanged and independently confirmed.** The historical `in-process-api` label was reclassified at `e8641a6` while this study ran; the final baseline already records the corrected mechanism without changing the admitted operation set or proposed public exports.

The public freeze still admits only:

- Bun selected-command executable compile plus its derived homogeneous matrix;
- Deno selected-command executable compile plus its derived homogeneous matrix;
- esbuild memory build and context operations;
- direct Node SEA assembly; and
- no Rolldown package or portable role.

The correction is below that public operation set:

| Frozen operation | Final freeze label | Confirmed multi-axis classification |
|---|---|---|
| esbuild build/context | `installed-library-api` (historical R1: `in-process-api`) | caller: official JS API; execution: package-owned native service child; transport: private framed bidirectional stdio; selection: normally the installed optional-binary graph, but ambient `ESBUILD_BINARY_PATH` can override it; the version handshake is not a content digest; state: service shared by one resolved package module instance plus scoped contexts |
| Bun compile | `selected-command` | caller: Effect function; execution: selected Bun child; transport: argv/streams/filesystem; selection: probed explicit/PATH binary; state: one-shot child plus atomic publication |
| Deno compile | `selected-command` | caller: Effect function; execution: selected Deno child, optionally another esbuild child and denort acquisition; transport: argv/streams/filesystem/cache/network; state: one-shot outer child plus provider mutations and atomic publication |
| Node SEA assembly | command/config | caller: Effect function; execution: selected Node/LIEF child; transport: official JSON config plus command streams/filesystem; selection: exact builder/base; state: one-shot private candidate plus atomic publication |

`in-process-api` is safe only as a historical lane name meaning “called through a package API.” It is false as an execution-topology statement for esbuild. The final `SURFACE.json` now uses `installed-library-api`, preserves `historicalR1Lane: in-process-api`, and separately records `mechanismTopology: package-owned-native-service-child` for both frozen esbuild operations.

This study authored only the governing prompt and `interface-mechanisms/` research corpus. Those two path roots were untracked at the immutable `a301765` study observation and are the only paths permitted in this research-only publication descendant. The study did not edit `SURFACE.json`, `MIGRATION.json`, Plans 039-044, production, public exports, or release state. Other concurrent work integrated the classification correction at `e8641a6`; the independently integrated freeze marks Plan 039 `READY` from `1d50fab`; and research/CI hardening continued through the local study baseline `a301765`. After that baseline was pinned, the separate implementation thread advanced the live PR two child commits: `7de4ffe` established the certification handoff and `e12e930` implemented the frozen core capability contracts and marked Plan 039 `DONE`. Those commits are external chronology, not ancestors or work authored by this publication branch. This study neither authorizes nor begins Plan 039 and made no production or release change.

## 3. Ground-truth state map

The machine-readable record is [GROUND-TRUTH.json](./GROUND-TRUTH.json).

| State | Exact coordinate | Classification |
|---|---|---|
| Published source | `v0.3.0` / `f06f96ca88b6278e5f23a898d758b99fa9322108` | released source and npm tarballs |
| Requested checkout | `/private/tmp/effect-build-v04-freeze.ep1cIR/repo`, `codex/v0.4-surface-freeze`, `a3017657e0851530892a9f3d2d55ac5736769881` | unreleased research/freeze branch |
| Entry observation | `8a383db7a5f52ba382f10818330bbd4d1907c991` | surface/migration artifacts were still only in sibling worktrees |
| Integrated freeze | `16f9bd352bfbc099b5f5f81fc70b052dd7744313`, `c31815b…`, `e8641a6…`, `1d50fab…`, `fcbd2bb…`, `8ff14a7…`, `bc43266…`, `62eee63…`, `348d1cb…`, `592c1df…`, `1f9d463…`, and `a301765…` | surface, migration, semantic closure, activation, then research/CI hardening integrated concurrently while this study ran |
| `origin/main` | `60259f98a460b3d9b25b95221ca71b56c17d9d78` | remote branch, not this checkout |
| Live PR 4 | head `e12e930de5622be3f23814f3235293c93fcfd8bf`; base `15c811bb9904142a33d119766b62082f3c689f13` | open draft, `CLEAN`; live PR advanced two child commits beyond the immutable local study baseline and independently completed Plan 039 |
| Historical probes/corpus | prior post-0.3 branches and R1/R2/R3-R6 reports | evidence inputs, not published/current behavior |

At the immutable study observation, `a301765` was 116 commits after `v0.3.0`, but `git diff v0.3.0..a301765 -- packages package.json bun.lock` and the corresponding worktree diff were empty. The final adjudication still records exactly five shipped canonical candidates and two derived compile-matrix operations. The publication branch is a strict linear descendant of that exact study baseline; validation proves that every publication commit changes only the governing prompt or this research directory and changes no production/package path. A dedicated GitHub review-base ref points to the same immutable commit so Plan 039's exact-DONE certification remains untouched.

At the 2026-08-21T22:43:53Z publication observation, both duplicate exact-`e12e930` `quality` and `plan039-implementation` jobs succeeded. Source export and every listed provider, target-support, compatibility, publication-host, real-tool, and Node SEA job also succeeded: 27 of 27 current check-rollup entries were complete and successful. This workflow no longer listed the prior `linux-research`/`aggregate-certification` names; the immediately preceding exact-`a301765` runs had passed both twice before the live PR advanced. Exact Actions run URLs are recorded in `GROUND-TRUTH.json`; historical receipts are never substituted for another SHA.

### Published `v0.3.0`

The five npm tarballs were re-acquired and inspected. All provider packages export only `.`; core exports `.`, `./Integration`, and `./Provider`. Tarball hashes, export declaration paths and hashes, full sorted declaration-manifest hashes, registry URLs, and the acquisition command are in [GROUND-TRUTH.json](./GROUND-TRUTH.json). The immutable `a301765` study-baseline package sources and built declarations are unchanged from that tag; the later live PR head contains independently authored, export-inert Plan 039 implementation files.

### Exact versions under study

| Subject | Product/freeze coordinate | Comparative coordinate | Evidence class |
|---|---|---|---|
| Effect | `4.0.0-rc.108`, tag `bef7bf38…` | compatibility also covers beta.104 in existing CI | official tagged package |
| Bun | selected tool `1.3.9`, `cf6cdbbb…` | R2 source `1.3.14`, `0d9b296a…` | documented public release; content-pinned Linux tool; exact local Darwin 1.3.9 probe |
| Deno/denort | selected tools `2.9.3`, `f39575ec…` | R2 source/local Deno `2.9.5`, `17fadf33…` | documented public releases; content-pinned Linux tools |
| esbuild | `0.28.2`, `609683d8…` | none | documented public npm/Go/browser APIs; internal service separately classified |
| Node | `26.7.0`, peeled commit `b4f23d36…` | none | documented public release; SEA Stability 1.1 |
| Rolldown | candidate `1.2.4`, `483c6483…` | none | documented public JS package; provider is freeze-deferred |

Product pins and R2 comparison versions are not interchangeable. In particular, Deno 2.9.3 marks `deno transpile` experimental, so a later dossier conclusion must not be projected backward.

## 4. Correct research axes

Every record in [MECHANISM-COVERAGE.csv](./MECHANISM-COVERAGE.csv) separates:

- caller surface: function, callback, scoped handle, command, or manifest;
- execution location: isolate, native thread/addon, worker, child, sidecar, or embedded library;
- transport: direct call, N-API, Wasm, framed pipe, argv/streams, or filesystem artifact;
- selection authority: ambient host, package-resolved engine, explicit binary/library, or content-bound service; and
- state/lifetime: one-shot value, borrowed output, context, process/session, direct mutation, or atomic publication.

The inventory has 45 semantic operations. Scalar and matrix compilation, memory/stdout/direct-disk output, transform/format/analyze calls, context methods, and SEA generation/injection/repair/signing are separate wherever authority, lifetime, or output ownership differs. The mechanism ledger has 540 provider × operation × mechanism-family records, including bounded negatives for all twelve required families. [DECISION-MATRIX.csv](./DECISION-MATRIX.csv) adds 270 operation × architecture records without averaging semantic gate failures into a score. Its `portfolio_relation` distinguishes alternative routes, required adjunct artifacts, and hidden implementation dependencies; adjuncts are scored as non-standalone, while implementation dependencies are not promoted to caller-selectable mechanisms.

## 5. Current TypeScript-facing execution trace

[CURRENT-TS-TRACE.csv](./CURRENT-TS-TRACE.csv) traces every exported effect-returning build/lifecycle operation and the public author factory in the released package surface at the immutable study baseline. Public schemas and error classes are data declarations, not engine operations.

The important topology is:

```text
Bun compile/bundle
  TS Effect -> selected Bun child -> Bun native compiler threads -> staged/private file
            -> effect-build validation -> atomic publication or scoped borrowed cleanup

Deno compile
  TS Effect -> selected Deno child -> graph/check/bundle/standalone writer
            -> optional esbuild helper child + optional denort acquisition/cache
            -> Deno private rename into effect-build staging
            -> effect-build validation -> atomic publication

esbuild borrowed bundle
  TS Effect -> official esbuild JS API -> package-module-global native service child
            <-> private framed protocol and possible reverse callbacks
            -> scoped context result bytes -> effect-build temp file -> borrowed callback

Node SEA
  TS Effect -> borrowed main/assets validation -> private copies/config
            -> selected Node --check -> selected Node --build-sea -> LIEF private candidate
            -> effect-build native validation -> atomic publication
```

Matrix operations are repeated scalar cells under Effect concurrency. They are not provider-native matrix engines. Successful cells remain published when other cells fail; interruption closes active children but does not roll back earlier publications.

## 6. Provider findings

### Bun 1.3.9

`Bun.Transpiler` is a real host API. Synchronous transform/scan work executes on the caller thread; async transform uses Bun's worker pool. `Bun.build` stays in the Bun process but not the caller isolate's thread: the JS binding queues work to a singleton detached native bundle thread and shared work pool, then returns completions and plugin callbacks to the caller event loop. There is no compiler child.

That topology supports three different truthful boundaries:

- direct host API for transformations, structured memory builds, virtual files, and arbitrary JS plugins;
- selected command for native project/process semantics, compile, direct disk builds, and raw watch; and
- a package-private Bun sidecar for serializable transformations or memory builds when the orchestrator is not Bun.

The sidecar is a genuine provider-API mechanism only when it calls `Bun.Transpiler`/`Bun.build`. A JSON request containing `bun build` argv is still a CLI wrapper. Arbitrary functions cannot cross. A provider-side plugin module is possible, but changes the contract to code selection, mobility, trust, versioning, and reentrancy.

No supported general Bun compiler library ABI, outward C API, stable service protocol, or compiler WASM build was found at `bun-v1.3.9` after checking public declarations/docs, FFI/Node-API surfaces, JS/native bindings, CLI/build/compile sources, and the exact source tree. Bun FFI and Node-API load user native code into Bun; they do not export Bun's compiler. The native `onBeforeParse` plugin is valuable for one owned parser-thread transform, not a general compiler bridge. A fork would inherit Bun, Zig, JSC/WebKit, large native build/distribution, and component-license obligations.

Recommendation by operation:

- transpile/scan: direct Bun host; bounded sidecar for a non-Bun orchestrator or batching;
- build memory: direct host; sidecar only when structured host-independent bytes pay for copies/protocol;
- plugins/virtual: direct host, or explicitly selected provider-side module—not callback serialization;
- direct multi-output: direct host/command according to authority; never call it transactional;
- executable compile: keep selected Bun plus Effect staging/publication;
- watch: keep raw selected process; a typed handle is upstream-dependent.

### Deno 2.9.3

Experimental `Deno.bundle` is also not “in-process compiler work.” The call enters a Rust runtime op, starts a fresh OS thread with a current-thread Tokio runtime, reconstructs Deno project/resolution/permission state, then starts an esbuild 0.25.5 service child over framed stdio for that call. Structured bytes return through Rust/V8. The host API disables type checking and exposes no plugins, declarations, watch, cancellation, or reusable context.

The CLI bundle watch path is materially different: it retains a private esbuild context. That state is public only as a terminal-oriented watch process.

`deno_core` embeds V8/event-loop machinery and explicitly omits TypeScript and CLI tooling. `deno_runtime` is a rapidly changing runtime product, not the CLI build tool. `deno_bundle_runtime` publishes an inverted `BundleProvider` hook, but an embedder must supply an implementation; Deno's real `CliBundleProvider`, bundle tool, compiler, and standalone writer are private. No supported Deno 2.9.3 Rust surface for the CLI bundle/check/declaration/compile operations was found. `deno_ast` is credible only for a separate pure per-file parse/transpile operation and explicitly does not promise SemVer.

Recommendation by operation:

- experimental structured bundle memory: direct Deno host or a bounded exact-Deno sidecar;
- bundle disk/stdout, checking, declarations, config/import-map/lock/permissions: selected command and native project files;
- compile and denort acquisition: keep selected Deno plus Effect staging/publication; a sidecar spawning `deno compile` is only JSON around CLI;
- watch: selected process until Deno supports a typed context/event protocol;
- private Rust CLI embedding: reject.

### esbuild 0.28.2

The official caller surfaces are CLI, JavaScript, and Go. Their mechanisms differ:

| Surface | Actual engine topology | Support status | Semantic advantage |
|---|---|---|---|
| CLI | selected native child; Go compiler in that process | documented public | explicit binary/process/project/stream authority and kill isolation |
| Node JS | module-global native child `--service=0.28.2 --ping` | JS API public; protocol internal | structured results, virtual inputs, JS plugin reverse callbacks, contexts |
| Go | compiler linked into caller Go process | documented public | direct library calls, Go plugins, direct contexts; no service child |
| Browser Wasm | browser JS -> Worker by default -> Go Wasm service | documented public reduced domain | in-memory/virtual/plugin builds without native platform binary |

The private service has request IDs, reverse callback requests, framed packets, and an exact-version first-packet handshake. The shipped loader normally resolves the matching optional platform package, but it consults ambient `ESBUILD_BINARY_PATH` first; the handshake rejects a version mismatch, not modified same-version bytes. The checked probe deliberately excludes that override and content-binds both the manifest and the native binary it observes. The protocol must remain below the upstream package boundary. A probe's success does not make it a supported effect-build protocol.

Two lifecycle facts matter:

- `context.cancel()`/`dispose()` are honest provider operations. The checked probe showed cancel waits while a host plugin callback is blocked. Effect interruption alone does not cancel a one-shot `build()`.
- disposing contexts does not stop the package-module-global native process. `esbuild.stop()` kills the state shared by consumers of that resolved module instance and is too broad for an ordinary library Scope finalizer.

The Go API answers the “other official library” question: it genuinely embeds the compiler. But a TypeScript-facing Go sidecar would add a protocol, generated schemas, platform binaries, copy/backpressure decisions, stale handles, and callback RPC while duplicating much of esbuild's maintained JS package. It is viable for a bounded plugin-free experiment, not currently simpler.

The browser probe established that Wasm preserves transform, in-memory build, virtual plugin callbacks, structured failure/recovery, concurrency, and a rebuild-capable implementation handle in Chrome 151. It also failed closed for filesystem `write`, `watch`, and `serve`. Upstream declarations classify browser context as unsupported even though implementation plumbing currently permits `context()`/`rebuild()`; that accidental breadth must not be promoted over the public support promise.

Recommendation: keep the official JS API and the final freeze's `installed-library-api` plus package-owned-child topology for build/context operations. Use selected CLI only where selected command semantics are the operation. Keep Go sidecar and browser Wasm as separate research domains.

### Node SEA 26.7.0

Direct `node --build-sea config` and legacy `--experimental-sea-config` are the only supported creation surfaces found. The public C++ embedder and snapshot machinery construct a hosted/custom Node runtime or snapshot product; they do not clone an official base, inject `NODE_SEA_BLOB`, flip the SEA fuse, or establish `node:sea`. The attractive `node::sea::BuildSingleExecutable` and blob functions are source-visible internal symbols guarded by `NODE_WANT_INTERNALS`, not a public C/Node-API/C++ assembly contract.

Node's direct builder reads main/assets/base, generates the blob, copies/rebuilds the executable through LIEF, flips the fuse, and truncates/writes the configured output. It does not give atomic destination semantics. effect-build's private candidate, validation, and final rename are therefore a real ownership boundary.

`postject@1.0.0-alpha.6` is the material alternate mechanism for legacy injection:

- supported external Promise `inject()` surface from the Node-owned project;
- same Node isolate plus bundled Emscripten/LIEF Wasm;
- no cancellation, TypeScript declarations, stable tagged errors, or bytes-returning output;
- full executable/blob copies and in-place mutation;
- prerelease and independently versioned from Node; its LIEF 0.13 differs from Node 26.7's LIEF 0.17.

The probe produced both a direct SEA and a working legacy programmatically injected SEA, then verified reinjection fails closed and direct output to a pre-existing directory fails nonzero without destroying the directory. This proves the mechanism, not its product priority.

Recommendation: keep selected direct Node assembly. Admit pinned postject only if legacy injection becomes a required operation, behind a package-private adapter and private candidate. Do not add fallback from direct assembly. Keep signing/repair as explicit post-mutation platform capability and `node:sea` as the artifact-runtime contract.

### Rolldown 1.2.4

Rolldown is not a live 0.4 candidate. The freeze defers both package/profile admission because package, host, consumer, publication, and lifecycle gates remain open. Mechanism research cannot bypass those gates.

Its actual JS topology is still important:

```text
certified/archived host JS (durable Node evidence; Bun/Deno host cells unproven)
  -> Rolldown JS option/plugin adapters
  -> package-owned platform N-API addon
  -> same-process Rust/Tokio worker threads
  -> reverse N-API calls to host plugin closures
```

There is no compiler child. Outputs may expose lazy native-backed fields and explicit external-memory release. A process boundary must eagerly copy/materialize these values or create session-affine borrowed handles with leaks and stale states.

`RolldownBuild` is reusable as an API object, but each `generate`/`write` creates a fresh full build; it is not incremental. Existing freeze evidence also shows `close()` need not join an already-started generation. The published Rust crate is official but explicitly has no SemVer, documentation, or team-support commitment. Exact source exposes a WASI selection branch; a disposable scratch observation was not retained as reproducible executable evidence, so WASI operation/parity/performance/support remain unproven.

Recommendation: keep Rolldown deferred. If reconsidered, first close package/five-host/packed-consumer/publication gates, in-flight joining, package/native/host identity, and external-memory ownership. Do not add RPC sessions around a non-incremental handle.

## 7. Adversarial probes

Sources, exact commands, assertions, and limitations are in [PROBES.md](./PROBES.md); machine receipts are under [receipts](./receipts/).

| Probe | Mechanism distinguished | Fail-closed conclusions |
|---|---|---|
| Bun 1.3.9 framed sidecar | provider host API versus CLI/JSON wrapper | exact handshake/skew; reusable handle; structured failure and recovery; 1 MiB transfer; pipelining; callback serialization loss; stale handle; graceful/forced cleanup |
| esbuild JS service | official JS surface versus actual engine topology | lazy single native child; reverse plugin callbacks; two contexts share child; dispose leaves child; cancel waits for host callback; stop/restart changes PID |
| esbuild browser Wasm/Worker | supported non-TypeScript/native surface | exact package; in-memory/plugin success; failure recovery; concurrent requests; write/watch/serve reject; timing/heap observations |
| Node direct/postject | official command versus programmatic legacy injector | exact Node executable plus version/API-entry-bound postject (whose entry embeds LIEF/Wasm); both artifacts run; reinjection rejects; direct-write failure preserves pre-existing directory |

Go was absent, so no native toolchain was installed. Browser Wasm was exercised instead, as permitted by the brief. Deno 2.9.3 did not have a matching local executable for an independent provider probe, so source evidence and the already content-pinned Linux tool remain distinct from local Deno 2.9.5 behavior. Rolldown's durable evidence is exact-source material plus an archived narrow R2 receipt; disposable broader observations are not claimed as reproducible checked evidence and do not change its deferred status.

The timings are observations, not benchmarks. On this macOS arm64 host, the exact Bun sidecar cold handshake was roughly tens of milliseconds, warm small transforms were sub-millisecond, the recorded 1 MiB round trip took about 7.4 ms, and idle RSS was roughly 61 MiB. Browser Wasm initialization/first transform were materially slower than native esbuild. These values expose cost categories; they are not release claims.

## 8. Architecture comparison

### A. Current operation-specific hybrid

Concrete calls and traces: `BunCompile.compileExecutable(request)` and `DenoCompile.compileExecutable(request)` resolve an exact layer-selected child, render native argv/project authority, build a sibling private candidate, validate it, and atomically publish it. `EsbuildBuild.build(request)` enters the supported JS package, which lazily starts its package-module-global native service child and returns structured bytes; `EsbuildContext.make(request)` scopes the public context handle, then cancels/disposes it without claiming ownership of that wider child. `NodeAssemble.assembleExecutable(request)` copies private inputs, writes the documented config, runs the selected exact Node builder/base, validates the candidate, and publishes it.

- Control/state: operation wrapper and upstream handle/child, not a universal backend manager.
- Serialization: only command and filesystem boundaries serialize; esbuild callbacks stay in host JS.
- Preserves/loses: preserves provider project authority, structured results and plugins where a supported API is chosen, and explicit binary identity where a command is chosen. Direct APIs retain host-runtime coupling; command paths intentionally do not promise arbitrary callback/opaque-handle transport or structured events absent a native machine channel.
- Coverage/non-fit: fits the frozen Bun/Deno compile, esbuild build/context, and Node SEA operations and their exact derived matrices. It does not turn browser Wasm, Node embedding, Rolldown, or unadmitted Bun/Deno host-only breadth into substitutes, and it cannot make a provider API available in an incompatible orchestrator host.
- Failure/lifetime: Scope owns selected children/context finalizers/staging; provider-direct writes stay explicit. A child crash is isolated and invalidates that invocation, while provider cache/direct-write mutation can remain outcome-unknown; an in-process/package service fault can affect the host, and Effect interruption is not relabeled as provider cancellation.
- Output/mutation/cleanup: in-memory API bytes remain caller-owned; direct writes remain provider mutation; executable operations use private candidates, validation, cleanup, then atomic publication.
- Version/capability/support: selected-command layers probe exact path/version/capabilities and bind the selected runtime; supported package APIs use their upstream package/version promise while internal protocols remain undocumented implementation details.
- Public compatibility: only semantic provider operations and their documented fields are public; command/API/service topology and selection adapters remain package-private.
- Cost: low structural, operational, distribution, and source-maintenance cost relative to owned protocols or native bridges, at the price of some deliberately heterogeneous implementation.
- Invalid states removed: no generic provider registry, fallback, or false common option set.
- Falsifier: reject when an admitted operation requires structured host-only semantics from an incompatible orchestrator and a bounded sidecar materially reduces total state.

Verdict: viable now, but topology vocabulary must be corrected.

### B. Provider-host sidecars

Concrete call: a Node-hosted Effect program sends a framed `transform`/`scan`/`buildMemory` request to an explicitly selected Bun child that invokes Bun's public API and returns a typed result.

- Control/state: Effect owns process/protocol/queue; Bun owns engine threads; request is correlated by ID.
- Serialization: source/options/results/bytes; closures and opaque objects do not cross.
- Preserves: structured serializable operations and host independence.
- Loses/adds: copies, plugin code-mobility policy, handshake/schema/backpressure/crash/outcome states.
- Failure/lifetime: kill gives fault isolation, not provider cancellation; persistent crash invalidates generation-bound handles.
- Output/mutation/cleanup: response bytes are copied into the caller; files created in the sidecar namespace are provider-direct until Effect validates/publishes them; Scope owns pipe/process cleanup and cannot infer rollback after a crash.
- Compatibility: exact path/version/digest/capabilities and protocol generation required.
- Public promise: transport should remain package-private; public operation stays semantic.
- Cost/invalid states: server distribution, cold/warm memory, frame bounds, correlation, backpressure, timeout, code mobility, and crash/outcome classification are medium-high operational and maintenance costs.
- Falsifier: reject if the sidecar only stores CLI argv, cannot retain a required provider field, or adds more state than host coupling removed.

Verdict: bounded future mechanism for Bun transformations/memory build and experimental Deno bundle memory; not a universal architecture.

### C. Persistent provider sessions

Concrete call: acquire a session, create a configured transpiler/context, issue many correlated calls, close handle, then shut down session.

- Control/owners: Effect would own the daemon process, protocol generation, queue, and final shutdown; the provider owns engine state; opaque handles borrow that session and all become stale on crash/restart.
- Request/result boundary: framed serializable requests and copied results keyed by request and generation-bound handle IDs; callbacks require separate bidirectional RPC and are not assumed.
- State: handshake, session generation, handles, queue bounds, in-flight calls, shutdown, crash/restart, idle resources.
- Output/mutation/cleanup: in-memory results cross by copy; direct files belong to the daemon namespace until explicitly published; Scope must close handles, drain or cancel owned work, stop the process, and classify outcome-unknown mutation after a crash.
- Benefit: amortized startup and real upstream incremental/context state.
- Fit: Bun Transpiler batching; esbuild public contexts already provide the needed state without an effect-build daemon.
- Non-fit: Bun build has no public context; Deno.bundle recreates its inner engine; Node/postject is one-shot; RolldownBuild is non-incremental and has a close race.
- Compatibility/public promise: a version/capability handshake and stale-handle laws would be effect-build-owned; the session remains package-private and cannot enlarge the semantic public operation.
- Cost/invalid states: protocol/server packaging, idle memory, queue/backpressure, handle leaks, generation skew, restart policy, and shutdown races are high operational and maintenance costs unless real reusable provider state removes more work.
- Falsifier: reject whenever no supported reusable engine state exists or a shared upstream service cannot be safely scoped.

Verdict: do not generalize. Use the upstream esbuild context; keep Bun session research narrow.

### D. Embedded/native/Wasm engines

Concrete call: a Go program calls esbuild `pkg/api` directly, or browser JS initializes exact `esbuild-wasm` and builds virtual inputs.

- Control/owners: a Go/Rust/native host owns the linked engine and native faults; a browser page owns its Worker/Wasm instance. Effect can own only an explicit bridge process/worker or scoped handle, not an engine hidden in another caller.
- Request/result boundary: direct language values inside the native consumer; a TypeScript bridge must serialize values/copies and either exclude callbacks or own callback RPC. Browser Wasm accepts only its documented in-memory domain.
- Preserves: direct Go semantics or reduced browser in-memory semantics.
- Lifetime/failure/output: linked crashes share the host process; sidecar crashes invalidate handles and may leave direct writes outcome-unknown; Worker termination discards memory. Scope can release an owned bridge/worker, while durable publication still needs explicit filesystem ownership.
- Compatibility/public promise: official Go/browser APIs are supported only in their declared hosts; C/ABI/source-internal surfaces remain rejected. Any bridge and platform binary is package-private unless separately certified as a supported Layer.
- Costs/invalid states: TypeScript bridge schemas, native toolchains/platform binaries, ABI/source coupling, signing, Wasm copies/performance/filesystem loss, crash recovery, and platform skew are high structural/distribution/source-maintenance costs.
- Provider fit: esbuild Go and browser Wasm are supported; Rolldown N-API is its existing package mechanism but provider deferred.
- Non-fit: Bun has no supported compiler ABI/Wasm; Deno runtime crates are not CLI build engines; Node embedder is not SEA.
- Falsifier: reopen when upstream ships a supported ABI/library with required operation semantics and distribution cost below sidecar/command alternatives.

Verdict: provider-specific, not a default effect-build implementation family.

### E. Inverted/declarative integration

Concrete calls: esbuild/Bun/Rolldown own compilation and call host plugins; Node owns SEA assembly and consumes `sea-config.json`; Deno consumes deno.json/import-map/lock/permission authority.

- Control/owners: the provider owns execution and callback scheduling or consumes its native project/config artifact; the caller owns plugin code/trust or manifest contents; provider-direct mutation remains provider-owned until a separate publication step.
- Request/result boundary: plugins retain closures and opaque context only inside the provider host; declarative files retain documented native fields but cannot encode arbitrary callbacks or private handles.
- Preserves: callbacks when they remain in provider host; native project/config fields; durable artifact handoff.
- Failure/lifetime: callback reentrancy, plugin cleanup, and provider crash follow the provider handle/process; config parse/version failure is one-shot; interruption does not invent callback cancellation or roll back provider-direct writes.
- Compatibility/public promise: public plugin/config schemas follow upstream support policy; executable config and private IR/blob formats do not become stable protocols. These mechanisms remain provider-native adjuncts beneath semantic operations.
- Costs/invalid states: reentrancy/code identity/trust, config/schema/version skew, filesystem remnants, and signing/mutation order are operation-dependent; duplicating a native config schema would add rather than remove workflows.
- Non-fit: config is not an engine, executable config may not be declarative, private IR/blob formats are not stable protocols, and a file containing argv remains CLI semantics.
- Falsifier: reject an “artifact protocol” if exact-version/provider-private coupling is required but unrecorded.

Verdict: valuable adjuncts and plugin-specific boundaries; not a universal controller.

### F. Operation-specific portfolio

Concrete flow: choose the supported mechanism that owns each operation's semantics, then reuse common Effect lifecycle/file/process primitives without normalizing unlike requests.

- Bun/Deno/Node executable operations: selected exact command plus staging/validation/publication.
- esbuild memory/context: public JavaScript API; record hidden child topology; scope context, not global service.
- Future serializable host-only operation: bounded provider sidecar only after an operation admission decision.
- Plugins: provider-native/inverted host callbacks, never generic JSON callbacks.
- Project authority: native provider configuration remains native.
- Runtime artifact API: stays attached to produced artifact rather than build transport.
- Control/owners: each operation record names its provider engine/child/handle, Effect scope, mutation owner, and publication owner; there is no cross-provider session owner.
- Request/result boundary: native values stay native where callbacks/handles matter; selected commands use argv/streams/files; sidecar framing is admitted only for a serializable operation that earns it.
- Failure/lifetime/output: command children and private candidates are scoped, public contexts use their native cancel/dispose laws, direct multi-output writes stay explicitly non-transactional, and matrix successes are not rolled back after another cell fails.
- Compatibility/public promise: public operations remain semantic and provider-specific; package-private mechanism selection carries exact version/capability/support evidence and can change without exposing a generic transport promise.
- Cost/invalid states: the portfolio keeps some heterogeneous adapters but adds no registry, fallback, universal option schema, or shared failure algebra; it minimizes total state only while each operation has one canonical supported route.

This model introduces no generic `Backend`, `Manager`, registry, fallback, scheduler, or remote product. The common core is lifecycle and artifact truth, not a universal build request.

- Falsifier: supersede the portfolio only if a supported mechanism preserves every relevant operation's authority, callbacks/results, lifetime, and output laws while measurably reducing the combined protocol, distribution, and invalid-state burden.

Verdict: preferred.

### Complexity ledger

| Model | Concepts added | Workflows removed/preserved | New invalid states | Operational/distribution cost | Decision |
|---|---|---|---|---|---|
| A hybrid | selected tool, command child, public API/context, staging | preserves upstream-native workflows | package-module-global esbuild service/crash; provider-direct mutation | low-medium | keep; corrected classification is already frozen |
| B sidecars | protocol, handshake, queue, request IDs, server | removes host-runtime coupling for serializable ops | skew, timeout, outcome unknown, code mobility, copies | medium-high | bounded only |
| C sessions | B plus generations/handles/restart/idle state | amortizes startup only with real reusable state | stale/leaked handles, crash invalidation, shutdown races | high | reject as general model |
| D embedded | ABI/library/Wasm/toolchain packages | can remove a child in supported language/domain | ABI/source/platform skew, native faults, capability loss | high-very high | provider-specific research |
| E inverted/declarative | plugin trust/reentrancy or config schema | preserves native callback/project authority | code identity, unversioned artifact/config mismatch | operation-dependent | adjunct only |
| F portfolio | no universal abstraction; per-op mechanism record | preserves one canonical workflow per operation | only provider-specific states that operation requires | lowest total state | preferred |

## 9. Operation-level boundary portfolio

The full prose-backed matrix is [DECISION-MATRIX.csv](./DECISION-MATRIX.csv). The decisive recommendations are:

| Provider/operation | Boundary now | Public status | Research alternative |
|---|---|---|---|
| Bun compile/matrix | selected Bun command + Effect atomic publication | frozen | direct host/sidecar only if a JS-only compile field becomes required |
| Bun transpile/scan/memory build | direct Bun host | not admitted | framed Bun sidecar for non-Bun orchestrator; plugin closures excluded |
| Bun plugins | direct/inverted provider callback | not admitted | selected provider-side module with explicit trust; no JSON closure claim |
| Bun watch | raw selected process | not admitted | upstream typed context/events |
| Deno compile/matrix/acquisition | selected Deno command + Effect atomic publication | frozen | none; CLI-wrapping sidecar rejected |
| Deno bundle memory | experimental direct host | not admitted | exact-Deno sidecar for structured bytes only |
| Deno project/check/declarations/watch | selected Deno command/native files | not admitted | upstream machine context/protocol |
| esbuild build memory | official JS API over hidden native child | frozen | browser Wasm only for reduced browser domain; Go sidecar unearned |
| esbuild context | official JS context, Scope cancel/dispose | frozen | Go session only if host independence becomes required |
| esbuild plugins/watch/serve | official JS context/plugins | not admitted | raw CLI watch/serve are distinct process contracts, not substitutes for context methods; no effect-build protocol recreation |
| Node direct SEA/main/assets | selected exact Node/config + Effect atomic publication | frozen | none currently better |
| Node legacy injection | pinned postject function on private candidate | not admitted | one-shot selected-Node sidecar only for host isolation |
| Node snapshot/embedder | distinct products/fields | not admitted | reject as SEA substitute |
| Rolldown all | no effect-build boundary | deferred | reopen only after R6/package/lifecycle gates |

## 10. API sketches for the top portfolios

These are sketches, not implementation authorization or a replacement for `SURFACE.json`.

### Portfolio 1: corrected operation-specific public surface

Public operations remain provider-native and do not expose transport selection:

```ts
yield* BunCompile.compileExecutable(input)
yield* DenoCompile.compileExecutable(input)
yield* EsbuildBuild.build(input)
yield* Effect.scoped(
  EsbuildContext.make(input).pipe(
    Effect.flatMap((context) => context.rebuild),
  ),
)
yield* NodeAssemble.assembleExecutable(input)
```

Package-private mechanisms stay narrow:

```ts
withAtomicExecutableCandidate(request, ({ stagedOutfile }) =>
  selectedCommand.run(renderNativeArgv(stagedOutfile)))

withEsbuildContext(options, (context) => context.rebuild())

assembleWithSelectedNode(selectedNode, privateSeaConfig)
```

There is no public `Transport`, `Backend`, mechanism tag, registry, or fallback. A Layer owns selected identity and supported mechanism; the operation contract owns semantics.

### Portfolio 2: bounded provider-host sidecar beneath a semantic operation

No public sidecar API should be frozen until a new operation is admitted. The package-private shape needed for a probe is:

```ts
interface BunSidecarSelection {
  readonly executable: AbsolutePath
  readonly expectedVersion: "1.3.9"
  readonly expectedSha256: Sha256
  readonly protocol: "effect-build/bun-sidecar@1"
  readonly maxFrameBytes: number
  readonly maxInFlight: number
}

interface BunTranspilerSession {
  readonly transform: (request: SerializableTransformRequest) => Effect<TransformResult, SidecarError>
  readonly scan: (request: SerializableScanRequest) => Effect<ScanResult, SidecarError>
}

const withBunTranspilerSession: <A, E, R>(
  selection: BunSidecarSelection,
  use: (session: BunTranspilerSession) => Effect<A, E, R>,
) => Effect<A, SidecarError | E, Scope | ChildProcessSpawner>
```

The public semantic operation, if separately admitted, would remain `BunTranspile.transform`, with the mechanism supplied by a certified Layer. Plugins are absent because serializable transform semantics do not include them. A future plugin-module operation would have a different request, trust model, and identity—not a fallback.

## 11. Semantic validity, compatibility, status, priority, ergonomics

| Finding | Semantic validity | Public compatibility cost | Implementation/certification status | Product priority | Observed ergonomics |
|---|---|---|---|---|---|
| Bun sidecar transform/scan | valid serializable operation | none if package-private; new promise if public layer supported | prototype passes; multi-host/package gates absent | optional until non-Bun caller needs it | simple calls; protocol ownership nontrivial |
| Deno bundle sidecar | valid only within experimental API domain | high if stabilized as effect-build promise | source-grounded; exact 2.9.3 local probe absent | low while operation is not admitted | structured bytes attractive; inner service still cold |
| esbuild JS API topology correction | required truth, no semantic surface change | none to public operation; documentation/certification metadata change | exact source and probes complete | high before implementation | current JS API remains easiest faithful TypeScript surface |
| esbuild Go bridge | semantically valid for serializable/full Go operations | new cross-language protocol/package promise | Go toolchain absent; no local bridge probe | low without host/distribution need | worse than maintained JS API for current consumer |
| esbuild browser Wasm | valid reduced browser domain | separate host capability promise | exact Chrome probe passes reduced assertions | low for current Node package train | easy in memory; slower/no filesystem/watch/serve |
| postject injection | valid legacy injection | new prerelease injector compatibility axis | exact programmatic probe passes Darwin arm64 | low unless legacy flow is a named product need | convenient Promise; unsafe in-place/no cancel |
| Node C++ embedder as SEA | semantically invalid equivalence | irrelevant | bounded negative | none | large toolchain for different product |
| Rolldown N-API | valid upstream API | full new package/profile promise | freeze gates fail | deferred, not invalid | rich API; lifecycle/native-memory ownership incomplete |

Absence of a current adopter affects priority only. It is not used as evidence against semantic validity.

## 12. Upstream proposals, unknowns, and stop conditions

### Bun

Propose a supported versioned compiler service/ABI or public build context with typed events, rebuild, cancellation, and disposal; add `AbortSignal`/cancel for `Bun.build`. Reopen embedding only if Bun publishes and supports such a surface. Stop sidecar work if the first real consumer requires arbitrary closures or if host coupling is cheaper than protocol/distribution.

### Deno

Propose a stable bundle/compile Rust service or machine protocol exposing exact runtime/helper/config/permission identity; public context/rebuild/cancel/dispose; explicit esbuild-helper acquisition observation; and a supported plugin policy. Reopen private Rust embedding only if the CLI operation is published as a supported library. Stop Deno sidecar work if it merely spawns `deno compile` or cannot preserve project authority.

### esbuild

A documented supported service protocol, per-context service ownership, or one-shot cancellation would change the bridge calculation. Reopen a Go sidecar only after a concrete host-independence need and a probe preserving all required options/results, crash recovery, and plugin policy on supported platforms. Stop if it recreates the existing private protocol without reducing state.

### Node/postject

Propose a structured Node SEA builder/blob API with capability metadata, exact builder/base identity, typed errors, and cancellation or safe bytes-returning output. For postject: TypeScript declarations, stable typed errors, `AbortSignal`, current LIEF, and `injectBytes(base, resource) -> bytes`. Reopen native embedding only with official libnode distribution and a stable SEA API. Stop legacy injection work until a product requirement exists.

### Rolldown

Reopen only after upstream/support and repository gates prove: stable Rust/ABI or supported JS package relation; cancellation; close joins all owned work; external-memory policy; true incremental handle; five-host and packed-consumer coherence; package/export/publication evidence. Stop immediately if a proposed session only wraps repeated full builds.

### Remaining empirical gaps

- Bun sidecar multi-platform/process-crash during provider mutation and direct multi-output remnants.
- Deno exact 2.9.3 executable sidecar and cache/acquisition interruption on the certified Linux host.
- Esbuild Go direct/sidecar probe, because Go was unavailable and intentionally not installed.
- Browser Wasm broader asset/source-map and worker-crash memory profiling.
- Node postject Linux/Windows, snapshot, exec argument extension, interruption mid-write, and quantitative peak memory.
- Rolldown package/lifecycle gates; mechanism research does not substitute for them.

Each gap is a gate only for the operation/mechanism it affects. None justifies a generic manager, fallback, retry, installer, cache, scheduler, or remote-build product.

## 13. Final conclusion

The current search was too narrow as a taxonomy but mostly correct as an operation portfolio. “API” did not mean one execution model, and “process” did not necessarily mean CLI semantics. The real alternatives are supported Go libraries, package-owned native services, N-API engines, WebAssembly workers, provider-host sidecars, inverted callbacks, and declarative/artifact handoffs. Most are useful only in a provider/operation-specific domain.

The evidence independently confirms the architectural fact encoded at `e8641a6` and retained at the final `a301765` baseline: esbuild's frozen JS lane is an installed-library caller surface over a package-owned native service child, not an in-process compiler. No further freeze change is required. It does not change the admitted 0.4 operations. This study does not justify Rolldown, authorize or begin Plan 039, or change production/release state. The durable rule is: expose semantic provider operations; keep execution mechanisms package-private; select mechanisms per operation; and make identity, mutation, lifetime, and capability loss explicit.
