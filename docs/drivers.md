# Integrations

**Bun** (`effect-build-bun/CompileExecutable`) runs `bun build --compile`
with `minify`, `sourcemap`, and `bytecode` passthrough. Six targets
(macos x64/aarch64, linux x64 gnu/musl, linux aarch64 gnu, windows x64).
Project configuration (`bunfig.toml`, `tsconfig.json`) is inherited from
`cwd` exactly as the CLI would.

**Deno** (`effect-build-deno/CompileExecutable`) runs `deno compile` with
typed `permissions` (rendered to `--allow-*` flags), plus `bundle` and
`minify` (type-constrained to require `bundle`). Six targets including
windows-aarch64; targets map to Rust triples.

**esbuild** (`effect-build-esbuild/Build`, `.../Context`) uses the
package's own esbuild dependency in-process. `Build.build` is one
in-memory build; `Context.make` is a scoped incremental context — native
`dispose` is hidden and owned by the Scope finalizer's cancel-then-dispose
sequence. Both layers are constants with no requirements.

**Node SEA** (`effect-build-node-sea/AssembleExecutable`) assembles a
single-file executable for the host with a builder node (`--check`, then
`--build-sea` over a generated sea-config) and a base node binary that
defaults to the builder. Assets embed by key; mains come from a file or
raw bytes.

All selected-command layers accept an explicit executable path and
otherwise perform one deterministic PATH search. Untested tool versions
warn once and proceed; there is no version or host refusal.
