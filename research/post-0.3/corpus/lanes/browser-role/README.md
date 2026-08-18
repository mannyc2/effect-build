# `effect-build` browser-role research

Observed repository: `mannyc2/effect-build`  
Observed research head: `96e53a27be4ef96fb47f1a745480e0c5382640f2`  
Release-line base: `15c811bb9904142a33d119766b62082f3c689f13`  
Draft PR: `#4`  
Observation cutoff: `2026-08-17T15:53:21Z`

## Decision in one paragraph

**[INFERENCE I-001]** `effect-build` can define a provider-portable browser abstraction, but the first truthful abstraction is a **browser module payload**—a corrected and more explicit form of `BrowserModuleOutputSet`—rather than a general `BrowserModuleApplication`. It begins with explicit JavaScript/TypeScript browser-module entries; delegates module/CSS/asset graph construction and URL rewriting to Bun or Deno; returns a borrowed, isolated output tree with stable entry associations and provider-declared closure observations; and leaves host-document discovery, deployment headers, public-base policy, workers, service workers, framework conventions, and durable directory publication outside the portable law.

**[INFERENCE I-002]** The live branch does not establish the current `BrowserModuleApplication` claim. The last successful receipt demonstrates one script-rooted CSS fixture and an extension/`src|href` existence oracle. The later v2 probe source copies a fixture-specific top-level stylesheet and asset directory, injects links/elements into provider-generated HTML, and then exercises the normalized result. That is evidence about one explicit normalizer, not a general Bun/Deno browser-application substitution law.

**[PROPOSAL P-001]** Preserve four distinct layers:

1. `BrowserModulePayload`—the portable, provider-owned module-graph build role.
2. `HtmlModuleGraphBuild`—a possible later role with an explicitly small admitted HTML source language and provider-owned transformation.
3. `ExplicitStaticResources`—an optional composition helper that copies only caller-enumerated resources and never claims discovery.
4. Permanent provider-native APIs and outputs for richer provider and framework behavior.

“No current consumer” affects release priority, not semantic validity. Conversely, a successful fixture affects confidence in that fixture only; it cannot substitute for complete scenario enumeration, counterexamples, and falsifiers.

## Proposed application-visible substitution law

**[PROPOSAL P-002]** Let `S` be an admitted source project, `E` a non-empty set of explicit browser-module entries, `P` a conforming provider adapter, `T_P` the borrowed tree returned by that adapter, and `H_P` a consumer host document constructed only from the adapter’s returned entry/style observations.

Replacing Bun with Deno—or another conforming provider—may change output bytes, filenames, minification, chunk topology, source-map topology, provider metadata, and independent request ordering. It must not change the following portable observations when each tree is served byte-for-byte at the required relative mount with correct MIME types:

1. The adapter identifies one loadable JavaScript entry output for each requested entry.
2. Every provider-declared internal output edge required by an admitted entry resolves to a contained member of `T_P` under the browser URL context declared by the profile.
3. Every declared external URL/specifier retains the same parsed external semantics; it is not silently copied, vendored, or redirected into the local tree.
4. The browser reaches the same consumer-defined readiness predicate and exposes the same profile-level application result.
5. Failure to prove entry association or closure is a typed rejection, not guessed success.

The law intentionally does not promise identical `import.meta.url`, stack traces, function source text, chunk URLs, network-request count, cache keys, source-map contents, provider-generated HTML, or provider metadata.

**[UNKNOWN U-001]** The reviewed repository contains no evidence broad enough to classify current Bun or Deno adapters as conforming to this proposed law. This package defines a candidate law and its falsifiers; it makes no conformance claim.

## Answers to the eight questions

### 1. What application-visible substitution law could Bun and Deno both satisfy?

The law above: explicit browser-module entries; provider-owned graph production; stable returned entry associations; a provider-declared, contained internal output closure; preserved external URL semantics; borrowed output ownership; and a consumer-defined browser readiness/result oracle. Portable equivalence is behavioral through returned observations, not byte or topology equality.

### 2. Must the library own HTML/CSS discovery and rewriting, delegate it, or expose output observations only?

**[INFERENCE I-003]** The portable core should delegate source discovery and rewriting to providers, then expose and validate output observations. It may check containment, path uniqueness, digest stability, declared edges, and lifetime. It should not make a regex, filename convention, or independent HTML/CSS/JavaScript parser the semantic authority. A caller-enumerated copy helper can exist, but that is explicit composition—not application discovery.

### 3. Which resources are in scope, external, copied, rewritten, or rejected?

For `BrowserModulePayload`:

| Disposition | Resources |
|---|---|
| In scope | Explicit module entries; provider-resolved static module dependencies; emitted chunks; provider-associated CSS; provider-declared emitted/copied assets; optional provider-linked source maps. |
| Explicitly external | Absolute `http:`/`https:` URLs; protocol-relative URLs; caller/provider-declared external imports; remote resources intentionally preserved as remote. |
| Copied unchanged | Provider-declared asset outputs, or files explicitly named by the caller through a separate `ExplicitStaticResources` operation. |
| Rewritten | Only by the provider in the portable role. A separate HTML composition operation may rewrite with a complete before/after ledger and policy checks. |
| Rejected from a closure claim | Arbitrary computed imports/URLs; unowned import maps; runtime DOM insertion; service-worker registration/scope; unknown root-relative mount assumptions; output-tree escapes; ambiguous entry association; and local edges the adapter cannot account for. |

`resource-discovery-model.md` and `url-rewrite-contract.md` contain the complete matrix.

### 4. Is a general provider-neutral discovery algorithm feasible without recreating a frontend framework?

**[INFERENCE I-004]** No. A finite declarative subset is feasible; complete browser-application discovery is not. JavaScript can construct URLs from runtime data, import maps alter module resolution, CSS resolves relative to stylesheet-specific bases, service workers add scope/header semantics, and frameworks/plugins define additional asset conventions. A purported general algorithm must either become a bundler/frontend framework or execute an open-ended application under necessarily incomplete environments.

### 5. What output ownership and atomicity can honestly be promised?

A successful portable build can lend an isolated output tree for one callback/scope. The adapter can promise root containment, unique relative paths, a frozen manifest observation, provider-operation completion before the callback, and cleanup after the scope. It cannot promise that the provider made no partial writes inside staging before failure. It cannot promise portable atomic replacement of a non-empty durable directory across POSIX and Windows. Durable publication must be a separate deployment operation, preferably a versioned immutable tree plus a single pointer/symlink/config switch appropriate to the target platform.

### 6. Which exclusions are semantic necessities rather than convenient test limitations?

Semantic necessities include arbitrary runtime URL construction; exact filenames/chunk topology; exact `import.meta.url`; universal public-base rewriting; remote/data/blob inclusion in a local tree; CSP/SRI preservation after byte changes; service-worker scope; framework/plugin conventions; and portable atomic multi-file directory replacement. Convenient limitations include the current fixture names, one HTML entry, one image, one browser executable path, Linux-only execution, and absence of a current adopter.

### 7. What adversarial applications would falsify each candidate?

The catalog covers `<base>`, root-relative paths, top-level CSS, nested `@import`, CSS `url()`, `srcset`, preload/modulepreload, import maps, static and computed dynamic imports, multiple entries/shared chunks, workers, service workers, WASM, public subpaths, query/fragment identity, source maps, minification-sensitive code, CSP/SRI, symlink escapes, stale files, provider-generated HTML, manifests, interrupted writes, and directory publication. See `adversarial-application-catalog.md`.

### 8. What should remain provider-native even if a portable role exists?

HTML selector coverage/generation, plugins/loaders/transforms, import-map behavior, framework semantics, public-path features, remote fetching/vendor policy, chunk naming and splitting, minifier details, source-map modes, CSS modules, workers/service workers/worklets, WASM conventions, public directories, provider manifests/metafiles, diagnostics, watch/incremental/HMR, CSP/SRI generation, and deployment/publishing should remain provider-native.

## Claim classifications

Every central claim is labeled and recorded in `evidence-ledger.json`:

- `GITHUB-DIRECT`: live repository, PR, branch, source, declaration, workflow, or artifact metadata.
- `UPSTREAM-DIRECT`: official standard, official documentation, declaration, or upstream source repository.
- `RECORDED-EXECUTION`: structured receipt from a completed GitHub Actions run, limited to its exact source SHA, versions, command, fixture, and oracle.
- `INFERENCE`: conclusion derived from direct evidence, standards analysis, counterexamples, or impossibility boundaries.
- `PROPOSAL`: recommended API, role, law, policy, or proof obligation.
- `UNKNOWN`: material behavior not established by reviewed evidence.

`RECORDED-EXECUTION` never means general conformance.

## Archive integrity and scope

`manifest.sha256` hashes every other archive member and excludes itself to avoid recursion. The ZIP digest is reported alongside the download link.

This was read-only research. No repository file, PR, branch, workflow, setting, package, release, or tag was modified. No browser pipeline or tests were implemented. No provider conformance is claimed.
