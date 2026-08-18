# Primary-source bibliography

All sources were retrieved on 2026-08-17. URLs are exact coordinates used by the inventory and evidence ledger.

| Source | Class | Tag / commit / version | Sections used | Exact URL |
|---|---|---|---|---|
| effect-build live PR/ref/tree | GitHub direct | 96e53a27be4ef96fb47f1a745480e0c5382640f2 | PR metadata, ref, checks, changed files, manifests, source and AGENTS | https://github.com/mannyc2/effect-build/pull/4 |
| Historical receipt artifact | GitHub Actions direct | 9b0d2f59567a7684b62df932c67b7a96050b605f | Run 31971767617; artifact 9269991589; digest-addressed JSON receipts | https://github.com/mannyc2/effect-build/actions/runs/31971767617 |
| Bun bundler docs | Upstream direct | bun-v1.3.14 | Bun.build, CLI, HTML, plugins/loaders, outputs/metafile, splitting/assets/maps/watch | https://bun.sh/docs/bundler |
| Bun declarations | Upstream direct | bun-v1.3.14 / 0d9b296a… | BuildConfig, BuildOutput, BuildArtifact, plugins/files/write forms | https://raw.githubusercontent.com/oven-sh/bun/bun-v1.3.14/packages/bun-types/bun.d.ts |
| Bun executables | Upstream direct | bun-v1.3.14 | compile, cross-target OS/arch/libc/CPU, embedded runtime/full-stack HTML | https://bun.sh/docs/bundler/executables |
| Deno bundling reference | Upstream direct | v2.9.5 / 17fadf33… | experimental API/CLI overview, outputs and modes | https://docs.deno.com/runtime/reference/bundling/ |
| Deno.bundle API | Upstream direct | v2.9.5 | BundleOptions/BundleResult, write/memory semantics | https://docs.deno.com/api/deno/~/Deno.bundle |
| Deno bundle CLI | Upstream direct | v2.9.5 | stdout/direct write/watch/config/import-map/lock options | https://docs.deno.com/runtime/reference/cli/bundle/ |
| Deno compile | Upstream direct | v2.9.5 | runtime acquisition, target, permissions, include and executable semantics | https://docs.deno.com/runtime/reference/cli/compile/ |
| Deno security | Upstream direct | v2.9.5 | permissions and ambient authority baseline | https://docs.deno.com/runtime/fundamentals/security/ |
| esbuild API | Upstream direct | v0.28.2 / 609683d8… | build, transform, context/rebuild/watch/serve/cancel/dispose, plugins, metafiles, writes, diagnostics, target/platform/external/maps | https://esbuild.github.io/api/ |
| Node SEA exact docs | Upstream direct | v26.7.0 / 29702dd2… | stability, CJS/ESM, assets, cache/snapshot, args, direct/legacy generation, postprocessing/signing | https://github.com/nodejs/node/blob/v26.7.0/doc/api/single-executable-applications.md |
| Effect exact tag | Upstream direct | effect@4.0.0-rc.108 / bef7bf38… | Scope, Stream, FileSystem, Path, Layer, Context, Cause, Logger, Tracer | https://github.com/Effect-TS/effect/tree/effect%404.0.0-rc.108/packages/effect/src |
| Effect ChildProcess | Upstream direct | effect@4.0.0-rc.108 | Command, Spawner, Handle, options, streams, signals, Scope requirement | https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.108/packages/effect/src/unstable/process/ChildProcess.ts |

## Source discipline

Repository plans, expected-conclusion files and the unavailable synthesis archive are not upstream evidence. They may identify hypotheses or probes but never establish provider behavior. Historical receipts are classified `RECORDED-EXECUTION`, not `UPSTREAM-DIRECT`, and are bounded to their exact cells.
