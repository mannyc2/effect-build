# Source bibliography

**[PROPOSAL]** Sources are ordered by authority for this assignment: live effect-build GitHub state and checked-in research; pinned official Effect source/docs; official Node/Microsoft/OpenTelemetry sources. Tutorials and third-party summaries were not used as evidence.

## Live effect-build state

| Class | Source | Pin / observed state | Use |
|---|---|---|---|
| GITHUB-DIRECT | [Draft PR 4](https://github.com/mannyc2/effect-build/pull/4) | open, draft; observed `2026-08-17T15:43:36Z` | PR purpose, reported prior execution, lifecycle/primitive summary, and body/live-head discrepancy |
| GITHUB-DIRECT | [Research branch ref](https://api.github.com/repos/mannyc2/effect-build/git/ref/heads/codex/post-0.3-native-capability-architecture) | `96e53a27be4ef96fb47f1a745480e0c5382640f2` | authoritative live branch head |
| GITHUB-DIRECT | [Base branch ref](https://api.github.com/repos/mannyc2/effect-build/git/ref/heads/codex/granular-integration-program) | `15c811bb9904142a33d119766b62082f3c689f13` | authoritative live base head |
| GITHUB-DIRECT | [`POST-0.3-NATIVE-CAPABILITY-ARCHITECTURE.md`](https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/plans/POST-0.3-NATIVE-CAPABILITY-ARCHITECTURE.md) | live head; blob noted in ledger | selected architecture, lifecycle table, profiles, watch and publication decisions |
| GITHUB-DIRECT | [`POST-0.3-PROVIDER-CAPABILITY-MATRIX.md`](https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/plans/POST-0.3-PROVIDER-CAPABILITY-MATRIX.md) | live head | provider capability axes, primitive rent, reported experiments and unknowns |
| GITHUB-DIRECT | [`POST-0.3-API-CANDIDATES.md`](https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/plans/POST-0.3-API-CANDIDATES.md) | live head; blob `72a9bf…` | concrete proposed signatures, lifecycle prototypes, source-locator and watch rejections |
| GITHUB-DIRECT | [`039-establish-core-capability-boundaries.md`](https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/plans/039-establish-core-capability-boundaries.md) | live head | intended core production scope and law obligations |
| GITHUB-DIRECT | [`architecture-laws.mjs`](https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/research/post-0.3/architecture-laws.mjs) | live head | closure-owned liveness/mutation/expiry mechanism and raw path behavior |
| GITHUB-DIRECT | [`architecture-laws.test.mjs`](https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/research/post-0.3/architecture-laws.test.mjs) | live head; blob `d69999c240d80ac1bf091f6bbc7e2548372d05b7` | source definitions of ownership, exact failure, expiry, and callback-nesting laws |
| GITHUB-DIRECT | [`duplicate-core.test.mjs`](https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/research/post-0.3/duplicate-core.test.mjs) | live head; blob `9b52d6196b157b6e7d8896388a79ffa145c23dfd` | duplicate-module authority law source |
| GITHUB-DIRECT | [`FINAL-CONTRACTS.md`](https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/research/post-0.3/FINAL-CONTRACTS.md) | live head; blob `a0ae3bf3151ebea9c424d999ec71b9edb2a87d91` | declared role protocol shapes |
| RECORDED-EXECUTION | PR body and capability-matrix reported runs | reports tied to repository history, including body-named `af4887c36753a82c3c97fafc54b3c368cd98b34d` | historical provider/law/workflow results; not rerun in this session |

## Pinned Effect v4 source

| Class | Source | Pin | Use |
|---|---|---|---|
| UPSTREAM-DIRECT | [Effect tags API](https://api.github.com/repos/Effect-TS/effect/tags?per_page=10) | newest observed `effect@4.0.0-rc.110` → `66114151c2b4640bf773f2b3456ce70d679422f6` | version pin |
| UPSTREAM-DIRECT | [`packages/effect/package.json`](https://github.com/Effect-TS/effect/blob/66114151c2b4640bf773f2b3456ce70d679422f6/packages/effect/package.json) | `66114151c2b4640bf773f2b3456ce70d679422f6` | exact package version and exports including `effect/unstable/process` |
| UPSTREAM-DIRECT | [`Scope.ts`](https://github.com/Effect-TS/effect/blob/66114151c2b4640bf773f2b3456ce70d679422f6/packages/effect/src/Scope.ts) | blob `a7268975…` | scope state, strategies, finalizers, fork, close, use |
| UPSTREAM-DIRECT | [`Effect.ts`](https://github.com/Effect-TS/effect/blob/66114151c2b4640bf773f2b3456ce70d679422f6/packages/effect/src/Effect.ts) and [`internal/effect.ts`](https://github.com/Effect-TS/effect/blob/66114151c2b4640bf773f2b3456ce70d679422f6/packages/effect/src/internal/effect.ts) | `66114151c2b4640bf773f2b3456ce70d679422f6` | `scoped`, acquire/release/bracket, `onExit`, `failCause`, interruption masking |
| UPSTREAM-DIRECT | [`FileSystem.ts`](https://github.com/Effect-TS/effect/blob/66114151c2b4640bf773f2b3456ce70d679422f6/packages/effect/src/FileSystem.ts) | commit-pinned source; blob SHA not independently recorded | filesystem service, handles, streams, temp resources, realPath/stat/rename/remove/watch |
| UPSTREAM-DIRECT | [`Path.ts`](https://github.com/Effect-TS/effect/blob/66114151c2b4640bf773f2b3456ce70d679422f6/packages/effect/src/Path.ts) | `66114151c2b4640bf773f2b3456ce70d679422f6` | platform path-string service and exact methods |
| UPSTREAM-DIRECT | [`ChildProcess.ts`](https://github.com/Effect-TS/effect/blob/66114151c2b4640bf773f2b3456ce70d679422f6/packages/effect/src/unstable/process/ChildProcess.ts) | blob `1c019b54…` | command Effect model, options, signals, I/O, pipelines |
| UPSTREAM-DIRECT | [`ChildProcessSpawner.ts`](https://github.com/Effect-TS/effect/blob/66114151c2b4640bf773f2b3456ce70d679422f6/packages/effect/src/unstable/process/ChildProcessSpawner.ts) | blob `5c8d0ac2…` | handle members and convenience runners/streams |
| UPSTREAM-DIRECT | [`NodeChildProcessSpawner.ts`](https://github.com/Effect-TS/effect/blob/66114151c2b4640bf773f2b3456ce70d679422f6/packages/platform/node-shared/src/NodeChildProcessSpawner.ts) | blob `38299e21…` | Node spawn, group/direct kill, timeout, exit wait, finalizer error ignoring |
| UPSTREAM-DIRECT | [`Layer.ts`](https://github.com/Effect-TS/effect/blob/66114151c2b4640bf773f2b3456ce70d679422f6/packages/effect/src/Layer.ts) | `66114151c2b4640bf773f2b3456ce70d679422f6` | Layer service construction, scope, memoization |
| UPSTREAM-DIRECT | [`Context.ts`](https://github.com/Effect-TS/effect/blob/66114151c2b4640bf773f2b3456ce70d679422f6/packages/effect/src/Context.ts) | `66114151c2b4640bf773f2b3456ce70d679422f6` | service keys and class-style service construction |
| UPSTREAM-DIRECT | [`Logger.ts`](https://github.com/Effect-TS/effect/blob/66114151c2b4640bf773f2b3456ce70d679422f6/packages/effect/src/Logger.ts) | `66114151c2b4640bf773f2b3456ce70d679422f6` | logger event model and Layers |
| UPSTREAM-DIRECT | [`Tracer.ts`](https://github.com/Effect-TS/effect/blob/66114151c2b4640bf773f2b3456ce70d679422f6/packages/effect/src/Tracer.ts) | `66114151c2b4640bf773f2b3456ce70d679422f6` | spans, attributes, events, links, sampling, status |
| UPSTREAM-DIRECT | [`Metric.ts`](https://github.com/Effect-TS/effect/blob/66114151c2b4640bf773f2b3456ce70d679422f6/packages/effect/src/Metric.ts) | `66114151c2b4640bf773f2b3456ce70d679422f6` | metric instruments and operations |
| UPSTREAM-DIRECT | [`packages/opentelemetry/package.json`](https://github.com/Effect-TS/effect/blob/66114151c2b4640bf773f2b3456ce70d679422f6/packages/opentelemetry/package.json) | `effect@4.0.0-rc.110` | exact OTel package version |
| UPSTREAM-DIRECT | [`NodeSdk.ts`](https://github.com/Effect-TS/effect/blob/66114151c2b4640bf773f2b3456ce70d679422f6/packages/opentelemetry/src/NodeSdk.ts) | blob `e3964b5f…` | signal wiring, resource, scoped provider shutdown |
| UPSTREAM-DIRECT | [`OtelTracer.ts`](https://github.com/Effect-TS/effect/blob/66114151c2b4640bf773f2b3456ce70d679422f6/packages/opentelemetry/src/OtelTracer.ts) | `66114151c2b4640bf773f2b3456ce70d679422f6` | Effect-to-OTel span bridge |
| UPSTREAM-DIRECT | [`OtelLogger.ts`](https://github.com/Effect-TS/effect/blob/66114151c2b4640bf773f2b3456ce70d679422f6/packages/opentelemetry/src/OtelLogger.ts) | blob `8ccd6ee8…` | Effect-to-OTel logs bridge |
| UPSTREAM-DIRECT | [`OtelMetrics.ts`](https://github.com/Effect-TS/effect/blob/66114151c2b4640bf773f2b3456ce70d679422f6/packages/opentelemetry/src/OtelMetrics.ts) | blob `da76f6b7…` | Effect metrics producer/reader bridge |

## Official Effect documentation

| Class | Source | Version / use |
|---|---|---|
| UPSTREAM-DIRECT | [Effect v4 API reference](https://www.effect.website/docs/v4/api/effect) | identifies current `effect` API version and exact public symbols |
| UPSTREAM-DIRECT | [`@effect/opentelemetry` v4 API reference](https://www.effect.website/docs/v4/api/opentelemetry) | package modules and version |
| UPSTREAM-DIRECT | [Effect homepage / v4 installation](https://www.effect.website/) | v4 release-candidate channel |
| UPSTREAM-DIRECT | [Resource management guide](https://www.effect.website/docs/resource-management/introduction/) | scoped lifetime and acquire/release semantics |
| UPSTREAM-DIRECT | [Services and Layers guide](https://www.effect.website/docs/requirements-management/services/) | `Context.Service`, construction, and Layers |
| UPSTREAM-DIRECT | [Logging guide](https://www.effect.website/docs/observability/logging/) | log annotations and propagation |
| UPSTREAM-DIRECT | [Tracing guide](https://www.effect.website/docs/observability/tracing/) | `Effect.withSpan` usage |
| UPSTREAM-DIRECT | [Metrics guide](https://www.effect.website/docs/observability/metrics/) | metrics and tracking combinators |
| UPSTREAM-DIRECT | [OpenTelemetry integration guide](https://www.effect.website/docs/observability/opentelemetry/) | application-installed OTel integration |

## Official platform and telemetry sources

| Class | Source | Use |
|---|---|---|
| UPSTREAM-DIRECT | [Node.js child-process documentation](https://nodejs.org/api/child_process.html) | pipe capacity/backpressure, exit versus close, signal delivery, `killed`, Windows behavior, descendant limits |
| UPSTREAM-DIRECT | [Microsoft `MoveFileEx`](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexa) | replacement ACL/delete requirements, cross-volume copy/delete, write-through flag limits |
| UPSTREAM-DIRECT | [OpenTelemetry Trace SDK sampling](https://opentelemetry.io/docs/specs/otel/trace/sdk/#sampling) | non-recording/sampled span behavior |
| UPSTREAM-DIRECT | [OTLP specification](https://opentelemetry.io/docs/specs/otlp/) | export request/response, partial success, retry, concurrency, duplicates |
| UPSTREAM-DIRECT | [OpenTelemetry specification](https://opentelemetry.io/docs/specs/otel/) | telemetry signal model |

## Evidence-use cautions

**[INFERENCE]** A checked-in test source directly proves what law was encoded, not that it passed at the live head. Passing claims remain `RECORDED-EXECUTION` unless rerun.

**[INFERENCE]** An upstream source implementation proves the pinned platform Layer's behavior, not every other Effect platform implementation.

**[INFERENCE]** Official Node/Microsoft documents constrain portability; they do not by themselves prove effect-build's future implementation handles every edge case correctly.

**[UNKNOWN]** Source line anchors may drift in rendered tag views; commit/tag and blob identities are the reproducibility anchors.
