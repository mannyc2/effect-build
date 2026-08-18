# Source bibliography

Access date for all rolling sources: **2026-08-17**. Exact GitHub repository sources are pinned to commit `96e53a27be4ef96fb47f1a745480e0c5382640f2` unless another tag is shown.

## effect-build live GitHub

### GH-PR-4 — GITHUB-DIRECT

- Direct PR REST payload: `https://api.github.com/repos/mannyc2/effect-build/pulls/4`
- Purpose: live PR state, title, refs, timestamps, body assertion.
- Caveat: the PR body is an author assertion and names a stale final SHA; it is not used as the live-ref authority.

### GH-LIVE-REFS — GITHUB-DIRECT

- Research branch ref: `https://api.github.com/repos/mannyc2/effect-build/git/ref/heads/codex/post-0.3-native-capability-architecture`
- Base branch ref: `https://api.github.com/repos/mannyc2/effect-build/git/ref/heads/codex/granular-integration-program`
- Observed values: `96e53a27be4ef96fb47f1a745480e0c5382640f2` and `15c811bb9904142a33d119766b62082f3c689f13`.

### GH-HEAD-COMMIT — GITHUB-DIRECT

- `https://api.github.com/repos/mannyc2/effect-build/commits/96e53a27be4ef96fb47f1a745480e0c5382640f2`
- Purpose: exact message, tree, parent, author/committer, signature verification, stats.

### GH-PLAN-043 — GITHUB-DIRECT

- `https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/plans/043-publish-single-node-program-profile.md`
- Blob SHA: `9e2fba144e19cae0773de9e4da27048961bc97b0`.
- Purpose: current proposed `NodeMainProgram`, `NodeMainExecutable`, and `NodeSourceExecutable` domain/API.

### GH-API-CANDIDATES — GITHUB-DIRECT

- `https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/plans/POST-0.3-API-CANDIDATES.md`
- Blob SHA: `72a9bf011528d683a3e3445d00cb058d444a9e3b`.
- Purpose: Candidate C2 declarations, author primitives, compatibility and lifecycle shape.

### GH-NODE-CANON-PROBE — GITHUB-DIRECT

- `https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/research/post-0.3/node-main-canon-probe.mjs`
- Blob SHA: `480026ae15648d9e482f963d41222cc531fa80ae`.
- Purpose: curated Bun/esbuild candidate probe and its source-level conclusion.
- Caveat: source is not an execution receipt and does not establish arbitrary-program closure.

### GH-ARCH-WORKFLOW — GITHUB-DIRECT

- `https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/.github/workflows/architecture-research.yml`
- Blob SHA: `fa1017f5996bce1195be3bb129735c781f535b14`.
- Purpose: command order and exact tool versions intended in architecture research.

### GH-CHECKS-HEAD — RECORDED-EXECUTION

- `https://api.github.com/repos/mannyc2/effect-build/commits/96e53a27be4ef96fb47f1a745480e0c5382640f2/check-runs?per_page=100`
- Purpose: current-head recorded check statuses.
- Scope: job conclusions only; the audit does not infer broader semantics from names.

### GH-EXEC-ANNOTATIONS — RECORDED-EXECUTION

- `https://api.github.com/repos/mannyc2/effect-build/check-runs/95273543625/annotations`
- Purpose: exact current `executable-research` failure annotations.

### GH-EXPECTED-CONCLUSIONS — GITHUB-DIRECT

- `https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/research/post-0.3/expected-conclusions.json`
- Blob SHA: `af106e79404cacbbb60c5311c97a57622560cfa6`.
- Purpose: expected claim inventory.
- Caveat: expected conclusions are not receipts.

## Node.js v26.7.0

The official annotated `v26.7.0` tag resolves to commit `b4f23d3619c98bed09af93a21192f6080197a8c6`; GitHub reports the tag signature as verified. The tag was created 2026-08-05.

### NODE-SEA-26 — UPSTREAM-DIRECT

- Rendered current docs: `https://nodejs.org/api/single-executable-applications.html`
- Pinned source: `https://github.com/nodejs/node/blob/v26.7.0/doc/api/single-executable-applications.md`
- Source blob SHA: `be5667cbd499e4e5dc9bfb321a3a4177c124f1e4`.
- Purpose: SEA input/configuration, loader, assets, snapshots, code cache, addon and signing constraints.

### NODE-ESM-26 — UPSTREAM-DIRECT

- `https://github.com/nodejs/node/blob/v26.7.0/doc/api/esm.md`
- Source blob SHA: `7bee6777458375012b132858a5022c4c0f68fa5f`.
- Purpose: ESM specifiers, extensions, URLs, import attributes, built-ins, dynamic import, main semantics.

### NODE-CJS-26 — UPSTREAM-DIRECT

- `https://github.com/nodejs/node/blob/v26.7.0/doc/api/modules.md`
- Source blob SHA: `f055372739c24e5125a69b6f9ac491863e02806c`.
- Purpose: CommonJS loading and main/imported semantics.

### NODE-PACKAGES-26 — UPSTREAM-DIRECT

- `https://github.com/nodejs/node/blob/v26.7.0/doc/api/packages.md`
- Purpose: package `type`, `exports`, `imports`, conditions, CJS/ESM resolution.

### NODE-CLI-26 — UPSTREAM-DIRECT

- `https://nodejs.org/api/cli.html#-c---check`
- Purpose: `--check` syntax-only contract.

### NODE-VFS-26 — UPSTREAM-DIRECT

- `https://nodejs.org/api/vfs.html`
- Purpose: experimental explicit virtual-filesystem API comparison.
- Interpretation: `node:vfs` is an opt-in filesystem-like API, not an automatic broadening of SEA module/package resolution.

## Bun

### BUN-BUNDLER — UPSTREAM-DIRECT

- `https://bun.sh/docs/bundler`
- Purpose: target, format, splitting, external packages, metafiles, loaders/plugins, output kinds, syntax transformation policy.
- Version relation: repository workflow pins Bun `1.3.14`; the URL is rolling official documentation and is not represented as a content-addressed 1.3.14 snapshot.

### BUN-EXECUTABLES — UPSTREAM-DIRECT

- `https://bun.sh/docs/bundler/executables`
- Purpose: Bun runtime embedding and provider-native executable/cross-target behavior.

## esbuild

### ESBUILD-API — UPSTREAM-DIRECT

- `https://esbuild.github.io/api/`
- Purpose: platform, target, external, packages, splitting, loaders, metafiles, output behavior.
- Version relation: repository workflow pins aliases for esbuild `0.28.1` and `0.28.2`; the URL is rolling official documentation.

## Rolldown

### ROLLDOWN-DOCS — UPSTREAM-DIRECT

- Platform: `https://rolldown.rs/reference/InputOptions.platform`
- Format: `https://rolldown.rs/reference/OutputOptions.format`
- External modules: `https://rolldown.rs/in-depth/external-modules`
- Code splitting: `https://rolldown.rs/reference/OutputOptions.codeSplitting`
- Transform target: `https://rolldown.rs/reference/InputOptions.transform`
- Output chunk: `https://rolldown.rs/reference/Interface.OutputChunk`
- Module types: `https://rolldown.rs/in-depth/module-types`
- Version relation: repository workflow pins Rolldown `1.2.4`; URLs are rolling official documentation.

## Rollup

### ROLLUP-CONFIG — UPSTREAM-DIRECT

- `https://rollupjs.org/configuration-options/`
- Purpose: formats, externals, chunks/assets, dynamic-import inlining, output contract.

### ROLLUP-PLUGINS — UPSTREAM-DIRECT

- `https://github.com/rollup/plugins`
- Purpose: official Node resolution, CommonJS, JSON, dynamic-import-variable and related plugin semantics.

## Deno

### DENO-COMPILE — UPSTREAM-DIRECT

- `https://docs.deno.com/runtime/reference/cli/compile/`
- Purpose: module graph inclusion, explicit include, npm/node_modules, VFS/self-extracting behavior, workers and cross-target compile.
- Version relation: repository workflow pins Deno `2.9.5`; URL is rolling official documentation.

## @yao-pkg/pkg

### PKG-GUIDES — UPSTREAM-DIRECT

- SEA versus standard: `https://yao-pkg.github.io/pkg/guide/sea-vs-standard`
- Targets: `https://yao-pkg.github.io/pkg/guide/targets`
- ESM: `https://yao-pkg.github.io/pkg/guide/esm`
- Native addons: `https://yao-pkg.github.io/pkg/guide/native-addons`
- Purpose: narrower executable-packaging comparison.
- Version caveat: workflow pins `@yao-pkg/pkg` `6.22.0`; the observed guide publication may identify a different documentation version. No exact 6.22.0 contract equivalence is claimed without a pinned source/tag check.

## ncc

### NCC-REPO — UPSTREAM-DIRECT

- `https://github.com/vercel/ncc`
- Purpose: Node-oriented bundle and asset-relocation comparison.

## Source-quality rule

Official upstream contracts and exact repository sources control factual statements. Repository plans, PR prose, and expected conclusions are evidence of the repository's proposal and intent, not substitutes for upstream contracts or current execution receipts. Where rolling documentation is used against a workflow-pinned version, the difference is called out and future exact-version source/fixture work remains required.
