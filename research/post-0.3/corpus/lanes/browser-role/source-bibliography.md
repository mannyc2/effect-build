# Source bibliography

Retrieval cutoff: `2026-08-17T15:53:21Z`. Repository sources are pinned to the observed commit where possible. Upstream living standards and documentation are identified by canonical official URLs and retrieval date. No third-party blog or leaked/private material was used.

The `Source ID` values are referenced by `evidence-ledger.json`.

## A. Live GitHub repository and PR evidence (`GITHUB-DIRECT`)

| Source ID | Source | Pin / use |
|---|---|---|
| GH-REF-HEAD | https://api.github.com/repos/mannyc2/effect-build/git/ref/heads/codex/post-0.3-native-capability-architecture | Live research ref; observed SHA `96e53a27be4ef96fb47f1a745480e0c5382640f2`. |
| GH-REF-BASE | https://api.github.com/repos/mannyc2/effect-build/git/ref/heads/codex/granular-integration-program | Live base ref; observed SHA `15c811bb9904142a33d119766b62082f3c689f13`. |
| GH-PR-4 | https://api.github.com/repos/mannyc2/effect-build/pulls/4 | PR state, head/base, title, draft status, and body-declared earlier “final research head.” |
| GH-COMMIT-HEAD | https://api.github.com/repos/mannyc2/effect-build/commits/96e53a27be4ef96fb47f1a745480e0c5382640f2 | Head commit/tree/parent/message/time. |
| GH-TREE-HEAD | https://api.github.com/repos/mannyc2/effect-build/git/trees/96e53a27be4ef96fb47f1a745480e0c5382640f2?recursive=1 | Complete observed tree and browser-research path inventory. |
| GH-COMPARE | https://api.github.com/repos/mannyc2/effect-build/compare/15c811bb9904142a33d119766b62082f3c689f13...96e53a27be4ef96fb47f1a745480e0c5382640f2 | Base/head relationship and change context. |
| GH-PR-FILES | https://api.github.com/repos/mannyc2/effect-build/pulls/4/files?per_page=100 | Changed-file inventory; 74 filenames observed through the GitHub plugin. |
| GH-WORKFLOW-SOURCE | https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/.github/workflows/architecture-research.yml | Workflow steps and which probes/certifiers are invoked. |
| GH-RUN-118 | https://api.github.com/repos/mannyc2/effect-build/actions/runs/31990684158 | Latest PR workflow run at observed head; completed/failure. |
| GH-JOBS-118 | https://api.github.com/repos/mannyc2/effect-build/actions/runs/31990684158/jobs?per_page=100 | Typecheck failure and skipped later steps. |
| GH-RUN-48 | https://api.github.com/repos/mannyc2/effect-build/actions/runs/31971767617 | Last successful architecture run used for downloaded receipts; source SHA `9b0d2f5...`. |
| GH-ARTIFACT-RECEIPTS | https://api.github.com/repos/mannyc2/effect-build/actions/artifacts/9269991589 | Receipt artifact metadata, size, and GitHub SHA-256 digest. |
| GH-PROBE-REFINEMENT | https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/research/post-0.3/profile-refinement-probe.mjs | Hardcoded module/HTML fixtures and extension/regex predicates. |
| GH-PROBE-BROWSER-V1 | https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/research/post-0.3/browser-behavior-probe.mjs | Earlier browser-behavior source. |
| GH-PROBE-BROWSER-V2 | https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/research/post-0.3/browser-behavior-probe-v2.mjs | Fixture tree, top-level copy, asset copy, markup injection, HTML selection, browser and map checks. |
| GH-COMMIT-V2-INTRO | https://api.github.com/repos/mannyc2/effect-build/commits/5fdfd5bca49ca0b45578bec0fca63537800e90df | First observed commit containing browser v2 source. |
| GH-V2-RUNS | https://api.github.com/repos/mannyc2/effect-build/actions/runs?head_sha=5fdfd5bca49ca0b45578bec0fca63537800e90df&per_page=20 | Run state around v2 introduction. |
| GH-CONTRACTS | https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/research/post-0.3/contracts.ts | Prototype role and ownership contracts. |
| GH-FINAL-CONTRACTS | https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/research/post-0.3/final/contracts.ts | Later candidate contract prototypes. |
| GH-FINAL-ADAPTERS | https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/research/post-0.3/final/provider-adapters.ts | Final-research adapter implementations; Node-main only in reviewed file. |
| GH-PROVIDER-CONFORMANCE | https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/research/post-0.3/provider-conformance.mjs | Provider conformance research source. |
| GH-CERT-PROFILE | https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/research/post-0.3/certify-profile-refinement.mjs | Receipt certification logic for profile refinement. |
| GH-CERT-PROVIDER | https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/research/post-0.3/certify-provider-conformance.mjs | Receipt certification logic for provider research. |
| GH-EXPECTED | https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/research/post-0.3/expected-conclusions.json | Expected conclusion registry. |
| GH-PLAN-ARCH | https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/plans/POST-0.3-NATIVE-CAPABILITY-ARCHITECTURE.md | Selected architecture and role rationale. |
| GH-PLAN-API | https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/plans/POST-0.3-API-CANDIDATES.md | Candidate API names and public paths. |
| GH-PLAN-MATRIX | https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/plans/POST-0.3-PROVIDER-CAPABILITY-MATRIX.md | Claimed provider capabilities, evidence classes, and exclusions. |

## B. Structured execution receipts (`RECORDED-EXECUTION`)

| Source ID | Source | Integrity / exact scope |
|---|---|---|
| REC-ARCHIVE-9B0D | GitHub Actions artifact `9269991589` from run `31971767617` | ZIP size 8,951 bytes; SHA-256 `d783cfb14665c891f32e76aca095de08777c5b00e9fb517b26faa38eeb5582d9`; local downloaded digest matched GitHub metadata. Source SHA `9b0d2f59567a7684b62df932c67b7a96050b605f`. |
| REC-PROFILE-REFINEMENT | `profile-refinement.json` inside `REC-ARCHIVE-9B0D` | Records Bun 1.3.9/Deno 2.9.3 output-set and narrow HTML-module fixture outputs/oracles. |
| REC-EXISTING-PROVIDER | `existing-provider-research.json` inside `REC-ARCHIVE-9B0D` | Records broad static-web top-level stylesheet counterexample and provider versions. |
| REC-CERT-SUMMARY | `certification-summary.json` inside `REC-ARCHIVE-9B0D` | Artifact-level certification summary at exact source SHA. |

The receipt archive is evidence, not included in the final research ZIP because the requested member list is fixed. Its digest and result extracts are represented in the ledger.

## C. Browser and language standards (`UPSTREAM-DIRECT`)

| Source ID | Official source | Use |
|---|---|---|
| STD-HTML-URL | https://html.spec.whatwg.org/multipage/urls-and-fetching.html | HTML URL parsing, document/API bases, fetch context. |
| STD-HTML-SEMANTICS | https://html.spec.whatwg.org/multipage/semantics.html | Link and document metadata/fetch-bearing semantics. |
| STD-HTML-SCRIPT | https://html.spec.whatwg.org/multipage/scripting.html | Script elements, classic/module script processing. |
| STD-HTML-IMAGES | https://html.spec.whatwg.org/multipage/images.html | Images, `srcset`, candidate selection. |
| STD-HTML-WEBAPIS | https://html.spec.whatwg.org/multipage/webappapis.html | Module graph fetching, import maps, environment settings. |
| STD-HTML-WORKERS | https://html.spec.whatwg.org/multipage/workers.html | Worker and SharedWorker construction/graphs. |
| STD-SERVICE-WORKER | https://w3c.github.io/ServiceWorker/ | Registration, script/scope URLs, origin/path/header semantics. |
| STD-URL | https://url.spec.whatwg.org/ | URL records, path/query/fragment and parsing/serialization. |
| STD-CSS-VALUES | https://www.w3.org/TR/css-values-4/ | CSS URL values and base resolution. |
| STD-CSS-CASCADE | https://www.w3.org/TR/css-cascade-5/#at-import | `@import`, conditional/layer/import ordering semantics. |
| STD-ECMASCRIPT-DYNAMIC-IMPORT | https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#sec-import-calls | Runtime evaluation of `import(expression)`. |
| STD-WASM-JS | https://webassembly.github.io/spec/js-api/ | WebAssembly JavaScript embedding/API. |
| STD-WASM-WEB | https://webassembly.github.io/spec/web-api/ | Streaming fetch/compile/instantiate and MIME/CORS behavior. |
| STD-SOURCE-MAPS | https://tc39.es/ecma426/ | ECMA-426 source-map format and URL associations. |
| STD-SRI | https://w3c.github.io/webappsec-subresource-integrity/ | Integrity metadata and response-byte verification. |
| STD-CSP | https://w3c.github.io/webappsec-csp/ | Content Security Policy sources, nonces, hashes, execution restrictions. |
| STD-POSIX-RENAME | https://pubs.opengroup.org/onlinepubs/9799919799/functions/rename.html | POSIX rename behavior, directory replacement restrictions, atomic naming rationale. |
| STD-WIN-MOVEFILEEX | https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexa | Windows move/replace/cross-volume behavior. |
| STD-WIN-REPLACEFILE | https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilea | Windows file replacement semantics. |

## D. Provider and comparator documentation/source (`UPSTREAM-DIRECT`)

| Source ID | Official source | Pin / use |
|---|---|---|
| BUN-DOC-BUNDLER | https://bun.sh/docs/bundler | Entries, target, splitting, minification, source maps, output files, metafile, public path, loaders/plugins. |
| BUN-DOC-HTML | https://bun.sh/docs/bundler/html | HTML selector coverage, asset/CSS processing, generated HTML behavior. |
| BUN-REF-MAIN | https://api.github.com/repos/oven-sh/bun/git/ref/heads/main | Upstream main observed at `1dd66afde213732c645c60ac08cf68f1087a271d`. |
| BUN-DTS | https://github.com/oven-sh/bun/blob/1dd66afde213732c645c60ac08cf68f1087a271d/packages/bun-types/bun.d.ts | `BuildArtifact`, source-map relation, metafile declarations and output types. |
| DENO-DOC-BUNDLING | https://docs.deno.com/runtime/reference/bundling/ | Current bundling overview, HTML/CSS/splitting/maps/minify guidance and experimental status. |
| DENO-DOC-CLI-BUNDLE | https://docs.deno.com/runtime/reference/cli/bundle/ | CLI flags/output semantics and experimental warning. |
| DENO-API-BUNDLER | https://docs.deno.com/api/deno/bundler/ | `Deno.bundle()` result and `OutputFile` declarations. |
| DENO-REF-MAIN | https://api.github.com/repos/denoland/deno/git/ref/heads/main | Upstream main observed at `89f33cbef296a2b287f323d42de54c871fa69c77`. |
| DENO-SOURCE-MAIN | https://github.com/denoland/deno/tree/89f33cbef296a2b287f323d42de54c871fa69c77 | Version-pinned upstream source tree for follow-up source validation. |
| ESBUILD-API | https://esbuild.github.io/api/ | Entrypoints, splitting, output files, metafile, public path, CSS bundle, source maps, direct outdir behavior. |
| VITE-ASSETS | https://vite.dev/guide/assets.html | Imported assets, CSS URLs, public directory, `new URL` limitations. |
| VITE-BUILD | https://vite.dev/guide/build | HTML entry/build behavior and public base rewriting. |
| VITE-FEATURES | https://vite.dev/guide/features | Worker conventions and broader frontend feature surface. |

## E. Source-quality notes

- WHATWG/W3C/TC39/Open Group/Microsoft documentation is used for standards/platform semantics.
- Bun, Deno, esbuild, and Vite official documentation/declarations/source are used for provider behavior and interface shape.
- GitHub state and repository source are read through the connected GitHub plugin at exact refs.
- Recorded execution is limited to the verified artifact and exact source/tool versions in its JSON receipts.
- Inferences and proposals are not upgraded to direct evidence in the ledger.
