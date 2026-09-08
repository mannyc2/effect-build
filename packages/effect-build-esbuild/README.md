# effect-build-esbuild

Uses pinned esbuild 0.28.2; no tool layer is needed. `build` preserves native options
and results. `buildToDirectory({ ...options, outdir })` returns `Artifact.Directory` and needs platform services.
`transform` and `analyzeMetafile` wrap the corresponding native utilities.
`context` requires a scope and exposes Effect rebuild/watch/serve/cancel operations.
Scope closure cancels and disposes the context; esbuild's asynchronous `onDispose`
callbacks can finish later.

[Setup and atomic output](../../docs/getting-started.md) · [Errors](../../docs/errors.md)
