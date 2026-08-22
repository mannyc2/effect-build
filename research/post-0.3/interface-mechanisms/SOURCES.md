# Exact-source bibliography

Evidence classes follow the governing brief. GitHub links are pinned to exact commits. The effect-build source links below pin the immutable study baseline `a3017657e0851530892a9f3d2d55ac5736769881`, whose production package files are unchanged from `v0.3.0`; they do not drift with later implementation work. The esbuild semantic reclassification itself was integrated earlier at `e8641a6ef2c4b8f1d8b0bc511d3079b7b1f9f84c` and retained unchanged.

## Effect 4.0.0-rc.108 (`bef7bf38ae4b73d5511043f707aed083de5da7cc`)

- [Exact package version, repository, and MIT license](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/package.json#L1-L12), documented public prerelease surface.
- [`Scope` ownership, state, close, and finalizer semantics](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Scope.ts#L25-L80) and [`Cause` typed failure/defect/interruption model](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Cause.ts#L1-L75).
- [`Layer` capability construction](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Layer.ts#L54-L90) and [`Stream` typed stream model](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Stream.ts#L122-L168).
- Platform-neutral [`FileSystem`](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/FileSystem.ts#L15-L60), [`Path`](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Path.ts#L18-L60), and scoped [`ChildProcess`](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/unstable/process/ChildProcess.ts#L35-L73) capabilities used by the mechanism mappings.

## effect-build current/published operations

- Published/core exports and scoped bundle: [`packages/effect-build/src/index.ts`](https://github.com/mannyc2/effect-build/blob/a3017657e0851530892a9f3d2d55ac5736769881/packages/effect-build/src/index.ts), [`JavaScriptBundle.ts`](https://github.com/mannyc2/effect-build/blob/a3017657e0851530892a9f3d2d55ac5736769881/packages/effect-build/src/JavaScriptBundle.ts), documented public package surface.
- Command and artifact lifecycle: [`Integration.ts`](https://github.com/mannyc2/effect-build/blob/a3017657e0851530892a9f3d2d55ac5736769881/packages/effect-build/src/Integration.ts), published author surface.
- Command-provider factory: [`Provider.ts`](https://github.com/mannyc2/effect-build/blob/a3017657e0851530892a9f3d2d55ac5736769881/packages/effect-build/src/Provider.ts), published author surface.
- Scalar/matrix execution: [`CompilerEngine.ts`](https://github.com/mannyc2/effect-build/blob/a3017657e0851530892a9f3d2d55ac5736769881/packages/effect-build/src/standalone/internal/CompilerEngine.ts), package-private study-baseline implementation.
- Bun public wrapper/CLI adapter: [`index.ts`](https://github.com/mannyc2/effect-build/blob/a3017657e0851530892a9f3d2d55ac5736769881/packages/effect-build-bun/src/index.ts), [`Adapter.ts`](https://github.com/mannyc2/effect-build/blob/a3017657e0851530892a9f3d2d55ac5736769881/packages/effect-build-bun/src/Adapter.ts), [`Bundle.ts`](https://github.com/mannyc2/effect-build/blob/a3017657e0851530892a9f3d2d55ac5736769881/packages/effect-build-bun/src/Bundle.ts).
- Deno public wrapper/CLI adapter: [`index.ts`](https://github.com/mannyc2/effect-build/blob/a3017657e0851530892a9f3d2d55ac5736769881/packages/effect-build-deno/src/index.ts), [`Adapter.ts`](https://github.com/mannyc2/effect-build/blob/a3017657e0851530892a9f3d2d55ac5736769881/packages/effect-build-deno/src/Adapter.ts).
- Esbuild public wrapper: [`index.ts`](https://github.com/mannyc2/effect-build/blob/a3017657e0851530892a9f3d2d55ac5736769881/packages/effect-build-esbuild/src/index.ts), [`internal/Esbuild.ts`](https://github.com/mannyc2/effect-build/blob/a3017657e0851530892a9f3d2d55ac5736769881/packages/effect-build-esbuild/src/internal/Esbuild.ts).
- Node SEA public wrapper: [`index.ts`](https://github.com/mannyc2/effect-build/blob/a3017657e0851530892a9f3d2d55ac5736769881/packages/effect-build-node-sea/src/index.ts), [`internal/NodeSea.ts`](https://github.com/mannyc2/effect-build/blob/a3017657e0851530892a9f3d2d55ac5736769881/packages/effect-build-node-sea/src/internal/NodeSea.ts), [`SelectedNodeExecutable.ts`](https://github.com/mannyc2/effect-build/blob/a3017657e0851530892a9f3d2d55ac5736769881/packages/effect-build-node-sea/src/internal/SelectedNodeExecutable.ts).
- Frozen research proposal: [`SURFACE.json`](https://github.com/mannyc2/effect-build/blob/a3017657e0851530892a9f3d2d55ac5736769881/research/post-0.3/freeze/SURFACE.json), [`SURFACE-ADJUDICATION.json`](https://github.com/mannyc2/effect-build/blob/a3017657e0851530892a9f3d2d55ac5736769881/research/post-0.3/freeze/SURFACE-ADJUDICATION.json), [`SURFACE-ADJUDICATION-POLICY.json`](https://github.com/mannyc2/effect-build/blob/a3017657e0851530892a9f3d2d55ac5736769881/research/post-0.3/freeze/SURFACE-ADJUDICATION-POLICY.json), and [`MIGRATION.json`](https://github.com/mannyc2/effect-build/blob/a3017657e0851530892a9f3d2d55ac5736769881/research/post-0.3/freeze/MIGRATION.json), research-only artifacts.
- Live npm registry metadata used for the 2026-08-21 release-state observation: [`effect-build`](https://registry.npmjs.org/effect-build), [`effect-build-bun`](https://registry.npmjs.org/effect-build-bun), [`effect-build-deno`](https://registry.npmjs.org/effect-build-deno), [`effect-build-esbuild`](https://registry.npmjs.org/effect-build-esbuild), and [`effect-build-node-sea`](https://registry.npmjs.org/effect-build-node-sea). `GROUND-TRUTH.json` records both `npm view <package> dist-tags --json` and the complete `versions --json` result needed to exclude a non-latest `0.4.x` publication.

## Bun 1.3.9 (`cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a`)

Documented public:

- [`Bun.Transpiler` declarations](https://github.com/oven-sh/bun/blob/cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a/packages/bun-types/bun.d.ts#L2350-L2411).
- [Transpiler caller-thread/worker-pool documentation](https://github.com/oven-sh/bun/blob/cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a/docs/runtime/transpiler.mdx#L61-L93).
- [`BuildConfig.files` and compile fields](https://github.com/oven-sh/bun/blob/cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a/packages/bun-types/bun.d.ts#L2685-L2868).
- [In-memory versus direct-write build outputs](https://github.com/oven-sh/bun/blob/cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a/docs/bundler/index.mdx#L295-L335).
- [HTML/CSS/Wasm/assets loaders](https://github.com/oven-sh/bun/blob/cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a/docs/bundler/index.mdx#L155-L173).
- [CLI watch](https://github.com/oven-sh/bun/blob/cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a/docs/bundler/index.mdx#L147-L153).
- [JS and native plugin threading distinction](https://github.com/oven-sh/bun/blob/cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a/docs/bundler/plugins.mdx#L314-L336).
- [Standalone executable semantics](https://github.com/oven-sh/bun/blob/cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a/docs/bundler/executables.mdx#L6-L40).
- [FFI experimental status](https://github.com/oven-sh/bun/blob/cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a/docs/runtime/ffi.mdx#L6-L11) and [Node-API host support](https://github.com/oven-sh/bun/blob/cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a/docs/runtime/node-api.mdx#L6-L18).
- [Worker experimental/thread/structured-clone semantics](https://github.com/oven-sh/bun/blob/cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a/docs/runtime/workers.mdx#L1-L17).

Source-visible topology:

- [Direct Transpiler implementation](https://github.com/oven-sh/bun/blob/cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a/src/bun.js/api/JSTranspiler.zig#L815-L918).
- [`Bun.build` JS binding and deadlock guard](https://github.com/oven-sh/bun/blob/cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a/src/bun.js/api/JSBundler.zig#L1112-L1151).
- [Queue to singleton bundle thread/work pool](https://github.com/oven-sh/bun/blob/cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a/src/bundler/bundle_v2.zig#L1780-L1826).
- [Detached singleton thread](https://github.com/oven-sh/bun/blob/cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a/src/bundler/BundleThread.zig#L29-L67) and [per-request arena/work pool](https://github.com/oven-sh/bun/blob/cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a/src/bundler/BundleThread.zig#L103-L163).
- [Completion back to JS loop](https://github.com/oven-sh/bun/blob/cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a/src/bundler/bundle_v2.zig#L2017-L2033) and [plugin callback bounce](https://github.com/oven-sh/bun/blob/cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a/src/bundler/bundle_v2.zig#L2340-L2354).
- [CLI build and executable assembly](https://github.com/oven-sh/bun/blob/cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a/src/cli/build_command.zig#L312-L515).
- [Compile-target runtime acquisition](https://github.com/oven-sh/bun/blob/cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a/src/compile_target.zig#L1-L163) and [no Wasm executable target](https://github.com/oven-sh/bun/blob/cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a/src/compile_target.zig#L435-L440).
- [Build/fork cost and requirements](https://github.com/oven-sh/bun/blob/cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a/CONTRIBUTING.md#L1-L49), [license/component notices](https://github.com/oven-sh/bun/blob/cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a/LICENSE.md).

Bounded negative: no supported general outward compiler ABI/service/Wasm surface was found after the documented/public and exact-tree search above. This is not a timeless nonexistence claim.

## Deno 2.9.3 (`f39575ecd50602a5b42b1ba8e93849460de9fcf4`)

Documented public/experimental:

- [`Deno.bundle` declarations and fields](https://github.com/denoland/deno/blob/f39575ecd50602a5b42b1ba8e93849460de9fcf4/cli/tsc/dts/lib.deno.unstable.d.ts#L11-L199).
- [Experimental bundle CLI marker](https://github.com/denoland/deno/blob/f39575ecd50602a5b42b1ba8e93849460de9fcf4/cli/lib.rs#L159-L165) and [experimental transpile marker](https://github.com/denoland/deno/blob/f39575ecd50602a5b42b1ba8e93849460de9fcf4/cli/lib.rs#L216-L223).
- [Compile `--bundle` path](https://github.com/denoland/deno/blob/f39575ecd50602a5b42b1ba8e93849460de9fcf4/cli/tools/compile.rs#L189-L218), [compile watch](https://github.com/denoland/deno/blob/f39575ecd50602a5b42b1ba8e93849460de9fcf4/cli/tools/compile.rs#L42-L67), and [private output/rename](https://github.com/denoland/deno/blob/f39575ecd50602a5b42b1ba8e93849460de9fcf4/cli/tools/compile.rs#L713-L799).
- [denort acquisition/cache/download](https://github.com/denoland/deno/blob/f39575ecd50602a5b42b1ba8e93849460de9fcf4/cli/standalone/binary.rs#L376-L538).
- [Bundle checking/declarations](https://github.com/denoland/deno/blob/f39575ecd50602a5b42b1ba8e93849460de9fcf4/cli/tools/bundle/mod.rs#L306-L395) and [private watch/context path](https://github.com/denoland/deno/blob/f39575ecd50602a5b42b1ba8e93849460de9fcf4/cli/tools/bundle/mod.rs#L1066-L1167).

Host topology/source:

- [JS runtime op and byte normalization](https://github.com/denoland/deno/blob/f39575ecd50602a5b42b1ba8e93849460de9fcf4/ext/bundle/bundle.ts#L12-L44).
- [`BundleProvider` extension point](https://github.com/denoland/deno/blob/f39575ecd50602a5b42b1ba8e93849460de9fcf4/ext/bundle/src/lib.rs#L16-L63) and [op dispatch](https://github.com/denoland/deno/blob/f39575ecd50602a5b42b1ba8e93849460de9fcf4/ext/bundle/src/lib.rs#L223-L237).
- [Private provider installed by CLI workers](https://github.com/denoland/deno/blob/f39575ecd50602a5b42b1ba8e93849460de9fcf4/cli/factory.rs#L1219-L1243).
- [Fresh OS thread/Tokio runtime per host bundle call](https://github.com/denoland/deno/blob/f39575ecd50602a5b42b1ba8e93849460de9fcf4/cli/tools/bundle/provider.rs#L119-L184).
- [Resolver/loader/config/permissions/esbuild initialization](https://github.com/denoland/deno/blob/f39575ecd50602a5b42b1ba8e93849460de9fcf4/cli/tools/bundle/mod.rs#L209-L303).
- [Pinned esbuild helper acquisition](https://github.com/denoland/deno/blob/f39575ecd50602a5b42b1ba8e93849460de9fcf4/cli/tools/bundle/esbuild.rs#L21-L143) and [`esbuild_client` dependency](https://github.com/denoland/deno/blob/f39575ecd50602a5b42b1ba8e93849460de9fcf4/cli/Cargo.toml#L110-L123).

Rust/embedding classification:

- [`deno_core` scope excludes TypeScript/CLI](https://github.com/denoland/deno/blob/f39575ecd50602a5b42b1ba8e93849460de9fcf4/libs/core/README.md#L6-L28).
- [`deno_runtime` slim/rapidly breaking scope](https://github.com/denoland/deno/blob/f39575ecd50602a5b42b1ba8e93849460de9fcf4/runtime/README.md#L6-L20).
- [Private CLI module visibility](https://github.com/denoland/deno/blob/f39575ecd50602a5b42b1ba8e93849460de9fcf4/cli/lib.rs#L3-L26) and [`deno_lib` highly unstable warning](https://github.com/denoland/deno/blob/f39575ecd50602a5b42b1ba8e93849460de9fcf4/cli/lib/README.md).
- [`deno_ast` non-SemVer posture](https://github.com/denoland/deno_ast/blob/8bd7154d96b6dcb7120ad9ed38595e22411f3fd1/README.md#L36-L51) and Deno [pure transform use](https://github.com/denoland/deno/blob/f39575ecd50602a5b42b1ba8e93849460de9fcf4/cli/tools/transpile.rs#L107-L174).
- [Project/declaration transpile path](https://github.com/denoland/deno/blob/f39575ecd50602a5b42b1ba8e93849460de9fcf4/cli/tools/transpile.rs#L236-L331).
- [Hidden internal eszip flag](https://github.com/denoland/deno/blob/f39575ecd50602a5b42b1ba8e93849460de9fcf4/cli/args/flags.rs#L5519-L5524).

Bounded negative: no supported Rust/C/ABI surface implementing Deno's CLI bundle/check/declaration/compile operations was found after the exact workspace/public-module/provider/standalone search above.

## esbuild 0.28.2 (`609683d892977362a0f99026cb74b96263d728a9`)

Documented public:

- [Exact public JavaScript build/transform declarations](https://github.com/evanw/esbuild/blob/609683d892977362a0f99026cb74b96263d728a9/lib/shared/types.ts#L116-L304), [context/watch/serve/cancel/dispose plus format/analyze declarations](https://github.com/evanw/esbuild/blob/609683d892977362a0f99026cb74b96263d728a9/lib/shared/types.ts#L528-L603), and [CLI option/watch/serve implementation](https://github.com/evanw/esbuild/blob/609683d892977362a0f99026cb74b96263d728a9/pkg/cli/cli_impl.go#L1083-L1552).
- [Exact npm package/platform binary graph](https://github.com/evanw/esbuild/blob/609683d892977362a0f99026cb74b96263d728a9/npm/esbuild/package.json#L1-L73).
- [Official Go Build/Transform](https://github.com/evanw/esbuild/blob/609683d892977362a0f99026cb74b96263d728a9/pkg/api/api.go#L396-L488), [Go context](https://github.com/evanw/esbuild/blob/609683d892977362a0f99026cb74b96263d728a9/pkg/api/api.go#L529-L560), and [format/analyze](https://github.com/evanw/esbuild/blob/609683d892977362a0f99026cb74b96263d728a9/pkg/api/api.go#L715-L746).
- [Exact browser Wasm package](https://github.com/evanw/esbuild/blob/609683d892977362a0f99026cb74b96263d728a9/npm/esbuild-wasm/package.json#L1-L18).

Source-visible internal/service topology:

- [Node module-global service spawn](https://github.com/evanw/esbuild/blob/609683d892977362a0f99026cb74b96263d728a9/lib/npm/node.ts#L133-L370), [optional-package/downloaded-binary selection and ambient `ESBUILD_BINARY_PATH` override](https://github.com/evanw/esbuild/blob/609683d892977362a0f99026cb74b96263d728a9/lib/npm/node-platform.ts#L6-L143), and [sync worker/service behavior](https://github.com/evanw/esbuild/blob/609683d892977362a0f99026cb74b96263d728a9/lib/npm/node.ts#L422-L520).
- [Framing/request IDs/reverse requests/version handshake](https://github.com/evanw/esbuild/blob/609683d892977362a0f99026cb74b96263d728a9/lib/shared/common.ts#L505-L640).
- [Host plugin callback registration](https://github.com/evanw/esbuild/blob/609683d892977362a0f99026cb74b96263d728a9/lib/shared/common.ts#L1169-L1240).
- [Hidden `--service` entry](https://github.com/evanw/esbuild/blob/609683d892977362a0f99026cb74b96263d728a9/cmd/esbuild/main.go#L200-L218) and [service operations](https://github.com/evanw/esbuild/blob/609683d892977362a0f99026cb74b96263d728a9/cmd/esbuild/service.go#L227-L575).
- [Browser initialization/worker and no-FS channel](https://github.com/evanw/esbuild/blob/609683d892977362a0f99026cb74b96263d728a9/lib/npm/browser.ts#L65-L154), [Wasm worker service startup](https://github.com/evanw/esbuild/blob/609683d892977362a0f99026cb74b96263d728a9/lib/shared/worker.ts#L12-L102), [browser support declarations](https://github.com/evanw/esbuild/blob/609683d892977362a0f99026cb74b96263d728a9/lib/shared/types.ts#L528-L641), and [Wasm serve exclusion](https://github.com/evanw/esbuild/blob/609683d892977362a0f99026cb74b96263d728a9/pkg/api/serve_wasm.go#L8-L12).

Bounded negatives: `--service`/protocol has no documented compatibility promise; no supported C/C++/N-API/FFI API was found after public docs/packages and exact `pkg/lib/cmd` search.

## Node 26.7.0 (`b4f23d3619c98bed09af93a21192f6080197a8c6`)

Documented public/experimental:

- [SEA direct/config/legacy/runtime documentation](https://github.com/nodejs/node/blob/b4f23d3619c98bed09af93a21192f6080197a8c6/doc/api/single-executable-applications.md#L21-L625).
- [C++ embedder scope/stability](https://github.com/nodejs/node/blob/b4f23d3619c98bed09af93a21192f6080197a8c6/doc/api/embedding.md#L5-L22).
- [Generic snapshot CLI/compatibility](https://github.com/nodejs/node/blob/b4f23d3619c98bed09af93a21192f6080197a8c6/doc/api/cli.md#L470-L520).

Source-visible direct/internal topology:

- [Blob generation/main/assets/cache/snapshot](https://github.com/nodejs/node/blob/b4f23d3619c98bed09af93a21192f6080197a8c6/src/node_sea.cc#L723-L792) and [private serialization](https://github.com/nodejs/node/blob/b4f23d3619c98bed09af93a21192f6080197a8c6/src/node_sea.cc#L63-L239).
- [Config parser](https://github.com/nodejs/node/blob/b4f23d3619c98bed09af93a21192f6080197a8c6/src/node_sea.cc#L350-L571).
- [Direct LIEF builder](https://github.com/nodejs/node/blob/b4f23d3619c98bed09af93a21192f6080197a8c6/src/node_sea_bin.cc#L380-L480) and [non-transactional writer](https://github.com/nodejs/node/blob/b4f23d3619c98bed09af93a21192f6080197a8c6/src/node_file_utils.cc#L29-L86).
- [Internal SEA symbols](https://github.com/nodejs/node/blob/b4f23d3619c98bed09af93a21192f6080197a8c6/src/node_sea.h#L84-L93).
- [Public embedder snapshot types](https://github.com/nodejs/node/blob/b4f23d3619c98bed09af93a21192f6080197a8c6/src/node.h#L460-L484) and [snapshotting environment](https://github.com/nodejs/node/blob/b4f23d3619c98bed09af93a21192f6080197a8c6/src/node.h#L946-L994).

Supported external/prerelease injector:

- [`postject.inject()`](https://github.com/nodejs/postject/blob/3c4f2080ee56025716c3add0f6c03b16e2af54ff/src/api.js#L1-L163).
- [Wasm memory configuration](https://github.com/nodejs/postject/blob/3c4f2080ee56025716c3add0f6c03b16e2af54ff/CMakeLists.txt#L22-L31), [copy/mutation implementation](https://github.com/nodejs/postject/blob/3c4f2080ee56025716c3add0f6c03b16e2af54ff/src/postject.cpp#L16-L87), and [artifact/resource design](https://github.com/nodejs/postject/blob/3c4f2080ee56025716c3add0f6c03b16e2af54ff/README.markdown#L68-L112).

Bounded negative: no supported JS/Node-API/C/C++ SEA assembly library was found; public embedder/snapshot APIs are distinct products, while assembly functions are internal.

## Rolldown 1.2.4 (`483c64833c0fb0d1b75f1339accf781c0a09b335`)

Documented public/experimental:

- [Package/API/N-API targets](https://github.com/rolldown/rolldown/blob/483c64833c0fb0d1b75f1339accf781c0a09b335/packages/rolldown/package.json#L1-L52).
- [Public/experimental bundler API](https://github.com/rolldown/rolldown/blob/483c64833c0fb0d1b75f1339accf781c0a09b335/docs/apis/bundler-api.md#L1-L76) and [plugin API](https://github.com/rolldown/rolldown/blob/483c64833c0fb0d1b75f1339accf781c0a09b335/docs/apis/plugin-api.md#L1-L10).
- [Executable config/CLI semantics](https://github.com/rolldown/rolldown/blob/483c64833c0fb0d1b75f1339accf781c0a09b335/docs/apis/cli.md#L1-L61).
- [Published Rust crate](https://github.com/rolldown/rolldown/blob/483c64833c0fb0d1b75f1339accf781c0a09b335/crates/rolldown/Cargo.toml#L1-L19) and [explicit no-SemVer/docs/support promise](https://github.com/rolldown/rolldown/blob/483c64833c0fb0d1b75f1339accf781c0a09b335/docs/apis/rust-crates.md#L1-L15).

Native/lifecycle topology:

- [Architecture layers](https://github.com/rolldown/rolldown/blob/483c64833c0fb0d1b75f1339accf781c0a09b335/AGENTS.md#L26-L49).
- [Same-process Tokio runtime](https://github.com/rolldown/rolldown/blob/483c64833c0fb0d1b75f1339accf781c0a09b335/crates/rolldown_binding/src/lib.rs#L92-L120).
- [`RolldownBuild` generate/write/close](https://github.com/rolldown/rolldown/blob/483c64833c0fb0d1b75f1339accf781c0a09b335/packages/rolldown/src/api/rolldown/rolldown-build.ts#L23-L147) and [fresh full build per call](https://github.com/rolldown/rolldown/blob/483c64833c0fb0d1b75f1339accf781c0a09b335/crates/rolldown_binding/src/classic_bundler.rs#L1-L48).
- [Experimental `DevEngine` creation, watch/callback configuration, and build-state methods](https://github.com/rolldown/rolldown/blob/483c64833c0fb0d1b75f1339accf781c0a09b335/packages/rolldown/src/api/dev/dev-engine.ts#L21-L129), plus [close and lazy-entry methods](https://github.com/rolldown/rolldown/blob/483c64833c0fb0d1b75f1339accf781c0a09b335/packages/rolldown/src/api/dev/dev-engine.ts#L151-L178).
- [N-API async build/close](https://github.com/rolldown/rolldown/blob/483c64833c0fb0d1b75f1339accf781c0a09b335/crates/rolldown_binding/src/binding_bundler.rs#L22-L209).
- [JS plugin adaptation](https://github.com/rolldown/rolldown/blob/483c64833c0fb0d1b75f1339accf781c0a09b335/packages/rolldown/src/plugin/bindingify-plugin.ts#L57-L193) and [Rust reverse callbacks](https://github.com/rolldown/rolldown/blob/483c64833c0fb0d1b75f1339accf781c0a09b335/crates/rolldown_binding/src/options/plugin/js_plugin.rs#L78-L158).
- [External-memory handle](https://github.com/rolldown/rolldown/blob/483c64833c0fb0d1b75f1339accf781c0a09b335/packages/rolldown/src/types/external-memory-handle.ts#L7-L60), [lazy JS chunk](https://github.com/rolldown/rolldown/blob/483c64833c0fb0d1b75f1339accf781c0a09b335/packages/rolldown/src/types/output-chunk-impl.ts#L8-L98), and [native release](https://github.com/rolldown/rolldown/blob/483c64833c0fb0d1b75f1339accf781c0a09b335/crates/rolldown_binding/src/types/binding_output_chunk.rs#L12-L57).
- [Node-script CLI entry](https://github.com/rolldown/rolldown/blob/483c64833c0fb0d1b75f1339accf781c0a09b335/packages/rolldown/bin/cli.mjs#L1-L2) and [CLI build/write/watch](https://github.com/rolldown/rolldown/blob/483c64833c0fb0d1b75f1339accf781c0a09b335/packages/rolldown/src/cli/commands/bundle.ts#L46-L177).
- [Binding selection/version/WASI branches](https://github.com/rolldown/rolldown/blob/483c64833c0fb0d1b75f1339accf781c0a09b335/packages/rolldown/src/binding.cjs#L63-L82).
- [Package-private binding crate](https://github.com/rolldown/rolldown/blob/483c64833c0fb0d1b75f1339accf781c0a09b335/crates/rolldown_binding/Cargo.toml#L1-L16).

Freeze status: [`R6-ROLLDOWN-VERDICTS.md`](../freeze/R6-ROLLDOWN-VERDICTS.md) and [`CANDIDATE-VERDICTS.json`](../freeze/CANDIDATE-VERDICTS.json). Rolldown evidence is future-candidate research only.
