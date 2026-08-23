# Changelog

## 0.5.0

A ground-up simplification and broadening of the 0.4 candidate. Breaking
throughout; 0.4.0 was never published.

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
