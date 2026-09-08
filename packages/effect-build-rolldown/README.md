# effect-build-rolldown

Uses pinned Rolldown 1.2.5; no tool layer is needed. `buildToDirectory({ input, outdir, output? })` returns an
`Artifact.Directory` and needs platform services. `build` preserves native results
and `write` behavior; use `write: false` for memory output.
`make` acquires a scoped builder with `generate` and `write`; active work finishes
before it closes. `watch` streams completed builds/errors and closes native results;
slow consumers receive the latest pending event with a `superseded` count.
`transform` wraps the native utility. `DevEngine.make` is scoped and experimental.

[Setup and atomic output](../../docs/getting-started.md) · [Providers](../../docs/providers.md) · [Errors](../../docs/errors.md)
