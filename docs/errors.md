# Errors and interruption

There is no public `effect-build/BuildError` module or cross-provider build
error union. The hard cut assigns each refusal or failure to the role that has
enough information to state it truthfully.

## Core ownership

| Owner                   | Failure family                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `Artifact`              | Invalid scalar, path, digest, or observation data                                                          |
| `Author/Tool`           | Missing, invalid, or ambiguous selection and selected-content change                                       |
| `Author/BorrowedOutput` | Missing, changed, expired, or escaped lease; observation or post-use cleanup failure                       |
| `Author/Executable`     | Invalid destination, missing or changed candidate, inspection failure, destination lock, or commit failure |
| `Matrix`                | Invalid matrix input; cell failures remain the provider evaluator's own error values                       |

These are closed role boundaries, not a generic taxonomy. The former four-row
`BuildError` model no longer describes the API: `ToolNotFound` survives only as
an `Author/Tool` selection error, while generic `ToolFailed`,
`UnsupportedTarget`, and `PublishFailed` tags are gone.

The private Node-main, browser-payload, incremental-main, and typed-watch
candidates retain their own errors without adding public core failure families.

## Provider host APIs

Provider host APIs preserve their native semantic owner:

- Bun API modules report host unavailability, native invocation failure, or a
  rejected publication mode;
- esbuild API modules report `EsbuildFailed` while scoped context owners retain
  drain-before-close behavior;
- Rolldown API failures remain package-private with the conditional operations
  they describe.

A native promise or callback with no cancellation primitive can stop being
awaited on interruption. That does not prove the provider's native work was
cancelled.

## Provider commands

Command lanes distinguish four concerns:

- input invalidity before provider work;
- unsupported exact-version capability or relation;
- transport failure while launching, communicating with, or reaping the child;
- non-zero provider completion with bounded stdout and stderr plus truncation
  observations.

The concrete tags are provider-owned (`BunCommand*`, `DenoCommand*`,
`EsbuildCommand*`, and `NodeSea*`). A command is selected and observed once, then
its content is reauthenticated immediately before every invocation. A changed
executable fails as `SelectedToolChanged`; it is never silently reselected or
retried.

## Publication failures

Provider-direct directory writes may leave partial files, caches, or a mixed
destination after failure or interruption. Their operation contracts identify
that publication mode and do not claim rollback.

`Author/Executable.publish` is a different authority. Its same-parent private
candidate is inspected before an atomic destination replacement. Candidate
creation, content change, native inspection, locking, and commit failures remain
separate tags. A failed candidate never becomes a successful artifact value.

Borrowed output is also distinct from durable publication. The file or tree is
valid only inside the supplied continuation. Escape, mutation, expiry, and
cleanup-after-success remain observable instead of being collapsed into a
provider error.

## Interruption and cleanup

Interruption remains an Effect Cause event and is never translated into a typed
build failure. Scope closure terminates an owned command child or closes one
native handle according to that operation's contract. Cleanup failure is
preserved in Cause alongside the primary failure.

Descendant-process-tree containment is not inferred from closing a direct
child. It is claimed only by a schema-serializable private workflow after the
process group or Job Object, tree exit, and staging cleanup are verified. An
implemented workflow or a local sample is not certification evidence.

Apple distribution has its own artifact, identity, tool, mutation, receipt,
notary, staple, and assessment failures. See
[Apple distribution](apple-distribution.md); those errors do not widen into a
generic build error family.
