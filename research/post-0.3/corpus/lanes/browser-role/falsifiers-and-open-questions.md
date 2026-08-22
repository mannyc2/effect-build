# Falsifiers and open questions

## 1. General `BrowserModuleApplication`

A general application claim is falsified by any admitted source whose browser-visible behavior depends on an edge/policy the role neither preserves nor rejects. Decisive examples include top-level linked CSS, `<base>`, import maps, `srcset`, service-worker scope, CSP/SRI, multiple HTML entries, and runtime-computed URLs.

**[INFERENCE F-001]** Existing recorded evidence already falsifies a broad top-level-resource interpretation: tested Deno omitted the linked stylesheet. Narrowing the source language may yield a valid role; it does not make the broader claim true.

## 2. `BrowserModuleOutputSet`

The unrefined set is falsified as an application-facing abstraction when a consumer cannot identify:

- which output is the requested entry;
- which CSS belongs to which entry;
- which chunks/assets are transitively required;
- which specifiers remain external;
- whether the returned files share one lifetime/mount.

One multi-entry/shared-chunk fixture is enough to expose an extension-only model.

## 3. `BrowserModulePayload`

The proposed payload is falsified if an admitted provider/version cannot:

1. establish exactly one module output per request ID;
2. account for provider-declared internal emitted edges;
3. preserve declared externals;
4. associate required CSS/assets/chunks without filename guessing;
5. lend a contained stable snapshot;
6. satisfy the same consumer readiness/result oracle under the admitted host.

A provider may conform to a smaller versioned capability range or reject unsupported requests. Silent weakening is non-conformance.

## 4. Strict `HtmlModuleGraphBuild`

The role is falsified by any source construct it admits but cannot preserve equivalently. The safest first source language excludes `<base>`, import maps, inline modules, non-module top-level local resources, root-relative paths, service workers, and library rewriting. Every relaxation adds a new proof obligation.

## 5. Durable output tree

The portable durable-tree claim is falsified by partial provider writes, stale files, cleanup failure, cross-filesystem movement, or inability to atomically replace a live non-empty directory. Versioned publication can be a separate role, but its platform-specific commit object and reader protocol must be explicit.

## 6. Open provider questions

**[UNKNOWN Q-001]** Can supported Deno versions expose a reliable mapping from each explicit module entry to emitted JS, associated CSS, chunks, and copied assets through public API or structured output? The reviewed `Deno.bundle.OutputFile` shape lacks Bun-like graph/kind fields.

**[UNKNOWN Q-002]** Does Deno expose an official public-base/public-path option with defined coverage across JS chunks, CSS URLs, HTML, and assets? It was not established from reviewed docs.

**[UNKNOWN Q-003]** Beyond documented script references and module-imported CSS, which exact HTML attributes/resources does Deno preserve, copy, hash, or rewrite at each supported version?

**[UNKNOWN Q-004]** How does current Bun HTML bundling handle import maps, scopes, integrity entries, and map relocation? The finite selector documentation does not establish a complete import-map law.

**[UNKNOWN Q-005]** Do both providers expose nested literal dynamic-import chunks strongly enough in public metadata to prove closure without parsing emitted JavaScript?

**[UNKNOWN Q-006]** What exact static `new URL(..., import.meta.url)` and worker forms do Bun and Deno recognize, and how are asset/entry associations represented?

**[UNKNOWN Q-007]** Is a dedicated `BrowserWorkerModulePayload` feasible across both providers without importing framework conventions? SharedWorker/classic worker variants may require separate roles.

**[UNKNOWN Q-008]** Can either provider expose service-worker output with enough scope/deployment metadata for a portable role, or is service-worker deployment necessarily native?

**[UNKNOWN Q-009]** For WASM loaders, can both providers expose the emitted WASM/glue relation, required MIME, and target behavior under one bounded role?

**[UNKNOWN Q-010]** Which source-map modes and generated-to-map associations can be projected truthfully from both providers? Deno’s simple `OutputFile` surface may require narrower observations.

**[UNKNOWN Q-011]** What are the exact partial-write and cancellation semantics of current in-process Bun and Deno APIs when targeting adapter-owned staging?

**[UNKNOWN Q-012]** Do provider APIs guarantee output-file arrays are complete before resolution, and can direct writes continue after the calling fiber stops waiting?

**[UNKNOWN Q-013]** Can generated HTML be associated to the requested HTML entry through official metadata in both providers when multiple HTML entries are present?

**[UNKNOWN Q-014]** Which provider-generated manifests/metadata are stable public contracts versus diagnostic/internal formats across supported versions?

**[UNKNOWN Q-015]** Which browser engines/environments constitute the portable runtime oracle, and which behavior differences are excluded? One Chromium execution is not a browser-neutral proof.

## 7. Open contract questions

**[UNKNOWN Q-016]** Should the portable payload require a full edge list, or allow a weaker “entry + associated styles + all output files” result when one provider cannot expose edge metadata? A weak mode may be useful but must not be called closed.

**[UNKNOWN Q-017]** Should source maps be outside v1 entirely, or optional observations with provider-specific modes? Requiring false equivalence would be worse than omission.

**[UNKNOWN Q-018]** Should `minify` be a portable boolean, a provider-default marker, or provider-native only? Behavioral equivalence can tolerate different minifiers, but policy/security and debugging may not.

**[UNKNOWN Q-019]** Which MIME mapping belongs to the role versus the consumer test host? A payload can report media types, but serving remains deployment behavior.

**[UNKNOWN Q-020]** Should external bare specifiers be allowed in the first role? Allowing them requires the consumer host/import-map contract; forbidding them yields a clearer closed payload.

**[UNKNOWN Q-021]** Is same-origin relative colocated serving sufficient for the first consumer set, or should public-base support be a separate profile from inception?

**[UNKNOWN Q-022]** What protocol/version string governs independent provider-package conformance without npm lockstep?

## 8. Evidence required to close questions

Closing an unknown requires all of:

- official version-pinned declaration/document/source evidence;
- a complete admitted scenario list;
- at least one positive and one counterexample/falsifier where meaningful;
- structured provider output observations;
- an application/browser oracle for behavior claims;
- failure/interruption/ownership observations;
- no fixture-specific normalization hidden inside the provider proof;
- reproducible receipts tied to source SHA and tool/browser versions.

This document does not implement those probes or tests.

## 9. Semantic necessities versus present limitations

### Semantic necessities

- Runtime-computed URLs cannot be generally enumerated statically.
- `import.meta.url`, exact filenames, and chunk topology cannot be equalized without changing application observables.
- Service-worker scope and CSP/SRI depend on deployment policy beyond file output.
- Remote/data/blob URLs are not ordinary local tree members.
- Universal public-base rewriting is not implicit in module output.
- Multi-file non-empty directory replacement has no universal atomic transaction law.
- Provider-native metadata cannot be projected into fields a provider cannot prove.

### Present evidence limitations

- hardcoded `index.html`, `top.css`, `assets/`, and one module/CSS fixture;
- one browser executable and one operating-system environment;
- first-HTML-file selection;
- extension and regex path checks;
- no multiple-entry/shared-chunk scenario;
- no broad URL/policy/worker/WASM matrix;
- latest live workflow fails before certification;
- no implemented browser adapter;
- no current consumer.

**[INFERENCE F-002]** The first group constrains any truthful abstraction. The second group constrains confidence in the current research only and can be improved without changing the semantic law.
