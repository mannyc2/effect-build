# Errors and interruption

The core kernel fails with a small closed set of `Schema.TaggedError` classes
from `effect-build/BuildError`, each with real fields and a readable
`message`:

| Error                        | Meaning                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `ToolNotFound`               | Explicit executable unusable, or the PATH walk found nothing                                               |
| `ToolFailed`                 | The tool exited non-zero (`exitCode`, bounded `stdout`/`stderr`) or could not be launched (`exitCode: -1`) |
| `UnsupportedTarget`          | The requested target is outside the provider's set (`available`)                                           |
| `PublishFailed`              | Staging, sanity check, or the atomic rename failed (`reason`)                                              |
| `ArtifactVerificationFailed` | A finalized path no longer has its recorded type, byte length, manifest, or SHA-256 identity               |

Producer packages add durable domain-specific errors only where the core five
are not expressive: unsafe/failed archive construction, invalid Python output,
rejected nFPM configuration or Windows signing input, schema-invalid SBOM
output, and Apple construction, signing, notary
correlation/unknown-submission, staple, or assessment outcomes.
Credential coordinates are scrubbed before any error leaves a signing/notary
service.

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
artifacts are never rolled back. Publication's final rename is
uninterruptible, so a destination is always absent or complete, never partial.
Effect reasserts an interruption that arrived during that rename immediately
after the commit; the caller can therefore receive interruption without the
`Artifact` return value even though the complete destination exists. A
higher-level continuation must observe and adopt the exact digest/manifest, or
deliberately discard and rebuild it. It must not infer non-commit and retry
blindly.

All local publication operations assume one release-machine writer for each
destination. The same-parent rename gives an atomic visibility boundary, not a
portable multi-writer compare-and-swap primitive.
