# Errors and interruption

The whole library fails with a small closed set of `Schema.TaggedError`
classes from `effect-build/BuildError`, each with real fields and a
readable `message`:

| Error               | Meaning                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `ToolNotFound`      | Explicit executable unusable, or the PATH walk found nothing                                               |
| `ToolFailed`        | The tool exited non-zero (`exitCode`, bounded `stdout`/`stderr`) or could not be launched (`exitCode: -1`) |
| `UnsupportedTarget` | The requested target is outside the provider's set (`available`)                                           |
| `PublishFailed`     | Staging, sanity check, or the atomic rename failed (`reason`)                                              |

esbuild operations fail with `EsbuildFailed`, which wraps the native
rejection and exposes its `errors`/`warnings` message arrays by
reference; rolldown operations fail with `RolldownFailed`, which does the
same for rolldown's `errors` diagnostics. Watch streams never fail on
broken rebuilds — those arrive as values — only on failing to start.

Layer construction fails with `ToolNotFound | ToolFailed`; untested tool
versions log one warning and proceed — version and host mismatches are
never refusals.

Interruption is a Cause-level event: interrupting a build closes the
Scope, force-terminates owned child processes, and removes private
staging. It is never translated into a typed build failure, and committed
artifacts are never rolled back.
