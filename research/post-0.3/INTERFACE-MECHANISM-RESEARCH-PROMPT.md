# Research prompt: interface mechanisms beyond CLI versus host API

> **Status**: research-only prompt. It does not define a production architecture,
> authorize Plan 039, freeze exports, or supersede repository instructions.
>
> **Drafted against**: local `codex/v0.4-surface-freeze` commit
> `9f29d02f50211f85852d593579a2c96a6dc5167c` on 2026-08-21. Resolve the
> current checkout, branches, PR, release, and upstream versions again before
> executing the prompt.

## Research decision

Determine whether effect-build has constrained its search space by treating the
following as the primary ways to drive Bun, Deno, esbuild, Node SEA, and any
still-admitted Rolldown candidate:

1. an existing JavaScript or TypeScript API called from a compatible host; or
2. a selected CLI executable invoked through Effect process services.

Treat that binary, Candidate C2, the current canonical-operation lane labels,
and the 0.4 surface-freeze recommendations as hypotheses to test rather than
conclusions to restate. Determine whether other interface mechanisms preserve
otherwise inaccessible semantics, improve host independence, give stronger
identity or lifecycle control, reduce operational complexity, or enable a
meaningfully better public or package-private boundary.

Do the research. Do not critique or praise this prompt, merely summarize prior
work, or replace source investigation with a methodology essay.

## Observed framing to challenge precisely

The current research is not literally blind to all non-CLI mechanics. Its
closed lane vocabulary contains `host-api`, `in-process-api`,
`selected-command`, and produced-artifact `runtime-api`. It also records
esbuild's package-owned shared native child, and it conditionally permits a
native/FFI lane when an upstream publishes a supported embeddable ABI.

The unresolved question is narrower and more important: alternate mechanisms
such as an official non-JavaScript library, owned native binding, runtime-hosted
sidecar, persistent machine protocol, worker/WebAssembly engine, or inverted
plugin boundary are mostly treated as implementation facts, non-operations,
provisional future cases, or policy exclusions. They have not all been compared
as first-class interface strategies. Test that closure without assuming every
transport deserves a public lane.

## Governing boundaries

- Do not edit production packages, public declarations, package manifests,
  `AGENTS.md`, Plans 039-044, release automation, tags, or published state.
- Scratch probes and new research-only evidence may be added only when they are
  bounded, reproducible, and cannot mutate external state.
- Do not add a generic build algebra, provider registry, automatic fallback,
  retry, tool installation, cache/CAS, scheduler, or remote-build product.
- Preserve package manager, orchestrator runtime, provider/tool runtime,
  selected tool identity, artifact runtime, and artifact target as independent
  axes.
- Lack of a current adopter may affect product priority. It is not evidence
  that an architecture is semantically invalid.
- A mechanism is not valuable merely because it is different. It must preserve
  a capability, remove a duplicated workflow or invalid state, improve an
  explicit non-functional property, or reveal that the current boundary is
  already optimal.

## Required conceptual correction

Do not use `Api` and `Command` as the top-level research axes. Separate at least
these dimensions:

| Dimension | Examples |
|---|---|
| Caller surface | function, scoped handle, stream, callback/plugin, config/manifest, command |
| Execution location | same isolate, worker, native addon, embedded library, local child, persistent sidecar, remote worker |
| Transport | direct call, N-API/FFI/C ABI, WebAssembly calls, framed stdio, pipe/socket RPC, HTTP, filesystem/artifact handoff |
| Selection authority | ambient host runtime, package-resolved engine, explicit binary/library, content-bound image/service |
| State and lifetime | one-shot value, borrowed output, scoped context, process/session, durable direct write, atomic publication |

A TypeScript API can proxy to a native child or WebAssembly worker. A process
can expose a structured machine protocol instead of CLI argv and terminal
prose. A JSON wrapper around a CLI is still a CLI-derived semantic boundary.
Classify these facts independently.

## Verifiable completion criteria

The work is complete only when it:

1. Separates published `v0.3.0`, current local/unreleased work, the live PR,
   historical experiments, proposals, and upstream state.
2. Reconstructs the relevant provider operations before selecting interface
   mechanisms.
3. Traces every current TypeScript-facing operation through the package to the
   actual engine, process, worker, protocol, or filesystem boundary.
4. Investigates every plausible mechanism family below for every relevant
   provider operation, recording evidence or a bounded negative result.
5. Compares at least four materially different control/execution/lifetime
   architectures, not four names around the same call path.
6. Runs fail-closed probes for the promising mechanisms that are locally
   testable without a large implementation program.
7. Produces an operation-level recommendation. A mixed portfolio is valid and
   should be preferred over a forced universal winner when the evidence differs.
8. Separates semantic validity, public compatibility cost, implementation and
   certification status, product priority, and observed ergonomics.

## Ground-truth procedure

Resolve and record before analysis:

- repository path, branch, exact SHA, status, worktrees, and relevant ancestry;
- released `v0.3.0` source, tarball exports/declarations, and exact source SHA;
- live PR head and checks, without accepting PR-body receipts for another SHA;
- current surface-freeze artifacts and canonical operation crosswalk;
- exact official Effect, Bun, Deno, esbuild, Node, and Rolldown versions under
  study;
- historical private probes separately from current or published behavior.

Use upstream documentation and source at exact tags or commits. For package
APIs, inspect their shipped implementation and installation graph, not only
declarations. Every current fact must cite an exact URL or repository
file/symbol/line coordinate plus version or commit.

Start with, but do not subordinate conclusions to:

- `research/post-0.3/corpus/DECISION-RECORD.md`;
- `research/post-0.3/corpus/RECONCILIATION.md`;
- `research/post-0.3/reconciliation/r1/PRIMARY-METHOD.md`;
- `research/post-0.3/reconciliation/r1/CANONICAL-OPERATIONS.csv`;
- `research/post-0.3/reconciliation/r1/NON-OPERATION-REGISTER.csv`;
- the five `research/post-0.3/reconciliation/r2/*/REPORT.md` dossiers;
- `research/post-0.3/freeze/PRODUCT-DECISIONS.md`; and
- the provider-native breadth corpus and its source bibliographies.

Classify evidence as one of:

- documented public stable;
- documented public experimental or unstable;
- public but host- or platform-restricted;
- supported third-party surface;
- source-visible internal or undocumented surface with no compatibility promise;
- effect-build-owned prototype;
- hypothetical and unproven.

Phrase negative findings as `no supported surface found at <version/commit>
after <bounded search>`, not as timeless nonexistence.

## Operation inventory

Derive the final list from the canonical crosswalk and upstream sources. At
minimum cover:

- **Bun**: transpile/scan, bundle/build in memory and to disk, plugins and
  virtual inputs, multi-entry HTML/CSS/assets, executable compilation, and
  watch or other reusable state actually exposed by the pinned version.
- **Deno**: bundle in memory/stdout/to disk, declarations/checking, config,
  import-map/lock/permission authority, compile/runtime acquisition, targets,
  and watch or incremental behavior actually exposed by the pinned version.
- **esbuild**: build, transform, format/analyze, plugins and virtual inputs,
  direct writes, context/rebuild/watch/serve/cancel/dispose, the Go API, the
  JavaScript package's native-service protocol, and browser WebAssembly.
- **Node SEA**: direct generation, legacy blob/injection flow, main and asset
  ingestion, code cache/snapshot/arguments, base/builder relations, signing or
  candidate repair, runtime `node:sea`, and relevant Node embedder/snapshot
  APIs without assuming they are SEA equivalents.
- **Rolldown**, only if still a live provider candidate: JavaScript binding,
  native Rust library/binding architecture, CLI, persistent build/dev/watch
  handles, plugins, and ownership of native external memory.

Do not widen into unrelated tools merely to inflate the candidate count. A
comparative tool may be admitted only when it exposes an interface mechanism
that materially tests an effect-build assumption.

## Interface mechanisms to investigate

For each provider and operation, investigate rather than presume the fitness of:

1. **Direct host API**: official JavaScript/TypeScript surface in its native or
   supported orchestrator runtime.
2. **Selected command**: one-shot or scoped CLI process with native project,
   config, environment, permission, target, and terminal-stream semantics.
3. **Other official language/library API**: for example a Go or Rust library
   that exposes semantics unavailable or differently owned in JavaScript.
4. **Native bridge**: supported C ABI, C++, N-API, FFI, or a small owned binding
   over a supported upstream library.
5. **Embedded engine**: link or vendor an upstream compiler/runtime core and
   drive it directly, distinguishing supported embedding from source-internal
   coupling or a maintained fork.
6. **Runtime-hosted sidecar**: run a provider-native API in Bun, Deno, Node, Go,
   or Rust and expose a deliberate framed pipe/socket protocol to the Effect
   application.
7. **Persistent service or daemon**: reuse a provider engine or session across
   builds with explicit handshake, crash, stale-handle, shutdown, and
   backpressure semantics.
8. **WebAssembly/WASI or worker boundary**: run a supported engine in an
   isolated worker or WebAssembly host and measure capability and filesystem
   loss rather than assuming portability is free.
9. **Inverted plugin/loader/hook integration**: let the provider own execution
   and call effect-build-controlled callbacks or modules; identify reentrancy,
   code-mobility, trust, and lifetime consequences.
10. **Declarative or artifact protocol**: configuration, manifest, project,
    intermediate artifact, or documented binary-format handoff that is a
    stable semantic boundary rather than merely argv stored in a file.
11. **Local or remote isolated worker**: compare only where host/runtime or
    fault isolation is material. Do not turn this study into remote execution
    infrastructure.
12. **Upstream contribution**: a missing library, protocol, cancellation hook,
    or machine-readable event surface that could be added upstream. Separate
    plausible upstream work from an interface effect-build can support now.

Not every row should survive. Explicitly identify mechanisms that merely move
the same CLI semantics behind RPC, depend on unsupported internals, require a
permanent fork, or lose callbacks, plugins, rich results, project authority,
permissions, selected identity, or target semantics.

## Required mechanism record

Produce one record per provider x operation x plausible mechanism:

| Field | Required content |
|---|---|
| Mechanism | Caller surface, execution location, transport, and control direction |
| Availability | Evidence class, exact version/commit, license, support promise |
| Authority | Who selects/version-binds the runtime, engine, config, environment, permissions, and targets |
| Inputs/results | Native fields retained; callbacks/handles/bytes that cannot cross the boundary faithfully |
| Lifetime | One-shot/session/context ownership, cancellation, interruption, crash, cleanup, and outcome-unknown states |
| Outputs | Borrowed versus durable/direct outputs, mutation, atomicity, remnants, and publication owner |
| Host/distribution | Orchestrator support, native toolchain, binaries, cross-platform packaging, offline behavior |
| Compatibility | ABI/protocol/schema/version skew and capability handshake |
| Operations fit | Exact operations helped and operations that do not fit |
| Complexity ledger | Concepts, adapters, workflows, fallbacks, invalid states, and maintenance burden added/removed |
| Effect mapping | Existing Scope, Stream, FileSystem, Path, ChildProcess, Layer, and Cause semantics reused |
| Verdict | viable now, viable with bounded adapter, upstream-dependent, research-only, or reject, with confidence |

## Required source investigations

At minimum answer these concrete questions:

- esbuild documents CLI, JavaScript, and Go APIs and also ships a versioned
  persistent native-service child plus browser WebAssembly. Which of these are
  supported semantic surfaces, which are implementation details, and what would
  a Go bridge or owned sidecar change relative to the current package API?
- Deno publishes `deno_core`/`deno_runtime` Rust crates with explicit stability
  constraints. Do they expose the bundle/compile operations effect-build needs,
  or only a different embedded-runtime product? Which Deno CLI crates or
  internals would require lockstep source coupling?
- Node exposes a C++ embedder API and snapshot machinery while SEA exposes
  command/config/runtime surfaces. Are any embedder or direct artifact paths a
  truthful SEA assembly alternative, or are they distinct products with higher
  ABI and distribution cost?
- Bun exposes rich host APIs and source-visible internal compiler components.
  Is there a supported embeddable library or protocol at the pinned version?
  If not, quantify the cost of a fork, FFI shim, runtime-hosted sidecar, or
  upstream proposal instead of inferring equivalence.
- For every TypeScript-facing API, where does work actually run? Record same
  isolate, native thread, worker, hidden child, shared global service, or remote
  execution and who owns it.

## Adversarial probes

For each plausible and locally testable non-baseline mechanism, use the smallest
probe that distinguishes it from the direct host API and CLI. Cover applicable
cases from:

- successful one-shot operation and structured failure identity;
- plugin callback, virtual input, and non-serializable state;
- project/config/import-map/environment/permission behavior;
- multi-entry JavaScript/CSS/assets/source maps and large binary transfer;
- version/capability handshake and intentional skew;
- interruption before, during, and after provider mutation;
- child/service/worker crash, descendant survival, and restart policy;
- context rebuild/watch/serve, concurrency, backpressure, and stale handles;
- cleanup after success, typed failure, defect, interruption, and orchestrator
  termination;
- output remnants and pre-existing destination behavior;
- selected runtime/builder/base/target mismatch for executable assembly;
- cold start, warm reuse, memory, serialization copies, and idle resources.

Prototype at least one disposable provider-host sidecar for a serializable Bun
or Deno operation if locally feasible. Compare it with a callback/plugin case
that may not cross the same boundary faithfully. Also exercise one supported
non-TypeScript surface, such as esbuild's Go API or browser WebAssembly API, if
the required toolchain is already available. Do not install a large native
toolchain or vendor an engine merely to satisfy a probe count; record that as a
costed gate.

Receipts must fail closed. Assert the expected conclusion set. Distinguish a
legitimate semantic falsification from missing tools, network failure, timeout,
or a probe that never exercised the intended path.

## Architectures to compare

Compare at least these genuinely different models, dropping one only with an
evidence-backed infeasibility result:

A. **Current operation-specific hybrid**: direct host APIs and selected commands
   with scoped provider handles where upstream exposes them.
B. **Provider-host sidecars**: native provider APIs behind an effect-build-owned
   local protocol.
C. **Persistent provider sessions**: version-negotiated daemon or engine
   sessions with opaque lifetime-bound handles.
D. **Embedded/native engines**: supported library APIs connected by direct
   language integration, native binding, FFI, or WebAssembly.
E. **Inverted/declarative integration**: provider plugins/hooks or stable
   manifests/artifacts own the boundary.
F. **Operation-specific portfolio**: choose independently among these mechanisms
   per operation; portable roles exist only over proven semantic domains.

For every candidate provide:

- a concrete user call and end-to-end execution trace;
- control, state, process, output, mutation, and cleanup owners;
- canonical request/result and any serialization boundary;
- preserved and lost provider semantics;
- provider/operation coverage and explicit non-fit;
- failure, interruption, crash, and outcome-unknown behavior;
- version/capability negotiation and support policy;
- public compatibility promise versus package-private mechanism;
- semantic, structural, operational, distribution, and source-maintenance cost;
- invalid states and duplicated workflows added or removed;
- a falsification condition.

Reject candidates that only add `Manager`, `Backend`, `Transport`, `Service`, a
tagged registry, or a protocol wrapper without changing authority, semantics,
lifetime, isolation, or state-space size.

## Decision matrix

Evaluate provider x operation x candidate against:

- native semantic and diagnostic fidelity;
- selected tool/runtime identity;
- orchestrator-host independence;
- plugins, callbacks, virtual inputs, and opaque handles;
- project/config/environment/permission fidelity;
- interruption, cancellation, cleanup, and fault isolation;
- incremental/session state and backpressure;
- borrowed, durable, direct-write, mutation, and publication semantics;
- ABI/protocol/schema stability and upstream coupling;
- startup, warm throughput, memory, serialization, and copy cost;
- platform, native toolchain, packaging, offline, and security burden;
- testability, observability, and failure reproduction;
- reuse of official Effect capabilities;
- semantic, structural, operational, and maintenance complexity.

Use scores only after evidence-backed prose. Publish weights and sensitivity if
an aggregate score is used. Do not average away a semantic incompatibility or a
required unsupported platform.

## Required deliverables

1. Direct answer: where, if anywhere, is CLI versus existing host API an
   unjustified binary?
2. Ground-truth state map with exact SHAs, versions, and evidence classes.
3. Multi-axis trace of every current TypeScript-facing operation to its actual
   execution mechanism.
4. Provider/operation/mechanism evidence table and bounded negative findings.
5. Probe source, commands, receipts, asserted conclusions, and limitations.
6. Candidate comparison and semantic/structural/operational complexity ledger.
7. Operation-level decision matrix and recommended boundary portfolio.
8. Compact public and package-private API sketches for the top two portfolios.
9. Exact disposition for the current 0.4 freeze: unchanged, reclassified,
   expanded research gate, or superseded proposal. Do not implement it.
10. Upstream proposals, remaining unknowns, stop conditions, and the evidence
    that would change each decision.

## Mandatory falsifiers and failure guards

- A sidecar started by a command is not automatically a CLI semantic boundary;
  inspect the protocol and authority. Wrapping CLI argv in JSON is not a new
  mechanism.
- Do not call a TypeScript API `in-process` until the actual engine/process/
  worker topology is traced.
- Do not expose an undocumented internal protocol as a supported public
  contract merely because one probe succeeds.
- Do not assume JSON can preserve callbacks, closures, plugin objects, opaque
  handles, binary ownership, or incremental context identity.
- Do not invent provider cancellation when Effect interruption only stops the
  awaiting fiber.
- Do not claim transactionality for provider-direct multi-output writes.
- Do not derive typed machine events from terminal prose.
- Do not infer architectural invalidity from the absence of current adopters.
- Do not infer runtime behavior from declarations or source shape alone when a
  bounded executable probe is feasible.
- Do not treat FFI, embedding, WebAssembly, a daemon, or RPC as inherently
  superior. Count build/distribution/security/versioning costs and new invalid
  states.
- Do not recommend Plan 039 or production implementation until mechanism
  evidence actually changes a boundary decision and the maintainer authorizes
  the resulting public commitment.
