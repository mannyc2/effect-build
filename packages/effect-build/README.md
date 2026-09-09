# effect-build

Core Effect programs for files, executables, directories, tools, targets, and checksums.
`Artifact.File`, `Artifact.Executable`, and `Artifact.Directory` share `path`, numeric
`bytes`, `sha256`, and `producedBy`; executables add inspected `target` and `format`.

Use `Artifact.file`, `executable`, or `directory` to record existing output, and
`Artifact.encode` / `decode` for core-only JSON; provider signatures, runtime records,
and Apple refinements require their provider schemas. Directory hashes include modes and symlinks.
Compose `Artifact.verify`, `Executable.expectTarget`, `Tool.requireVersion`, and
`Commit.atomic` where needed. `Artifact.streamVerified` and `Artifact.copyVerified`
move a file's bytes in 64 KiB chunks and fail at the end when they changed, so use
them inside staged output. Files replace atomically; directory replacement retains
a backup for recovery and has a brief visibility gap. `{ onExists: "fail" }` uses
exclusive hard-link creation for files and returns an unsupported error for directories.
Every producer accepts `Commit.ProducerOptions` (`atomic`, `onExists`, `prefix`) and
chooses its own staging depth; use `{ staging: "sibling" }` with `Commit.atomic` around
your own bundle directories to preserve relative path semantics.
`Checksums.write` creates a SHA256SUMS file with
paths relative to its directory; run `sha256sum -c SHA256SUMS` from that directory.

[Get started](../../docs/getting-started.md) · [Providers](../../docs/providers.md) · [Errors](../../docs/errors.md)
