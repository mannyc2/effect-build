# Observability and provenance model

**[UPSTREAM-DIRECT]** This model targets Effect `effect@4.0.0-rc.110` and `@effect/opentelemetry` at the same version.

**[INFERENCE]** effect-build should be observable without making telemetry part of the typed application protocol. The operation result/cause and artifact observations remain authoritative; spans, logs, and metrics are operator projections.

## Signal architecture

**[PROPOSAL]** The following diagram defines the recommended one-way projection model.

```text
typed Effect result / Cause
          |
          +---- provider-native observations (diagnostics, graphs, events)
          |
          +---- common artifact observations (path/kind/bytes/digest/runtime/target)
          |
          +---- durable provenance receipt (optional but correctness-oriented)
          |
          `---- operator telemetry projection
                 spans + logs + metrics + optional OpenTelemetry export
```

**[PROPOSAL]** The arrows are one-way. Losing telemetry must not change application behavior, artifact ownership, or provenance completeness.

## Effect-native integration

| Class | Signal | Exact Effect facilities | Recommended use |
|---|---|---|---|
| UPSTREAM-DIRECT | spans | `Effect.withSpan`, `Effect.withSpanScoped`, `Effect.annotateSpans`, `Tracer.Span` attributes/events/links/status | one span per semantically bounded operation or long-lived session |
| UPSTREAM-DIRECT | logs | `Effect.log*`, `Effect.annotateLogs`, `Effect.annotateLogsScoped`, `Logger.layer` | diagnostics, compatibility warnings, cleanup warnings, bounded provider output |
| UPSTREAM-DIRECT | metrics | `Metric.*`, `Metric.update`, `Effect.track*`, `Effect.trackDuration` | aggregate throughput, latency, bytes, outcomes, retries, cleanup failures |
| UPSTREAM-DIRECT | OpenTelemetry tracing | `OtelTracer.layer`, `layerGlobal`, `NodeSdk.layer` with span processors | optional export of Effect spans |
| UPSTREAM-DIRECT | OpenTelemetry logs | `OtelLogger.layer`, `NodeSdk.layer` with log processors | optional export of Effect logs and annotations |
| UPSTREAM-DIRECT | OpenTelemetry metrics | `OtelMetrics.layer`, `NodeSdk.layer` with metric readers | optional export of Effect metrics |
| UPSTREAM-DIRECT | resource identity | `Resource` / `NodeSdk.Configuration.resource` | application service name/version and bounded deployment attributes |

**[INFERENCE]** Core effect-build packages should emit Effect-native signals and avoid depending directly on a particular exporter. Applications decide whether and where to export.

## Span model

### Operation span names

**[PROPOSAL]** Use stable names with bounded cardinality:

| Class | Span name | Boundary |
|---|---|---|
| PROPOSAL | `effect-build.tool.select` | one Layer/tool selection and compatibility evaluation |
| PROPOSAL | `effect-build.host.build` | one in-process provider call |
| PROPOSAL | `effect-build.command.run` | one selected command execution |
| PROPOSAL | `effect-build.context.acquire` | one scoped provider-context acquisition |
| PROPOSAL | `effect-build.context.rebuild` | one rebuild call |
| PROPOSAL | `effect-build.watch.session` | one long-lived provider/process watch session |
| PROPOSAL | `effect-build.borrowed.produce` | one borrowed root production and caller-use lifetime |
| PROPOSAL | `effect-build.artifact.observe` | one coherent file/tree observation |
| PROPOSAL | `effect-build.artifact.publish` | one durable candidate validation/commit |
| PROPOSAL | `effect-build.matrix` | one matrix coordination |
| PROPOSAL | `effect-build.matrix.cell` | one cell operation |
| PROPOSAL | `effect-build.mutation` | one future sign/notarize/patch transformation |

### Span attributes

**[PROPOSAL]** Recommended low-cardinality attributes:

```text
effect_build.operation
effect_build.provider.package
effect_build.provider.version
effect_build.lane                  api | command | profile | recipe
effect_build.profile.protocol
effect_build.tool.name
effect_build.tool.version
effect_build.tool.compatibility    tested | untested-override
effect_build.runtime
effect_build.system.os
effect_build.system.architecture
effect_build.output.count
effect_build.output.bytes
effect_build.commit.kind           none | same-parent-rename | provider-direct
effect_build.cleanup.outcome       removed | already-missing | incomplete
effect_build.matrix.cell_count
effect_build.watch.kind            structured-provider | raw-command
```

**[PROPOSAL]** Omit absent attributes rather than use arbitrary placeholder strings.

**[PROPOSAL]** Do not use complete paths, entrypoint URLs, package specifiers, matrix cell IDs from user input, digests, or error messages as metric labels. A span may include a digest only under an explicit privacy/cardinality policy because a digest is high cardinality and can become a correlation identifier.

### Span events

**[PROPOSAL]** Bounded events:

| Class | Event | Required bounded attributes |
|---|---|---|
| PROPOSAL | `tool.selected` | tool name/version/compatibility |
| PROPOSAL | `tool.override` | tested range and observed version; no executable path by default |
| PROPOSAL | `process.spawned` | provider lane; PID only if policy permits |
| PROPOSAL | `process.cancellation_requested` | requested signal and force-kill timeout |
| PROPOSAL | `process.exit_observed` | numeric exit code or signal-termination error class |
| PROPOSAL | `artifact.observed` | kind/count/bytes; digest omitted by default |
| PROPOSAL | `artifact.commit_completed` | commit kind and output count |
| PROPOSAL | `borrowed.expired` | operation class only |
| PROPOSAL | `borrowed.changed` | mismatch class, not full paths/content |
| PROPOSAL | `cleanup.incomplete` | platform error category/method and retry count |
| PROPOSAL | `provider.graph_available` | schema/format/bytes/digest-policy flag |
| PROPOSAL | `watch.unknown_line` | stream and line length, not raw line by default |

**[INFERENCE]** Span events remain telemetry; they may mirror but never replace typed state transitions.

## Logging model

### Structured log events

**[PROPOSAL]** Prefer structured message objects over preformatted strings.

**[PROPOSAL] PROPOSAL — illustrative; need not compile.**

```ts
yield* Effect.logWarning({
  event: "effect-build.tool.untested-override",
  tool: observation.name,
  observedVersion: observation.version,
  testedRange: [tested.min, tested.max]
})

yield* Effect.logError({
  event: "effect-build.cleanup.incomplete",
  rootId: redactedRootId,
  error: boundedPlatformError
})
```

### Severity guidance

| Class | Level | Use |
|---|---|---|
| PROPOSAL | `Trace` | bounded state-machine transitions useful only during deep diagnosis |
| PROPOSAL | `Debug` | selected lane/options summaries after redaction |
| PROPOSAL | `Info` | major operation completion when applications opt in |
| PROPOSAL | `Warn` | untested compatibility override, parser unknown grammar threshold, incomplete cleanup after preserved caller failure |
| PROPOSAL | `Error` | operation failure, unexpected watch exit, post-commit verification failure |
| PROPOSAL | `Fatal` | not normally emitted by a library; reserve for application runtime policy |

### Provider stdout/stderr

**[PROPOSAL]** Raw provider output should remain a `Stream` first. Logging it requires:
- **[PROPOSAL]** opt-in;
- **[PROPOSAL]** source (`stdout`/`stderr`);
- **[PROPOSAL]** maximum line/chunk length;
- **[PROPOSAL]** total byte budget;
- **[PROPOSAL]** ANSI/control-character policy;
- **[PROPOSAL]** credential/path/source redaction;
- **[PROPOSAL]** truncation marker.

**[INFERENCE]** Logging every provider line by default can duplicate large output, leak source paths or credentials, and overload an OTel backend.

## Metrics model

### Instruments

| Class | Metric | Instrument idea | Unit | Cardinality-safe attributes |
|---|---|---|---|---|
| PROPOSAL | `effect_build_operations_total` | counter | operations | operation, provider package, lane, outcome |
| PROPOSAL | `effect_build_operation_duration` | histogram | seconds | operation, provider package, lane, outcome |
| PROPOSAL | `effect_build_output_bytes` | histogram | bytes | operation, provider package, artifact kind |
| PROPOSAL | `effect_build_outputs_total` | counter | files/artifacts | operation, provider package, artifact kind |
| PROPOSAL | `effect_build_tool_selection_total` | counter | selections | tool name, compatibility |
| PROPOSAL | `effect_build_tool_probe_failures_total` | counter | failures | tool name, failure class |
| PROPOSAL | `effect_build_process_termination_total` | counter | processes | provider package, outcome class |
| PROPOSAL | `effect_build_cleanup_total` | counter | cleanups | borrowed/durable-staging, outcome |
| PROPOSAL | `effect_build_borrowed_expiry_total` | counter | operations | profile/operation |
| PROPOSAL | `effect_build_borrowed_mutation_total` | counter | changes | profile/operation, mismatch kind |
| PROPOSAL | `effect_build_watch_rebuild_total` | counter | rebuilds | provider package, structured/raw, outcome when known |
| PROPOSAL | `effect_build_watch_unknown_lines_total` | counter | lines | provider package, exact parser version family |
| PROPOSAL | `effect_build_matrix_cells_total` | counter | cells | operation, outcome |
| PROPOSAL | `effect_build_provenance_bytes` | histogram | bytes | schema version |

**[PROPOSAL]** Never label metrics with absolute paths, digest values, PIDs, arbitrary target names, entrypoint names, user project names, raw exception messages, or complete versions when the fleet could create excessive cardinality. Use bounded version families only if operationally required.

### Metrics and exact failure identity

**[INFERENCE]** Updating a failure counter must not catch/remap the application cause. Use Effect tracking/tap combinators that observe the outcome and preserve it.

**[PROPOSAL]** Cleanup metrics emitted after a failed/interrupted caller must be best-effort and must not replace the caller cause if exact identity is promised.

## Provider-native observations

**[PROPOSAL]** Keep provider observations as typed provider values or opaque versioned envelopes:

```ts
interface ProviderObservationEnvelope {
  readonly providerPackage: string
  readonly providerVersion: string
  readonly kind: "metafile" | "graph" | "diagnostics" | "structured-watch-event"
  readonly schema: string
  readonly payload: unknown
}
```

**[PROPOSAL]** If persisted, store a canonical byte representation, byte count, digest, media type, and redaction status. Do not claim provider payload schemas are stable across versions unless the provider does.

**[INFERENCE]** Common profiles may select a small subset of common facts but should retain access to the provider envelope so normalization is not information-destructive.

## Common artifact observations

**[PROPOSAL]** Common artifact observations should remain deterministic data values independent of telemetry:

| Class | Artifact | Required facts |
|---|---|---|
| PROPOSAL | borrowed file | path locator, kind=file, bytes, digest, lease-backed re-observation |
| PROPOSAL | borrowed tree | canonical root observation, sorted relative manifest, per-file bytes/digests, manifest digest, lease-backed re-observation |
| PROPOSAL | durable file | committed destination observation, bytes/digest, commit kind/time |
| PROPOSAL | executable | durable file facts plus native format, runtime, system target, executable-specific steps |
| PROPOSAL | source map | file observation plus generated-artifact relation |
| PROPOSAL | provider graph/metafile artifact | media/schema/provider/version plus bytes/digest |
| PROPOSAL | provenance receipt | schema, canonical encoding, bytes/digest/signature state |

**[INFERENCE]** Paths are useful locators, but digest and semantic observations are the durable identity facts. A path can be overwritten after return.

## Durable provenance model

### Canonical receipt

**[PROPOSAL]** The provenance receipt should have a versioned schema and canonical serialization. JSON is acceptable only with a documented canonicalization rule; ordinary JavaScript property insertion order is not an attestation format.

**[PROPOSAL]** Required top-level fields:
- **[PROPOSAL]** schema/protocol version;
- **[PROPOSAL]** operation/profile/provider identity;
- **[PROPOSAL]** exact selected tool/executable observation and compatibility state;
- **[PROPOSAL]** input identities/digests and reproducibility status;
- **[PROPOSAL]** configuration digest and allowlisted environment facts;
- **[PROPOSAL]** ordered transformation steps;
- **[PROPOSAL]** output observations/digests;
- **[PROPOSAL]** provider graph/source map references;
- **[PROPOSAL]** parent provenance digests for composition/mutation;
- **[PROPOSAL]** timestamps with clock/source policy;
- **[PROPOSAL]** optional signature/attestation envelope.

### Provenance completeness

**[PROPOSAL]** Include a completeness field:

```ts
type ProvenanceCompleteness =
  | { readonly _tag: "CompleteUnderDeclaredModel" }
  | {
      readonly _tag: "Incomplete"
      readonly reasons: ReadonlyArray<
        | "remote-input-without-integrity"
        | "plugin-undeclared-input"
        | "environment-read-not-captured"
        | "provider-direct-output-not-exhaustively-observed"
        | "other"
      >
    }
```

**[INFERENCE]** “Complete” can only mean complete under a declared input/environment model. It cannot prove that an opaque provider/plugin did not read undeclared state.

### Storage and reference

**[PROPOSAL]** A durable artifact may return:
- **[PROPOSAL]** inline provenance when small;
- **[PROPOSAL]** a provenance file observation;
- **[PROPOSAL]** a content-addressed external receipt reference;
- **[PROPOSAL]** both a summary and full receipt.

**[PROPOSAL]** The artifact observation must not rely solely on a trace ID to locate provenance. Trace retention and sampling are independent.

## Redaction and privacy

**[PROPOSAL]** Default-sensitive fields:
- **[PROPOSAL]** absolute paths and usernames;
- **[PROPOSAL]** URL query/fragment/userinfo;
- **[PROPOSAL]** environment and credentials;
- **[PROPOSAL]** source contents and snippets;
- **[PROPOSAL]** complete argv when arguments may contain secrets;
- **[PROPOSAL]** provider diagnostics containing code or paths;
- **[PROPOSAL]** package registry tokens or signer identifiers;
- **[PROPOSAL]** PIDs and host identifiers in multi-tenant telemetry.

**[PROPOSAL]** Redaction should occur before logger/exporter boundaries. Hashing is pseudonymization, not guaranteed anonymization; document keying and linkability.

## Failure and interruption observability

**[PROPOSAL]** Preserve the primary `Exit` and emit projections:
- **[PROPOSAL]** span status derives from that Exit;
- **[PROPOSAL]** logs contain bounded error class/cause presentation under policy;
- **[PROPOSAL]** metrics increment outcome class;
- **[PROPOSAL]** durable provenance records an outcome only if a receipt is intentionally committed;
- **[PROPOSAL]** cleanup failure after caller failure is a separate observation.

**[INFERENCE]** Instrumentation code that can fail in the primary channel risks changing semantics. Exporter/metric/log failures should generally be isolated unless the application explicitly chooses observability-as-required policy.

## OpenTelemetry is optional infrastructure

**[UPSTREAM-DIRECT]** `NodeSdk.layer` installs tracing, metrics, or logging only when processors/readers are configured; its tracer/logger shutdown paths force-flush/shutdown with timeout and ignore the result.

**[INFERENCE]** effect-build cannot promise telemetry delivery, and lack of an exporter cannot be a build error.

**[PROPOSAL]** Applications that require durable audit should enable provenance receipts and separately monitor telemetry-export health.
