# effect-build lifecycle and observability research

**[GITHUB-DIRECT]** Repository state was observed from `mannyc2/effect-build` draft PR 4 and branch `codex/post-0.3-native-capability-architecture` at `96e53a27be4ef96fb47f1a745480e0c5382640f2`; the configured base branch was `codex/granular-integration-program` at `15c811bb9904142a33d119766b62082f3c689f13`.

**[UPSTREAM-DIRECT]** Current Effect v4 analysis is pinned to official tag `effect@4.0.0-rc.110` at `66114151c2b4640bf773f2b3456ce70d679422f6` rather than to a moving branch.

**[RECORDED-EXECUTION]** This package was generated and archive-verified locally only. No effect-build code, Effect program, provider binary, workflow, test suite, or platform publication path was executed in this research session.

## Classification convention

**[PROPOSAL]** Every substantive claim in this package carries one of these labels, either inline or in a table's `Class` column. A code block inherits the classification stated immediately before it.

| Class | Meaning |
|---|---|
| GITHUB-DIRECT | Directly observed in the live effect-build repository, PR metadata, branch metadata, or checked-in research source. |
| UPSTREAM-DIRECT | Directly observed in pinned official Effect source/documentation or another official upstream standard/source. |
| RECORDED-EXECUTION | A result reported by checked-in repository evidence, or an archive-integrity operation actually run while producing this ZIP; it is not a new runtime validation of effect-build. |
| INFERENCE | A conclusion derived from direct evidence; assumptions and limits are stated. |
| PROPOSAL | A recommended contract, law, signature, or implementation direction; illustrative signatures need not compile. |
| UNKNOWN | A fact not established by the inspected evidence and requiring additional proof. |

## Executive determination

**[INFERENCE]** The ideal API is not one universal lifecycle abstraction. The honest public surface is a small sum of native shapes: plain `Effect` for one-shot work and durable results; `Effect<Handle, E, Scope.Scope>` for provider contexts and long-lived structured sessions; official `ChildProcess.Command` / `ChildProcessSpawner.ChildProcessHandle` plus `Stream`s for raw command processes; continuations with revocable observation authority for borrowed trees; and explicit per-cell outcomes for independently committing matrices.

**[INFERENCE]** Effect already supplies structured lifetime management, interruption propagation, service construction, scoped process handles, stream backpressure, logging, tracing, metrics, and optional OpenTelemetry export. effect-build should not duplicate these mechanics.

**[INFERENCE]** The integration-author primitives pay rent only when they add build-domain authority that Effect does not supply:

| Class | Primitive | Determination |
|---|---|---|
| INFERENCE | `Author/Tool` | Keep, but restrict it to exact executable selection, version/capability compatibility, canonical observation, and no-fallback policy; its command result should be official `ChildProcess.Command`. |
| INFERENCE | `Author/BorrowedOutput` | Keep; it adds revocable liveness, cleanup-root claims, containment, coherent observation, mutation detection, and typed expiry. |
| INFERENCE | `Author/Executable` | Keep only as a durable single-file publication/inspection state machine; do not let the name imply all executable production is portable. |
| INFERENCE | `HostPath.Observed` | Retain only as a point-in-time observation record, not as a branded string claiming continuing existence or authority. |
| INFERENCE | `SourceLocator` | Omit as a universal wrapper; add a tagged source-reference sum only when each variant carries distinct validation and identity semantics. |
| INFERENCE | public command wrapper | Reject when it merely delegates to `ChildProcess.make`, `ChildProcess.Command`, or `ChildProcessSpawner`. |
| INFERENCE | public compiler abstraction | Reject unless a future cross-provider law is demonstrated beyond provider-specific option translation and command rendering. |

## Direct answers

### 1. What does Effect Scope already guarantee?

**[UPSTREAM-DIRECT]** `Scope.Scope` is a lifetime boundary with sequential or parallel finalization; `Scope.addFinalizerExit` receives the `Exit` used to close the scope; `Scope.fork` links a child scope so the parent's closure closes it with the same `Exit`; and `Scope.use` closes a supplied closeable scope with the workflow's exact exit.

**[INFERENCE]** Scope guarantees registration and execution of finalizer effects, not linear ownership. It does not stop a returned path, object, callback, or handle from escaping; revoke escaped JavaScript values; prove path containment; prove physical deletion; make a file immutable; guarantee process-tree death; or make multi-file writes transactional.

### 2. What additional authority does a borrowed-output abstraction need?

**[INFERENCE]** It needs a producer-controlled lease whose operations recheck liveness, a uniquely claimed cleanup root, lexical and canonical containment checks, coherent file/tree observations, mutation checks, deterministic typed expiry, and a cleanup-result policy. A raw path may be exposed as data, but it must not itself be the authority that proves the output is still live and unchanged.

### 3. Does callback nesting enforce anything?

**[GITHUB-DIRECT]** The checked-in law fixture demonstrates that a raw path can escape an inner callback and remains merely a string after the outer callback returns.

**[INFERENCE]** A single outer continuation enforces the cleanup boundary. Additional callback nesting around the same escapable value makes ownership look stronger but adds no affine or linear invariant. Runtime authority improves only when operations are withheld behind a revocable closure or a producer-owned service, not by adding another lexical indentation level.

### 4. How should liveness, containment, byte count, digest, mutation, and expiry work?

**[PROPOSAL]** Every borrowed operation should first atomically observe an `open` lease state; closure should transition the lease to `closing` before cleanup and to `closed` after the cleanup attempt. New operations fail with typed expiry once closing begins.

**[PROPOSAL]** Containment should reject absolute and `..`-escaping relative names, resolve against the claimed root, canonicalize existing objects with `FileSystem.realPath`, and verify that the canonical result remains under the canonical root. Symlink traversal and replacement races must be treated as adversarial; a string-prefix check is insufficient.

**[PROPOSAL]** Byte count and digest should be computed from the same byte traversal. A digest must carry its algorithm, and mutation protection should compare at least object kind, byte count, and digest; timestamps and device/inode values may be useful accelerators but are not content proofs.

**[PROPOSAL]** After release, every closure-owned observation fails with a stable typed `BorrowedOutputExpired`. An observed raw path can still be used by arbitrary host code, so the public contract must say that such use is outside borrowed authority.

### 5. How should exact caller failure and interruption identity be preserved?

**[UPSTREAM-DIRECT]** Effect can preserve complete causes using `Exit`/`Cause` and `Effect.failCause`; `acquireUseRelease` restores interruption for the use phase and passes the use `Exit` to release.

**[PROPOSAL]** A borrowed-output continuation should not catch and reconstruct the callback's error or interruption. When the callback fails or is interrupted, cleanup failure must not replace or augment the caller's primary cause if exact identity is promised; report cleanup failure separately through a bounded cleanup observation, log, or metric. When the callback succeeds, cleanup failure may be the typed operation failure.

### 6. What command-watch contract is honest for human-oriented output?

**[UPSTREAM-DIRECT]** Effect's official process model already provides a scoped handle, `stdout`, `stderr`, combined `all`, `exitCode`, `isRunning`, `kill`, `stdin`, additional descriptors, and `unref`.

**[INFERENCE]** When a provider exposes only terminal text, the honest contract is the official child handle plus byte/text streams and exit information. It is not a portable stream of `ready`, `rebuild-started`, or `rebuild-complete` events. A text parser may be offered only as provider/version-pinned experimental interpretation with an `UnknownLine` case and no stronger lifecycle promise.

### 7. Which lifecycle types map to which Effect shapes?

| Class | Lifecycle | Recommended public shape |
|---|---|---|
| INFERENCE | one-shot in-process host API | plain `Effect<Result, E, R>` |
| INFERENCE | one-shot selected command with bounded result | plain `Effect<Result, E, R>` that internally scopes the official command |
| INFERENCE | caller-controlled selected command | `ChildProcess.Command` |
| INFERENCE | scoped provider context | `Effect<Handle, E, R | Scope.Scope>` |
| INFERENCE | rebuild operation | method returning plain `Effect` on the scoped handle |
| INFERENCE | provider-native structured watch | scoped handle, or `Stream<Event, E, R | Scope.Scope>` only when the provider exposes stable structured events |
| INFERENCE | human-output command watch | `ChildProcessSpawner.ChildProcessHandle` plus `stdout` / `stderr` / `all` streams |
| INFERENCE | borrowed file/tree | one continuation plus revocable closure-owned observation effects |
| INFERENCE | durable file/executable | plain `Effect<ArtifactObservation, E, R>` |
| INFERENCE | direct multi-output write | provider-native `Effect` with explicit partial-durable-outcome errors |
| INFERENCE | independently committing matrix | one coordinating `Effect` whose per-cell `Exit`s and committed artifacts remain inspectable |
| INFERENCE | future signing/mutation | plain input-to-new-output `Effect`; scoped session only for a genuinely long-lived signer resource |

### 8. What can be promised about Windows locks, cleanup, and multi-file publication?

**[UPSTREAM-DIRECT]** Windows rename/replacement is subject to access control and handle-sharing conditions; Node's signal behavior on Windows is forceful rather than POSIX-equivalent; Effect's Node process finalizer ignores termination errors after a best-effort group/process kill and wait.

**[INFERENCE]** Promise an attempted, observed cleanup—not guaranteed deletion. Promise at most one-file commit at a successful same-parent rename boundary—not crash durability unless flush semantics are separately established. Do not promise an atomic multi-file publication across platforms. Direct output trees and matrices must expose partial durable outcomes.

### 9. Why use `SourceLocator` instead of Effect FileSystem/Path?

**[UPSTREAM-DIRECT]** `FileSystem.FileSystem` already owns host filesystem effects, while `Path.Path` owns platform path-string operations.

**[INFERENCE]** A generic `SourceLocator` adds no authority if it is merely a branded string around a path, URL, package specifier, stdin label, or virtual module name. A source abstraction becomes useful only as a tagged sum whose variants have different validation, canonicalization, credential, reproducibility, and provenance rules.

## “Source traces” disambiguation

| Class | Meaning | Correct home |
|---|---|---|
| INFERENCE | operator telemetry and OpenTelemetry spans | spans, logs, metrics; transient and exporter-dependent |
| INFERENCE | provider build graphs or metafiles | provider-native observations, optionally stored as durable auxiliary artifacts |
| INFERENCE | source maps | emitted artifact(s) with their own digest and linkage to generated output |
| INFERENCE | durable source-to-artifact provenance | persistent hash-linked receipt independent of telemetry retention |

**[INFERENCE]** Telemetry must not be an application event protocol. Sampling can omit spans, export can be delayed, retried, partially accepted, duplicated, or lost, and Effect's OpenTelemetry bridge exports only through application-configured processors/readers. Build readiness and rebuild completion therefore require provider evidence, not the existence of a span or log line.

## Package map

| Class | File | Purpose |
|---|---|---|
| PROPOSAL | `live-github-state.json` | Reproducible live branch/PR/base/upstream pin and explicit head discrepancy. |
| PROPOSAL | `effect-platform-capability-map.md` | Exact Effect v4 capabilities and their non-guarantees. |
| PROPOSAL | `lifecycle-taxonomy.md` | Lifecycle-by-lifecycle public shape and commit/cancellation model. |
| PROPOSAL | `ownership-laws.md` | Borrowing, containment, mutation, expiry, cleanup, and cause-preservation laws. |
| PROPOSAL | `primitive-rent-audit.md` | Invariant audit of every proposed author primitive. |
| PROPOSAL | `proposed-api-shapes.md` | Illustrative, non-compiling API sketches. |
| PROPOSAL | `command-watch-contract.md` | Honest raw-process and provider-native watch contracts. |
| PROPOSAL | `source-trace-ontology.md` | Four-way disambiguation of “source traces.” |
| PROPOSAL | `observability-and-provenance-model.md` | Signal placement, cardinality, redaction, and durable provenance. |
| PROPOSAL | `evidence-ledger.json` | Claim/evidence ledger with classifications and pinned sources. |
| PROPOSAL | `source-bibliography.md` | Pinned source bibliography. |
| PROPOSAL | `falsifiers-and-open-questions.md` | Evidence that would overturn recommendations and unresolved facts. |
| RECORDED-EXECUTION | `manifest.sha256` | SHA-256 of every other package member; the manifest does not hash itself. |

## Scope limits

**[GITHUB-DIRECT]** The PR body reports prior executable experiments and workflow results on an earlier named research head. The live branch ref instead points to `96e53a27be4ef96fb47f1a745480e0c5382640f2`, and this package records the discrepancy rather than silently treating the body text as live state.

**[RECORDED-EXECUTION]** Reported repository experiments are classified `RECORDED-EXECUTION`; their checked-in test/source definitions are `GITHUB-DIRECT`. This session did not rerun them.

**[UNKNOWN]** Crash durability after rename, Windows lock-release timing, direct-provider partial-output behavior under every interruption point, hard-link/symlink race resistance, and signing authority remain unproven without targeted platform execution.
