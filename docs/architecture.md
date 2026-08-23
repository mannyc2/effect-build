# Architecture

Core owns the canonical vocabulary and the kernel; providers own only what
is genuinely tool-specific.

- `effect-build/Target` — one value-level table from target names to
  os/architecture/abi/suffix/native-format projections.
- `effect-build/Artifact` — one `Executable` artifact type with an
  optional digest; no observation modes or type-level variants.
- `effect-build/BuildError` — `ToolNotFound`, `ToolFailed`,
  `UnsupportedTarget`, `PublishFailed`; every provider failure is one of
  these or a provider-native wrapper (`EsbuildFailed`).
- `effect-build/Toolchain` — resolve-once tool selection, scoped spawn
  with bounded capture and force-kill, version probe, warn-only tested
  ranges, and staged atomic publication with a native-magic sanity check.

A provider is a thin layer over the kernel: a target table, an argv
renderer, a version parser, and a tested range. Bun and Deno spawn a
selected command; esbuild runs in-process; Node SEA drives `--check` and
`--build-sea`. Providers depend one way on core, never on a sibling, and
only `effect-build-esbuild` carries a third-party dependency.

Applications choose provider layers and provide one official Effect
platform layer at composition time; library source imports no `node:*`
modules. Interruption closes the Scope and terminates owned children — it
is never rewritten into a typed build failure. Publication stages in a
private same-parent temp directory and commits with one atomic rename, so
a failed or interrupted build never leaves a partial artifact at the
destination.
