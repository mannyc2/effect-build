# effect-build design

## What it is

effect-build compiles TypeScript into things you can ship (native executables,
bundles, archives, OS packages, wheels, signed Apple/Windows products, SBOMs) as
composable Effect programs, and returns a plain record of what it made. Publishing is
ts-release's job; it consumes files by path and re-hashes them, so the handoff is
files on disk plus an optional JSON manifest (`Artifact.encode`).

The user is someone shipping a TS CLI to end users on three OSes. The first example
in the README is two lines. Everything defensive is a combinator they can add.

## Core

| Module | Exports | Role |
|---|---|---|
| `Target` | 8 literals (`linux-x64`, `linux-x64-musl`, `linux-arm64`, `linux-arm64-musl`, `darwin-x64`, `darwin-arm64`, `windows-x64`, `windows-arm64`), `parts`, `all`, `host` | Same names ts-release uses. Linux without suffix means glibc. |
| `Artifact` | `File`, `Executable`, `Directory`, `Regular`, `Producer`; `file`, `executable`, `directory`, `verify`, `readVerified`, `sha256`, `encode`, `decode` | Observe what's on disk into a record. `Executable.target` comes from the header. `Directory.sha256` hashes the sorted manifest; symlinks recorded, not followed. |
| `Executable` | `parse`, `inspect`, `matches`, `resolveTarget`, `expectTarget` | ELF/Mach-O/PE header facts. A static Linux binary matches gnu and musl. |
| `Commit` | `atomic(outfile, produce, { onExists })` | Stage in a sibling temp dir, rename into place. Checks run inside `produce` run before the rename. |
| `Tool` | `resolve`, `run`, `parseVersion`, `satisfies`, `requireVersion`, `producer` | Resolve once, record path/version/hash. Nothing re-checks the binary later. Ranges match canonical `x.y.z` only. |
| `Checksums` | `write` | `sha256sum -c` compatible. |

## Providers

Each wraps one external toolchain or domain:

```ts
class X extends Context.Service<X, { tool: Tool.Resolved }>()("effect-build-x/X") {}
const tested: string                                      // range CI runs against, with why
const layer: (o?: { executable?; version?: string | ((v) => boolean) }) => Layer<X, ...>
const compile/build/package/...: (input & { outfile; atomic?: boolean }) => Effect<Artifact, ...>
```

Operations verify their own output before the rename (executables: header vs
requested target). `atomic: false` writes directly. Domain packages may refine core
types (`SignedApp = Artifact.Directory & { signature }`) but never replace them.

## Decided

- Replacing a non-empty directory removes the old tree before renaming; file replacement uses one atomic rename.

- **Replace on exists by default.** `onExists: "fail"` is one option away.
- **No tool re-check before launch.** The hash at resolve time is a record, not a lock.
- **No overwrite guard on executables' inputs.** `Artifact.verify` is opt-in.
- **Whole-file reads for hashing.** Move to streaming in `Artifact` when someone hits it.
- **Static Linux binaries report as glibc** when no target is requested.
- **Two zip encoders** (archives, python wheel). Cheaper than a shared package until a
  third consumer appears.
- **Bun forces `.exe` on Windows outputs**, so callers' `outfile` must end in `.exe`
  for Windows targets; the provider rejects otherwise rather than renaming.
- **Bun `tested` excludes 1.4.0 and 1.4.1**: 1.4.0 unreviewed, 1.4.1 has a reproduced
  emitted-program bug (regression test in the Bun package).
- **Deno `tested` is exactly 2.9.5**: 2.9.6 removed `transpile --conditions` and
  `compile --allow-scripts`.
- **Explicit `denort` is hashed and recorded, not executed** to establish identity.
- **Effect stays pinned to the RC** until 4.0.0 ships; bump is its own change.
