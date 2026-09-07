# External Command compatibility audit

Audited September 6, 2026, against effect-build source baseline `1082bd067262e79af3cb8800d99bc8055dd5a198`. This is the source and real-command evidence behind the initial compatibility policy. The generated [compatibility table](compiler-compatibility.md) remains the current acceptance authority.

The reviewed floors remain esbuild 0.28.2 and Bun 1.3.14/1.4.2. **Deno must remain exactly 2.9.5:** the newest patch, 2.9.6, removed an exposed option from each public operation family. A successful default build would have missed both regressions. Future Deno patches require review of the repaired surface before admission; this audit does not assume that an unreleased patch fixes them.

## Exact versions and evidence meaning

The official npm version registers were read during this audit: [esbuild](https://registry.npmjs.org/esbuild), [Bun](https://registry.npmjs.org/bun), and [Deno](https://registry.npmjs.org/deno). Canonical three-component releases in the proposed minor lines gave:

| Command line | Proposed minimum | Newest available patch | Audit decision                                           |
| ------------ | ---------------- | ---------------------- | -------------------------------------------------------- |
| esbuild 0.28 | 0.28.2           | 0.28.2                 | Admit patches from 0.28.2 within 0.28                    |
| Bun 1.3      | 1.3.14           | 1.3.14                 | Admit patches from 1.3.14 within 1.3                     |
| Bun 1.4      | 1.4.2            | 1.4.2                  | Separately reviewed; admit patches from 1.4.2 within 1.4 |
| Deno 2.9     | 2.9.5            | 2.9.6                  | Retain exactly 2.9.5; 2.9.6 fails the exposed surface    |

These are sufficient reviewed floors, not claims about the earliest historical introduction of every flag. The audit deliberately does not lower a floor based on an older compiler's successful default invocation. Accepted future patches describe a maintained policy, while pinned fixture versions and their actual execution results describe evidence. esbuild explicitly treats patches as compatible within a minor line in its [production-readiness policy](https://esbuild.github.io/faq/#production-readiness). Bun's ranges are effect-build's maintained commitment.

Exact macOS arm64 native compiler files were selected directly. Their SHA-256 digests were recomputed and matched the previously acquired official package binaries before probing:

| Compiler       | Native binary SHA-256                                              |
| -------------- | ------------------------------------------------------------------ |
| esbuild 0.28.2 | `10b6243df618d374bb2d5c9cfbe7052e1405f6aa4e53a6164f11a91b9f2e1384` |
| Bun 1.3.14     | `e0c90ec15d33363e6b70713d56bc3b2c7585c17f40a0fe0f8fd9305901d4e233` |
| Bun 1.4.2      | `35d20dd0263e5c950194434b925454fdfa9ba6e4467da960410fa05b08a7a5b5` |
| Deno 2.9.5     | `b5bd08edab254d42d7b05aa5b6cb4c9b8d4dede4975aff76951ce2cce18866fa` |
| Deno 2.9.6     | `b3ac3bd206e48c26026cadd80c1367e96c149f9c66130952382a642b09fa8a71` |

The audit combined pinned upstream parser/implementation sources, each exact binary's help, individual real parser probes, successful differential Deno reproductions, and actual Bun 1.4.2 compilation of every typed executable target. It covered 37 esbuild flag/value probes, 144 Bun probes across the two admitted versions, and 210 Deno probes across 2.9.5/2.9.6. Individual parser probes used a missing input to establish option recognition without pretending to establish output semantics. Source/configuration/option-combination failures after parsing are distinct from a missing flag. The implementation's integration fixtures establish emitted-program and resource-lifecycle behavior separately.

## esbuild public Command surface

Public operations are `Build.build`, `BuildToDirectory.buildToDirectory`, and `Watch.watch`. Their shared renderer is `packages/effect-build-esbuild/src/internal/Command.ts`; Watch additionally supplies its process-lifecycle switch. The following inventory covers every public input that produces compiler argv. All entries exist in [esbuild v0.28.2 CLI parsing](https://github.com/evanw/esbuild/blob/v0.28.2/pkg/cli/cli_impl.go#L85), and the real binary accepted each tested enumerated form or reported the expected native combination/input error.

| Public input                                    | Rendered CLI boundary and reviewed values                                                                                                |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `entrypoint`, `entrypoints`                     | Positional input paths; directory/watch accepts multiple entries                                                                         |
| `directory`, Watch `output`                     | `--outdir=…`; Watch also admits `--outfile=…`                                                                                            |
| `bundle`                                        | `--bundle` when true; false/absent preserves unbundled native invocation                                                                 |
| `format`                                        | `--format=iife/cjs/esm`                                                                                                                  |
| `platform`                                      | `--platform=browser/node/neutral`                                                                                                        |
| `target`                                        | `--target=…`, including comma-separated lists; arbitrary target text is native esbuild validation, not a promise to support every string |
| `minify`                                        | `--minify`                                                                                                                               |
| `sourcemap`                                     | Omitted for false; `--sourcemap` for true; `--sourcemap=linked/external/inline`                                                          |
| `splitting`                                     | `--splitting`; native output/format restrictions remain                                                                                  |
| `external`, `define`, `loader`, `inject`        | Repeated `--external:…`, `--define:key=value`, `--loader:.ext=value`, `--inject:…`; loader values remain native strings                  |
| `packages`                                      | `--packages=bundle/external`                                                                                                             |
| `publicPath`, `tsconfig`, `metafile`, `outbase` | `--public-path`, `--tsconfig`, `--metafile`, `--outbase` with `=value`                                                                   |
| `entryNames`, `chunkNames`, `assetNames`        | `--entry-names`, `--chunk-names`, `--asset-names` with native templates                                                                  |
| `allowOverwrite`                                | `--allow-overwrite`                                                                                                                      |
| `logLevel`                                      | `--log-level=verbose/debug/info/warning/error/silent`                                                                                    |
| Watch lifecycle                                 | `--watch=forever`, output flag, original positional entries; scope owns termination                                                      |

`cwd` and `environment` are effect-build process inputs, not compiler flags. There is no executable target enum for esbuild Command: its `target` is a JavaScript/CSS syntax target interpreted by [the upstream target parser](https://github.com/evanw/esbuild/blob/v0.28.2/pkg/cli/cli_impl.go#L1025). Serve remains private and exactly 0.28.2; this review does not promote it. The supplied esbuild Api package retains its exact internal service-binary relationship.

## Bun public Command surface

Public operations are build to stdout, build to directory, watch, and executable compile. The shared build renderer is `packages/effect-build-bun/src/internal/BuildCommand.ts`; executable inputs/rendering are in `src/Command/CompileExecutable.ts`.

The build parameter sets include common transpiler flags, not just flags printed by `bun build --help`. The source audit therefore checked [1.3.14 Arguments.zig](https://github.com/oven-sh/bun/blob/bun-v1.3.14/src/cli/Arguments.zig#L55) and [1.4.2 Arguments.rs](https://github.com/oven-sh/bun/blob/bun-v1.4.2/src/runtime/cli/Arguments.rs#L100), including their build-specific sets and option decoding. It also checked [1.3.14 build execution](https://github.com/oven-sh/bun/blob/bun-v1.3.14/src/cli/build_command.zig) and [1.4.2 build execution](https://github.com/oven-sh/bun/blob/bun-v1.4.2/src/runtime/cli/build_command.rs).

| Public build input                                | Rendered CLI boundary and reviewed values on both versions                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `entrypoint`, `entrypoints`, `outdir`             | `build`, positional paths, and `--outdir=…`                                                                                    |
| `target`, `format`                                | `--target=browser/bun/node`; `--format=esm/cjs/iife`                                                                           |
| `sourcemap`                                       | `--sourcemap=linked/inline/external/none`; stdout restricts to inline/none                                                     |
| `splitting`, `packages`, `external`, `conditions` | `--splitting`, `--packages=bundle/external`, repeated `--external=…`, `--conditions=…`                                         |
| `publicPath`, `root`                              | `--public-path=…`, `--root=…`                                                                                                  |
| `define`, `loader`                                | `--define key=value`; `--loader .ext:loader`                                                                                   |
| Loader enum, all 16 values                        | `js`, `jsx`, `ts`, `tsx`, `json`, `toml`, `yaml`, `text`, `file`, `dataurl`, `base64`, `css`, `html`, `sqlite`, `wasm`, `napi` |
| `naming.entry`, `.chunk`, `.asset`                | `--entry-naming=…`, `--chunk-naming=…`, `--asset-naming=…`                                                                     |
| `minify`                                          | Whole `--minify`, or `--minify-syntax`, `--minify-whitespace`, `--minify-identifiers`, `--keep-names`                          |
| `bytecode`                                        | `--bytecode`; excluded from stdout. Native format/target constraints remain                                                    |
| `banner`, `footer`, `metafile`                    | `--banner=…`, `--footer=…`, `--metafile=…`; metafile excluded from stdout                                                      |
| `environmentInline`                               | `--env=inline/disable`, or prefix wildcard such as `--env=AUDIT*`                                                              |
| `drop`, `features`                                | Repeated `--drop value`, `--feature value`; these are common transpiler parameters                                             |
| `tsconfig`                                        | `--tsconfig-override path`                                                                                                     |
| `reactFastRefresh`, `bundle`                      | `--react-fast-refresh`; false bundle emits `--no-bundle`                                                                       |
| Watch `noClearScreen`                             | `--watch`, optionally `--no-clear-screen`, with directory build arguments                                                      |

The [1.3.14 loader parser](https://github.com/oven-sh/bun/blob/bun-v1.3.14/src/bundler/options.zig#L568) includes all 16 typed values even though the concise help lists fewer. Real loader probes against both versions accepted all 16 names. Flags inherited by CompileExecutable (`minify`, inline/none `sourcemap`, `bytecode`, `packages`, `external`, `conditions`, `define`, and `environmentInline`) use the same build parameter set. Its remaining inputs are:

| Public compile input                      | Rendered CLI boundary on both versions                                             |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `entrypoints`, `outfile`, `target`        | `build --compile`, positional entrypoints, `--outfile=…`, optional `--target=…`    |
| `execArgv`                                | Repeated `--compile-exec-argv=…`                                                   |
| `autoloadDotenv`, `autoloadBunfig`        | Positive/negative `--compile-autoload-dotenv`, `--compile-autoload-bunfig`         |
| `autoloadTsconfig`, `autoloadPackageJson` | Positive/negative `--compile-autoload-tsconfig`, `--compile-autoload-package-json` |
| `windows.hideConsole`, `.icon`            | `--windows-hide-console`, `--windows-icon=…`                                       |
| `windows.title`, `.publisher`, `.version` | `--windows-title=…`, `--windows-publisher=…`, `--windows-version=…`                |
| `windows.description`, `.copyright`       | `--windows-description=…`, `--windows-copyright=…`                                 |

Windows metadata/icon operations retain native Windows-builder restrictions. The audit's macOS probes recognized those flags and produced those native restrictions. Bun 1.4.2 permits hide-console for a Windows cross-target where 1.3.14 additionally requires a Windows builder. This is an upstream expansion; no flag rewriting or new effect-build fallback is needed. Source review does not claim a Windows resource-editing execution on this Mac.

### Every typed Bun executable target

[1.3.14 CompileTarget](https://github.com/oven-sh/bun/blob/bun-v1.3.14/src/options_types/CompileTarget.zig) and [1.4.2 compile_target](https://github.com/oven-sh/bun/blob/bun-v1.4.2/src/options_types/compile_target.rs#L247) parse the target components, including `modern` and `baseline`. All 13 current target literals were actually passed to Bun 1.4.2 `build --compile`, with separate temporary output paths. Every command returned zero and emitted the expected native header, independently inspected using `/usr/bin/file`.

| Exact typed target         | 1.4.2 emitted header     | Execution during this audit                        |
| -------------------------- | ------------------------ | -------------------------------------------------- |
| `bun-darwin-x64`           | Mach-O x86_64            | Not run                                            |
| `bun-darwin-x64-baseline`  | Mach-O x86_64            | Not run                                            |
| `bun-darwin-arm64`         | Mach-O arm64             | Passed; printed value 42 and runtime version 1.4.2 |
| `bun-linux-x64`            | ELF x86-64, GNU loader   | Not run                                            |
| `bun-linux-x64-baseline`   | ELF x86-64, GNU loader   | Not run                                            |
| `bun-linux-x64-modern`     | ELF x86-64, GNU loader   | Not run                                            |
| `bun-linux-arm64`          | ELF aarch64, GNU loader  | Not run                                            |
| `bun-linux-x64-musl`       | ELF x86-64, musl loader  | Not run                                            |
| `bun-linux-arm64-musl`     | ELF aarch64, musl loader | Not run                                            |
| `bun-windows-x64`          | PE32+ x86-64             | Not run                                            |
| `bun-windows-x64-baseline` | PE32+ x86-64             | Not run                                            |
| `bun-windows-x64-modern`   | PE32+ x86-64             | Not run                                            |
| `bun-windows-arm64`        | PE32+ Aarch64            | Not run                                            |

Thus Bun 1.4.2 does not require target-specific admission for the existing enum. CLI acceptance and correct headers do not establish foreign-target execution, instruction-set compatibility, or cold/warm/offline runtime acquisition. Those retain their existing explicit evidence qualifications and appropriate-runner fixtures.

The expanded native Windows 1.3.14 target fixture exposed a separate construction-host filesystem boundary. The plain Windows x64 target compiled and executed, but baseline acquisition repeatedly failed while moving the extracted runtime into Bun's cache. The same official baseline archive cross-compiled successfully on macOS, and all three Windows variants passed with Bun 1.4.2 on Windows. The 1.3.14 archive contains the expected ordinary `package/bin/bun.exe` file; this is not a removed target or an archive-layout change.

Pinned 1.3.14 source explains the volume sensitivity: [CompileTarget downloads](https://github.com/oven-sh/bun/blob/bun-v1.3.14/src/options_types/CompileTarget.zig#L249) extract into a relative directory beneath compiler `cwd`, then move `bun.exe` into the [install cache](https://github.com/oven-sh/bun/blob/bun-v1.3.14/src/install/PackageManager/PackageManagerDirectories.zig#L152). On hosted Windows these default to separate drives. The [cross-volume move path](https://github.com/oven-sh/bun/blob/bun-v1.3.14/src/sys/sys.zig#L4363) unlinks its source before the Windows helper tries a pathname-based copy. The failure log masks the lower-level syscall; this identifies the cross-volume move as the source-backed explanation, while the controlled same-volume fixture tests the correction.

The target fixture now uses its private working directory and a new empty `BUN_INSTALL_CACHE_DIR` beneath that directory. Bun still downloads and extracts the actual target runtime; the fixture does not preseed its cache or replace a target. All three Windows x64 variants remain compiled and executed by the native Windows runner. The library preserves the caller's native working-directory and environment choices; this test setup does not claim that Bun 1.3.14's cross-volume acquisition works.

Bun 1.4.1 remains rejected because its variable-collision defect was independently reproduced in the preceding research and is documented in the [1.4.2 fix](https://bun.com/blog/bun-v1.4.2#fixed-bun-build-variable-name-collision). The permanent fixture must consume generated code and check its value. Bun 1.4.0 remains unreviewed; the floor does not claim that 1.4.0 has the same defect. Host Bun Api admission and the exact `bun-types` declaration relationship remain separate from this Command review.

## Deno public Command surface

Public operations are transpile to stdout, transpile to directory, declaration emission, and executable compile. The renderer inventory is `packages/effect-build-deno/src/internal/Options.ts`, `src/internal/CompileCommand.ts`, and `src/Command/Transpile.ts`. At 2.9.5, [transpile](https://github.com/denoland/deno/blob/v2.9.5/cli/args/flags.rs#L4634) calls the shared [compile/project argument builder](https://github.com/denoland/deno/blob/v2.9.5/cli/args/flags.rs#L5077); [compile](https://github.com/denoland/deno/blob/v2.9.5/cli/args/flags.rs#L2354) adds runtime/permission and compile-specific arguments.

| Shared public project input | Rendered boundary present in 2.9.5                                                   |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `config`                    | `--config path` or `--no-config`; absent preserves discovery                         |
| `importMap`                 | `--import-map path`                                                                  |
| `lock`                      | `--no-lock`, `--lock`, or `--lock path`; native optional-value parsing remains       |
| `frozen`                    | `--frozen` or `--frozen=false`                                                       |
| `noNpm`, `noRemote`         | `--no-npm`, `--no-remote`                                                            |
| `nodeModulesDir`            | `--node-modules-dir=auto/manual/none`                                                |
| `nodeModulesLinker`         | `--node-modules-linker=isolated/hoisted`; native hoisted/manual relationship remains |
| `reload`                    | `--reload` or `--reload=specifier,…`                                                 |
| `vendor`                    | `--vendor` or `--vendor=false`                                                       |
| `cert`                      | `--cert path`                                                                        |
| `conditions`                | Repeated `--conditions value`; **missing from transpile in 2.9.6**                   |
| `minimumDependencyAge`      | `--minimum-dependency-age value`; provider-native age grammar remains                |

Transpile additionally accepts positional `file`/`files`, `--source-map none/inline/separate`, `--quiet`, `--outdir path`, and `--declaration`. Stdout restricts source maps to none/inline; directory and declaration forms share the wider enum. Deno itself describes this command as experimental. The wrapper retains that native behavior; a patch line cannot be assumed compatible merely from SemVer.

| Public compile input                            | Rendered boundary present in 2.9.5                                                            |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `entrypoint`, `scriptArgs`, `outfile`, `target` | `compile`, positional entrypoint and script args, `--output path`, optional `--target triple` |
| `cachedOnly`, `check`                           | `--cached-only`; `--check`, `--check=all`, `--no-check`, `--no-check=remote`                  |
| `allowAll`, `permissionSet`, `noPrompt`         | `--allow-all`; `--permission-set` or `--permission-set=name`; `--no-prompt`                   |
| All allow permissions                           | `--allow-read/write/net/env/run/ffi/sys/import`, either bare or `=list`                       |
| All deny permissions                            | `--deny-read/write/net/env/run/ffi/sys/import`, either bare or `=list`                        |
| `ignoreRead`, `ignoreEnv`                       | `--ignore-read`, `--ignore-env`, either bare or `=list`                                       |
| `allowScripts`                                  | `--allow-scripts` or `--allow-scripts=npm:package,…`; **missing from compile in 2.9.6**       |
| `envFile`, `quiet`                              | `--env-file` or `--env-file=path`; `--quiet`                                                  |
| `ext`                                           | `--ext ts/tsx/js/jsx/mts/mjs/cts/cjs`                                                         |
| `location`, `preload`, `require`                | `--location value`, repeated `--preload path`, `--require path`                               |
| `seed`, `v8Flags`                               | `--seed number`, `--v8-flags=flag,…`                                                          |
| `noCodeCache`, `appName`                        | `--no-code-cache`, `--app-name value`                                                         |
| `bundle`, `minify`, `engine`                    | `--bundle`, `--minify`, `--engine v8/quickjs`; native minify/bundle relationship remains      |
| `exclude`, `excludeUnusedNpm`                   | Repeated `--exclude path`, `--exclude-unused-npm`                                             |
| `icon`, `include`                               | `--icon path`, repeated `--include path`                                                      |
| `noTerminal`, `selfExtracting`                  | `--no-terminal`, `--self-extracting`                                                          |

All six typed triples exactly match the 2.9.5 [upstream supported target list](https://github.com/denoland/deno/blob/v2.9.5/cli/args/flags.rs#L2345): `x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu`, `x86_64-pc-windows-msvc`, `aarch64-pc-windows-msvc`, `x86_64-apple-darwin`, and `aarch64-apple-darwin`. No target is inferred from a runtime download filename.

`cwd`, `environment`, observation mode, artifact finalization, and matrix coordinates are effect-build inputs, not additional Deno flags. The explicit runtime option renders the `DENORT_BIN` environment override. [2.9.5 standalone implementation](https://github.com/denoland/deno/blob/v2.9.5/cli/standalone/binary.rs#L1797) reads that override; engine-specific runtime selection otherwise distinguishes V8 and QuickJS. The library must compare the authenticated explicit runtime's version with the authenticated selected compiler's version, retain target/header checks, and preserve the qualification that a matching version alone does not establish the requested engine relationship. Private bundle/watch and compile-watch retain their exact policy and are not promoted by this audit.

### Real explicit runtime identity

Real-tool testing exposed an older invalid assumption in the runtime adapter: **a bare official `denort` does not implement `--version`.** The official 2.9.5 and 2.9.6 macOS arm64 archives were verified against the GitHub release assets' SHA-256 digests before extraction. Both exact runtime binaries exit one, emit no stdout, and report `Could not find standalone binary section.` when invoked with `--version`. [The runtime entrypoint](https://github.com/denoland/deno/blob/v2.9.5/cli/rt/lib.rs#L68) extracts a standalone payload before running, and [the section reader](https://github.com/denoland/deno/blob/v2.9.5/cli/rt/binary.rs#L387) explains the observed failure. A mocked Deno banner cannot establish this boundary.

| Official runtime                                                                                                                | Archive SHA-256                                                    | Extracted executable SHA-256                                       |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| [denort 2.9.5, aarch64-apple-darwin](https://github.com/denoland/deno/releases/download/v2.9.5/denort-aarch64-apple-darwin.zip) | `4f3dc3b7d28cd9ff1099972bd23ef85040b4c48daf8c57189a1d9765b6240c66` | `d33fb959f65541acecc2deb56bda370f0928ae35577bf8ab44c07ad0acb798fa` |
| [denort 2.9.6, aarch64-apple-darwin](https://github.com/denoland/deno/releases/download/v2.9.6/denort-aarch64-apple-darwin.zip) | `315d36905ea1081e3d0e1c39890f1a1bb0d477e497995929e99330fbb679f595` | `2c3721b6e651f29eb3cb01a8c18f81ad78ee300cc5a7c6edd25f58b9902edeb2` |

The actual version can be observed by compiling a small trusted introspection program with the selected compiler and exact runtime override, then executing the temporary artifact. This was proved with `console.log(JSON.stringify(Deno.version))`, compiler 2.9.5, and each runtime above. Both compile and execution returned zero. The 2.9.5 runtime reported `deno: "2.9.5"`; the 2.9.6 runtime reported `deno: "2.9.6"`. The observed version therefore belongs to the override runtime, not the compiler's metadata. The audited probe disabled configuration, locks, npm, remote resolution, checking, and code cache; used a private scratch directory; and compiled with the exact `DENORT_BIN` path.

This requires a scoped, bounded identity probe with reauthentication of the same selected compiler and runtime before launch. It observes host-runnable runtimes; it does not establish that a foreign-target runtime can execute locally. Failures remain failures, without alternate runtime selection. `Deno.version` reports no release channel, so that observation must retain `unreported` instead of manufacturing `stable`. The upstream [`denover` section](https://github.com/denoland/deno/blob/v2.9.5/cli/lib/version.rs#L33) contains a release-channel marker, not a public runtime-version record. Searching arbitrary executable strings is not an identity protocol. V8/QuickJS relationships and foreign targets retain their separate qualifications.

### Why 2.9.6 is excluded

Deno 2.9.6 replaced the earlier parser definitions with `deno_cli_parser`. Its [transpile definition](https://github.com/denoland/deno/blob/v2.9.6/libs/cli_parser/src/defs.rs#L3313) omits the runtime group that now owns `conditions`. Its [compile definition](https://github.com/denoland/deno/blob/v2.9.6/libs/cli_parser/src/defs.rs#L1764) omits `ALLOW_SCRIPTS_ARG`. These are observable missing public flags, rather than inference from changed help text. Conversely, renamed help entries for `frozen` and `minimum-dependency-age` retain aliases and still parse; they are not treated as regressions.

The successful/failed pairs used the same scratch `main.ts` containing `console.log(42)`:

```sh
"$DENO_295" transpile --conditions development main.ts
"$DENO_296" transpile --conditions development main.ts

"$DENO_295" compile --no-check --allow-scripts=npm:audit-never-imported --output app-295 main.ts
"$DENO_296" compile --no-check --allow-scripts=npm:audit-never-imported --output app-296 main.ts
```

Both 2.9.5 commands returned zero. The compiled 2.9.5 executable ran and printed `42`; the source imports no package and runs no package install scripts. Both 2.9.6 commands returned one before output production, reporting an unexpected argument for the affected flag. Compile still accepts `--conditions`; that does not repair its independent `allowScripts` regression.

Retaining exact 2.9.5 for all public Deno operations is the smallest honest initial policy. Request-specific admission would add a new partial-support contract merely to accommodate a known broken newest patch. A subsequent change can review a fixed release and deliberately restore an open patch window. No unsupported option is dropped, renamed, or retried by effect-build.

## Maintenance boundary

New minor lines require a complete source/option/target review plus consequential real-operation tests. For admitted patch windows, refresh exact fixtures deliberately; a discovered incompatible patch requires a regression fixture and a policy change. The rejected Deno 2.9.6 and Bun 1.4.1 cases demonstrate why evidence versions must remain distinct from acceptance ranges. This audit establishes the enumerated source and command boundaries; it does not stand in for passing provider lifecycle, emitted-program, native-runner, contract, or repository verification jobs.
