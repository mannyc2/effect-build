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

**Archives** (`effect-build-archives/Archive`, `.../SourceArchive`) encodes
ZIP and tar.gz deterministically from explicit layouts and rejects unsafe or
ambiguous names. Source archives ask one resolved Git executable for one
exact tree, honor `export-ignore`, preserve executable/symlink modes and LFS
pointer bytes, and exclude `.git`, build output, and unsupplied gitlinks.

**Python** (`effect-build-python/Build`) resolves and probes one uv frontend,
requires `pyproject.toml` plus a valid `uv.lock`, disables Python downloads,
forces PEP 517, gives the tool one private cache, and admits exactly one wheel
and one sdist. The acceptance matrix fixes uv 0.12.x and both `uv_build` and
`poetry-core` fixtures.

**nFPM** (`effect-build-nfpm/Package`) projects typed metadata/content into a
private native configuration and drives nFPM 2.47.x for deb, rpm, apk, Arch
Linux, and unsigned MSIX. Release, timestamp, payload modes, and the selected
MSIX metadata are closed schema fields; there is no arbitrary native
configuration escape hatch.

**Windows** (`effect-build-windows/SignMsix`) copies an unsigned MSIX to
private staging, drives SignTool with SHA-256 and an RFC 3161 SHA-256
timestamp, verifies with `/pa /tw` (warnings fail), and then publishes. Credentials are supplied
as a PFX service or an exact certificate-store thumbprint and are scrubbed
from failures.

**SBOM** (`effect-build-sbom/Generate`) makes the scan subject explicit:
directories use Syft `--from dir`, finalized files use `--from file`. Output
is either SPDX JSON 2.3 or CycloneDX JSON 1.6 and is schema-decoded before
publication from the exact held commit bytes using fatal UTF-8 decoding; the
tested tool line is Syft 1.50.x.

**Apple** (`effect-build-apple`) owns the selected direct-distribution path:
exact arm64/x64 `.app` bundles, UDZO DMGs, unsigned flat packages, Developer
ID application/installer signing, notary submit/info/log, stapling, and
Gatekeeper assessment. Apple tools are resolved/probed once. Notary
credentials remain services; returned submission references contain only
the provider ID, product kind, byte length, and artifact digest.

All selected-command layers accept an explicit executable path and
otherwise perform one deterministic PATH search. Untested tool versions
warn once and proceed; there is no version or host refusal.
