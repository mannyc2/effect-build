# Changelog

## 0.6.0

Research-scope-complete implementation hard cut. All twelve packages move in
lockstep; this is breaking throughout. Formal cross-repository launch evidence
is tracked separately and is not implied by this implementation changelog.

- One generated `effect-build/combined-contract@1` accounts for 67 provider
  operations, 46 non-operation findings, and 19 capabilities across archives,
  Python, nFPM, Apple, Windows, and SBOM. The public API snapshot is a validated
  projection of this contract rather than a second authority.
- Core now owns the only hashed file, tree, executable, selected-tool, and
  adoption identities. File/tree/executable finalizers stage privately,
  observe, inspect, re-observe, reconstruct from held verified content, and
  commit with one uninterruptible same-parent rename. Verified continuations
  lend bytes or a private tree snapshot without promoting mutable paths.
- Provider operations move to permanent native `Api` and `Command` lanes.
  Flat `Build`, `Bundle`, `CompileExecutable`, `Context`, `Watch`, and
  `AssembleExecutable` subpaths are removed without compatibility aliases.
  Selected commands record exact executable content and reauthenticate it
  immediately before every launch; providers own admission and typed errors.
- Bun exposes admitted API/command breadth, Deno exposes admitted command
  transpilation and executable compilation, esbuild exposes admitted API and
  command breadth, and Node SEA exposes command assembly. All 19 live Rolldown
  operations remain implemented package-private; its rejected row is absent,
  its package is private, and its root is inert.
- New `effect-build-archives`: deterministic ZIP/tar.gz layouts and exact
  Git-tree source archives, with typed traversal, duplicate, case/Unicode,
  and invalid-prefix rejection.
- New `effect-build-python`: exactly one wheel and one sdist through one
  resolved uv frontend, a required `uv.lock`, forced PEP 517, no Python
  downloads, and a private scoped cache.
- New `effect-build-nfpm`: deb, rpm, apk, Arch Linux, and unsigned MSIX from
  typed metadata, verified payload artifacts, and private native nFPM
  configuration whose override/script/signing escape hatches are rejected.
- New `effect-build-windows`: SignTool MSIX signing and `/pa` verification
  with SHA-256 digests, RFC 3161 SHA-256 timestamps, PFX and certificate-store
  credential backends, and credential-scrubbed failures.
- New `effect-build-sbom`: explicit directory/file scan subjects and
  exact finalized scan subjects and schema-decoded SPDX JSON 2.3 and
  CycloneDX JSON 1.6 output from Syft.
- New `effect-build-apple`: exact arm64/x64 app, UDZO DMG, and flat-pkg
  products; Developer ID app/pkg signing; credential-free durable notary
  references with fresh-runner info/log; stapling; and Gatekeeper assessment.
- Only explicit producer finalizers return canonical durable artifacts.
  Provider-native memory results, scoped handles, notarization/assessment
  evidence, and provider-direct directories retain their honest native shape.
- `Artifact.adoptFile` and `adoptTree` provide path-free logical-name/digest
  handoffs. effect-build owns production and finalization; downstream release
  systems own plans, mutation journals, continuation, and publication.
- The packed-consumer gate installs every public tarball, imports every public
  module, runs a native in-memory provider API, finalizes immutable bytes,
  adopts them by logical name/digest, and proves later mutation is rejected.
- npm publication is no longer triggered by a green push. It requires a
  manual exact-SHA dispatch and the repository's protected npm environment
  approval.

## 0.5.0

A ground-up simplification and broadening of the 0.4 candidate. Breaking
throughout; 0.4.0 was never published.

New surface on the rebuilt kernel:

- `Artifact.Bundle` — multi-file artifacts with per-file `bytes` and
  optional `sha256`, published through the same staged pipeline
  (`Toolchain.publishBundle`, per-file renames into `outdir`).
- `effect-build-bun/Bundle` — `bun build` with `target`
  (browser/bun/node), `format`, `minify`, `sourcemap`, `splitting`,
  `packages`, and `external`.
- `effect-build-deno/Bundle` — `deno bundle` (Deno ≥ 2.4) with `platform`
  (browser/deno), `minify`, `codeSplitting`, `sourcemap`, and `external`.
- `effect-build-esbuild` gains `Build.transform`,
  `Build.analyzeMetafile`, and `Watch.changes` — watch mode as a `Stream`
  of build results whose end stops the watcher.
- New package `effect-build-rolldown`: scoped in-process bundles
  (`Build.make`/`generate`/`write` over the native `RolldownBuild`, with
  `close` owned by the Scope) and `Watch.events` streaming sanitized
  watcher events.

- One artifact type: `Artifact.Executable` with `path`, numeric `bytes`,
  `target`, `tool { name, version }`, and an optional `sha256` (hashing is
  on by default; pass `hash: false` to skip). The `observation` modes,
  `Hashed*/Unhashed*` twins, and `DecimalBytes` strings are gone.
- One error set: `ToolNotFound`, `ToolFailed`, `UnsupportedTarget`,
  `PublishFailed` (plus `EsbuildFailed` wrapping native diagnostics)
  replace the fifteen-variant admission/refusal taxonomies.
- Warn-only version policy: layers probe the tool once and log one warning
  outside the CI-tested range. `allowUntestedVersion` is gone, and the
  Ubuntu-24.04 host gate is gone — every operation now works on any host
  its tool supports.
- Flat inputs: tool options move to the top level (`minify`, `sourcemap`,
  `bytecode`, `bundle`, `permissions`); `target` defaults to the host;
  windows outputs gain a missing `.exe` suffix on the committed path.
- `compileExecutableMatrix` is removed — fan out with
  `Effect.forEach(inputs, compileExecutable, { concurrency })`.
- Core is rebuilt around a real kernel: `effect-build/Target` (one
  value-level target table), `effect-build/Toolchain` (resolve-once
  selection, scoped spawn, version probe, staged atomic publication).
  `SystemTarget.Descriptor`, `Matrix`, and the type-only `Author/*`
  contracts are removed.
- Node SEA assets are a keyed record (duplicate keys unrepresentable),
  mains may come from a file or raw bytes, and assembly targets the host
  through `node --check` + `node --build-sea`.
- Launch reauthentication, double artifact observation, native
  header parsers, the import-scanning main validator, and per-operation
  re-hashing of tools are all removed; publication keeps the staged
  atomic rename and a 4-byte native-magic sanity check.

## 0.4.0 (unpublished candidate)

Replaced the 0.3 public surface behind a freeze process; never published.
