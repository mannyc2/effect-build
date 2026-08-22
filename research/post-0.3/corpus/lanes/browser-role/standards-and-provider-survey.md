# Standards and provider survey

This survey distinguishes browser-standard semantics from build-tool conventions. A provider can transform a source graph into a useful deployment tree without implementing every browser fetch algorithm. A portable role must say which semantic layer it substitutes.

## 1. URL and base-resolution rules

**[UPSTREAM-DIRECT S-001]** HTML parses URL strings against a context-specific base URL. A document uses the frozen base URL of the first `<base href>` in tree order when present; otherwise it uses its fallback base URL. Environment APIs can use an API base URL rather than the document base. Consequently, “resolve relative to `dirname(index.html)`” is not a standards-equivalent rule.

Relevant consequences:

- Moving or injecting `<base>` changes later relative HTML URL semantics.
- A source document and generated document may have different document URLs and therefore different fallback bases.
- Inline CSS, external CSS, module code, workers, service workers, import maps, source maps, and runtime `URL` construction do not all share one base algorithm.
- Root-relative URLs bind to origin root, not output-tree root or filesystem root.

## 2. HTML resource surfaces

**[UPSTREAM-DIRECT S-002]** HTML can initiate, prioritize, or configure resource fetches through a broad set of element/attribute algorithms. A portable HTML role must enumerate admitted surfaces rather than scan generic `src` and `href` text.

At minimum the browser-relevant surface includes:

| Surface | Examples | Important distinctions |
|---|---|---|
| Scripts | `<script src>`, module scripts, inline modules | classic/module graph, credentials, referrer, integrity, nonce, async/defer |
| Styles | `<link rel=stylesheet href>`, inline `<style>` | stylesheet URL becomes CSS base; media/disabled/crossorigin/integrity |
| Images | `img[src]`, `img[srcset]`, `source[srcset]`, posters | candidate parsing and density/width selection; not one URL string |
| Hints | preload, modulepreload, prefetch, preconnect, dns-prefetch | fetch destination, credentials, integrity, `as`, module graph behavior |
| Icons/manifests | icon links, web app manifest | deployment and metadata semantics differ from ordinary assets |
| Media/tracks | audio/video/source/track | multiple source candidates and media selection |
| Embedded content | iframe/object/embed | nested browsing contexts and plugin/document semantics |
| Runtime insertion | DOM-created script/link/img/etc. | open-ended program behavior, generally undiscoverable statically |

The fact that a generated HTML file contains one script and one stylesheet does not prove preservation of these other surfaces.

## 3. JavaScript module graphs

**[UPSTREAM-DIRECT S-003]** HTML module-script processing fetches a module and then its descendants. Static `import` and `export ... from` requests are source-level module requests. ECMAScript defines `import(expression)` by evaluating the expression at runtime, converting it to a string, and asking the host to load that specifier. Literal dynamic imports are often statically recognized by bundlers; computed dynamic imports are not generally closed source graphs.

A browser module graph can include:

- nested static imports;
- shared dependencies across entries;
- split chunks loaded only after a dynamic import;
- CSS/assets interpreted by provider loaders rather than ECMAScript;
- bare specifiers affected by import maps or provider resolution;
- externalized imports left for the browser/host;
- `import.meta.url` observations that change when output paths change.

A portable role may require provider-declared closure for emitted edges. It cannot infer all runtime import requests from syntax alone.

## 4. Import maps

**[UPSTREAM-DIRECT S-004]** Import maps normalize keys and addresses against a base URL, support scopes and integrity metadata, and are merged under rules affected by module resolution state. Relocating or rewriting an import map can change bare-specifier and scope matching. Copying an import-map text block while independently rewriting surrounding module URLs is not automatically semantics-preserving.

For a first portable module-payload role, an import map should be either:

1. entirely outside the role and owned by the consumer host document;
2. a provider-native feature with provider-native observations; or
3. admitted by a future HTML role only after base, scopes, integrity, and merge behavior are specified.

## 5. CSS graph and URL bases

**[UPSTREAM-DIRECT S-005]** Relative URLs in an external stylesheet resolve against the stylesheet’s own URL. Embedded CSS resolves using its container-associated base. `@import` recursively adds stylesheets, and `url()` appears in far more places than background images: fonts, cursors, masks, filters, list markers, generated content, SVG references, image sets, and other properties.

A complete CSS closure proof therefore needs provider metadata or a standards-aware CSS pipeline that handles at least:

- recursive `@import` ordering and media/supports/layer conditions;
- quoted/unquoted/escaped URLs;
- `data:`, `blob:`, absolute, protocol-relative, root-relative, path-relative, query-only, and fragment-only references;
- fragment-bearing SVG references that may not be separate fetches;
- emitted asset hashing/renaming and stylesheet relocation;
- source-map annotations in CSS.

## 6. Workers and service workers

**[UPSTREAM-DIRECT S-006]** Worker and SharedWorker constructors resolve script URLs through worker-constructor algorithms and may create classic or module graphs. Service-worker registration parses script and scope URLs against the relevant API base, then applies same-origin, secure-context, path, update, and scope rules. Deployment headers such as `Service-Worker-Allowed` can alter effective scope.

Workers are not safely implicit assets in a generic module-output set. A provider may recognize conventions such as `new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })`, but that recognition is a build-tool convention. Service workers additionally need deployment policy and should remain provider-native or have a dedicated role.

## 7. WebAssembly

**[UPSTREAM-DIRECT S-007]** WebAssembly bytes can be obtained by ordinary `fetch`, streaming compilation/instantiation, provider loader imports, generated glue, data URLs, or runtime-computed URLs. Streaming APIs require response and MIME properties. The JavaScript and Web APIs do not define a universal build-time asset convention.

A WASM file is in a portable payload only when the provider declares it as an emitted asset/edge under the role. Otherwise its loading convention remains provider-native or application runtime behavior.

## 8. Remote, data, and blob URLs

**[UPSTREAM-DIRECT S-008]** Absolute HTTP(S) and protocol-relative URLs normally resolve outside the local output tree unless a provider intentionally vendors them. `data:` URLs embed payloads in the URL. `blob:` URLs identify entries in a runtime blob URL store and do not name build-tree files.

A local-tree closure validator must not convert these into filesystem paths. Vendoring is a separate, explicit policy because it changes caching, origin, credentials, integrity, and availability semantics.

## 9. Query strings and fragments

**[UPSTREAM-DIRECT S-009]** The URL Standard models path, query, and fragment as distinct components. Queries can select different bytes and participate in request/module identity and caching. Fragments can affect navigation or resource interpretation and may not denote a separate network fetch.

Therefore a validator that strips `?` and `#` before checking a file can answer only “the path component names a file.” It cannot prove that the original URL retains request identity or semantics.

## 10. Source maps

**[UPSTREAM-DIRECT S-010]** ECMA-426 defines linked and inline source maps, `sourceMappingURL`, `sourceRoot`, `sources`, optional `sourcesContent`, and URL resolution relative to generated code. A `.map` file may exist without being linked; a linked map may be inline, supplied by a response header, or reference original sources outside the deployment tree.

Portable output should treat source maps as optional observations with explicit generated-output association. It should not treat “a `.map` extension exists” as a complete map contract.

## 11. Minification, CSP, and SRI

**[UPSTREAM-DIRECT S-011]** Subresource Integrity checks response bytes against cryptographic metadata. Content Security Policy may authorize scripts/styles by source expression, nonce, or hash and may reject generated forms such as inline code or eval-like constructs. Any post-provider byte rewrite can invalidate SRI or hash-based CSP; injected markup can require new nonce/hash/source policy.

Minification also changes observable source text, names, stack traces, evaluation order in incorrect programs, and source-map topology. A portable role may promise profile-level behavior, but not identical minifier output.

## 12. Bun survey

**[UPSTREAM-DIRECT B-001]** Bun’s official bundler surface supports browser targets, multiple entrypoints, splitting, minification, source maps, naming, `publicPath`, plugins, loaders, output files, and metafiles. Its declarations expose output kinds and relations such as entry point/chunk/asset/sourcemap, paths, hashes, and source-map linkage; its metafile records input/output imports, output entry points, and associated CSS bundles.

**[UPSTREAM-DIRECT B-002]** Bun’s HTML bundling is a finite, documented transform rather than the entire HTML fetch model. The official documentation enumerates recognized selectors such as script sources, stylesheet links, images/`srcset`, selected preload-like links, media, icons, manifests, and posters. It documents JavaScript/CSS bundling, CSS `@import`/`url()` processing, asset hashing/copying, preservation of HTTP(S) URLs, and `publicPath` behavior.

**[INFERENCE B-003]** Bun appears capable of supporting a rich `BrowserModulePayload` observation through `BuildArtifact` and metafile data. That does not establish every edge required by a strict HTML-entry profile; each admitted HTML surface still needs versioned proof.

Observed upstream source pin for declarations: Bun `main` at `1dd66afde213732c645c60ac08cf68f1087a271d`.

## 13. Deno survey

**[UPSTREAM-DIRECT D-001]** Deno documents `deno bundle` as experimental and powered by esbuild. Current documentation covers browser targeting, CSS, minification, source maps, code splitting, and HTML entrypoints. For HTML entrypoints, Deno says it finds script references, bundles their dependencies, updates script paths, and injects CSS imported by those scripts. It recommends the feature for small static applications and points complex projects to tools such as Vite.

**[UPSTREAM-DIRECT D-002]** The reviewed `Deno.bundle()` API can return in-memory output files with `path`, `contents`, `hash`, and `text`, plus success/errors/warnings. The reviewed public API does not expose Bun-like output kind, entrypoint association, import-edge, or `cssBundle` fields.

**[UNKNOWN D-003]** No official Deno option equivalent to Bun’s broadly documented `publicPath` or Vite’s `base` was established in the reviewed current bundling documentation. This is unknown, not proof of absence from source, flags, future versions, or narrower modes.

**[INFERENCE D-004]** A Deno portable adapter must derive entry/style associations only from official structured behavior that is proven for the admitted request, or reject ambiguity. Extension-only guessing is insufficient for multiple entries and shared chunks.

Observed upstream source pin: Deno `main` at `89f33cbef296a2b287f323d42de54c871fa69c77`.

## 14. Esbuild and Vite as boundary comparators

**[UPSTREAM-DIRECT E-001]** Esbuild supports explicit entrypoints, splitting, `publicPath`, source maps, in-memory output, and a metafile with output imports, external flags, entrypoint association, and CSS bundle association. It is a JavaScript/CSS bundler rather than a standards-complete browser application framework; HTML integration is normally caller/plugin/framework territory.

**[UPSTREAM-DIRECT V-001]** Vite’s official documentation covers HTML entry processing, imported assets, CSS URLs, public directories, worker conventions, `new URL(..., import.meta.url)`, static-analysis limits, and base-path rewriting across HTML/CSS/JavaScript. It requires conventions and plugins for framework-specific templates and notes cases where dynamically constructed URLs cannot be transformed.

**[INFERENCE V-002]** Vite demonstrates the engineering surface hidden by the phrase “general browser application”: public-directory policy, HTML transformation, worker recognition, framework transforms, asset-query syntax, SSR distinctions, and public-base rewriting. Recreating these neutrally inside `effect-build` would create a frontend build system, not a thin role adapter.

## 15. Common semantic center

**[INFERENCE S-012]** The common portable center is not “all resources an HTML application can load.” It is “a provider-produced browser module payload with explicit entry observations and a bounded provider-declared closure.” Bun can expose richer metadata through provider-native observations; the portable interface must not force Deno to synthesize precision it cannot prove.

**[PROPOSAL S-013]** A future HTML-entry role is valid only if it defines a small admitted source language, delegates transformation to providers, and has scenario-specific browser oracles. “HTML + JS + CSS exist and regex-matched paths resolve” is not an application equivalence law.
