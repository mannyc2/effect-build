# URL rewrite contract

## 1. Default rule: no portable-core rewriting

**[PROPOSAL URL-001]** `BrowserModulePayload` should not rewrite source or emitted HTML/CSS/JavaScript. Each provider owns transformations performed by its supported build mode. The adapter records output relations, validates containment, and exposes observations. A separately named HTML composition role may rewrite only under an explicit contract and ledger.

## 2. Resolution contexts

A rewrite engine must first identify the standards context; it cannot start with filesystem resolution.

| Context | Base or resolution authority | Why it matters |
|---|---|---|
| HTML element URL | document base URL, including first `<base href>` | source and output document locations may differ |
| Inline CSS | container-associated base | differs from a copied external stylesheet |
| External CSS | stylesheet response URL | moving/renaming CSS changes relative `url()` interpretation |
| Static module import | module URL plus module resolution/import-map rules | not document-relative after module fetch |
| Dynamic import | runtime-evaluated specifier and host module loader | computed values may be undiscoverable |
| Import-map keys/addresses | import-map base plus scope/merge rules | relocation can change normalization and matching |
| Worker URL | constructor/base algorithm | may create separate classic/module graph |
| Service-worker script/scope | API base plus origin/path/header rules | deployment policy is part of semantics |
| `new URL(x, import.meta.url)` | emitted module URL at runtime | hashed/relocated module paths are observable |
| Source-map annotation | generated resource URL/header | `.map` existence alone is insufficient |

**[INFERENCE URL-002]** A filesystem existence check is useful only after correct URL classification and mapping. It cannot determine browser URL semantics.

## 3. URL class table

| Original form | Portable disposition | Rewrite rule |
|---|---|---|
| `https://host/x` | External | Preserve parsed URL unless explicit vendoring operation. |
| `http://host/x` | External | Same. |
| `//host/x` | External | Preserve scheme-relative semantics; do not treat as absolute filesystem path. |
| `data:...` | Inline URL | Preserve exactly unless provider owns transformation. |
| `blob:...` | Runtime | Never map to output file. |
| `/assets/x.js` | Rejected in relative v1 | Requires origin-root/public-base contract. |
| `./x.js`, `../x.js` | Internal only when declared | Resolve in correct browser context; rewrite only by provider/explicit composer. |
| `?v=2` | Contextual | Preserve query identity; do not strip before mapping. |
| `#icon` | Contextual | Preserve fragment; may refer within same resource and not trigger new fetch. |
| `x.svg#icon` | Internal plus fragment if declared | Target path and fragment are separate semantic components. |
| bare module specifier | External/import-map/provider resolved | Never apply filesystem path logic without module-resolution evidence. |

**[PROPOSAL URL-003]** Resolve or classify the original URL string under its standards-defined context before deciding whether it maps to an output member. Never strip query/fragment text, ignore `<base>`, or call a filesystem resolver first.

## 4. Public base paths

Build tools offer different `publicPath`/`base` features and different coverage over HTML, JS chunks, CSS URLs, assets, and runtime helpers. A common string option would be dishonest unless the role specifies every affected edge.

**[PROPOSAL URL-004]** Portable v1 should require relative, colocated serving:

- returned tree mounted as one same-origin directory subtree;
- consumer host built from returned relative observations;
- no root-relative internal URLs;
- no guarantee under arbitrary CDN prefix, rewritten document base, or separate asset origin;
- correct MIME types supplied by the consumer server.

Provider-native APIs retain richer public-path/base capabilities. A future portable public-base profile needs a separate compatibility matrix and adversarial proof.

## 5. Explicit rewrite ledger

**[PROPOSAL URL-005]** Any library-owned rewrite operation should return a complete ledger:

```ts
interface UrlRewriteObservation {
  readonly sourceDocument: RelativeOutputPath
  readonly syntax: "html-attribute" | "srcset-candidate" | "css-url" |
    "css-import" | "import-map-address" | "source-map-annotation"
  readonly location: { readonly line?: number; readonly column?: number }
  readonly rawBefore: string
  readonly parsedBefore: string
  readonly baseBefore: string
  readonly rawAfter: string
  readonly parsedAfter: string
  readonly baseAfter: string
  readonly target?: RelativeOutputPath
  readonly query?: string
  readonly fragment?: string
  readonly integrityDisposition?: "preserved" | "recomputed" | "removed" | "not-present"
}
```

A rewrite is allowed only when the operation can prove equivalent parsed target semantics under the output base and has an explicit CSP/SRI policy. Unknown syntax or policy causes rejection, not pass-through plus a closure claim.

## 6. Internal-edge requirements

**[PROPOSAL URL-006]** For each provider-declared internal edge, the adapter should require:

1. a normalized relative source member;
2. a raw specifier/URL and edge kind;
3. a normalized contained target member, except when the edge is intentionally fragment-only;
4. preservation of query and fragment components;
5. no target collision after platform path normalization;
6. no symlink/reparse-point escape;
7. exact bytes preserved after the final manifest snapshot;
8. correct consumer MIME mapping for executable/resource types in the browser oracle.

Unresolved declared internal edges are build-result failures. Unobserved runtime edges are outside the closure and must not be described as included.

## 7. CSP and SRI

A browser can make zero 404 requests and still reject the application due to policy. Injecting inline code, changing bytes, modifying a script URL, or adding a stylesheet can invalidate policy.

**[INFERENCE URL-007]** “No failed local requests” is not an application proof under CSP. A scenario claiming policy compatibility must serve the intended headers/meta policy and treat policy violations as failures.

Policy choices for an explicit composer:

- `preserve-and-reject`: do not rewrite integrity-bearing resources or hash-sensitive inline content;
- `recompute`: recompute SRI/hash policy only with explicit algorithm and authority;
- `remove`: generally not portable because it weakens policy; require a separately named unsafe/provider-native option;
- `provider-owned`: return provider-generated HTML and policy metadata unchanged.

Portable v1 should choose `provider-owned`/no rewriting.

## 8. Source-map observations

**[PROPOSAL URL-008]** Common observations may include:

```ts
interface SourceMapObservation {
  readonly generated: RelativeOutputPath
  readonly mode: "linked-file" | "inline" | "response-header" | "provider-other"
  readonly map?: RelativeOutputPath
  readonly annotation?: string
  readonly sourcesEscapingOutputTree: boolean
}
```

The profile does not require original sources to be deployment members. It requires honesty about whether a generated file is linked to a map and whether the association is portable.

## 9. Example classifications

### Example A: CSS with query and fragment

```css
.mask { mask-image: url("../icons.svg?v=2#check") }
```

The path, query, and fragment must remain distinguishable. A provider may emit `icons-ABC.svg?v=2#check`; a core validator may verify the declared target path `icons-ABC.svg`, but must not call the original equivalent merely because `icons.svg` exists after stripping suffixes.

### Example B: document base

```html
<base href="https://cdn.example/app/">
<script type="module" src="./entry.js"></script>
```

`entry.js` is remote under the document base. Copying it beside `index.html` does not make the original reference local.

### Example C: computed dynamic import

```js
await import(`./locale/${navigator.language}.js`)
```

A provider may support a glob transform, emit a context map, externalize it, or fail. The portable role includes it only when the provider declares a finite emitted edge set under a provider-native convention; otherwise the closure claim rejects it.

### Example D: service worker

```js
navigator.serviceWorker.register("./sw.js", { scope: "/" })
```

A local `sw.js` file is not enough. Origin, secure context, path, registration base, scope, and `Service-Worker-Allowed` policy matter. It remains provider-native or a dedicated deployment role.

## 10. Conclusion

**[INFERENCE URL-009]** URL rewriting is too cross-cutting to be an implicit portable-core responsibility. Provider-native transforms are authoritative. Any library-owned HTML composition must be explicit, policy-aware, fully ledgered, and narrower than a general frontend framework.
