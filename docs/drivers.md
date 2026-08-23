# Integrations

**Bun** (`effect-build-bun/CompileExecutable`, `.../Bundle`) runs
`bun build --compile` with `minify`, `sourcemap`, and `bytecode`
passthrough over six targets (macos x64/aarch64, linux x64 gnu/musl,
linux aarch64 gnu, windows x64), and `bun build` bundling with `target`
(browser/bun/node), `format`, `minify`, `sourcemap`, `splitting`,
`packages`, and `external`. Project configuration (`bunfig.toml`,
`tsconfig.json`) is inherited from `cwd` exactly as the CLI would.

**Deno** (`effect-build-deno/CompileExecutable`, `.../Bundle`) runs
`deno compile` with typed `permissions` (rendered to `--allow-*` flags),
plus `bundle` and `minify` (type-constrained to require `bundle`), over
six targets including windows-aarch64 mapped to Rust triples; and
`deno bundle` (Deno ≥ 2.4) with `platform` (browser/deno), `minify`,
`codeSplitting`, `sourcemap`, and `external`.

**esbuild** (`effect-build-esbuild/Build`, `.../Context`, `.../Watch`)
uses the package's own esbuild dependency in-process. `Build.build` is one
in-memory build, `Build.transform` a one-file transpile, and
`Build.analyzeMetafile` the native size report; `Context.make` is a scoped
incremental context — native `dispose` is hidden and owned by the Scope
finalizer's cancel-then-dispose sequence — and `Watch.changes` streams
every completed build until the stream ends. All layers are constants
with no requirements.

**Node SEA** (`effect-build-node-sea/AssembleExecutable`) assembles a
single-file executable for the host with a builder node (`--check`, then
`--build-sea` over a generated sea-config) and a base node binary that
defaults to the builder. Assets embed by key; mains come from a file or
raw bytes.

**Rolldown** (`effect-build-rolldown/Build`, `.../Watch`) uses the
package's own rolldown dependency in-process. `Build.make` is a scoped
handle over the native `RolldownBuild` — `generate` bundles in memory,
`write` bundles onto disk, and native `close` is owned by the Scope —
with `Build.generate`/`Build.write` as one-shot forms. `Watch.events`
streams sanitized watcher events and closes rollup-convention result
handles itself.

All selected-command layers accept an explicit executable path and
otherwise perform one deterministic PATH search. Untested tool versions
warn once and proceed; there is no version or host refusal.
