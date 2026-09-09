# effect-build-esbuild

esbuild is a peer dependency (`>=0.28.2 <0.29.0`, tested with 0.28.2), so your install's
esbuild runs in process; no tool layer is needed. `build` preserves native options
and results. `buildToDirectory({ ...options, outdir })` returns `Artifact.Directory` and needs platform services.
`transform` and `analyzeMetafile` wrap the corresponding native utilities.
`context` requires a scope and exposes Effect rebuild/watch/serve/cancel operations.
Scope closure cancels and disposes the context; esbuild's asynchronous `onDispose`
callbacks can finish later.

[Setup and atomic output](../../docs/getting-started.md) · [Errors](../../docs/errors.md)
