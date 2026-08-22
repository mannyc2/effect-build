# Source-trace ontology

**[INFERENCE]** “Source traces” names four different information products. Treating them as one type would mix incompatible lifetime, retention, cardinality, and correctness requirements.

## Ontology

| Class | Term | What it represents | Typical producer | Lifetime | Correctness role |
|---|---|---|---|---|---|
| INFERENCE | operator telemetry / OpenTelemetry trace | execution of a build operation: timing, parent/child operations, status, bounded attributes, events | Effect `Tracer` and optional `@effect/opentelemetry` bridge | transient; sampled/exporter-dependent | operator diagnosis and performance, never sole application-state evidence |
| INFERENCE | provider build graph / metafile | provider-native graph of inputs, imports, chunks, assets, sizes, or dependency edges | Bun/Esbuild/Deno/Rolldown/provider API | operation/session result; may be persisted | provider-specific explanation and analysis |
| INFERENCE | source map | mapping from generated positions to original source positions/names/content references | compiler/bundler | artifact paired with generated output | debugging/tooling artifact with content/linkage semantics |
| INFERENCE | durable source-to-artifact provenance | persistent record linking exact input identities/digests, configuration/tool facts, transformations, and output digests | effect-build publication/provenance layer | durable and independently verifiable | reproducibility, audit, lineage, signing/attestation foundation |

## 1. Operator telemetry and OpenTelemetry spans

**[UPSTREAM-DIRECT]** Effect spans have a name, parent, attributes, links, events, sampling flag, kind, and completion status containing an `Exit`.

**[UPSTREAM-DIRECT]** Effect logs contain message, level, cause, fiber, and time; scoped log annotations can add contextual fields.

**[UPSTREAM-DIRECT]** Effect metrics aggregate counters, gauges, frequencies, histograms, summaries, and durations; OpenTelemetry readers may export cumulative or delta values.

**[UPSTREAM-DIRECT]** The OpenTelemetry bridge requires configured processors/readers/exporters, and sampling may reduce recorded/exported spans.

**[INFERENCE]** Telemetry describes *what operators observed about an execution*. It does not define the output graph, source map, or durable lineage.

### Belongs in spans

| Class | Data | Reason |
|---|---|---|
| PROPOSAL | operation name, provider package, lane, profile protocol | stable low-cardinality operation context |
| PROPOSAL | tested/override compatibility state | explains support posture |
| PROPOSAL | runtime name and system-target family | useful bounded build context |
| PROPOSAL | output count and total bytes | bounded result summary |
| PROPOSAL | completion status via Effect Exit | native tracing lifecycle |
| PROPOSAL | links to parent orchestration/matrix cell spans | causal operator navigation |
| PROPOSAL | events such as `tool.selected`, `commit.completed`, `cleanup.incomplete` | bounded milestones inside one operation |

### Does not belong in spans by default

| Class | Data | Reason |
|---|---|---|
| PROPOSAL | full argv/environment | secret and cardinality risk |
| PROPOSAL | absolute source/output paths | privacy/cardinality; use redacted or hashed identifiers only under policy |
| PROPOSAL | complete source lists/import graphs | unbounded provider-native data |
| PROPOSAL | source text/snippets | sensitive and unbounded |
| PROPOSAL | full provider diagnostics | logs or durable diagnostic artifact; span event payloads should be bounded |
| PROPOSAL | source map contents | separate artifact |
| PROPOSAL | durable provenance document | must not depend on sampling/export retention |

## 2. Provider build graphs and metafiles

**[INFERENCE]** Provider graphs are observations of provider semantics, not a common source trace. They can differ in node identity, virtual modules, plugin ownership, tree-shaking edges, chunk grouping, byte attribution, and URL/package resolution.

**[PROPOSAL]** Common surface:

```ts
interface ProviderBuildGraphObservation {
  readonly provider: string
  readonly providerVersion: string
  readonly schema: string
  readonly format: "json" | "binary" | "opaque"
  readonly bytes: bigint
  readonly digest: Digest
  readonly artifact?: FileObservation
}
```

**[PROPOSAL]** The common type should describe the envelope and provenance of the provider payload, not normalize every graph into a lossy universal node/edge schema.

**[PROPOSAL]** Provider packages may expose typed graph views under provider-native subpaths.

**[INFERENCE]** A graph/metafile can feed higher-level analysis, but it is not necessarily complete provenance: remote resolution, plugin-generated content, environment reads, nondeterministic transforms, and undeclared inputs may be missing.

## 3. Source maps

**[INFERENCE]** A source map is an output artifact with mapping semantics. It is not a tracing span and not automatically a build graph.

**[PROPOSAL]** Record:
- **[PROPOSAL]** source-map file observation/digest;
- **[PROPOSAL]** generated artifact digest it maps;
- **[PROPOSAL]** source map version/format;
- **[PROPOSAL]** whether `sourcesContent` is embedded;
- **[PROPOSAL]** whether paths/URLs were rewritten or redacted;
- **[PROPOSAL]** whether the map is external, inline, hidden, or absent.

**[PROPOSAL]** Source maps should be included in borrowed-tree manifests or durable output observations like any other file. The API may add a semantic relation to generated files.

**[UNKNOWN]** Cross-provider source-map fidelity and path normalization are not established by the inspected lifecycle research. A portable profile should promise only requested presence/form until adversarial mapping validation exists.

## 4. Durable source-to-artifact provenance

**[INFERENCE]** Durable provenance answers a different question: “Which exact inputs, policies, tools, and transformations produced this exact artifact?” It must survive process exit and telemetry loss.

**[PROPOSAL]** Minimum provenance record:

```ts
interface BuildProvenance {
  readonly schema: "effect-build/provenance@1"
  readonly operationId: string
  readonly profileProtocol?: string
  readonly providerPackage: {
    readonly name: string
    readonly version: string
  }
  readonly tool: ToolObservation<string>
  readonly inputs: ReadonlyArray<ProvenanceInput>
  readonly configurationDigest: Digest
  readonly environment: ReadonlyArray<BoundedEnvironmentFact>
  readonly steps: ReadonlyArray<BuildStepObservation>
  readonly outputs: ReadonlyArray<FileObservation>
  readonly providerObservations: ReadonlyArray<ProviderBuildGraphObservation>
  readonly sourceMaps: ReadonlyArray<SourceMapRelation>
  readonly startedAtUnixMillis: number
  readonly completedAtUnixMillis: number
  readonly parentProvenance?: ReadonlyArray<Digest>
  readonly signature?: ProvenanceSignature
}
```

**[PROPOSAL]** Input variants should distinguish:
- **[PROPOSAL]** observed host file/tree with digest;
- **[PROPOSAL]** remote URL with integrity/digest and fetch policy;
- **[PROPOSAL]** package specifier plus resolved package/lock facts;
- **[PROPOSAL]** virtual/plugin source with producer identity and content digest;
- **[PROPOSAL]** stdin content digest;
- **[PROPOSAL]** explicitly non-reproducible source where stable bytes were not captured.

**[PROPOSAL]** Environment facts should be an allowlisted schema, such as OS/architecture/runtime/tool version and declared feature flags. Do not persist arbitrary environment variables.

**[PROPOSAL]** Provenance should be content-addressed or separately digested. A signature signs the canonical provenance representation or a documented statement, not an in-memory object with unspecified serialization.

## Placement matrix

| Class | Information | Span | Log | Metric | Provider-native observation | Common artifact observation | Durable provenance |
|---|---|---:|---:|---:|---:|---:|---:|
| PROPOSAL | operation duration/status | primary | optional summary | aggregate | no | no | timestamps/status summary |
| PROPOSAL | typed caller cause | span completion status/bounded type | primary diagnostic under policy | failure count | no | no | bounded outcome class, not raw stack by default |
| PROPOSAL | stdout/stderr | no full payload | bounded/redacted or separate diagnostic artifact | byte/line counts | raw process stream | no | optional digest/diagnostic reference |
| PROPOSAL | provider build graph/metafile | digest/schema only | availability/error | graph byte/count metrics | primary | envelope artifact if persisted | digest/reference |
| PROPOSAL | source map | presence/count only | diagnostics | count/bytes | provider result may identify | primary artifact relation | digest/relation |
| PROPOSAL | output path | omit/redact by default | redacted on demand | never label by full path | provider result | primary locator observation | locator policy plus digest |
| PROPOSAL | output bytes/digest | count/total; digest only if policy permits | exceptional detail | bytes aggregate | may report | primary | primary |
| PROPOSAL | dependency/import edges | no | no | aggregate counts | primary | optional normalized summary | provider payload digest/reference |
| PROPOSAL | exact selected executable/version | bounded tool name/version/compatibility; path redacted | selection/override warning | selection/failure count | no | build-step observation | primary |
| PROPOSAL | application ready/rebuild event | mirror only | mirror only | count/duration | primary structured provider event | resulting artifact observation | optional event-linked receipt |
| PROPOSAL | signing lineage | span timing/status | signer diagnostics | counts/durations | signer-native result | output artifact | primary provenance edge |

## Why telemetry is not an application event protocol

**[UPSTREAM-DIRECT]** OpenTelemetry sampling can create non-recording spans or reduce spans sent to a backend.

**[UPSTREAM-DIRECT]** OTLP allows concurrent in-flight export, partial success, retry after failures, and duplicate server data when acknowledgment is uncertain.

**[UPSTREAM-DIRECT]** Effect's `NodeSdk` enables a signal only when a processor/reader is supplied, and its scoped shutdown/flush paths are time-bounded and ignored.

**[INFERENCE]** Therefore an application cannot safely wait for “the rebuild span” or infer exactly-once state from exported logs. Telemetry is optional, lossy/duplicable operator data by design.

**[PROPOSAL]** Application events must come from:
- **[PROPOSAL]** the typed return of a one-shot Effect;
- **[PROPOSAL]** a scoped provider-native callback/event stream;
- **[PROPOSAL]** an official child-process exit and raw output when no richer protocol exists;
- **[PROPOSAL]** a durable artifact/provenance commit.

## Naming recommendation

**[PROPOSAL]** Avoid the bare field name `sourceTrace`.

**[PROPOSAL]** Use:
- **[PROPOSAL]** `telemetrySpan` / trace context for operator telemetry;
- **[PROPOSAL]** `providerBuildGraph` or `providerMetafile`;
- **[PROPOSAL]** `sourceMap`;
- **[PROPOSAL]** `provenance` or `sourceArtifactProvenance`.

**[INFERENCE]** Explicit names prevent users from treating an ephemeral span as durable provenance or a source map as a dependency graph.
