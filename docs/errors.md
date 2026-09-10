# Errors and checks

Effects expose errors through their error type and `_tag`; inspect structured fields
instead of parsing native diagnostics. Every error also has a `message`, so an
unhandled failure prints as `Tag: message` (for example `ToolNotFound: bun not found
(searched: PATH)`). Only errors an operation can raise appear in its return type.
Provider input errors are named `InputInvalid` with a package-specific tag and carry
their `reason`.

| Error                       | Useful fields / meaning                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| `Tool.NotFound`             | `tool`, `searched`: no executable at the explicit path or on PATH                              |
| `Tool.ProbeFailed`          | `tool`, `path`, `detail`: version probe failed                                                 |
| `Tool.VersionUnsupported`   | `tool`, `version`, `supported`: selected tool fails the requested range                        |
| `Tool.Failed`               | `tool`, `args`, `exitCode`, `stdout`, `stderr`, truncation flags: command exited unsuccessfully |
| `Tool.SpawnFailed`          | `tool`, `detail`: process could not start or finish                                            |
| `Artifact.ArtifactError`    | `path`, `reason`, optional `detail`: missing/unreadable/changed bytes or invalid metadata      |
| `Executable.InspectError`   | `path`, `reason`: unreadable or unsupported native header                                      |
| `Executable.TargetMismatch` | `path`, `expected`, `observed`: header differs from requested target                           |
| `Commit.CommitError`        | `destination`, `reason`, optional `recoveryPath`: staging, commit, or restoration failed       |
| `Archive.FormatLimit`       | `format`, `limit`, `maximum`, optional `path`: valid input exceeds a ZIP32 or ustar field       |

`Artifact.verify` checks the current file or directory against its record;
`Artifact.readVerified` returns checked file bytes. `Artifact.streamVerified` and
`Artifact.copyVerified` move bytes without buffering them and fail with `changed` at
the end of the stream, which is why producers run them inside staged output. `Executable.expectTarget` checks
an executable result, and `Tool.requireVersion` checks a resolved tool's version.
`Commit.atomic` runs production and validation in sibling staging before replacing
the destination; `Commit.output` does the same unless `atomic: false`, which creates
the destination's parent and lets the producer write the final path directly; a sibling-staged
directory producer starts from an empty destination. File
replacement is one rename. Directory replacement
moves the old tree aside, then restores it if committing the new tree fails. Readers
may see a brief absent destination between renames. If restoration fails,
`CommitError.recoveryPath` points to the complete preserved old tree for a
`rollback-failed` error. A later `remove-failed` cleanup error means the new output
is already committed and the backup may be partly removed; inspect it before
manual recovery.

`onExists: "fail"` uses atomic hard-link creation for regular files and returns an
explicit unsupported error for directories. File no-replace requires a filesystem
that supports hard links; failures leave the existing destination intact. Every
producer forwards `onExists` and `prefix`; with `atomic: false` the existence check
runs before production and is not exclusive.
Use `{ staging: "sibling" }` for directory trees containing bundles, so external
imports and source maps are computed at the final path's depth.

Native API failures retain tool diagnostics. Apple `Notary.ResponseInvalid` reports
malformed provider JSON; `Notary.ResultNotAccepted` preserves a pending or rejected
status. Signing tools redact supplied passwords from process errors.

`Tool.run` exposes `onOutput` for stdout/stderr chunks while retaining completion
output. Diagnostic buffers report their truncation explicitly; Bun's memory build
uses an uncapped output channel. Bun/Deno watch inherit output by default; choose
`stdio: "pipe"` when your application will consume the raw child streams.
