# Official upstream sources

Accessed 2026-08-17. Only primary/official contracts are used for new technical research.

- **Bun bundler** — https://bun.com/docs/bundler  
  Use: Bun.build, CLI bundling, loaders, watch, diagnostics, outputs
- **Bun standalone executables** — https://bun.com/docs/bundler/executables  
  Use: compile mode, embedded Bun runtime, targets
- **Deno bundling guide** — https://docs.deno.com/runtime/reference/bundling/  
  Use: experimental deno bundle and Deno.bundle, HTML, splitting, source maps, declarations
- **Deno bundle CLI** — https://docs.deno.com/runtime/reference/cli/bundle/  
  Use: CLI flags including watch, minify, source maps, platform
- **Deno.bundle API** — https://docs.deno.com/api/deno/bundle/  
  Use: official experimental runtime API contract
- **Deno compile** — https://docs.deno.com/runtime/reference/cli/compile/  
  Use: runtime compilation, bundle/minify, includes, workers, CJS/native addon behavior
- **Esbuild API** — https://esbuild.github.io/api/  
  Use: build, transform, context, rebuild, watch, serve, cancel, dispose
- **Node 26.1 SEA** — https://nodejs.org/download/release/v26.1.0/docs/api/single-executable-applications.html  
  Use: --build-sea, mainFormat, assets, version equality, module loading
- **Effect FileSystem** — https://effect-ts.github.io/effect/platform/FileSystem.ts.html  
  Use: filesystem operations, scoped temp files/directories, streams, watch
- **Effect Path** — https://effect-ts.github.io/effect/platform/Path.ts.html  
  Use: host path semantics
- **Effect Command** — https://effect-ts.github.io/effect/platform/Command.ts.html  
  Use: command construction
- **Effect CommandExecutor** — https://effect-ts.github.io/effect/platform/CommandExecutor.ts.html  
  Use: scoped processes, stdout/stderr, exit, kill
- **Effect Scope** — https://effect-ts.github.io/effect/effect/Scope.ts.html  
  Use: resource lifetime and finalizers
- **Effect Effect** — https://effect-ts.github.io/effect/effect/Effect.ts.html  
  Use: acquire/release, spans, annotations, logging
- **Effect Stream** — https://effect-ts.github.io/effect/effect/Stream.ts.html  
  Use: streaming output and backpressure
- **Effect OpenTelemetry Tracer** — https://effect-ts.github.io/effect/opentelemetry/Tracer.ts.html  
  Use: bridging Effect spans to OTel exporters
- **npm semver** — https://www.npmjs.com/package/semver  
  Use: complete SemVer range and prerelease semantics

> **Provenance:** `OFFICIAL-UPSTREAM-CONTRACT` · observation · confidence **high** · the URLs above
