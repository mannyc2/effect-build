# Lifecycle and observability decision

## Use Effect for temporal mechanics

Effect already owns Scope, finalizers, Effects, Causes, child processes, streams, filesystem/path services, Layers, logging, tracing, and metrics. effect-build should introduce a public primitive only when it prevents a build-domain state that those mechanisms do not prevent.

## Operation shapes

| Operation | Honest shape | Important qualification |
|---|---|---|
| One-shot in-process provider API | plain `Effect<Result, ProviderError, Requirements>` | Fiber interruption does not prove provider work stopped when upstream exposes no cancellation |
| Bounded selected command | plain `Effect<Result, ProviderError, Requirements>` using an internally scoped official command | No shell/provider/API fallback |
| Caller-controlled command/watch | official Effect command and scoped child handle | Preserve raw stdout/stderr, cancellation attempt, and observed direct-child exit |
| Long-lived provider context | scoped provider handle | Keep provider rebuild/watch/serve/cancel/dispose distinctions |
| Structured provider watch | scoped provider handle or Stream only when upstream defines machine events | No invented common readiness protocol |
| Borrowed file/tree | one continuation plus revocable closure-owned observation | Raw paths remain non-authoritative data |
| Durable single file | plain Effect returning an explicit commit outcome | Separate pre-commit failure from post-commit observation failure |
| Provider direct multi-output write | provider-native Effect with partial-outcome semantics | Not a transaction |
| Matrix | independently committing cell outcomes | Coordinator interruption/crash requires an explicit reporting or journal policy |
| Signing/mutation | immutable input to new output with lineage | Never mutate an already observed artifact in place |

## Primitive dispositions

### Selected tool authority

Keep the concept. It owns one canonical executable locator and point-in-time path/version/capability observations, provider/operation compatibility, and no hidden fallback or installation. It should construct official Effect commands and own no second command AST, process handle, kill API, or stream abstraction.

Do not promise immutable binary identity merely because a canonical path was captured; bytes at that path can later change. Stronger identity requires a digest/handle/execution-time re-observation policy.

Whether this becomes public `Author/Tool` is unresolved. Publicity should be justified by a real third-party adapter contract and at least two provider integrations using the same law—not by adopter count.

### Borrowed output authority

This has the strongest distinct rent:

- cleanup-root and destination-overlap authority;
- lexical and point-in-time canonical containment checks with typed escape detection;
- explicit `open -> closing -> closed` state;
- one selected in-flight acquisition policy;
- coherent file/tree observations;
- mutation detection and deterministic expiry;
- exact callback/Cause and cleanup precedence policy.

Scope alone does not make an escaped JavaScript string linear. Nested callbacks likewise add no authority. Any eventual consumer-facing value should distinguish copyable locator data from closure-owned authoritative operations.

The abstraction is not a filesystem sandbox. Symlink/reparse races, hard links, mixed-generation trees, provider background writes, lock release, and physical deletion remain host/provider proof obligations.

### Durable file and executable inspection

Split two concepts:

1. durable one-file staging/validation/commit;
2. executable-specific ELF/Mach-O/PE and runtime/system observation.

Executable production remains provider/profile-owned. Shared machinery may inspect and publish a candidate, but it must not imply one universal Bun/Deno/Node executable request.

The result algebra must expose the commit boundary. A rename may commit the destination before a later observation fails; an ordinary failure channel that hides the committed file is dishonest.

### Host path observation

If retained, model a point-in-time immutable record: original/resolved location, canonical path where observed, object kind, observation time, and optional host identity facts. It implies neither continuing existence nor authority.

Prefer domain-local `ToolObservation.location` and `ArtifactObservation.location` if one common `HostPath.Observed` record creates false equivalence.

### Source locator

Reject a universal branded locator string. Host paths, file/remote URLs, package specifiers, stdin, virtual modules, and plugin-owned modules have different resolution, credentials, identity, and provenance laws.

A tagged `SourceRef` may be reconsidered only when multiple real APIs consume the same variants without erasing their resolver authority. Until then, use Effect Path/FileSystem and provider-native request types.

### Command wrappers

Reject public `Author/Command` and `Author/CommandCompiler`.

Provider operations may validate requests, render provider argv, interpret native diagnostics, and compose selected official commands. That is provider policy, not a second process platform.

## Watch contract

For any Bun/Deno command-watch lane whose pinned interface exposes only human-oriented output, the stable law is:

```text
scoped official child handle
raw stdout and stderr streams
exit status
cancellation attempt
observed direct-child exit
selected provider/tool observations
```

Cancellation request, direct-child exit, stream closure, descendant death, output quiescence, and filesystem-lock release are separate milestones.

Do not infer `Ready` or `Rebuilt` from terminal text. An exact-version experimental parser is a provider interpretation only if it has `UnknownLine`, no silence-based readiness, and no grammar fallback.

## Four meanings of “source trace”

| Information | Authority | Correct home |
|---|---|---|
| Operator execution trace | lossy, sampled operational projection | Effect spans/logs/metrics and optional OpenTelemetry exporter |
| Provider build graph/metafile | provider-native build observation | native result or opaque versioned evidence |
| Source map | generated-to-source artifact | explicit output with digest/linkage |
| Durable source-to-artifact provenance | persistent claim/receipt | canonical hash-linked receipt independent of telemetry retention |

Eliminate the ambiguous singular name `sourceTrace`.

## Observability laws

- Instrumentation cannot change values, typed failures, defects, interruption, or Cause topology.
- Exporter absence, sampling, delay, duplication, or failure cannot change correctness.
- Compatibility override warnings are application-visible observations; logging is secondary.
- Raw stdout/stderr and source snippets are not logged by default.
- High-cardinality paths, argv, URLs, plugin configuration, environment values, and credentials are default-redacted.
- A composition may correlate telemetry through parent spans; durable build steps may correlate artifacts through content identity. Digests enter spans only under an explicit privacy/cardinality policy.

OpenTelemetry is a suitable optional export path for Effect-native instrumentation. It is not a source graph, source map, durable provenance record, readiness protocol, or rebuild event bus.

## Unresolved lifecycle laws

Before any author contract becomes a public compatibility promise, construct tests for:

- exact Effect Cause/cleanup precedence, including reporter failure;
- borrowed acquisition/close races and selected in-flight policy;
- provider quiescence and background-mutation behavior before borrowed output observation;
- coherent same-traversal byte/digest computation and a mandatory-versus-optional digest policy;
- traversal, symlink/junction, hard-link, replacement, and mixed-generation cases;
- host API work that continues after fiber interruption;
- child/descendant/worker/lock cleanup on Linux, macOS, and Windows;
- stdout/stderr flood and truncation;
- every single-file pre/post-commit interruption point;
- post-rename observation failure;
- direct multi-output remnants;
- matrix coordinator interruption and crash recovery;
- telemetry disabled, sampled, exporter-failed, duplicated, and shutdown-timeout cases.
- exact supported-Effect-version behavior for `effect/unstable/process`;
- canonical provenance serialization, signature, and privacy only if provenance becomes a shipped contract.
