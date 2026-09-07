# effect-build 0.7 design

## 0. What the library is

**effect-build compiles TypeScript into things you can ship** (native executables,
bundles, archives, OS packages, wheels, signed Apple/Windows products, SBOMs) as
composable Effect programs, and returns a plain record of what it made. Publishing is
ts-release's job; ts-release consumes files by path and re-hashes them, so the handoff
is "files on disk plus an optional JSON manifest."

The user is someone shipping a TS CLI to end users on three OSes. The first example in
the README is two lines. Everything defensive is a combinator they can add.

## 2. Core (`packages/effect-build`)

Start from `prototype/core/`. Six modules, ~600 lines. Signatures are final unless a
provider PR demonstrates a concrete need.

| Module | Exports | Notes |
|---|---|---|
| `Target` | `Target` schema (8 literals: `linux-x64`, `linux-x64-musl`, `linux-arm64`, `linux-arm64-musl`, `darwin-x64`, `darwin-arm64`, `windows-x64`, `windows-arm64`), `parts`, `all`, `host` | Same names ts-release uses. Replaces `SystemTarget` (`macos`→`darwin`, `aarch64`→`arm64`, `-gnu` dropped). |
| `Artifact` | `File`, `Executable`, `Directory`, `Artifact` (union), `Regular` (= File \| Executable), `Producer`, `ArtifactError`; `file`, `executable`, `directory` (observe what's on disk), `verify`, `readVerified`, `sha256`, `encode`, `decode` | `Executable.target` is established from the header, optionally checked against an expected target. `Directory.sha256` hashes the sorted entry manifest; symlinks recorded, not followed. |
| `Executable` | `Facts`, `parse`, `inspect`, `matches`, `resolveTarget`, `expectTarget` (combinator), `ParseError`, `InspectError`, `TargetMismatch` | The existing ELF/Mach-O/PE parser, simplified. A static Linux binary (no `PT_INTERP`) matches both gnu and musl and is reported as glibc when unconstrained. |
| `Commit` | `atomic(outfile, produce, { onExists?: "replace" \| "fail" })`, `CommitError` | Stages in a sibling temp dir, `mkdir -p` on the parent, rename into place, uninterruptible around the rename only. Works for files and directories. `produce` must return an artifact at the staged path. |
| `Tool` | `Resolved`, `resolve`, `run`, `parseVersion`, `satisfies`, `requireVersion` (combinator), `producer`, errors | Resolve once: explicit path or first PATH hit, realpath, hash, probe version. Nothing re-checks the binary later. `run` captures stdout/stderr with an 8 MiB cap and puts stderr in `ToolFailed`. `satisfies` is a 30-line range grammar (`>=1.3.14 <1.4.0 \|\| >=1.4.2 <1.5.0`); only canonical `x.y.z` versions ever match, so canaries and prereleases are refused without a special case. |
| `Checksums` | `write({ artifacts, outfile })` | `sha256sum -c` compatible. |

Package exports: `.` (namespace re-exports) and `./Artifact`, `./Commit`, `./Executable`,
`./Target`, `./Tool`, `./Checksums`. Nothing else.

Deleted from core: `Author/*` (all of it), `BorrowedOutput`, `DurableFile`, `Claims`,
`Matrix` (it was `Effect.forEach` + `Effect.result`), `SystemTarget`, `DecimalBytes`,
`Sha256Value`, `AbsolutePath`/`PortableRelativePath` schemas, `FileMode`,
`ObservationMode`, `Publication`, `Provenance`/`IntrinsicProvenance`, `adoptFile`/`adoptTree`
and the adoption protocol, `Tree`, `File.withVerifiedBytes` (→ `Artifact.readVerified`),
`Tree.withVerifiedSnapshot`, `Tree.projectFile`, every `*Observation` type, every
`Hashed*`/`Unhashed*` pair.
