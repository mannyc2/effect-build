# Provider drivers

Choose a provider for the build semantics you need, then its `Api` or `Command` lane. `Api` uses a host API or installed
library. `Command` selects an external executable and invokes typed operations through Effect platform services. The
runtime executing your Effect program is independent of the selected compiler.

## Available operations

Names below are relative to the package's `Api` or `Command` namespace. Package READMEs contain examples and input details.

| Package                                                                | Lane      | Operations                                                                                                                                                                               |
| ---------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`effect-build-bun`](../packages/effect-build-bun/README.md)           | `Api`     | `Transpiler.make`, `transform`, `transformSync`, `scan`, `scanImports`; `Build.build`, `buildToDirectory`; `CompileExecutable.compileExecutableDirect`                                   |
| `effect-build-bun`                                                     | `Command` | `Build.build`, `buildToDirectory`; `Watch.watch`; `CompileExecutable.compileExecutable`, `compileExecutableMatrix`                                                                       |
| [`effect-build-deno`](../packages/effect-build-deno/README.md)         | `Command` | `Transpile.transpile`, `transpileToDirectory`, `emitDeclarations`; `CompileExecutable.compileExecutable`, `compileExecutableMatrix`                                                      |
| [`effect-build-esbuild`](../packages/effect-build-esbuild/README.md)   | `Api`     | `Build.build`; `BuildToDirectory.buildToDirectory`; `Transform.transform`; `AnalyzeMetafile.analyzeMetafile`; `FormatMessages.formatMessages`; `Context.make`; `ContextToDirectory.make` |
| `effect-build-esbuild`                                                 | `Command` | `Build.build`; `BuildToDirectory.buildToDirectory`; `Watch.watch`                                                                                                                        |
| [`effect-build-node-sea`](../packages/effect-build-node-sea/README.md) | `Command` | `AssembleExecutable.assembleDirect`                                                                                                                                                      |

`effect-build-rolldown` is private and its package root exports nothing. Deno bundle operations and compile-watch, and the
esbuild command server, are not public APIs. An operation's source file does not imply a supported package export.

## Select a command

All public command lanes expose `Command.layer(options?)`. Build this layer once and provide it to the operations you
want to run. It requires `Crypto`, `FileSystem`, `Path`, and `ChildProcessSpawner`; an official Effect platform layer
supplies them. See [getting started](getting-started.md) for full composition.

For Bun, Deno, and esbuild, `LayerOptions.executable` is an `Artifact.AbsolutePath`:

```ts
import { Schema } from "effect";
import { Command } from "effect-build-bun";
import * as Artifact from "effect-build/Artifact";

const commandLayer = Command.layer({
  executable: Schema.decodeUnknownSync(Artifact.AbsolutePath)("/opt/tools/bun"),
  outputLimitBytes: 4 * 1024 * 1024,
});
```

Replace that path with an installed tool. Decoding checks the path's lexical form; selection then resolves, reads, and
probes the executable.

Without an explicit path, selection scans absolute entries in `PATH`, resolves symlinks, and deduplicates canonical paths.
**Two different matching executables are an ambiguity error**, even when one appears earlier in `PATH`. Pass an explicit
path to choose between installations. An invalid explicit selection does not fall back to `PATH`.

Selection records the executable's SHA-256 identity and provider observation. Before each launch, the provider checks the
same selected executable again. Replacing it during a long-running program produces `SelectedToolChanged`; it does not
silently select the new version. Rebuild the layer when intentionally changing tools.

`outputLimitBytes` defaults to 1 MiB **per stream** for captured commands. Stdout-producing builds fail when output would
be truncated; a successful file-producing command can have truncated diagnostic capture. Watch handles expose raw process
streams, so the caller owns stream consumption.

## Tool versions and runtime requirements

These versions describe this checkout's implemented admission policy, not the latest upstream releases.

| Lane               | Current requirement                                                         |
| ------------------ | --------------------------------------------------------------------------- |
| Bun `Api`          | Host exposes `globalThis.Bun` version `1.3.14` and the requested capability |
| Bun `Command`      | Selected Bun reports exactly `1.3.14`                                       |
| Deno `Command`     | Selected Deno reports exactly `2.9.5`                                       |
| esbuild `Api`      | Uses the package's pinned `esbuild` dependency, `0.28.2`                    |
| esbuild `Command`  | Selected esbuild reports exactly `0.28.2`                                   |
| Node SEA `Command` | Reviewed version `26.7.0`, `linux-x64-gnu`, with `--build-sea` capability   |

Bun, Deno, and esbuild command operations reject other versions. Node SEA alone exposes `allowUntestedVersion`, described
below. No lane installs a missing tool or retries with an alternate candidate. Local unit or consumer checks do not
establish cross-platform execution support; see [contributing](../CONTRIBUTING.md) for the separate verification gates.

## Bun

The API lane returns Bun's native build output and transpiler values. Supply `Api.layer` for all API services, or an
operation's narrower layer. `Api.Build.build` excludes `outdir` and compilation; `Api.Build.buildToDirectory` requires
`outdir` and excludes compilation.

`Api.CompileExecutable.compileExecutableDirect` requires Bun's native `compile` option and returns native build output.
It can express native modes such as HTML/full-stack compilation, but its output is provider-direct. `Bun.build` has no
cancellation handle: interruption stops awaiting it and may leave writes or cache changes in progress.

For a finalized executable, use `Command.CompileExecutable.compileExecutable` with:

- `entrypoints`: a non-empty tuple of paths;
- `outfile`: the destination, which must be absent;
- `observation`: `"hashed"` or `"unhashed"`;
- optional `target`, `cwd`, `environment`, and `options`.

Compilation flags are nested under `options`: `minify`, `bytecode`, `external`, `packages`, `define`, `conditions`,
environment inlining, runtime arguments, autoload settings, and Windows metadata. Sourcemaps are limited to
`"inline" | "none"` because this operation finalizes one executable. The
[exported `Options` and `Target`](../packages/effect-build-bun/src/Command/CompileExecutable.ts) are the exact reference.

The result includes `bunTarget` when requested and `runtimeAcquisition`. With no target option, this records the selected
host runtime. An explicit target records provider-managed acquisition with an open cross-target evidence gate. Inspecting
the output alone does not establish download/cache behavior or successful execution on its target.

## Deno

Deno has a command lane only. `Transpile.transpile` takes one `file` and returns stdout bytes; directory transpilation
takes `files` and `outdir`. Separate source maps require the directory operation. `emitDeclarations` uses Deno's
TypeScript-backed declaration emission, not bundle declaration roll-up.

`CompileExecutable.compileExecutable` takes a singular `entrypoint`, `outfile`, `observation`, optional `target`, and
**top-level** Deno options. Unlike Bun, it has no nested `options` object. Options include `check`, permission allow/deny
lists, `include`, `exclude`, `cachedOnly`, `engine`, `minify`, and `scriptArgs`. Use its exported `Input`, `Options`,
`Permissions`, and `Target` types; [source definitions](../packages/effect-build-deno/src/internal/CompileCommand.ts) list
every field.

`Command.layer` also accepts:

- `denoDir`: explicit absolute cache/configuration directory. When absent, inherited `DENO_DIR` is unchanged.
- `denort`: explicit absolute runtime binary for compilation, selected and authenticated separately.

`DENORT_BIN` is controlled by `layer({ denort })`. Per-call `environment.values.DENORT_BIN` is rejected, and an inherited
value is not adopted implicitly. An explicit `denort` must report the reviewed Deno version and is inspected against the
requested target. QuickJS engine relation evidence remains open. Without `denort`, the result records
provider-managed acquisition with an open cache/offline/target-relation evidence gate.

## esbuild

API operations use native esbuild options and results without a provider layer. In-memory `Build.build` and `Context.make`
require `write: false`. Their provider-direct counterparts require `write: true` and preserve native output options. Native diagnostic
`errors` and `warnings` remain available on `EsbuildFailed`.

Contexts require an Effect scope. Within it, use `context.rebuild`, `context.watch(options?)`, `context.serve(options?)`,
and `context.cancel`. Rebuild and cancel are Effects, not functions. Closing the scope cancels and disposes the native
context. The scope must cover the entire watch/server lifetime, not just acquisition.

Command builds return stdout bytes or a provider-direct directory result. Command watch returns a scoped child process
with raw byte streams; effect-build does not synthesize rebuild events from logs. esbuild has no canonical executable
finalizer.

## Node SEA

`Command.AssembleExecutable.assembleDirect` assembles an already-prepared CommonJS or ESM main into a finalized executable.
Its `main` is `{ _tag: "File", path, format }` or `{ _tag: "Bytes", contents, format, sourceName? }`. Other inputs are
`outfile`, `observation`, optional `cwd`, `assets`, and `disableExperimentalSEAWarning`.
Assets use `{ _tag: "File", key, path }` or `{ _tag: "Bytes", key, contents }`, with unique non-empty keys. Byte assets
are copied during preparation and both forms use the operation's private staging. `File.withVerifiedBytes` can pass an
existing artifact directly into a byte asset, preserving verified consumption without a temporary caller-owned file.

`Command.layer` takes `builderExecutable`, `baseExecutable`, `outputLimitBytes`, and `allowUntestedVersion`. The builder is
selected from `PATH` if absent; the base defaults to that builder. Both must expose `--build-sea`, report the same version,
and identify as `linux-x64-gnu`. This operation is not admitted for a macOS or Windows builder.

`allowUntestedVersion: true` relaxes only the reviewed Node version check. It does not bypass target, capability, or
builder/base relation checks. The layer records the untested admission internally; the public result remains a core
executable. Snapshot and code-cache modes are fixed off; no embedded argument policy is public. See the
[Node SEA example](../examples/node-sea/) for assembly setup.

## Artifact producers

Use a producer package for a package, archive, signed artifact, or SBOM:

| Package                                                                | Output family                                                        |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`effect-build-archives`](../packages/effect-build-archives/README.md) | ZIP, tar.gz, and exact-Git-tree source archives                      |
| [`effect-build-python`](../packages/effect-build-python/README.md)     | uv wheel and sdist                                                   |
| [`effect-build-nfpm`](../packages/effect-build-nfpm/README.md)         | deb, rpm, apk, Arch Linux, and unsigned MSIX                         |
| [`effect-build-apple`](../packages/effect-build-apple/README.md)       | App bundles, DMG, pkg, signing, notarization, staple, and assessment |
| [`effect-build-windows`](../packages/effect-build-windows/README.md)   | MSIX signing and verification                                        |
| [`effect-build-sbom`](../packages/effect-build-sbom/README.md)         | SPDX JSON 2.3 and CycloneDX JSON 1.6                                 |

Finalizers return core hashed file/tree refinements. Notary submission/query/log and Gatekeeper assessment return native
evidence results. Each package documents its tools, host requirements, and inputs; providers do not acquire sibling
packages automatically.
