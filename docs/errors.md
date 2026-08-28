# Errors

Core exposes narrowly owned failures for artifact validation, tool selection/content change, borrowed-output lifetime, file/tree/executable staging, revalidation, inspection, destination locking, and atomic commit.

Providers own probe, admission, input, launch, bounded-output, exit, native API, cancellation, and disposal errors. Producer packages likewise own archive, package, signing, notarization, assessment, and document-validation failures. Native diagnostics stay on the provider error rather than being flattened into a workspace-wide `ToolFailed` value.

Immediate pre-launch reauthentication can fail with a selected-tool content-change error. Verified file/tree continuations fail if the durable path is aliased, missing, changed during observation, or no longer matches the handed-off digest. These failures are evidence that adoption must stop; they are not retry or fallback signals.
