# Architecture

Core owns the canonical vocabulary and the kernel; producers own only what
is genuinely tool-specific.

- `effect-build/Target` — one value-level table from target names to
  os/architecture/abi/suffix/native-format projections.
- `effect-build/Artifact` — `Executable`, `FileArtifact`, and `Bundle`
  finalized values with mandatory regular-file SHA-256 identities and exact
  file/directory/symbolic-link bundle manifests;
  `FinalizedArtifact` is their complete cross-producer union.
- `effect-build/BuildError` — `ToolNotFound`, `ToolFailed`,
  `UnsupportedTarget`, `PublishFailed`, and `ArtifactVerificationFailed`;
  every provider failure is one of these or a durable provider-native error.
- `effect-build/Toolchain` — resolve-once tool selection, scoped spawn
  with concurrently drained bounded stdout/stderr and force-kill, version
  probe, warn-only tested ranges, and same-parent staged publication.
  Executables receive a native-magic check; ordinary files receive a
  regular-file check; both commit with one atomic rename. Exact bundles record
  every entry and commit the complete directory with one atomic rename.

A producer is a thin layer over the kernel: an explicit, closed input boundary,
exact tool arguments or an in-process adapter, output validation, and a tested
range. Release-facing producers use durable schema-backed input models; Bun,
Deno, and Node SEA keep compiler-native option bags operation-local because
they are neither persisted nor exchanged as release records. Bun and Deno
spawn selected commands; esbuild and Rolldown run
in-process behind scoped native-state owners; Node SEA drives `--check` and
`--build-sea`; the release producers drive exact Git, uv, nFPM, SignTool,
Syft, and Apple-native operations. Producers depend one way on core, never
on a sibling, and only
`effect-build-esbuild` and `effect-build-rolldown` carry a third-party
dependency.

Applications choose producer layers and provide one official Effect
platform layer at composition time; library source imports no `node:*`
modules. Interruption closes the Scope and terminates owned children — it
is never rewritten into a typed build failure. Publication stages in a
private same-parent temp directory under a single release-machine writer:
executables and ordinary files commit with one atomic rename, and bundles
reject an existing destination before a single directory-level commit. The
commit is uninterruptible, but Effect reasserts a pending interruption after it
finishes; a caller may therefore receive interruption while the destination is
already complete. Higher layers observe/adopt the exact identity or
deliberately rebuild instead of treating interruption as proof of non-commit.
A failed or interrupted build never leaves a partial artifact or silently
retains stale unmanifested bytes. Any producer that consumes an earlier
artifact first verifies its recorded length and digest and then operates on the
verified bytes or a private exact bundle reconstruction, never by reopening a
caller-controlled path.

Signing and notarization credentials are process-local services. Artifact
values, successful provider projections, and typed failures contain no
credential coordinates. Apple notarization returns a credential-free
submission ID bound to the exact artifact digest so another runner can call
`info` and `log`; an uncorrelated submission failure is explicitly unknown
and is never made safe to retry by the producer.
