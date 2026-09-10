# Errors and checks

Every failure in effect-build is a typed error in the Effect error channel. This page lists them,
shows how to handle them, and explains the atomic output behind every producer, including what
happens when a commit fails.

## The shape of an error

- Each error is a tagged class with a `_tag`, so `Effect.catchTag` and `Effect.catchTags` select
  it, and structured fields, so you inspect data instead of parsing tool output.
- Each error has a `message`, and an unhandled failure prints as `Tag: message`, for example
  `ToolNotFound: bun not found (searched: PATH)`. Tool errors name their tool in a `tool` field,
  never in `name`, so `Error.name` stays the tag.
- An operation's error type lists exactly the errors it can raise. `Bun.compile` can fail with
  `Bun.CompileError`, a union of the input, tool, artifact, executable, and commit errors below.
- Invalid input to a provider fails with that package's `InputInvalid`. Its tag is prefixed with the
  package (`BunInputInvalid`, `NfpmInputInvalid`) and it carries a `reason`.

```ts
const compile = Bun.compile({ entrypoints: ["src/cli.ts"], outfile: "dist/cli" }).pipe(
  Effect.catchTag(
    "ToolFailed",
    (failure) =>
      Effect.logError(`bun exited ${failure.exitCode}\n${failure.stderr}`).pipe(Effect.andThen(Effect.fail(failure))),
  ),
);
```

## Core errors

| Error                       | Tag                        | Fields and meaning                                                                                                               |
| --------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `Tool.NotFound`             | `ToolNotFound`             | `tool`, `searched`: no executable at the explicit path or on `PATH`.                                                             |
| `Tool.ProbeFailed`          | `ToolProbeFailed`          | `tool`, `path`, `detail`: the version probe failed or printed nothing parseable.                                                 |
| `Tool.VersionUnsupported`   | `ToolVersionUnsupported`   | `tool`, `version`, `supported`: the selected tool fails the requested range.                                                     |
| `Tool.Failed`               | `ToolFailed`               | `tool`, `args`, `exitCode`, `stdout`, `stderr`, `stdoutTruncated`, `stderrTruncated`: the command exited unsuccessfully.         |
| `Tool.SpawnFailed`          | `ToolSpawnFailed`          | `tool`, `detail`: the process could not start or finish.                                                                         |
| `Artifact.ArtifactError`    | `ArtifactError`            | `path`, `reason` (`not-found`, `not-a-file`, `not-a-directory`, `unreadable`, `changed`, `invalid-metadata`), optional `detail`. |
| `Executable.InspectError`   | `ExecutableInspectError`   | `path`, `reason`: the file is missing, unreadable, or not a native executable this package understands.                          |
| `Executable.TargetMismatch` | `ExecutableTargetMismatch` | `path`, `expected`, `observed`: the header describes a different target than requested.                                          |
| `Executable.ParseError`     | `ExecutableParseError`     | `reason`: `Executable.parse` was given bytes that are not a supported header.                                                    |
| `Commit.CommitError`        | `CommitError`              | `destination`, `reason`, optional `detail` and `recoveryPath`: staging, commit, or restoration failed. Reasons are listed below. |

## Provider errors

| Error                                                                       | Tag                                 | Meaning                                                                                                           |
| --------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `Archive.InputInvalid`                                                      | `ArchiveInputInvalid`               | `reason`, optional `path`: an unsafe, duplicate, or colliding entry path, or an entry beneath a file.             |
| `Archive.FormatLimit`                                                       | `ArchiveFormatLimit`                | `format`, `limit`, `maximum`, optional `path`: valid input exceeds a ZIP32 or ustar field. Raised before staging. |
| `Archive.EntrySizeMismatch`                                                 | `ArchiveEntrySizeMismatch`          | `path`, `expected`, `actual`: an entry's stream delivered a different byte count than its record.                 |
| `Archive.TarInvalid`                                                        | `ArchiveTarInvalid`                 | `path`, `offset`, `detail`: the tar that `git archive` exported could not be decoded.                             |
| `Esbuild.EsbuildFailed`                                                     | `EsbuildFailed`                     | `operation`, `cause`, with `errors` and `warnings` from esbuild's own diagnostics.                                |
| `Rolldown.Failed`                                                           | `RolldownFailed`                    | `operation`, `cause`, with `errors` from Rolldown's diagnostics.                                                  |
| `NodeSea.Failed`                                                            | `NodeSeaFailed`                     | `operation`, `cause`: blob generation, injection, or signing failed.                                              |
| `Build.BunApiFailed`, `BunApiUnavailable`                                   | `BunApiFailed`, `BunApiUnavailable` | The native Bun API failed, or the program is not running on Bun.                                                  |
| `Bundle.DenoBundleFailed`, `DenoBundleUnavailable`, `DenoBundleModeInvalid` | same names                          | The native Deno bundle API failed, is absent, or was called with mismatched `write` options.                      |
| `Apple.Notary.ResultNotAccepted`                                            | `NotaryResultNotAccepted`           | A submission is still pending or was rejected; the status is preserved.                                           |
| `Apple.Notary.ResponseInvalid`                                              | `NotaryResponseInvalid`             | notarytool returned JSON the package could not read.                                                              |

Native diagnostics survive: `ToolFailed` keeps both streams, `EsbuildFailed` keeps esbuild's
message arrays, and signing tools redact supplied passwords from the errors they raise.

## Diagnostics while a tool runs

`Tool.run` and every operation that spawns a tool accept `onOutput`, which receives each stdout
and stderr chunk as it arrives, including bytes beyond the retained limit. Retained buffers are
8 MiB per stream by default and report truncation explicitly; Bun's in-memory `build` uses an
uncapped stdout channel because its output is the result. Bun and Deno `watch` inherit stdout
and stderr by default; pass `stdio: "pipe"` when your program consumes the child's streams.

## Checks

Checks are combinators and functions you add where you need them; nothing runs them for you
except where a producer verifies its own output before committing.

| Check                     | What it does                                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `Artifact.verify`         | Re-reads a file or directory and fails with `changed` if any byte, mode, or entry differs from the record.                                   |
| `Artifact.readVerified`   | Returns a file's bytes, bounded to the recorded size, or fails.                                                                              |
| `Artifact.streamVerified` | Streams a file's bytes while hashing them; the stream fails at the end if they changed, so output written from it is provisional until then. |
| `Artifact.copyVerified`   | Copies through `streamVerified`, so the destination holds exactly the recorded bytes or nothing.                                             |
| `Executable.expectTarget` | Re-reads an executable's header after a step that rewrote it (signing, stripping) and fails on a mismatch.                                   |
| `Tool.requireVersion`     | Applies a range or predicate to a resolved tool; the layers use it for `supported`.                                                          |

Because a verified stream fails only at EOF, producers run it inside staged output: a wheel or
archive whose input changed mid-stream is discarded with its staging directory.

## Atomic output

Every producer accepts the same three options, `Commit.ProducerOptions`, and forwards them to
`Commit.output`:

| Option     | Default            | Effect                                                                                                                                                                |
| ---------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `atomic`   | `true`             | Stage in a temporary directory next to the destination, verify, then rename. `false` writes the destination directly, with no staging or rename.                      |
| `onExists` | `"replace"`        | `"replace"` renames over an existing destination. `"fail"` refuses to replace a regular file, using exclusive hard-link creation, and is unsupported for directories. |
| `prefix`   | `".effect-build-"` | Name prefix of the staging directory.                                                                                                                                 |

Staging depth is the producer's own choice. Files stage nested, under `<staging>/<basename>`, so
tools that embed the output name (Bun, Deno, Apple's packagers) see the final basename.
Directories that contain relative imports or source maps stage as siblings, at the final depth,
so those paths stay valid. `Commit.atomic(outfile, produce, { onExists, prefix, staging })` gives
your own producers the same machinery, and `Commit.output` is what the built-in producers call.

With `atomic: false`, the destination's parent is created and the producer writes the final
path. A directory producer starts from an empty destination, so an earlier build's files never
enter the record. `onExists: "fail"` is checked before production and is not exclusive: a
concurrent writer can still win.

### Replacement and recovery

File replacement is one rename, atomic on every supported OS. Directory replacement moves the old
tree aside, renames the new tree in, then removes the old one; readers can see a brief absent
destination between the renames. If the second rename fails, the old tree is restored.

`CommitError.reason` says which step failed:

| Reason                             | Meaning                                                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `staging-failed`                   | The staging or backup directory could not be created.                                                                  |
| `staged-path-mismatch`             | The producer returned an artifact recorded at a path other than the staged one.                                        |
| `exists`                           | `onExists: "fail"` and the destination is occupied.                                                                    |
| `directory-no-replace-unsupported` | `onExists: "fail"` was requested for a directory; the portable filesystem has no exclusive directory rename.           |
| `rename-failed`                    | The commit rename failed; a replaced directory was restored.                                                           |
| `rollback-failed`                  | The commit and the restoration both failed. `recoveryPath` points to the complete old tree.                            |
| `remove-failed`                    | The new tree is committed but the backup could not be fully removed. `recoveryPath` names it; inspect before deleting. |

`onExists: "fail"` for files needs a filesystem that supports hard links; when it fails, the
existing destination is intact.
