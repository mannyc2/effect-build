# effect-build-archives

Effect-native archive producers with one canonical output: a finalized
`Artifact.FileArtifact` committed through `Toolchain.publishFile`.

`Archive.archive` builds deterministic ZIP or tar.gz files from finalized file
artifacts. Entry order, timestamps, ownership, modes, ZIP headers, gzip headers,
and compression bytes are normalized. Unsafe paths, traversal, duplicates,
case/Unicode-normalization collisions, and file/directory prefix conflicts fail
with `UnsafeArchiveLayout` before any destination is committed. Format and
filename are one relational invariant: ZIP outputs end in `.zip` and tar+gzip
outputs end in `.tar.gz`.

`SourceArchive.sourceArchive` accepts only an exact SHA-1 or SHA-256 Git tree
object. Git is selected and version-probed once when its Layer is built. The
operation uses `git archive` to apply the tree's `export-ignore` attributes,
then deterministically re-encodes the projection. Executable and symlink modes
are preserved; Git links, `.git`, and conventional build-output roots are
excluded; Git LFS pointer blobs stay pointer bytes. There is no symbolic-revision
lookup, install, alternate executable, retry, or fallback.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Archive from "effect-build-archives/Archive";

const artifact = await Effect.runPromise(
  Archive.archive(
    new Archive.ArchiveInput({
      format: "tar.gz",
      entries: [
        new Archive.ArchiveEntry({
          artifact: executable,
          path: "bin/my-tool",
          executable: true,
        }),
      ],
      outfile: "dist/my-tool.tar.gz",
    }),
  ).pipe(Effect.provide(Archive.layer), Effect.provide(NodeServices.layer)),
);
```
