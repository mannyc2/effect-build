# Errors and checks

Effects expose errors through their error type and `_tag`; inspect structured fields
instead of parsing native diagnostics. Only errors an operation can raise appear in
its return type. Provider input errors are named `InputInvalid` with a package-specific tag.

| Error | Useful fields / meaning |
| --- | --- |
| `Tool.NotFound` | `name`, `searched`: no executable at the explicit path or on PATH |
| `Tool.ProbeFailed` | `path`, `detail`: version probe failed |
| `Tool.VersionUnsupported` | `version`, `supported`: selected tool fails the requested range |
| `Tool.Failed` | `args`, `exitCode`, `stderr`: native command exited unsuccessfully |
| `Tool.SpawnFailed` | `name`, `detail`: process could not start or finish |
| `Artifact.ArtifactError` | `path`, `reason`, optional `detail`: missing, unreadable, or changed bytes |
| `Executable.InspectError` | `path`, `reason`: unreadable or unsupported native header |
| `Executable.TargetMismatch` | `path`, `expected`, `observed`: header differs from requested target |
| `Commit.CommitError` | `destination`, `reason`: staging, existing output, removal, or rename failed |

`Artifact.verify` checks the current file or directory against its record;
`Artifact.readVerified` returns checked file bytes. `Executable.expectTarget` checks
an executable result, and `Tool.requireVersion` checks a resolved tool's version.
`Commit.atomic` runs production and validation in sibling staging before replacing
the destination. File replacement is one rename; replacing a non-empty directory
removes the old tree first. `onExists: "fail"` refuses an occupied destination.

Native API failures retain tool diagnostics. Apple `Notary.ResponseInvalid` reports
malformed provider JSON; `Notary.ResultNotAccepted` preserves a pending or rejected
status. Signing tools redact supplied passwords from process errors.
