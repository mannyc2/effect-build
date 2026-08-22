# Browser role candidates

## Evaluation rule

A candidate is semantically valid when its request, result, exclusions, ownership, and observable substitution law can be stated without collapsing provider distinctions or depending on a particular fixture. Existing adoption determines release priority only. Recorded success is evidence for the exact scenario and oracle only.

## Candidate A — current `BrowserModuleApplication`

### Intended shape

The live plans describe an HTML module application whose CSS/assets are “module-reachable,” built by Bun and Deno and returned as a borrowed tree.

### Merits

- It names an application-level result rather than raw files.
- It recognizes that broad static-web copying was falsified by top-level linked CSS.
- It preserves borrowed rather than durable tree ownership.
- It attempts to provide a directly deployable HTML entry.

### Fatal ambiguity

**[INFERENCE CAND-001]** “Module-reachable” is not a complete browser application boundary. It does not specify whether reachability includes provider-loader assets, `new URL`, dynamic imports, workers, import maps, CSS recursion, preload hints, WASM glue, or runtime-created URLs. Nor does it define the host/deployment policy under which generated HTML is substitutable.

The successful receipt’s oracle was roughly:

- an HTML file exists;
- a JS file exists;
- a CSS file exists;
- regex-matched `src`/`href` paths map to files after query/fragment stripping.

That is weaker than browser application equivalence. The later v2 source expands one fixture by copying and injecting resources, which narrows rather than generalizes the proof.

### Adversarial falsifiers

`<base>`, import maps, top-level stylesheets, `srcset`, multiple HTML entries, CSP/SRI, service workers, computed dynamic imports, nested public paths, and provider-generated HTML policy all falsify an unspecified general reading.

### Decision

**[PROPOSAL CAND-002]** Do not publish the current broad name/claim as established. Retain the research as input to a stricter HTML-entry candidate.

## Candidate B — current `BrowserModuleOutputSet`

### Intended shape

A set of emitted JavaScript and CSS files for a browser module entry, without HTML.

### Merits

- It avoids host-document discovery.
- The successful receipt directly shows Bun and Deno each emitted `app.js` and `app.css` for one CSS-importing module fixture.
- It is compatible with caller-owned HTML.

### Weaknesses

**[INFERENCE CAND-003]** A bag of files is not enough for substitution. Consumers need entry association, CSS association, closure/external observations, media types, lifetime, and a mount rule. Extension presence does not distinguish entries from chunks, shared CSS, source maps, or unrelated outputs.

### Adversarial falsifiers

Two entries plus shared chunks, CSS only for one entry, a lazy dynamic chunk, provider-external imports, emitted assets without association, duplicate basenames, or a JS file that is a chunk rather than the requested entry.

### Decision

Refine rather than reject. The semantically useful abstraction is Candidate C.

## Candidate C — `BrowserModulePayload` (recommended portable role)

### Definition

**[PROPOSAL CAND-004]** A one-shot provider build from explicit browser-module entries to a borrowed, isolated output tree with:

- one stable emitted module association per requested entry ID;
- provider-associated styles and optional preload candidates;
- contained file observations with role/media type/digest;
- provider-declared internal and external edges;
- provider-native metadata preserved separately;
- no generated or rewritten host HTML;
- no durable publication.

### Application-visible law

**[PROPOSAL CAND-005]** For consumers that construct their host document only from returned entry/style observations and serve the returned tree at the admitted relative same-origin mount, provider substitution preserves the consumer-defined browser readiness/result predicate and the resolution of all provider-declared internal edges. Filenames, bytes, splitting, minification, maps, request ordering, and provider metadata may differ.

### Admitted source and output boundary

- Source starts at explicit JS/TS module entries.
- Providers own graph resolution/loaders and output rewrites.
- Internal closure means “all provider-declared emitted edges,” not “all requests the running program could ever make.”
- External URLs/specifiers remain external and are observed when the provider exposes them.
- Computed/runtime edges are rejected from closure or retained provider-natively.
- HTML and server headers are consumer concerns.

### Why this is portable

**[INFERENCE CAND-006]** Bun and Deno both have a browser-module bundling center; the recorded fixture shows a non-empty intersection. The standards analysis gives a durable abstraction boundary independent of fixture filenames. Richer Bun graph metadata can be retained provider-natively without forcing Deno to fabricate it. A Deno adapter may reject requests whose entry/closure association cannot be proven.

### Evidence status

**[UNKNOWN CAND-007]** The role is architecturally plausible but not conformance-proven for current provider versions. Missing proof includes multiple entries, split chunks, nested dynamic imports, asset/CSS association, externals, source-map linkage, failure/partial-write behavior, and browser behavior under the precise host contract.

### Recommended public shape

```ts
export interface BrowserModulePayload {
  readonly withPayload: <A, E, R>(
    request: BrowserModulePayload.Request,
    use: (payload: BrowserModulePayload.Borrowed) => Effect.Effect<A, E, R>
  ) => Effect.Effect<A, BrowserModulePayloadError | E, R>
}
```

The continuation communicates borrowed ownership. Provider packages may add `provider` observations and richer request constructors.

## Candidate D — explicit `HtmlModuleGraphBuild`

### Definition

**[PROPOSAL CAND-008]** A future role accepting one explicitly named HTML entry under a deliberately small source language, delegating HTML discovery and rewriting to the provider, and returning provider-generated HTML plus its module payload in a borrowed tree.

Suggested v1 restrictions:

- exactly one HTML entry;
- no `<base>`;
- no import map;
- no inline module program;
- exactly one local external module script;
- no other local top-level fetch-bearing URL;
- all CSS/assets originate through provider-recognized module graph transforms;
- no root-relative internal URL;
- no workers/service workers/WASM claim unless separately admitted;
- no library injection or copying;
- relative colocated serving;
- returned HTML selected by requested-entry association, not “first `.html` file.”

### Merits

- More useful to simple static apps than a raw payload.
- Matches the documented Deno HTML center: script references plus script-imported CSS.
- Keeps transformation provider-owned.
- Can have a real browser oracle.

### Costs and risk

**[INFERENCE CAND-009]** The role remains significantly harder than Candidate C because HTML itself carries policy, base, fetch, hint, integrity, and metadata semantics. It should not ship until each admitted construct is enumerated and each provider exposes reliable entry association.

### Falsifiers

Any admitted source where one provider loses/reinterprets a top-level resource, changes base/import-map semantics, emits ambiguous HTML, violates CSP/SRI, or cannot satisfy the host mount/readiness law.

### Decision

Architecturally valid as a separate narrow role; deferred pending proof. Do not use the broad `BrowserModuleApplication` name unless the admitted language and exclusions are impossible to miss.

## Candidate E — provider-native outputs only

### Definition

Bun and Deno expose their official requests/results, generated HTML, files, graphs, diagnostics, and direct-write behavior without a portable browser profile.

### Merits

- Maximum honesty and feature access.
- No lowest-common-denominator pressure.
- Natural home for framework/plugin/provider distinctions.

### Weakness

**[INFERENCE CAND-010]** Native-only leaves a real portable semantic center unmodeled: explicit browser-module entry to borrowed module payload for caller-owned HTML. “No current consumer” is not a semantic counterexample. Rejecting Candidate C solely for lack of adoption would violate the architectural rule.

### Decision

Permanent and canonical, but not exclusive. Native lanes coexist with Candidate C and any later strict HTML role.

## Cross-candidate matrix

| Dimension | BrowserModuleApplication | BrowserModuleOutputSet | BrowserModulePayload | HtmlModuleGraphBuild | Provider-native only |
|---|---:|---:|---:|---:|---:|
| Explicit module entries | Ambiguous through HTML | Yes | Yes | HTML roots one module graph | Provider-defined |
| Host HTML included | Yes | No | No | Yes | Provider-defined |
| Stable entry association | Not proved | Not required/absent | Required | Required | Provider-defined |
| CSS association | Claimed loosely | Absent | Required when exposed | Required for admitted graph | Provider-defined |
| Output closure | Underspecified | File bag | Provider-declared | Provider-declared + admitted HTML | Provider-defined |
| General HTML discovery | Implicit risk | No | No | Deliberately finite | Provider-defined |
| Core rewriting | Probe does it | No | No | No; provider-owned | Provider-owned |
| Caller-owned HTML | Optional | Required | Required | No | Provider-defined |
| Borrowed ownership | Proposed | Should be | Required | Required | Provider-defined |
| Portable durable directory | No proof | No | No | No | Provider-specific |
| Current conformance evidence | Insufficient | One narrow fixture | Not yet complete | Not yet complete | Direct upstream only |
| Recommendation | Reject broad claim | Refine | **Adopt as candidate** | Separate/defer | **Keep permanently** |

## Provider-native even when Candidate C exists

**[PROPOSAL CAND-011]** Keep these permanently provider-native:

- HTML loader selectors and generated HTML;
- plugins, loaders, transforms, macros, framework integration;
- import-map handling and remote module/vendor policy;
- output naming, chunk strategy, splitting heuristics, minifier;
- public path/base/CDN rewriting;
- CSS modules and preprocessors;
- worker/service-worker/worklet conventions;
- WASM loaders/glue;
- source-map implementation and provider metadata;
- manifest/metafile schemas and diagnostics;
- watch, incremental rebuild, HMR, dev server;
- direct output-directory writes and deployment publication;
- CSP, SRI, nonce, signing, and header generation.

## Release sequencing

**[INFERENCE CAND-012]** Candidate C may be semantically valid yet deferred if the release cannot fund the required conformance matrix. Deferral must be recorded as priority/capacity, not as “invalid because no consumer.” Candidate D requires substantially more proof and should follow C, not replace it through fixture-specific normalization.
