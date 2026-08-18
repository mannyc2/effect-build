# Watch and observability

**Status:** reconstructed documentation; not recovered verbatim source.  
**Purpose:** Keep raw provider-native watch lifecycle separate from a falsified typed cross-provider event protocol, and recover an Effect-native observability design.  
**Observed remote head:** `96e53a27be4ef96fb47f1a745480e0c5382640f2`  
**Last substantive research head:** `49cd5e1be7917bf14e89068afb4fa47cf78488fb`  
**Last fully reproduced receipt boundary:** `9b0d2f59567a7684b62df932c67b7a96050b605f`

This document does not assert that the described API is implemented, remotely certified at the current head, or ready to merge.


## Two different watch contracts

### A. Provider-native command watch — valid permanent feature

A provider `Command` module may expose watch by starting exactly one selected provider command through Effect's scoped process service. Its stable contract is:

```text
scoped child process
raw stdout stream
raw stderr stream
exit status
interruption/termination/force-kill/reaping
selected tool identity and provider diagnostics
```

The later pushed watch prototype used an event protocol marker of `raw-stdio-and-exit-only`. Later expected-conclusion prose says Bun and Deno watch preserved process stdio, signals, exit, and force-kill without portable events.

> **Provenance:** `REPOSITORY-DOCUMENTED` · observation · confidence **high** · https://github.com/mannyc2/effect-build/blob/49cd5e1be7917bf14e89068afb4fa47cf78488fb/research/post-0.3/watch-contracts.ts#L5-L33


The claim was added after the last fully reproduced receipt boundary and was not included in a successful final structured receipt at `49cd5e1…`. Treat the interface and local probes as strong repository evidence, not exact-head remote certification.

> **Provenance:** `UNVERIFIED-CLAIM` · observation · confidence **medium** · https://github.com/mannyc2/effect-build/blob/49cd5e1be7917bf14e89068afb4fa47cf78488fb/research/post-0.3/expected-watch-conclusions.json#L1-L11


### B. Typed cross-provider readiness/rebuild protocol — falsified

The exercised Bun and Deno commands rebuilt, but their terminal text did not expose a stable machine-readable protocol. Parsing colored/human terminal output into `Ready`, `Rebuilt`, or structured diagnostics would create a brittle application protocol whose compatibility surface is not owned by upstream.

> **Provenance:** `FALSIFIED` · observation · confidence **high** · portable-command-watch-events claim in preserved existing-provider-research receipts


The two conclusions are compatible: permanent native raw-process watch can exist while a portable typed event stream does not.

## Recommended watch API boundary

Provider-native watch should return or expose the official Effect child process/stream capabilities rather than a custom duplicate handle. A provider may add request validation and selected-tool compatibility, but should not rename raw terminal lines into semantic events.

Readiness options, in descending authority:

1. upstream machine-readable protocol documented by the provider;
2. provider API callback/event contract with versioned declarations;
3. explicit caller-supplied readiness predicate over application output, clearly caller-owned;
4. no readiness concept—only process start, raw streams, and exit.

Telemetry events do not satisfy application readiness because exporters may sample, buffer, redact, reorder, or be disabled.

## Effect-native observability

### Root spans

Use one stable root span per public provider operation:

```text
effect-build.<provider>.<lane>.<operation>
```

Suggested author child spans:

```text
effect-build.tool.select
effect-build.tool.probe
effect-build.borrowed-output.acquire
effect-build.borrowed-output.observe
effect-build.executable.inspect
effect-build.executable.publish
```

### Bounded attributes

```text
effect_build.provider
effect_build.lane
effect_build.operation
effect_build.artifact.kind
effect_build.runtime.name
effect_build.runtime.version
effect_build.tool.name
effect_build.tool.version
effect_build.tool.compatibility
effect_build.target.system
effect_build.output.count
effect_build.output.bytes
effect_build.interruption.contract
effect_build.profile.protocol
```

Unknown values are omitted. Counts/bytes are numeric; categorical values are bounded.

> **Provenance:** `REPOSITORY-DOCUMENTED` · observation · confidence **high** · https://github.com/mannyc2/effect-build/blob/49cd5e1be7917bf14e89068afb4fa47cf78488fb/plans/POST-0.3-NATIVE-CAPABILITY-ARCHITECTURE.md#L874-L932


### Diagnostics and warnings

Provider diagnostics should remain typed/native result data where the provider exposes them. Logs/spans may carry safe summaries and counts, not full source snippets, absolute paths, argv, environment, URLs, asset keys, plugin configuration, credentials, or full diagnostics by default.

Compatibility override warnings should be structured application-visible warnings/observations and may also be logged. They must not disappear merely because no exporter is installed.

### Composition correlation

A recipe should run producer and assembler under a common parent span. Ordered `BuildStepObservation` values preserve durable composition trace. The canonical content identity correlates the producer output with the assembler input without exposing source content.

### OpenTelemetry connection

Effect-native spans are sufficient at library boundaries. Applications install an `@effect/opentelemetry` tracer/exporter Layer to bridge those spans to OpenTelemetry. The library should not require or configure a collector/exporter.

> **Provenance:** `OFFICIAL-UPSTREAM-CONTRACT` · observation · confidence **high** · Effect OpenTelemetry Tracer and Effect span documentation in evidence/UPSTREAM-SOURCES.md


## Source maps and source locations

Preserve provider source maps, diagnostics, source positions, graph/metafile data, and generated-to-source relationships on provider-native values. Portable profiles should retain only the subset needed for their law, such as browser source-map observations or Node import locations.

A new `SourceLocator` abstraction is justified only if it adds a real invariant, for example:

- one redaction-aware, provider-independent coordinate that can refer to an authenticated source/output identity;
- stable mapping through multiple composed build steps;
- explicit absence/unknown semantics;
- no claim that an ambient path still exists.

If it merely wraps `Path`, a URL string, or provider source-map coordinates, it duplicates Effect/platform/provider services and should not be public.

> **Provenance:** `PRESCRIPTIVE-RECOMMENDATION` · recommendation · confidence **medium** · Effect service audit plus source-trace requirements


## Observability laws

1. Instrumentation cannot change values, typed failures, defects, interruption, or Cause topology.
2. Watch progress remains raw process/application data; telemetry is secondary observation.
3. Redaction is default-deny for high-cardinality or sensitive fields.
4. Durable build steps preserve exact tool compatibility state, not just a log message.
5. Exporter absence never changes operation behavior.
6. Sampling never becomes a correctness dependency.
