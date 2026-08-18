# Source bibliography

Retrieved or refreshed on 2026-08-17 unless an input archive records a more specific retrieval timestamp.

## Live `effect-build` records

- PR #4: https://github.com/mannyc2/effect-build/pull/4
- Live research head: https://github.com/mannyc2/effect-build/commit/96e53a27be4ef96fb47f1a745480e0c5382640f2
- Architecture run `31990684158`: https://github.com/mannyc2/effect-build/actions/runs/31990684158
- Ordinary run `31990684160`: https://github.com/mannyc2/effect-build/actions/runs/31990684160
- Source-export run `31990680610`: https://github.com/mannyc2/effect-build/actions/runs/31990680610
- Architecture workflow at observed head: https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/.github/workflows/architecture-research.yml
- Plan 039 at observed head: https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/plans/039-establish-core-capability-boundaries.md
- Historical project instruction at the observed head: https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/AGENTS.md
- Historical project instruction at the PR base: https://github.com/mannyc2/effect-build/blob/15c811bb9904142a33d119766b62082f3c689f13/AGENTS.md
- Node probe: https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/research/post-0.3/node-main-canon-probe.mjs
- Browser probe: https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/research/post-0.3/browser-behavior-probe.mjs
- Later browser probe: https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/research/post-0.3/browser-behavior-probe-v2.mjs

## Node and producer contracts

- Node v26.7 SEA: https://nodejs.org/api/single-executable-applications.html
- Version-pinned Node SEA source documentation: https://github.com/nodejs/node/blob/v26.7.0/doc/api/single-executable-applications.md
- Node ESM: https://github.com/nodejs/node/blob/v26.7.0/doc/api/esm.md
- Node CommonJS modules: https://github.com/nodejs/node/blob/v26.7.0/doc/api/modules.md
- Node packages/resolution: https://github.com/nodejs/node/blob/v26.7.0/doc/api/packages.md
- Bun bundler: https://bun.sh/docs/bundler
- Bun executables: https://bun.sh/docs/bundler/executables
- esbuild API: https://esbuild.github.io/api/
- Deno compile: https://docs.deno.com/runtime/reference/cli/compile/
- Rolldown: https://rolldown.rs/

## Browser/provider/standards contracts

- Bun HTML bundler: https://bun.sh/docs/bundler/html
- Deno bundler API: https://docs.deno.com/api/deno/bundler/
- Deno bundling guide: https://docs.deno.com/runtime/reference/bundling/
- Deno bundle CLI: https://docs.deno.com/runtime/reference/cli/bundle/
- WHATWG HTML: https://html.spec.whatwg.org/
- WHATWG URL: https://url.spec.whatwg.org/
- ECMAScript dynamic import: https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#sec-import-calls
- Source Map specification: https://tc39.es/ecma426/
- Service Worker: https://w3c.github.io/ServiceWorker/
- Content Security Policy: https://w3c.github.io/webappsec-csp/
- Subresource Integrity: https://w3c.github.io/webappsec-subresource-integrity/
- CSS `@import`: https://www.w3.org/TR/css-cascade-5/#at-import
- CSS URL values: https://www.w3.org/TR/css-values-4/
- POSIX rename: https://pubs.opengroup.org/onlinepubs/9799919799/functions/rename.html
- Windows `MoveFileEx`: https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexa
- Windows `ReplaceFile`: https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilea

## Effect lifecycle and observability

The lifecycle archive pinned Effect commit `66114151c2b4640bf773f2b3456ce70d679422f6` (`effect@4.0.0-rc.110`). Important source coordinates:

- Effect: https://github.com/Effect-TS/effect/blob/66114151c2b4640bf773f2b3456ce70d679422f6/packages/effect/src/Effect.ts
- Scope: https://github.com/Effect-TS/effect/blob/66114151c2b4640bf773f2b3456ce70d679422f6/packages/effect/src/Scope.ts
- FileSystem: https://github.com/Effect-TS/effect/blob/66114151c2b4640bf773f2b3456ce70d679422f6/packages/effect/src/FileSystem.ts
- Path: https://github.com/Effect-TS/effect/blob/66114151c2b4640bf773f2b3456ce70d679422f6/packages/effect/src/Path.ts
- ChildProcess: https://github.com/Effect-TS/effect/blob/66114151c2b4640bf773f2b3456ce70d679422f6/packages/effect/src/unstable/process/ChildProcess.ts
- ChildProcessSpawner: https://github.com/Effect-TS/effect/blob/66114151c2b4640bf773f2b3456ce70d679422f6/packages/effect/src/unstable/process/ChildProcessSpawner.ts
- Tracer: https://github.com/Effect-TS/effect/blob/66114151c2b4640bf773f2b3456ce70d679422f6/packages/effect/src/Tracer.ts
- OpenTelemetry integration: https://github.com/Effect-TS/effect/tree/66114151c2b4640bf773f2b3456ce70d679422f6/packages/opentelemetry
- OpenTelemetry specification: https://opentelemetry.io/docs/specs/otel/

## Input archives

See `INPUT-AND-METHOD.md` for exact archive digests. Every material synthesis claim in `EVIDENCE-LEDGER.json` names its archive and source file.
