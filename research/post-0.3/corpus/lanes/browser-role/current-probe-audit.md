# Audit of current browser research and probes

## 1. Live-state qualification

**[GITHUB-DIRECT AUD-001]** The research branch was observed at `96e53a27be4ef96fb47f1a745480e0c5382640f2`. The PR body still calls `af4887c36753a82c3c97fafc54b3c368cd98b34d` the “final research head.” This audit uses the live ref and records the mismatch.

**[GITHUB-DIRECT AUD-002]** Architecture workflow run 118 at the live head completed with failure. The current contract-prototype typecheck failed; later compile, compatibility, reproduction, and receipt validation steps were skipped. The live head therefore has no successful end-to-end architecture certification run.

**[GITHUB-DIRECT AUD-003]** `browser-behavior-probe-v2.mjs` first appeared at commit `5fdfd5bca49ca0b45578bec0fca63537800e90df`, after the last successful receipt run at `9b0d2f59567a7684b62df932c67b7a96050b605f`. Runs at or after that addition did not successfully reach certification, and the reviewed workflow does not directly invoke v2 in its normal certification path.

**[INFERENCE AUD-004]** The v2 program is `GITHUB-DIRECT` source evidence, not `RECORDED-EXECUTION` evidence at the live head.

## 2. `profile-refinement-probe.mjs`

### Fixture specificity

**[GITHUB-DIRECT AUD-005]** The probe constructs hardcoded fixture directories/names including `browser-module`, `browser-html`, `app.ts`, `style.css`, and `index.html`, and invokes providers with literal entry names. Its output predicates are primarily file-extension predicates.

The module fixture is essentially one module importing one stylesheet. The HTML fixture is essentially one HTML module script whose module imports CSS. Those are useful minimal scenarios, not a complete application language.

### Recorded output-set result

**[RECORDED-EXECUTION AUD-006]** At source SHA `9b0d2f...`, Bun 1.3.9 and Deno 2.9.3 each emitted `app.js` (45 bytes) and `app.css` (17 bytes). This directly establishes that exact fixture/output fact.

**[INFERENCE AUD-007]** It does not establish a general `BrowserModuleOutputSet` law because the oracle lacks requested-entry association, chunk/edge closure, external-import classification, multi-entry scenarios, runtime loading, and ownership checks specific to the browser result.

### `referencesExist` oracle

**[GITHUB-DIRECT AUD-008]** The probe finds `src`/`href` strings with a regular expression, skips scheme/protocol-relative strings, strips query and fragment text, and resolves the remaining string through the filesystem.

What this can show:

- a regex-recognized path component maps to an existing filesystem entry in this output layout.

What it cannot show:

- correct HTML parsing or attribute semantics;
- `<base>` behavior;
- `srcset` candidates;
- import-map or module graph resolution;
- CSS `@import`/`url()`;
- query identity or fragment semantics;
- CSP/SRI/MIME/CORS/referrer behavior;
- worker/service-worker/WASM loading;
- browser application readiness.

**[RECORDED-EXECUTION AUD-009]** The successful receipt records one HTML, one JS, and one CSS output for each provider; the module imported CSS; and regex-matched generated `src|href` paths mapped to files. Deno’s stderr identified `deno bundle` as experimental.

**[INFERENCE AUD-010]** This proves a small script-rooted CSS tree was generated consistently enough for that filesystem oracle. It does not prove the broader browser application contract.

## 3. Broad static-web counterexample

**[RECORDED-EXECUTION AUD-011]** `existing-provider-research.json` records a broad fixture where Bun emitted HTML, JS, and a top-level linked CSS file, while Deno emitted HTML and JS but omitted that stylesheet. The receipt classified the broad static-web role as falsified.

This is the strongest browser result in the existing receipts because it is an explicit counterexample. It establishes that “all local top-level HTML resources are preserved” is not a common native law for the tested versions/mode.

## 4. `browser-behavior-probe-v2.mjs`

### Hardcoded source vocabulary

**[GITHUB-DIRECT AUD-012]** The v2 source uses a fixed tree/naming vocabulary including `index.html`, `top.css`, `module.css`, `app.ts`, nested chunks, and an `assets/` directory. Its checks and normalization know these names.

Fixture-specific names are acceptable for one scenario. They become a proof defect when the conclusion is generalized to arbitrary resources without an admitted-language specification.

### Copied resources

**[GITHUB-DIRECT AUD-013]** `normalizeTopLevelResources` copies source `top.css` to output `top.css` and recursively copies the entire source `assets/` directory to output `assets/`.

Consequences:

- success does not prove Deno preserved top-level CSS or HTML image resources;
- copying an entire conventional directory can include unused files and omit used files elsewhere;
- the operation is an explicit-resource/public-directory normalizer, not provider-neutral discovery;
- fixed destination names avoid collision/public-base/multiple-entry questions rather than solving them.

### Injected markup

**[GITHUB-DIRECT AUD-014]** When references are absent, v2 injects a stylesheet link, preload link, and image element targeting copied fixture files, writes the modified HTML, and then launches Chrome.

**[INFERENCE AUD-015]** The browser oracle validates the normalized output actually served. It cannot prove that the normalization algorithm is complete or semantically neutral for applications outside the fixture. A strong runtime oracle does not repair an undergeneral discovery/rewrite algorithm.

### HTML selection

**[GITHUB-DIRECT AUD-016]** V2 locates emitted HTML by extension and uses the first candidate. This is ambiguous for multiple HTML entries, auxiliary HTML files, or provider metadata. A portable HTML role requires requested-entry-to-output association.

### Source-map check

**[GITHUB-DIRECT AUD-017]** V2 observes whether source-map configuration was accepted and whether a `.map` output exists. It does not validate generated-file linkage, inline/header modes, map JSON, `sources`/`sourceRoot`, CSS maps, or whether source URLs resolve as intended.

### Other narrowing assumptions

The probe also narrows evidence through one browser executable/environment, one server layout, fixed readiness expressions, fixed output-directory shape, and limited request/console checks. These are scenario limitations, not semantic exclusions. They must be varied before claiming generality.

## 5. Proposal versus implementation

**[GITHUB-DIRECT AUD-018]** The plans and prototype contracts select browser profile paths, but the reviewed `research/post-0.3/final/provider-adapters.ts` implements Bun and Esbuild Node-main adapters only. No production or final browser adapter implementation was found at the live head.

**[INFERENCE AUD-019]** Browser conclusions at the live head are research/proposal claims, not shipped or final-adapter behavior.

## 6. Proof table

| Evidence item | Truthfully proves | Does not prove |
|---|---|---|
| Module output-set receipt | Tested Bun/Deno each emitted JS+CSS for one imported-CSS module fixture. | Entry mapping, chunks, assets, runtime behavior, general closure. |
| HTML module receipt | Tested providers emitted small HTML/JS/CSS trees whose regex-matched paths existed. | General HTML semantics, browser behavior, top-level resources, policies. |
| Broad static-web receipt | Tested Deno dropped one top-level linked stylesheet that Bun emitted. | Every other HTML edge; behavior of future versions/modes. |
| V2 source | Exact known-resource copy/injection/browser procedure exists in repository. | Successful recorded execution at live head; native provider preservation; general discovery. |
| V2 browser oracle design | The normalized fixture can be checked in a browser when run. | Completeness/neutrality of normalization; multi-environment equivalence. |
| Plans/contracts | Intended architecture and names. | Implemented adapter or conformance. |

## 7. Required evidence upgrades

A future proof—not implemented here—would need independent scenarios for:

- multiple entries, shared and lazy chunks;
- nested imports and literal/computed dynamic imports;
- top-level and module-owned CSS;
- recursive CSS imports and varied URL-bearing properties;
- `srcset`, preload, modulepreload, import maps, `<base>`;
- workers/service workers/WASM;
- remote/data/blob/root-relative/query/fragment URLs;
- public subpaths;
- source maps and minification;
- CSP/SRI/MIME;
- provider-generated HTML/metadata association;
- partial writes, stale output, cleanup, and publication.

Each scenario needs an admitted-source declaration, provider output observations, a browser/deployment oracle where applicable, explicit counterexamples, and a falsifier—not one aggregate “works” fixture.

## 8. Audit conclusion

**[INFERENCE AUD-020]** The current research establishes useful narrow facts and one important broad counterexample. It does not establish a general provider-neutral `BrowserModuleApplication`. The v2 copies and markup injection prove only an explicit fixture normalizer. The strongest truthful direction is `BrowserModulePayload`, plus a separately bounded HTML-entry role and permanent provider-native output surfaces.
