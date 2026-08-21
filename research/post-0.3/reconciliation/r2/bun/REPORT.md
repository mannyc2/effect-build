# Bun provider-native breadth reconciliation

Research date: 2026-08-19. Immutable effect-build base: `c4cefd0acc2b7854cc25513967af1a8d415ccab0` on `claude/research-corpus-reconciliation-63pjhg`. Upstream Bun baseline: tag `bun-v1.3.14`, commit `0d9b296af33f2b851fcbf4df3e9ec89751734ba4`.

## Executive conclusion

Bun exposes a substantially broader truthful product surface than the existing effect-build Bun adapter, but breadth must not erase provider semantics. The canonical operations in `PROVIDER-OPERATIONS.csv` separate `Bun.Transpiler` construction, async and sync transforms, structured scan, fast import scan, `Bun.build` memory and direct-write publication, selected-command one-shot build, selected-command raw watch, host-API executable compilation, selected-command executable compilation, the existing effect-build staged executable wrapper, and Bun's ambient global plugin mutations.

The architecture should ship provider-native operations whose request/result contracts can be represented without inventing guarantees. It should defer finite portable roles until R5 proves closure, and reject global plugin ownership, invented typed watch events, direct internal Zig embedding, runtime-neutral executable erasure, inferred continuous support ranges, and signing-as-a-compile-option. Documentation and source establish API shape; they do not prove cancellation, cleanup, remnants, atomicity, retained native ownership, or broad runtime compatibility.

## Gate and method

The source branch was verified identical to the required SHA before research and again before publication. The output branch did not exist before creation. Required corpus material was read in the requested order: `AGENTS.md`; corpus governance, decision record, reconciliation, reconciliation gates; R1/R2 in the research program; the complete provider-native-breadth lane; and relevant browser, lifecycle, compatibility, and Node-canon documents.

Each legacy Bun inventory row was decomposed into atomic claims rather than assigned one row-level classification. Only rows classified `operation` receive semantic identity in the form `provider / operation / lane / lifecycle / {resource-result, output-publication}`. Host, requested target, provider implementation identity, non-semantic option mode, and evaluation phase remain evidence coordinates. Provenance, semantic disposition, product priority, compatibility commitment, implementation status, and certification status remain independent axes.

`ATOMIC-CLAIMS.csv` uses compact codes only for these independent axes: provenance `U` upstream, `R` exact/recorded execution, `E` effect-build repository/implementation, `G` corpus governance, `D` documentation gap, `P` proposal/handoff, `T` tagged-source corroboration; semantic disposition `O` canonical operation, `E` established, `A` accepted, `U` unknown, `P` proposed, `R` rejected, `F` falsified; product priority `S` ship, `D` defer, `R` reject, `N` not applicable; compatibility `X` source-exact v1.3.14 (sometimes with exact observations), `P` exact observed points, `E` one exact coordinate, `C` current package commitment, `B` immutable-base implementation, `N` none; implementation `U` upstream only, `I` implemented, `P` partial/narrow, `N` not implemented, `R` research only; certification `S` source-only, `R` receipt-bounded, `N` not certified, `A` architecture-rejected, `G` governance-accepted. These codes are not combined judgments.

## Source ledger

All upstream authority is first-party Bun material pinned to `bun-v1.3.14` / `0d9b296af33f2b851fcbf4df3e9ec89751734ba4`, retrieved 2026-08-19:

- `https://github.com/oven-sh/bun/blob/bun-v1.3.14/packages/bun-types/bun.d.ts` — `TranspilerOptions`, `Transpiler`, `BuildConfig`, `CompileBuildOptions`, `BuildArtifact`, `BuildOutput`, plugin types.
- `https://github.com/oven-sh/bun/blob/bun-v1.3.14/docs/runtime/transpiler.mdx` — transform, transformSync, scan, scanImports, threadpool/calling-thread behavior.
- `https://github.com/oven-sh/bun/blob/bun-v1.3.14/docs/bundler/index.mdx` — Bun.build API/CLI, virtual files, direct writes, targets, loaders, splitting, chunks, assets, maps, externals, naming, public paths and watch CLI.
- `https://github.com/oven-sh/bun/blob/bun-v1.3.14/docs/bundler/plugins.mdx` — per-build callbacks and native `onBeforeParse` extension point.
- `https://github.com/oven-sh/bun/blob/bun-v1.3.14/docs/bundler/html-static.mdx` — HTML graph build semantics.
- `https://github.com/oven-sh/bun/blob/bun-v1.3.14/docs/bundler/fullstack.mdx` — Bun full-stack server/client graph semantics.
- `https://github.com/oven-sh/bun/blob/bun-v1.3.14/docs/bundler/standalone-html.mdx` — `compile + target=browser` HTML inlining mode and splitting limitation.
- `https://github.com/oven-sh/bun/blob/bun-v1.3.14/docs/bundler/executables.mdx` — API/CLI executable compilation, target tuples, runtime embedding, full-stack executables, embedded files/workers and autoload policy.
- `https://github.com/oven-sh/bun/blob/bun-v1.3.14/docs/bundler/bytecode.mdx` — sidecar/embedded bytecode, ESM compile relation, architecture independence, Bun/JSC version binding.
- `https://github.com/oven-sh/bun/blob/bun-v1.3.14/docs/runtime/ffi.mdx` — experimental `bun:ffi`; Node-API is the recommended stable native-extension boundary.
- `https://github.com/oven-sh/bun/blob/bun-v1.3.14/src/runtime/api/JSTranspiler.zig` — tagged implementation corroboration for captured Transpiler configuration.
- `https://github.com/oven-sh/bun/blob/bun-v1.3.14/src/runtime/api/JSBundler.zig` — tagged implementation corroboration for virtual files, BuildArtifact kinds, compile routing, standalone HTML distinction and no host-API watch member.
- `https://github.com/oven-sh/bun/blob/bun-v1.3.14/src/options_types/CompileTarget.zig` — tagged target parser/acquisition internals; source-only branches are not treated as public support commitments.

Existing exact effect-build execution evidence is bounded to the coordinates recorded by Actions run `31971767617`, artifact `9269991589`, receipt source commit `9b0d2f59567a7684b62df932c67b7a96050b605f`. It includes exact Bun 1.3.9/1.3.14 host-API boundary observations, narrow provider fixtures, raw watch, browser-module output and executable identity. No receipt is promoted into a continuous range.

## Capability map

### Transpiler and scanning

`new Bun.Transpiler(options)` creates reusable captured provider state. `transform` and `transformSync` are distinct operations because scheduling and interruption differ: the async path is documented on Bun's worker threadpool; the sync path runs on the calling thread. Neither resolves imports. `scan` returns exports plus typed imports; `scanImports` returns imports only and is explicitly faster but marginally less accurate. Import kind is provider information and must survive normalization.

### Bun.build

Memory-mode `Bun.build` returns native `BuildArtifact` blobs and structured logs without ordinary output publication. Direct-write `Bun.build` shares request breadth but publishes provider-owned durable files, so it has a different semantic identity. Virtual `files`, loader maps, per-build plugins, externals, `allowUnresolved`, package policy, splitting, naming, `publicPath`, source maps, metafiles, format, conditions, defines, environment injection, minification and bytecode are request modes/modifiers/result detail, not independent top-level operations.

Plugins expose setup, `onStart`, `onResolve`, `onLoad`, native `onBeforeParse`, and `onEnd`. JavaScript callbacks carry host authority. Global `Bun.plugin` and `clearAll` mutate ambient registry state and do not provide a safe lexical ownership handle.

### HTML, full-stack and standalone HTML

An HTML entry is a Bun graph root, not proof of generic static-directory ownership. It may produce rewritten HTML, JavaScript, CSS, chunks and assets according to Bun graph rules. Full-stack mode couples Bun server code with imported browser HTML graphs and Bun routing/manifest semantics. `compile + target=browser` with HTML entrypoints is standalone HTML, producing self-contained HTML rather than a Bun runtime executable; tagged source rejects splitting for that mode.

### CLI and watch

Selected `bun build` is distinct from the host API because executable selection, cwd/env/project authority, raw streams and serializable CLI options differ from callback/virtual-file authority. `bun build --watch` is a long-lived selected process with repeated provider writes and human byte streams. There is no supported `Bun.build` watch member in the pinned declarations and no machine-readable rebuild-event protocol established by the exact receipt.

### Executable compilation

Host-API `Bun.build({compile: ...})` and selected-command `bun build --compile` are distinct operations. The output embeds Bun runtime identity. Documented targets cover Linux glibc/musl, macOS and Windows on x64/arm64, with x64 baseline/modern CPU distinction. Tagged source contains acquisition/parser branches beyond that documentation; those branches are evidence, not public commitment. Cross-target acquisition can consult/download a Bun runtime and mutate cache state, so acquisition must remain visible in compatibility/lifecycle policy.

Bytecode is a modifier. Non-compile CJS may emit `.jsc`; compile embeds bytecode; ESM bytecode requires compile. Bun documents bytecode as architecture-independent but tied to Bun/JavaScriptCore version identity. Code signing/notarization operates on produced artifacts and is a post-production mutation.

### Native ABI boundary

No supported public ABI suitable for directly embedding Bun's general transpiler/bundler from Zig/native code was found in the reviewed tag. Internal Zig functions are implementation details. `bun:ffi` is an experimental JavaScript-to-user-library C-ABI facility, Node-API is a native-extension boundary, and native `onBeforeParse` is a narrow plugin callback ABI. None is a supported general Bun build ABI.

## Information-loss analysis

A single generic “build” result would erase memory versus publication ownership, native BuildArtifact fields, logs, import kinds, HTML/full-stack semantics, selected-command authority, compile target/acquisition identity and watch lifecycle. A generic “executable” would erase the embedded Bun runtime and OS/arch/libc/CPU/version coordinate. A generic “static site” would overclaim resource ownership beyond Bun's HTML graph. A typed watch event would invent a protocol over human streams. An atomic-output abstraction over provider direct writes would claim rollback/commit behavior that documentation does not establish.

The provider-native API should therefore expose raw Bun request/result contracts first, then add finite cross-provider roles only where R5 can prove that normalization loses no decision-relevant information.

## Provider-native API recommendations and candidate register

Every candidate has one recommendation:

| ID | Candidate | Decision |
|---|---|---|
| C01 | BunTranspiler service | ship |
| C02 | async transform | ship |
| C03 | sync transform | ship |
| C04 | structured scan | ship |
| C05 | fast import scan | ship |
| C06 | raw in-memory Bun.build | ship |
| C07 | raw direct-write Bun.build | ship |
| C08 | virtual files | ship |
| C09 | loader map | ship |
| C10 | per-build JavaScript plugins | ship |
| C11 | macro-enabled presets | defer |
| C12 | native artifacts/logs/chunks/assets/maps/metafile passthrough | ship |
| C13 | HTML graph | ship |
| C14 | full-stack AOT | ship |
| C15 | standalone HTML | ship |
| C16 | host-API compile | ship |
| C17 | selected-command compile | ship |
| C18 | raw one-shot selected `bun build` | ship |
| C19 | raw `bun build --watch` scoped handle | ship |
| C20 | typed watch event stream | reject |
| C21 | global `Bun.plugin` wrapper | reject |
| C22 | global `clearAll` wrapper | reject |
| C23 | native `onBeforeParse` | defer |
| C24 | direct internal Zig calls | reject |
| C25 | canonical single-JS build result | reject |
| C26 | generic atomic output-tree wrapper | defer |
| C27 | BrowserModulePayload portable role | defer |
| C28 | HTMLResourceGraph portable role | defer |
| C29 | NodeMainProgram portable role | defer |
| C30 | BunRuntimeExecutable role | defer |
| C31 | runtime-neutral executable role | reject |
| C32 | FullStackBunApplication role | defer |
| C33 | Standalone HTML portable role | defer |
| C34 | continuous support range inferred from 1.3.9/1.3.14 | reject |
| C35 | source-only FreeBSD/Android/explicit-version targets | defer |
| C36 | bytecode modifier | ship |
| C37 | signing folded into compile result | reject |
| C38 | signing/notarization post-production operation | defer |
| C39 | hidden cross-target runtime acquisition | reject |
| C40 | explicit acquisition/provenance policy | defer |

The 19 ship decisions are semantic recommendations, not product-release commitments. The 12 defer decisions require later architecture/compatibility/lifecycle proof. The 9 rejects are information-loss or ownership errors, not statements that upstream Bun lacks the underlying behavior.

## Precise empirical unknowns

U01 async Transpiler cancellation after Effect interruption; U02 Transpiler native backing lifetime/GC; U03 concurrent calls on one Transpiler; U04 macro interruption and worker cleanup; U05 `scan` versus `scanImports` adversarial accuracy; U06 retained BuildArtifact readability after delayed GC pressure; U07 direct-write partial files on parse/plugin failure; U08 direct-write behavior over pre-existing outputs; U09 direct-write interruption remnants; U10 output replacement/rename atomicity; U11 plugin callback ordering under concurrency; U12 `onLoad.defer` interruption/rejection behavior; U13 `onEnd` failure after outputs exist; U14 nested/recursive `Bun.build` edge behavior outside documented macro rejection; U15 raw watch readiness boundary; U16 raw watch failed-rebuild recovery; U17 SIGTERM/SIGINT escalation and descendant cleanup; U18 watch remnants during in-flight write; U19 API compile interruption and partial executable; U20 selected-command compile interruption and partial executable; U21 cross-target cold-cache acquisition; U22 warm-cache/offline acquisition; U23 proxy/TLS/custom-target acquisition behavior; U24 documented target tuple runtime identity across hosts; U25 standalone/full-stack adversarial asset closure; U26 bytecode mismatch/runtime fallback and signing mutation ordering across supported platforms.

None of U01-U26 is converted into a guarantee by documentation alone.

## Adversarial probe specifications

P01 interrupt large async transform and measure provider completion; P02 retain/discard Transpiler under GC pressure; P03 parallel transform/scan on one instance; P04 interrupt macro-backed transform and inspect workers/effects; P05 compare scan methods over type-only, dynamic, require.resolve, CSS and malformed inputs; P06 retain BuildArtifacts across GC and unrelated builds; P07 fail direct-write build after one output becomes possible and enumerate files; P08 repeat over pre-existing conflicting outputs; P09 interrupt direct-write build at controlled phases and enumerate remnants; P10 observe rename/write syscall topology where platform permits; P11 record plugin hook ordering with parallel graph branches; P12 reject/interrupt deferred `onLoad`; P13 throw/reject in `onEnd` after output creation; P14 attempt documented recursion/deadlock boundaries; P15 start raw watch and determine first safe-consumption point; P16 introduce a failed rebuild then a successful edit; P17 signal watch with children/plugins and inspect process tree; P18 signal during large output publication and enumerate remnants; P19 interrupt API executable compile and inspect file/cache state; P20 signal selected-command compile likewise; P21 cross-compile from empty target cache with network observation; P22 repeat offline with warm and cold caches; P23 vary proxy/TLS/custom tarball settings; P24 execute every documented OS/arch/libc/CPU tuple on matching hosts and self-report runtime; P25 stress HTML/full-stack with nested assets, chunks, CSS URLs, workers and external URLs; P26 generate bytecode, cross-version it, then apply signing/notarization after publication and verify identities.

Each probe must record provider version/commit, host, requested target, option mode, evaluation phase, stdout/stderr, exit/error shape, output topology, hashes, remnants and cleanup observations. Passing one coordinate does not certify a range.

## R3 compatibility handoff

R3 should model bundle target (`browser|bun|node`) separately from executable target. Executable compatibility needs Bun version plus OS, architecture, libc and CPU baseline/modern coordinate, with acquisition policy explicit. Exact 1.3.9 and 1.3.14 receipts are isolated observations, not interval endpoints. Source-only target branches require independent public-contract and runtime proof before support. Bytecode compatibility must include Bun/JSC version identity even though architecture independence is documented. CLI and host API can have different compatibility commitments.

## R4 lifecycle handoff

R4 must distinguish caller-retained values, provider-direct durable writes, effect-build staged/committed publication, and long-lived child processes. It must not equate fiber interruption with provider cancellation. Direct-write cleanup, partial writes, remnants and replacement are unknown until probed. Raw watch should be an opaque scoped process with raw streams; any typed event protocol requires new evidence. Cross-target acquisition/cache mutation is lifecycle-visible. Ambient global plugins have no safe ownership story and should remain rejected.

## Possible R5 role handoffs

R5 may investigate `SourceTransform`, `SourceImportScan`, `BrowserModulePayload`, `HTMLResourceGraph`, `NodeMainProgram`, `BunRuntimeExecutable`, `FullStackBunApplication`, standalone HTML, and raw command watch. A role is valid only if it reduces invalid states without discarding Bun-native facts needed for correctness. Provider-specific variants are preferable to a false common denominator.

## Demonstrated conclusions and authority boundary

The research demonstrates upstream surface existence and exact source/declaration contracts at Bun v1.3.14, plus the narrow behaviors recorded by existing receipts. It does not certify cancellation, cleanup, remnants, atomicity, retained native ownership, target matrices, continuous version ranges, or product support. Existing effect-build adoption affects implementation status only; lack of adoption is not a semantic falsifier. No implementation, package graph, export map, test, workflow, release, publication, or product authority is inferred by this documentation package.
