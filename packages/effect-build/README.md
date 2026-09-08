# effect-build

Core Effect programs for files, executables, directories, tools, targets, and checksums.
`Artifact.File`, `Artifact.Executable`, and `Artifact.Directory` share `path`, numeric
`bytes`, `sha256`, and `producedBy`; executables add inspected `target` and `format`.

Use `Artifact.file`, `executable`, or `directory` to record existing output, and
`Artifact.encode` / `decode` for JSON. Directory hashes include modes and symlinks.
Compose `Artifact.verify`, `Executable.expectTarget`, `Tool.requireVersion`, and
`Commit.atomic` where needed. Atomic commits replace existing output by default;
`{ onExists: "fail" }` rejects it. `Checksums.write` creates a SHA256SUMS file with
paths relative to its directory; run `sha256sum -c SHA256SUMS` from that directory.

[Get started](../../docs/getting-started.md) · [Providers](../../docs/providers.md) · [Errors](../../docs/errors.md)
