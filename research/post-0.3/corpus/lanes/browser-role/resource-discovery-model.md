# Resource discovery model

## 1. Model: declared closure, not omniscience

**[INFERENCE RDM-001]** A browser application’s actual fetch graph is partly declarative, partly provider-conventional, and partly programmable at runtime. A portable build abstraction can truthfully expose a **provider-declared output closure**; it cannot claim to enumerate every request the application may construct in every environment.

Definitions:

- **Source entry**: an explicit JavaScript/TypeScript browser-module entry supplied in the request.
- **Provider source graph**: the dependencies/assets the provider elects to recognize under its loaders/plugins/options.
- **Output member**: one contained file returned in the borrowed tree.
- **Declared internal edge**: an output relation the provider/adapter asserts must resolve to another output member.
- **Declared external edge**: an output relation intentionally left outside the tree.
- **Unknown edge**: an edge the adapter cannot classify or associate; it cannot be included in a closure claim.
- **Consumer host**: caller-owned HTML and serving policy constructed from returned observations.

## 2. First portable role inputs

**[PROPOSAL RDM-002]** `BrowserModulePayload.Request` should contain only portable, semantically necessary inputs:

```ts
interface BrowserModulePayloadRequest {
  readonly entries: ReadonlyArray<{
    readonly id: string
    readonly source: HostPath.Observed
  }>
  readonly mode: "development" | "production"
  readonly sourceMaps: "none" | "linked" | "inline" | "provider-default"
  readonly minify: boolean | "provider-default"
  readonly external?: ReadonlyArray<string>
  readonly conditions?: ReadonlyArray<string>
}
```

Provider-specific plugins, loaders, HTML selectors, naming templates, remote-fetch policy, public-path machinery, framework config, and worker conventions stay in provider-native request types.

## 3. Result observations

**[PROPOSAL RDM-003]** The borrowed result should expose only facts the adapter can prove:

```ts
interface BrowserModulePayloadBorrowed {
  readonly root: HostPath.Observed
  readonly entries: ReadonlyArray<{
    readonly requestId: string
    readonly module: RelativeOutputPath
    readonly associatedStyles: ReadonlyArray<RelativeOutputPath>
    readonly preloadCandidates: ReadonlyArray<RelativeOutputPath>
  }>
  readonly files: ReadonlyArray<{
    readonly path: RelativeOutputPath
    readonly bytes: bigint
    readonly sha256: string
    readonly mediaType?: string
    readonly role: "entry" | "chunk" | "style" | "asset" | "source-map" | "other"
  }>
  readonly edges: ReadonlyArray<{
    readonly from: RelativeOutputPath
    readonly rawSpecifier: string
    readonly disposition: "internal" | "external"
    readonly to?: RelativeOutputPath
    readonly kind?: string
  }>
  readonly provider: unknown // retained provider-native observation
}
```

Fields may be omitted or the request rejected when the provider cannot establish them. The portable layer must not invent graph edges from filenames.

## 4. Resource disposition matrix

The matrix describes the proposed first role. “Provider-declared” means the adapter has structured, versioned evidence—not merely an extension scan.

| Resource/scenario | Disposition | Conditions and reason |
|---|---|---|
| Explicit JS/TS module entry | In scope | Required input; exactly one returned entry association per request ID. |
| Static nested JS import | In scope | Provider resolves/bundles or declares external. Internal emitted edge must be contained. |
| Re-export edge | In scope | Same as static import. |
| Literal dynamic import | In scope only if declared | Emitted chunk/edge must be in provider metadata or otherwise officially associated. |
| Computed dynamic import | Rejected from closure | Runtime expression has no finite general source closure. May remain provider-native/external. |
| Shared chunk | In scope | May be shared by entries; exact topology is non-portable. |
| JS-imported CSS | In scope if associated | Provider must identify emitted CSS and URL rewrites. |
| Top-level HTML stylesheet | Outside module role | Belongs to host document or strict HTML role; the recorded Deno counterexample proves it cannot be assumed. |
| CSS `@import` | In scope if provider graph includes it | Provider owns recursion/rewrite; unknown edge rejects closure. |
| CSS `url()` asset | In scope if emitted/declared | Preserve query/fragment semantics; provider owns rewrite. |
| CSS fragment-only SVG reference | Preserve as URL semantics | Do not map mechanically to a separate file edge. |
| HTML `img[src]` | Outside module role | Consumer host or strict HTML role. |
| HTML `srcset` candidates | Outside module role | Needs candidate parsing and provider HTML semantics. |
| HTML preload/modulepreload | Outside module role | Consumer policy; may be suggested as observations, not silently injected. |
| Imported image/font/media through provider loader | In scope if declared | Returned as provider-declared asset and contained. |
| `new URL("./x", import.meta.url)` | In scope only if provider declares transform | Syntax recognition is provider convention; otherwise runtime behavior. |
| Worker/SharedWorker entry | Provider-native or future dedicated role | Needs worker entry association, graph type, URL/base, and runtime oracle. |
| Service worker | Provider-native/explicitly rejected | Scope, origin, secure context, update, and headers are deployment semantics. |
| Worklet | Provider-native or dedicated role | Separate runtime/global/loader semantics. |
| WASM imported by provider loader | In scope if declared | Asset/glue relation and MIME expectation must be observed. |
| WASM fetched by runtime expression | Rejected from closure | General runtime URL construction. |
| Import map in consumer HTML | External host policy | Consumer owns map/base/scopes/integrity. |
| Import map in HTML entry | Future strict HTML role only | Requires complete admitted semantics; not portable v1. |
| Absolute `http:`/`https:` URL | Explicit external | Do not copy or rewrite unless separate vendoring operation. |
| Protocol-relative URL | Explicit external | Origin/scheme-dependent; never a local path. |
| `data:` URL | Inline external-to-tree | Payload is in URL; no tree member required. |
| `blob:` URL | Runtime-only | Blob URL store entry, not a build artifact. |
| Root-relative URL | Rejected by v1 | Requires public-origin mount policy not present in relative payload role. |
| Path-relative URL | In scope when provider-declared | Resolved in correct output context and required to remain contained. |
| Query-only/fragment-only reference | Preserve | Do not strip before semantic classification. |
| Source map | Optional observation | Must be associated with generated output and link mode; original sources need not be deployment files. |
| Provider-generated HTML | Provider-native or strict HTML role | Not synthesized by module payload. |
| Provider manifest/metafile | Provider-native observation | Preserve verbatim/rich; portable projection only of proven common fields. |
| Public directory | Explicit copy/provider-native | Policy-heavy; caller enumeration may copy unchanged. |
| Arbitrary copied `assets/` directory | Rejected as discovery | Valid only when caller explicitly names it; cannot prove all/only app assets. |
| Runtime DOM insertion/fetch/XHR/WebSocket | Outside closure | Programmable runtime behavior. |
| Remote module vendoring | Separate provider-native policy | Changes origin, cache, credentials, integrity, and availability. |

## 5. Provider-first discovery procedure

**[PROPOSAL RDM-004]** A truthful adapter procedure is:

1. Validate explicit source entries and reject duplicate request IDs.
2. Create an isolated staging root not overlapping sources or a durable destination.
3. Invoke exactly the selected provider API/command with a provider-native request derived from the portable request.
4. Wait for provider completion; on failure, report that partial staging writes may exist and clean the staging root.
5. Obtain official provider outputs/metadata. Do not crawl the source tree looking for “likely assets.”
6. Normalize output paths to unique, relative, non-escaping paths; reject absolute paths, `..`, NUL, collisions, and escaping symlink targets.
7. Establish one entry output for each request ID. Reject missing or ambiguous association.
8. Project provider-declared output edges into internal/external observations. Reject any declared internal edge whose target is absent or escapes the root.
9. Associate styles/preload candidates only from provider evidence. Do not infer “the only CSS file belongs to the only JS file” as a general law.
10. Hash and freeze the manifest observation after provider completion.
11. Lend the tree to one continuation/scope; recheck liveness and mutation on observation operations.
12. Remove staging after the continuation, without claiming durable publication.

The core validates a provider-declared closure. It does not independently reconstruct browser semantics from emitted bytes.

## 6. Explicit static resources are composition, not discovery

A separate helper can be semantically valid:

```ts
interface ExplicitStaticResource {
  readonly source: HostPath.Observed
  readonly destination: RelativeOutputPath
  readonly collision: "reject"
}
```

It copies exactly the listed files/directories, records digests, rejects overlaps/escapes/collisions, and returns a composition ledger. It must not be marketed as finding “public” or “top-level” resources. The v2 probe’s `top.css`/`assets/` copy can be understood as an untyped fixture-specific instance of this operation.

## 7. Possible strict HTML-entry role

A later `HtmlModuleGraphBuild` can be provider-portable only with a deliberately small admitted source language, for example:

- exactly one explicitly named HTML entry;
- no `<base>`;
- no import maps;
- no inline module source;
- exactly one local `<script type="module" src="...">` rooted beneath the project root;
- no other local top-level fetch-bearing references;
- all CSS/assets must be reachable through provider-recognized module loaders;
- no root-relative URLs;
- no service-worker registration claim;
- relative colocated serving only;
- provider-generated HTML bytes returned without library rewriting.

This role would be more explicit than `BrowserModuleApplication`: it is an **HTML entry build for a bounded module graph**, not a general web application.

## 8. Why a general neutral algorithm is not feasible

**[INFERENCE RDM-005]** General discovery requires solving multiple open-ended problems simultaneously:

- executing arbitrary JavaScript URL expressions under all runtime states;
- implementing HTML parsing and each fetch-bearing element algorithm;
- resolving import maps with scopes/integrity/base changes;
- parsing and rewriting recursive CSS under stylesheet-specific bases;
- recognizing provider/framework plugin conventions;
- deriving worker, service-worker, worklet, WASM, and public-directory policy;
- predicting server headers, redirects, content negotiation, MIME, CSP, and cache behavior;
- preserving runtime-visible URL and source-map semantics.

Static scanning is incomplete; dynamic execution samples environments rather than proving closure. A complete implementation would be a frontend framework/build system and still could not enumerate arbitrary runtime requests.

## 9. Falsification rule

A candidate claiming closed output is falsified by any admitted application where:

- a required provider-declared internal edge is missing or escapes;
- an entry cannot be associated uniquely;
- an external is silently internalized or vice versa;
- a provider substitution prevents the consumer readiness/result oracle;
- output observations become invalid before the borrowed callback ends without a detected mutation/failure;
- the role relies on a resource that its admitted language did not enumerate.
