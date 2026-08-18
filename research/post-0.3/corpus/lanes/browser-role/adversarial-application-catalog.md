# Adversarial application catalog

Each application is a falsifier, not merely a coverage suggestion. A candidate claiming the scenario must define an oracle that distinguishes semantic preservation from file presence. “Reject” is a valid conforming outcome when the scenario is outside the admitted source language.

## A. HTML, document base, and top-level resources

| ID | Adversarial application | Candidate threatened | Required falsifier/oracle |
|---|---|---|---|
| H-01 | `<base href="/nested/">` before module script | General HTML role | Generated URLs resolve to same parsed targets or role rejects `<base>`. |
| H-02 | Two `<base href>` elements | General HTML role | First-in-tree semantics preserved; no last/regex choice. |
| H-03 | Root-relative module script `/assets/app.js` | Relative portable role | Reject or prove origin-root deployment contract. |
| H-04 | Top-level linked CSS not imported by JS | BrowserModuleApplication | Both providers preserve/rewrite it, or strict role excludes it. Existing receipt falsifies broad admission. |
| H-05 | Two stylesheets with media/integrity/crossorigin | HTML role | Order and attributes preserved; resources load under policy. |
| H-06 | Inline `<style>` with relative `url()` | HTML role | Container base and rewrite preserved. |
| H-07 | `img[src]` beside HTML | HTML role | Asset emitted and URL target preserved. |
| H-08 | `img[srcset]` with width and density candidates | HTML role | Candidate list parsed/re-written without corruption; selected image works. |
| H-09 | `<picture><source srcset media/type>` | HTML role | Selection behavior and candidate URLs preserved. |
| H-10 | `<link rel=preload as=font crossorigin>` | HTML role | Hint remains correct and does not create credential mismatch/double fetch. |
| H-11 | `<link rel=modulepreload>` for dependency graph | HTML role | Module credentials/integrity/graph semantics preserved. |
| H-12 | Icon, manifest, poster, track, media source | General HTML role | Every admitted selector preserved or rejected explicitly. |
| H-13 | Inline module plus external module | HTML role | Inline code/base/import map/order preserved or excluded. |
| H-14 | Two HTML entries sharing assets | HTML role | Requested entry maps to correct returned HTML; no “first `.html`” ambiguity. |
| H-15 | HTML filename not `index.html` and nested directory | Fixture-specific probe | No hardcoded index/output-root assumption. |
| H-16 | Local resource outside conventional `assets/` | Copy normalizer | Discovery cannot depend on copying one directory. |
| H-17 | Unused secret file inside `assets/` | Copy normalizer | It is not copied unless caller/provider explicitly declares it. |
| H-18 | Destination collision with injected `top.css` | V2-like normalizer | Collision rejected; no silent overwrite. |

## B. JavaScript modules, splitting, and import maps

| ID | Adversarial application | Candidate threatened | Required falsifier/oracle |
|---|---|---|---|
| J-01 | Nested static imports three levels deep | Module payload | All provider-declared internal edges contained and runtime result succeeds. |
| J-02 | Re-export-only dependency | Module payload | Edge is not lost because module has no direct runtime statement. |
| J-03 | Literal dynamic import loaded after user action | Module payload | Lazy chunk declared, contained, and loads after action. |
| J-04 | Computed import ``import(`./locale/${x}.js`)`` | Closed application | Reject/declare external/provider context; never claim universal closure. |
| J-05 | Dynamic import with query `./x.js?raw` | URL contract | Query semantics preserved; not reduced to `x.js`. |
| J-06 | Dynamic import with fragment | URL contract | Fragment handling matches provider/browser semantics. |
| J-07 | Two entries share one chunk | Output set | Entry/chunk associations remain correct; topology may differ. |
| J-08 | Entry A has CSS, entry B has none | Output set | Styles associated per entry, not all CSS attached to all entries. |
| J-09 | Same basename in separate source directories | Output tree | No output collision/incorrect association. |
| J-10 | External bare import | Module payload | Edge marked external and behavior governed by consumer/import map. |
| J-11 | Import map maps bare specifier to local path | HTML role | Base, map normalization, and module resolution preserved. |
| J-12 | Scoped import-map entries | HTML role | Scope matching preserved after relocation. |
| J-13 | Import-map integrity entry | HTML role | Integrity remains valid or role rejects rewrite. |
| J-14 | Multiple import maps/late map | HTML role | Merge/timing behavior preserved or excluded. |
| J-15 | `import.meta.url` displayed to user | Broad substitution | Candidate must exclude exact URL equality or define it. |
| J-16 | `new URL("./img.png", import.meta.url)` | Module payload | Provider declares asset edge/transform, or closure rejects it. |
| J-17 | `new URL(variable, import.meta.url)` | General discovery | Runtime-computed URL outside closure. |
| J-18 | Module fetch from remote HTTPS URL | Module payload | Remains external unless explicit vendoring policy. |
| J-19 | Cyclic modules with top-level await | Behavioral law | Readiness/result preserved despite topology differences. |
| J-20 | Side-effect order sensitive to incorrect splitting | Behavioral law | Correct program result preserved; provider bug falsifies conformance. |

## C. CSS and assets

| ID | Adversarial application | Candidate threatened | Required falsifier/oracle |
|---|---|---|---|
| C-01 | CSS imports another stylesheet | Module payload/HTML | Recursive edge declared and emitted; cascade/order works. |
| C-02 | Nested `@import` with media/layer/supports | CSS graph | Conditions and ordering preserved. |
| C-03 | CSS `url()` to font | Module payload | Font emitted/rewritten and browser loads with correct MIME/CORS. |
| C-04 | CSS `url()` to cursor/mask/filter | CSS scanner | Non-background URL property is not missed. |
| C-05 | CSS `image-set()` candidates | CSS scanner | All candidates preserved/rewritten. |
| C-06 | Quoted, unquoted, escaped URL tokens | CSS scanner | Standards parser behavior, not regex substitution. |
| C-07 | External stylesheet with `../asset.png` | URL base | Resolves relative to emitted stylesheet URL. |
| C-08 | Inline style with same spelling | URL base | Resolves relative to document/container, not external CSS base. |
| C-09 | `url(data:image/...)` | Local closure | Preserved inline; not filesystem-resolved. |
| C-10 | `url(https://cdn.example/x)` | External policy | Preserved external; no silent vendoring. |
| C-11 | `url(/root.png)` | Relative profile | Rejected or public-root contract proven. |
| C-12 | `url(icon.svg#check)` | Query/fragment | File target and fragment semantics preserved. |
| C-13 | `url(#filter)` fragment-only | Closure scanner | Not falsely required as missing file. |
| C-14 | Asset query selects provider loader mode | Portable role | Provider-native convention retained; common role only observes declared output. |
| C-15 | Asset name differs only by case | Cross-platform tree | Collision detected for destination platform. |

## D. Workers, service workers, worklets, and WASM

| ID | Adversarial application | Candidate threatened | Required falsifier/oracle |
|---|---|---|---|
| W-01 | Module worker via `new Worker(new URL(...))` | General module app | Worker entry/graph/URL association proven or excluded. |
| W-02 | Classic worker with `importScripts()` | Worker role | Nested classic imports and origin policy handled. |
| W-03 | SharedWorker | Worker role | Shared-worker URL/type/runtime oracle. |
| W-04 | Worklet module | General app | Dedicated runtime/global/loading semantics admitted or excluded. |
| W-05 | Service worker with default scope | Browser app | Secure context, origin, script URL, scope, update behavior. |
| W-06 | Service worker requesting wider scope | Browser app | `Service-Worker-Allowed` header/deployment contract. |
| W-07 | Service worker precache manifest with hashed chunks | Publication role | Manifest matches final tree and commit ordering. |
| W-08 | WASM imported by provider loader | Module payload | Provider declares asset/glue; correct MIME and runtime result. |
| W-09 | `fetch(new URL("x.wasm", import.meta.url))` | Module payload | Provider-declared transform or runtime exclusion. |
| W-10 | Runtime-computed WASM URL | Closed graph | Reject closure claim. |
| W-11 | `instantiateStreaming` served as wrong MIME | File-presence oracle | Browser oracle must include MIME failure. |

## E. URL classes, mount, and remote behavior

| ID | Adversarial application | Candidate threatened | Required falsifier/oracle |
|---|---|---|---|
| U-01 | Application served under `/app/v2/` | Relative/public-base law | Every internal edge loads under admitted mount. |
| U-02 | Assets served from separate CDN origin | Portable v1 | Reject or dedicated cross-origin/public-base profile. |
| U-03 | Protocol-relative URL | Filesystem validator | Remains external and scheme-relative. |
| U-04 | `data:` module/asset URL | Tree closure | No nonexistent output member required. |
| U-05 | Runtime `blob:` module/worker URL | Tree closure | Recognized as runtime blob-store behavior. |
| U-06 | Same path with two queries returns different bytes | Query stripping | Validator/oracle preserves distinct request identity. |
| U-07 | Fragment-only SVG reference | Fragment stripping | No false missing-file or extra fetch claim. |
| U-08 | Redirected external resource | General application | Deployment/network semantics outside local-tree closure. |
| U-09 | Remote resource requiring credentials/CORS | General application | External semantics and policy not normalized away. |
| U-10 | URL containing percent-encoding and dot segments | Path normalization | URL parsing precedes filesystem mapping; no traversal/collision. |

## F. Source maps, minification, CSP, SRI, and policy

| ID | Adversarial application | Candidate threatened | Required falsifier/oracle |
|---|---|---|---|
| P-01 | External linked JS source map | Source-map claim | Annotation points to correct returned map. |
| P-02 | Inline source map | `.map` extension oracle | Correctly observed despite no `.map` file. |
| P-03 | Source map via response header | Output-only claim | Requires server/header profile or is provider-native. |
| P-04 | Map with `sourceRoot` and external sources | Local closure | Original sources need not be output members; observation remains honest. |
| P-05 | CSS source map | JS-only map check | Associated and parsed or excluded. |
| P-06 | Minified code reads function name/source | Broad behavior | Candidate excludes exact source/name equality or provider divergence falsifies stronger law. |
| P-07 | CSP blocks inline injected script/style | V2-like normalizer | Browser oracle serves policy and treats violation as failure. |
| P-08 | CSP nonce on original script | HTML rewriting | Nonce preservation and generated elements policy defined. |
| P-09 | CSP hash for inline module | HTML rewriting | Byte changes invalidate hash; reject/recompute explicitly. |
| P-10 | SRI on external/local script | URL/byte rewrite | Integrity preserved or recomputed under authority. |
| P-11 | SRI on modulepreload and stylesheet | HTML role | All integrity-bearing edges handled. |
| P-12 | Crossorigin/credentials mismatch after rewrite | File existence | Browser fetch succeeds under real credentials/CORS. |

## G. Output ownership, manifests, and publication

| ID | Adversarial application | Candidate threatened | Required falsifier/oracle |
|---|---|---|---|
| O-01 | Provider fails after writing one chunk | Atomic build claim | Failure returns no success tree; partial staging cleaned/reported. |
| O-02 | Fiber interrupted during in-process provider build | Cancellation claim | Honest wait/cancellation and partial-write semantics. |
| O-03 | Child process terminated after partial output | Command role | Prior writes acknowledged; staging cleanup. |
| O-04 | Reused output directory contains stale chunk | Closure | Fresh staging or generation-aware manifest excludes stale file. |
| O-05 | Output symlink escapes root | Borrowed tree | Reject before lending/copying. |
| O-06 | Provider emits `../escape.js` | Containment | Reject normalized escape. |
| O-07 | Case-fold collision on Windows/macOS | Portable tree | Destination-aware collision rejection. |
| O-08 | Caller mutates borrowed file during callback | Snapshot law | Mutation detected or operations define point-in-time behavior. |
| O-09 | Raw path retained after callback | Borrowed ownership | Closure-owned operation fails after release; no durable promise. |
| O-10 | Cleanup fails due open handle | Cleanup guarantee | Typed cleanup failure; no false removal claim. |
| O-11 | Publish across filesystems | Atomic rename | Reject atomic claim or copy+verify+platform commit. |
| O-12 | Replace existing non-empty directory | Directory transaction | No universal atomic replacement claim. |
| O-13 | Reader sees mixed in-place deployment | Durable publication | Versioned immutable tree plus pointer, not in-place mutation. |
| O-14 | Provider manifest omits asset relation | Portable projection | Retain native metadata; reject common closure if proof insufficient. |
| O-15 | Provider generates multiple HTML files | First-extension selection | Requested-entry association required. |
| O-16 | Provider output manifest and bytes disagree | Observation | Adapter validates files/digests or rejects. |
| O-17 | Public-directory file shadows emitted chunk | Composition | Collision rejected with source/provenance ledger. |
| O-18 | Source map written after manifest snapshot | Snapshot | Provider completion required; mutation detected. |

## Candidate-specific kill sets

| Candidate | Smallest decisive falsifier set |
|---|---|
| Broad `BrowserModuleApplication` | H-01, H-04, H-08, J-11, W-05, P-07, O-15. |
| Unrefined `BrowserModuleOutputSet` | J-07, J-08, J-03, O-14. |
| `BrowserModulePayload` | J-01, J-03, J-07, C-01, C-03, O-01, O-05, plus a consumer readiness result. |
| Strict `HtmlModuleGraphBuild` | H-14 and every construct admitted by its source language; reject excluded constructs deterministically. |
| Durable portable directory artifact | O-01, O-10, O-11, O-12, O-13. |
| Provider-native only | Not falsified by feature divergence; product decision is whether Candidate C’s portable center is worth exposing. |
