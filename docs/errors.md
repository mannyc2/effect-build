# Errors and interruption

## Current candidate

The current source exposes a small set of `Schema.TaggedError` classes from
`effect-build/BuildError`:

| Error               | Meaning                                                             |
| ------------------- | ------------------------------------------------------------------- |
| `ToolNotFound`      | Explicit executable unusable, or the one PATH search found nothing  |
| `ToolFailed`        | Launch failure or non-zero tool exit with bounded stdout and stderr |
| `UnsupportedTarget` | Requested target is outside the provider's current set              |
| `PublishFailed`     | Staging, sanity checking, or a rename failed                        |

esbuild uses `EsbuildFailed`; Rolldown uses `RolldownFailed`. The current
provider layers warn and proceed outside their inferred version intervals.
Those intervals are candidate behavior, not v0.5 compatibility evidence. A
current bundle `PublishFailed` can occur after earlier files were committed.

## v0.5 boundary

Provider-native operations may preserve permissive native behavior when it is
truthfully documented. Portable profiles are fail-closed: version, tool
identity, base identity, agreement, target evidence, request-shape, graph, or
metadata mismatch is a refusal at the owning boundary. Exact executed points
come from the compatibility evidence manifest, not an inferred interval.

Interruption remains a Cause-level event and is never translated into a typed
build failure. Closing a current scope can terminate an owned direct child or
native handle, but that alone is not proof of descendant-tree containment. The
portable hard guarantee is earned only by a schema-serializable job inside its
owned process group or Job Object, after confirmed tree exit and staging
cleanup. Cleanup failure is preserved in Cause with the primary failure.
