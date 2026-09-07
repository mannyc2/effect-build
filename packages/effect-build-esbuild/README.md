# effect-build-esbuild

`import * as Esbuild from "effect-build-esbuild"` for `build`, `buildToDirectory`,
`context`, `transform`, and `analyzeMetafile`. Uses the pinned esbuild 0.28.2 npm
dependency; no tool layer is needed.

`build` preserves esbuild options and native results. `buildToDirectory({ ...options,
outdir })` returns an `Artifact.Directory` and commits output atomically by default;
set `atomic: false` for direct output. Supply `NodeServices.layer` for file operations.
`context` is scoped: rebuild, watch, serve, and cancel use Effect, and closing the
scope cancels and disposes the native context. esbuild schedules plugin `onDispose`
callbacks separately; their asynchronous work can finish after the scope closes.
