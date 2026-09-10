# effect-build-archives

Reproducible ZIP and tar.gz archives from artifacts, and exact source archives from a Git tree,
as Effect programs. `zip` and `tarGz` are pure TypeScript: no external archiver, no tool layer.

```sh
npm install --save-dev --save-exact effect-build-archives@0.7.0 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108 @effect/platform-node-shared@4.0.0-rc.108
```

## Usage

```ts
import { Effect } from "effect";
import * as Archive from "effect-build-archives";
import * as Bun from "effect-build-bun";
import * as Esbuild from "effect-build-esbuild";

const archives = Effect.gen(function*() {
  const executable = yield* Bun.compile({ entrypoints: ["src/cli.ts"], outfile: "dist/hello" });
  const bundle = yield* Esbuild.buildToDirectory({ entryPoints: ["src/lib.ts"], bundle: true, outdir: "dist/lib" });
  const entries = [{ artifact: executable, path: "hello" }, { artifact: bundle, path: "lib" }];
  const zip = yield* Archive.zip({ entries, outfile: "dist/hello.zip" });
  const tarGz = yield* Archive.tarGz({ entries, outfile: "dist/hello.tar.gz" });
  return [zip, tarGz];
});
```

Both operations take `{ entries, outfile, atomic?, onExists?, prefix? }` and return an
`Artifact.File`.

## Entries

An entry is `{ artifact, path, executable? }`: any artifact and the path it gets inside the
archive.

- A regular file's mode is `0755` for executables and `0644` for files; `executable` overrides it.
- A directory artifact expands beneath `path`, preserving descendant modes, empty directories,
  and symlinks, which are recorded and never followed. Each directory prefix has mode `0755`.
  Directory entries do not accept `executable`.
- Paths use `/`, are relative, and contain no empty, `.`, or `..` segments. They must be distinct
  after case folding and NFC normalization, including every implicit directory: `Docs/a` and
  `docs/b` conflict too. No entry may descend through a file or symlink. Core `Layout.validate`
  owns these shared shipping guarantees. Violations fail with `Tool.InputInvalid` before
  anything is written.

## Reproducibility

Bytes depend only on the entries: DEFLATE level 6 for ZIP, gzip level 6 for tar.gz, zero
timestamps, zero tar owners, zero gzip mtime, and entries ordered by their UTF-8 bytes. There
are no options for timestamps, ownership, comments, or compression level, so rebuilding identical
inputs gives identical archives and identical digests.

## Streaming and limits

Each input is read once in 64 KiB chunks through `Artifact.streamVerified`, checked against its
record as it passes, and compressed straight into the staged output, so memory does not grow
with archive size. A file that changed since it was recorded fails the archive at the end of its
stream, and the staged output is discarded.

The only size limits are the formats' own. ZIP32 holds 65,535 entries, 4 GiB per entry and per
archive, and names up to 65,535 bytes; ustar holds 8 GiB per entry. These fail with
`ArchiveFormatLimit` (`format`, `limit`, `maximum`) before any output is staged; switch to
`tarGz` when a ZIP32 field is the problem. ZIP64 and PAX size records are not written. ZIP
entries carry their CRC and sizes in data descriptors, so nothing is buffered to fill in a header.

## Source archives

`source({ repository, tree, project, version, format, outfile, cwd?, excludes? })` packages a
Git tree under `project-version/` as `zip` or `tar.gz`. It needs `Archive.layer({ executable?, version? })`
for Git: `Archive.supported` is `>=2.40.0 <3.0.0` and `Archive.tested` records 2.40.0 and 2.55.0.

```ts
const source = Archive.source({
  repository: ".",
  tree: "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
  project: "hello",
  version: "1.0.0",
  format: "tar.gz",
  outfile: "dist/hello-1.0.0-src.tar.gz",
}).pipe(Effect.provide(Archive.layer()));
```

`tree` is a tree object ID (`git rev-parse HEAD^{tree}`), so the bytes are fixed before Git runs.
Export-ignore attributes apply; symlinks, executable modes, and LFS pointers are kept as Git
exports them. Gitlinks and `.git` components are always omitted, and `excludes` lists
repository-relative paths to leave out with their descendants. Tracked directories such as
`build/` are included unless excluded. Host newline defaults are fixed to LF; a committed
`.gitattributes` still controls conversion. File payloads stream out of Git's temporary tar; an
export the reader cannot decode fails with `ArchiveTarInvalid`.

## The ZIP encoder

`Zip.encode(entries)` is the encoder itself, a `Stream<Uint8Array>` for callers that assemble
their own entries; `effect-build-python` writes wheels with it. Entries are `file`
(`path`, `mode`, `bytes`, and a `contents` stream), `directory`, or `symlink` (with `target`). The
stream fails with the caller's stream errors, `ArchiveFormatLimit`, or `ArchiveEntrySizeMismatch`
when a stream delivers a different byte count than it declared, and it can be run more than
once. Payloads are compressed in 64 KiB pieces regardless of how their streams chunk them, so the
bytes depend only on the entries. `Zip.limit(entries)` returns the limit `encode` would fail with
first, for checking before any output is staged.

## Errors

`Archive.ArchiveError` is `Tool.InputInvalid`, `FormatLimit`, `EntrySizeMismatch`,
`Artifact.ArtifactError`, or `Commit.CommitError`; `source` adds `TarInvalid`, `Tool.Failed`, and
`Tool.SpawnFailed`. Tags are prefixed `Archive`.

[Recipes](https://github.com/mannyc2/effect-build/blob/main/docs/recipes.md) ·
[Tools and providers](https://github.com/mannyc2/effect-build/blob/main/docs/providers.md) ·
[Errors and checks](https://github.com/mannyc2/effect-build/blob/main/docs/errors.md)
