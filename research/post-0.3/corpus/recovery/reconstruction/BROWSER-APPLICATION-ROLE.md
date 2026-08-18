# Browser application role

**Status:** reconstructed documentation; not recovered verbatim source.  
**Purpose:** Separate the narrow remotely demonstrated browser role from the general discovery/copy/rewrite implementation that remains missing.  
**Observed remote head:** `96e53a27be4ef96fb47f1a745480e0c5382640f2`  
**Last substantive research head:** `49cd5e1be7917bf14e89068afb4fa47cf78488fb`  
**Last fully reproduced receipt boundary:** `9b0d2f59567a7684b62df932c67b7a96050b605f`

This document does not assert that the described API is implemented, remotely certified at the current head, or ready to merge.


## Evidence boundary

Remote receipts establish two related facts:

1. A broad “static web application” contract was falsified because a top-level linked stylesheet was not preserved in the Deno adversarial fixture.
2. After narrowing to HTML module applications with module-reachable JavaScript/CSS, Bun and Deno produced locally resolvable HTML/JS/CSS trees in the exercised fixtures.

They do **not** establish a general HTML/CSS/asset discovery and rewrite implementation, comprehensive source-map behavior, or real-browser conformance for every requested mode.

> **Provenance:** `REMOTE-EXECUTED` · observation · confidence **high** · existing-provider-research.json and profile-refinement.json in the 9b0d receipt sets


## Truthful role

`BrowserModuleApplication` means:

- one contained HTML entry document;
- JavaScript module roots discovered from HTML;
- static and dynamic module dependencies handled through provider bundling/splitting;
- stylesheets and assets reachable through the discovered HTML/JS/CSS graph;
- output URLs rewritten to a contained output tree;
- borrowed output lifetime;
- browser execution as the substitutability law.

It does not mean “copy a website directory,” “inject provider-generated tags into a known fixture,” “serve arbitrary framework output,” or “make any static directory atomic.”

## General algorithm specification

### 1. Normalize authority and containment

- Canonicalize source root, output root, and HTML entry using Effect `Path`/`FileSystem`.
- Require entry containment under source root.
- Reject traversal, NUL/invalid paths, and symlink escapes under the selected policy.
- Define allowed URL schemes: local relative/root-relative references are candidates; `http:`, `https:`, `data:`, `blob:`, `mailto:`, fragments, and provider-specific schemes are preserved or rejected according to explicit rules, never copied accidentally.

### 2. Parse HTML structurally

Use an HTML parser, not regular expressions. Discover at minimum:

- module and classic `<script src>` references;
- `<link rel="stylesheet">`;
- preload/modulepreload references;
- images and responsive sources (`src`, `srcset`, `<source>`);
- media/poster/track references;
- icons/manifests where included by the role;
- inline module imports or CSS only if the provider/parser path supports them honestly;
- `<base href>` and document URL semantics.

Every discovered reference records source coordinate, original URL, resolved source identity, and intended output mapping.

### 3. Traverse JavaScript graph

Delegate module parsing/bundling to the provider and preserve its graph/metafile/output relationships where available. The role requires:

- static imports;
- dynamic imports and code splitting;
- worker/service-worker URLs only if explicitly admitted;
- import attributes/JSON behavior where supported;
- external URLs/packages according to request policy;
- chunk-to-chunk URL integrity after renaming/rewrite.

Do not invent a universal provider graph; translate only the URL/output observations needed by the browser role.

### 4. Traverse CSS graph

Parse CSS with a real CSS parser/value parser. Recursively discover:

- `@import` rules, including media/layer/supports qualifiers;
- `url(...)` in declarations;
- fonts, images, cursor assets, masks, and source maps;
- nested imports with cycle detection;
- quoting/escaping and query/fragment preservation.

A copied CSS file whose nested URLs still point outside the output tree does not conform.

### 5. Build provider output graph

Invoke Bun or Deno native bundling with the finite profile request. Preserve:

- output path/kind relationships;
- generated chunks and dynamic-import references;
- generated CSS/assets;
- diagnostics;
- source maps where requested/supported;
- minified versus unminified mode;
- native provider output in memory when possible to avoid partial durable writes.

### 6. Copy only discovered unbundled assets

Copy assets that remain external to provider output only because the role explicitly discovered them. Never recursively copy all fixture files. Observe bytes/digest/media kind and reject source changes during acquisition.

### 7. Compute output mapping and rewrite URLs

Create one mapping from canonical source/provider output identity to contained output URL. Rewrite:

- HTML references;
- CSS `@import` and `url(...)`;
- generated JS/chunk references only through provider-supported naming/metafile mechanisms or a parser that preserves syntax/source maps;
- source-map comments and `sources` paths where supported.

Preserve query and fragment components. Encode URLs correctly; filesystem separators never leak into browser URLs.

### 8. Validate containment and completeness

After rewrite:

- every local reference resolves inside the output tree;
- every referenced file exists and matches its observed identity;
- no output path escapes root or collides under case/Unicode normalization policy;
- no undiscovered source file was copied;
- no generated output is orphaned unless the provider explicitly reports it as auxiliary;
- output manifest is deterministic under a defined ordering.

### 9. Validate source maps

Where requested and supported:

- map files resolve from generated files;
- `sources`/`sourceRoot` references obey disclosure and containment policy;
- inline/external maps are distinguished;
- minification preserves stack/source mapping in browser probes;
- unsupported combinations fail or produce an explicit observation, never a silent false claim.

### 10. Execute in real browsers

A conformance fixture must test at least:

- initial HTML load;
- static module execution;
- dynamic import/chunk load;
- top-level and nested CSS application;
- CSS `url(...)` image/font resolution;
- HTML image/asset resolution;
- minified and unminified modes;
- source-map mode where supported;
- containment failures and missing-reference diagnostics;
- no network fetch except explicitly external references.

Real-browser tests should observe DOM/application state, computed style, asset load success, console/runtime errors, and network requests.

## Borrowed result contract

The profile returns a borrowed tree/manifest. It may expose:

```text
entryHtml
manifest Effect
read(path) Effect
open(path) scoped stream
validate Effect
```

The exact API is implementation work. The invariant is that every operation rechecks liveness/containment and that authority expires after the one producer continuation. A raw directory path alone is insufficient.

## Provider distinctions preserved

- Bun and Deno retain native diagnostics and output metadata.
- Deno's bundle surface is experimental and version-policy-owned.
- Provider project/config behavior not in the profile request is excluded rather than silently applied.
- Direct provider write behavior remains available on native surfaces even though the profile should prefer memory/borrowed assembly where possible.

## Falsifiers for the general role

The profile must be rejected or narrowed if either provider cannot preserve:

- a discovered top-level stylesheet;
- nested CSS imports/URLs;
- dynamic chunks after rewriting;
- equivalent browser-visible result;
- complete contained references;
- borrowed cleanup/mutation laws;
- honest source-map observations.

The existing fixture-specific evidence is not enough to waive these gates.
