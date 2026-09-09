# effect-build design

## What it is

effect-build compiles TypeScript into things you can ship (native executables,
bundles, archives, OS packages, wheels, signed Apple/Windows products, SBOMs) as
composable Effect programs, and returns a plain record of what it made. Publishing is
ts-release's job; it consumes files by path and re-hashes them, so the handoff is
files on disk plus an optional JSON manifest (`Artifact.encode`).

The user is someone shipping a TS CLI to end users on three OSes. The first example
in the README includes the runtime and layers needed to execute it. Everything defensive is a combinator they can add.

## Core

| Module       | Exports                                                                                                                                                             | Role                                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Target`     | 8 literals (`linux-x64`, `linux-x64-musl`, `linux-arm64`, `linux-arm64-musl`, `darwin-x64`, `darwin-arm64`, `windows-x64`, `windows-arm64`), `parts`, `all`, `host` | Same names ts-release uses. Linux without suffix means glibc.                                                                                                    |
| `Artifact`   | `File`, `Executable`, `Directory`, `Regular`, `Producer`; `file`, `executable`, `directory`, `verify`, `streamVerified`, `copyVerified`, `readVerified`, `sha256`, `encode`, `decode` | Observe what's on disk into a record. `Executable.target` comes from the header. `Directory.sha256` hashes the sorted manifest; symlinks recorded, not followed. |
| `Executable` | `parse`, `inspect`, `matches`, `resolveTarget`, `expectTarget`                                                                                                      | ELF/Mach-O/PE header facts. A static Linux binary matches gnu and musl.                                                                                          |
| `Commit`     | `atomic(outfile, produce, { onExists, staging })`, `output(outfile, produce, { atomic, ... })`                                                                     | Stage with final path depth or basename, then commit with recovery. Checks run inside `produce` run before the rename. `output` is what providers do with `atomic`. |
| `Tool`       | `locate`, `resolve`, `run`, `parseVersion`, `satisfies`, `requireVersion`, `producer`                                                                               | Locate and resolve once, record path/version/hash. Nothing re-checks the binary later. Ranges use npm semver.                                                     |
| `Checksums`  | `write`                                                                                                                                                             | `sha256sum -c` compatible.                                                                                                                                       |

## Providers

Each wraps one external toolchain or domain:

```ts
class X extends Context.Service<X, { tool: Tool.Resolved }>()("effect-build-x/X") {}
const supported: string                                   // accepted range; the layer's default policy
const tested: string                                      // exact versions real-tool CI runs
const layer: (o?: { executable?; version?: string | ((v) => boolean) }) => Layer<X, ...>
const compile/build/package/...: (input & { outfile; atomic?: boolean }) => Effect<Artifact, ...>
```

Operations verify their own output before the rename (executables: header vs
requested target) and commit through `Commit.output`, so `atomic: false` writes
directly. Optional inputs accept `undefined`; callers forward `process.env` values
and their own optionals without spreading. Domain packages may refine core
types (`SignedApp = Artifact.Directory & { signature }`) but never replace them.

## Decided

- Directory replacement retains a recoverable old tree; regular-file no-replace uses exclusive hard-link creation, while directory no-replace is unsupported.
- **Checksum paths are relative to their file's directory**, so a staged release tree can move without rewriting them.
- **Directory archive inputs preserve descendant modes and symlinks**; the archive prefix has mode `0755` because directory artifacts do not record their root mode.

- **Replace on exists by default.** `onExists: "fail"` is one option away.
- **No tool re-check before launch.** The hash at resolve time is a record, not a lock.
- **No overwrite guard on executables' inputs.** `Artifact.verify` is opt-in.
- **Inputs stream.** Hashing, verified copies, archives, wheels and Git source tars move 64 KiB at a
  time; `readVerified` is the explicit whole-buffer exception. A verified stream fails at EOF, so its
  output is provisional until then and only atomic staging makes that safe. The only size limits are
  ZIP32 and ustar field widths, typed as `Archive.FormatLimit`; there is no byte budget to tune.
- **Static Linux binaries report as glibc** when no target is requested.
- **Two zip encoders** (archives, python wheel). Cheaper than a shared package until a
  third consumer appears.
- **Bun forces lowercase `.exe` on Windows outputs**, so callers' `outfile` must end in `.exe`
  for Windows targets; the provider rejects otherwise rather than renaming.
- **Tested versions are evidence, not compatibility gates.** Bun 1.4.1 is rejected only for emitted builds; native APIs retain independent capability checks.
- **Deno 2.9.6 removed flags are checked per operation**; unrelated operations remain available.
- **Deno embeds the output basename**; Windows outputs require lowercase `.exe`
  so staging and the committed executable have the same name.
- **Explicit `denort` is hashed and recorded, not executed** to establish identity.
- **Git source archives fix host newline defaults to LF**; committed `.gitattributes` still controls file conversion.
- **Node SEA uses a CommonJS preparation blob and resource injection** across Node
  22–26; the builder and base executable must have matching Node versions.
- **SignTool reads its full SDK version from its binary resource**; string ranges select the first three
  components, while a caller predicate can pin the full four-component version. The Windows layer reads
  those bytes itself; `Tool.resolve` hashes incrementally and parses probe output only.
- **Errors name their tool in `tool`, never `name`**, so `Error.name` stays the `_tag` and every error
  prints as `Tag: message`.
- **Windows signing accepts MSIX files and PE executables**; signed executables must retain their input target before commit.
- **Apple resolves xcrun once**; active Xcode tools select its native commands, and copied app trees preserve framework symlinks.
- **Effect stays pinned to the RC** until 4.0.0 ships; bump is its own change.

- **Core manifests project core fields only.** Provider schemas preserve richer signing/runtime/product/notary records.
- **Release retries consume retained exact tarballs** and verify registry bytes before skipping an existing version.
