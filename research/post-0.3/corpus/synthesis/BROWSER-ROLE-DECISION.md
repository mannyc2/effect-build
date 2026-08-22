# Browser role decision

## Decision

Withdraw `BrowserModuleApplication` as an accepted portable profile.

The strongest positive receipt covers one script-rooted CSS fixture. The broad HTML fixture already found a provider difference for top-level linked CSS. The later browser probe copied fixture-specific files, injected markup, and exercised the normalized result; it did not demonstrate a general provider substitution law.

Retain **`BrowserModulePayload`** as the strongest semantic candidate, not as a demonstrated contract.

## Candidate role

```text
explicit browser-module entries
  -> provider-owned graph construction and rewriting
  -> provider-declared entry/style/chunk/asset associations
  -> adapter validates a contained output snapshot
  -> one borrowed browser module payload
```

The caller owns the host HTML. The role does not claim to discover or transform a whole web application.

## Substitution law

For an admitted set of explicit module entries, replacing one conforming provider with another may change bytes, filenames, chunk topology, request count, minifier details, source maps, and provider metadata. It must preserve:

1. one unambiguous loadable output association for every requested entry;
2. complete internal edges relative to an explicit, versioned provider metadata contract;
3. complete associated CSS/chunk/asset observations required by the admitted role;
4. filesystem containment and successful browser URL resolution under the declared same-origin relative mount, treated as separate checks;
5. an explicit external policy with no silent vendoring or unresolved bare imports;
6. mandatory media type information required by the test host;
7. scenario-specific behavioral oracles restricted to defined portable observations;
8. the borrowed lifetime, mutation, and cleanup law.

If a provider cannot prove entry association or closure, it does not conform to this profile. “Unknown” must not be represented as an empty list.

## Provider/core responsibilities

Provider adapters own:

- source graph discovery;
- resolution, loaders, plugins, and transforms;
- URL rewriting performed by the provider;
- entry/style/chunk/asset association derived from an official structured provider contract;
- native diagnostics and all official metadata returned by the operation.

Portable core may validate:

- unique normalized relative paths;
- root containment and absence of escaping links;
- internal consistency of entry/output associations established by the adapter from official structured evidence;
- media types;
- frozen manifest/digest observations;
- declared internal edges;
- lifetime and mutation.

Portable core must not turn regexes, extensions, directory names, first-file selection, or an independent partial parser into graph authority.

## First profile cuts

The exact v1 request is not ready to freeze. A defensible closed first role would likely require:

- explicit JavaScript/TypeScript module entries;
- same-origin relative colocated serving;
- no caller HTML transformation;
- no root-relative public-base policy;
- no import maps;
- no bare external specifiers unless an explicit consumer import-map contract is added;
- no service workers;
- no runtime-computed closure claim;
- source maps and minification either removed from v1 or modeled as explicit supported capability variants.

These are deliberate public compatibility cuts, not evidence that richer browser products are invalid.

## Separate concerns

Do not fold the following into optional fields on `BrowserModulePayload`:

- **`HtmlModuleGraphBuild`** — a possible later role with a finite admitted HTML language and provider-owned generated HTML;
- **explicit static-resource copy** — a caller-enumerated composition pattern with collision/containment ledger, never called discovery and not yet justified as a public primitive;
- workers, service workers, WASM, framework assets, and public directories;
- deployment/publication;
- provider-native HTML, plugin, HMR, watch, and manifest behavior.

## Ownership

The honest common result is:

> One completed provider build lends one isolated, validated output snapshot for one continuation; it publishes nothing.

The adapter may promise private staging, completion before lending, containment, a frozen observation, and scope-owned authoritative operations—or another enforceable revocable capability—plus best-effort cleanup with an explicit cleanup failure policy. A retainable raw path is not revocable authority.

It cannot promise:

- that no partial writes occurred inside staging;
- a durable returned directory;
- atomic replacement of a live non-empty tree across supported platforms;
- rollback of provider direct writes;
- cleanup success under every host failure.

Cleanup failure may leave physical files, but it never turns the operation into durable success.

Durable deployment is a separate platform protocol, preferably immutable version directories plus a single explicit pointer/manifest switch whose semantics are owned by that deployment target.

## Why a general neutral discovery algorithm is rejected

A finite parser/rewriter for a declared source language is possible. General web-application discovery is not: base URLs, import maps, CSS-specific bases, runtime URL construction, workers, service-worker scope, CSP/SRI, framework plugins, and deployment headers extend beyond a closed static file graph.

Owning all of those semantics would turn effect-build into a frontend framework while still failing to enumerate open-ended runtime behavior.

## Evidence status and gates

Status: `semantically-proposed`.

The decisive unresolved question is whether supported Deno APIs can provide authoritative entry, CSS, chunk, asset, and edge associations without filename guessing. If not, either:

- Deno does not implement this profile;
- a distinctly weaker output-set role is named and specified; or
- the role is withdrawn.

Before `portable-demonstrated`, construct an adversarial matrix covering multiple entries, shared/lazy chunks, nested CSS/import/assets/fonts, absolute and relative URLs, queries/fragments, externals, source maps, media types, interruption, partial writes, containment, mutation, and at least the approved browser-engine matrix. No fixture-specific normalization may occur inside the proof.

The matrix must pin exact provider versions, negotiate profile protocol/capabilities before provider work, and reject unsupported association metadata fail-closed. No browser public export is authorized while the governing workspace instruction retains one public operation, `compileExecutable`, unless the maintainer explicitly supersedes it. The different historical instruction at the live PR head must be reconciled rather than silently treated as current authority.
