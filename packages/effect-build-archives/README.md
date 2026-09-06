# effect-build-archives

Create deterministic ZIP or tar.gz archives from finalized artifacts or one exact Git tree. Both operations return a
canonical `Artifact.HashedFile` with an atomically finalized path and SHA-256 digest.

## Install

```sh
npm install --save-exact effect-build-archives@0.6.3 effect-build@0.6.3 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108
```

These examples use Effect v4 and its matching Node platform package.

`Archive` needs no archive CLI. `SourceArchive` requires an installed Git **2.40 or later in the 2.x series**.

## Archive a finalized file

Pass a `HashedFile` from `File.publish` or a finalized tree's file projection. Its identity records the bytes that
will be verified before archiving. Run the returned Effect at your application's entry point.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Archive from "effect-build-archives/Archive";
import type * as Artifact from "effect-build/Artifact";

export const archiveFile = (file: Artifact.HashedFile) =>
  Archive.archive(
    new Archive.ArchiveInput({
      format: "zip",
      entries: [
        new Archive.ArchiveEntry({
          artifact: file,
          path: "share/doc/greeting.txt",
        }),
      ],
      outfile: "dist/app.zip",
    }),
  ).pipe(
    Effect.provide(Archive.layer),
    Effect.provide(NodeServices.layer),
  );
```

Use a destination that does not exist. Archive paths are relative and portable; traversal and colliding layouts are
rejected. Each input is revalidated, and ordering, timestamps, ownership, modes, headers, and compression are normalized.
Set `executable: true` explicitly for entries that need mode `0755`; ordinary entries use `0644`.
An `ArchiveEntry` requires a `HashedFile`. A compiler's `HashedExecutable` has a different identity; to package those
bytes, use `File.withVerifiedBytes` with `File.publish` to finalize a file payload first.

## Archive source

`SourceArchive.sourceArchive(new SourceArchive.SourceArchiveInput({...}))` takes `repository`, an exact `tree` object
ID, `project`, `version`, `format`, and `outfile`. The source root is named from `project` and `version`. Supply
`SourceArchive.layer()` and platform services.

The tree must be a lowercase 40-character SHA-1 or 64-character SHA-256 Git tree ID. Resolve branches, tags, or commits
to that tree before calling this operation. Git export rules are applied; Git links and build-output roots are excluded.
The selected Git executable is observed once and reauthenticated before each launch.

The public `Model` and `ArchiveError` modules expose the shared input schemas and typed failures.

## More

[Getting started](https://github.com/mannyc2/effect-build/blob/main/docs/getting-started.md) · [API guide](https://github.com/mannyc2/effect-build/blob/main/docs/api.md) · [Error handling](https://github.com/mannyc2/effect-build/blob/main/docs/errors.md)
