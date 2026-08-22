# Errors

The public operations keep separate closed tagged-error boundaries. Match
`_tag` or use `Effect.catchTags`; do not parse diagnostic text.

## Bun and Deno compilation

`compileExecutable` uses `BuildError.BuildError`: `ToolNotFound`,
`ToolProbeFailed`, `ToolFailed`, `TargetUnsupported`, `InvalidDriverOptions`,
`OutputMissing`, `OutputInvalid`, `OutputLocked`, and `PublicationFailed`.
Diagnostics keep stdout and stderr separate and bounded.

Malformed untyped scalar envelopes and common fields fail with the existing
provider-attributed `InvalidDriverOptions`; its deterministic reason is
`<field> <finite reason>` (for example, `digest must be boolean`). Provider
option failures preserve their existing exact reason, such as
`unknown Bun option`. Unknown own fields fail as an `input` issue. Unsupported
runtime targets keep the existing `TargetUnsupported` tag. These rejections
occur before scalar staging or compiler execution, after any command selection
and probe required to construct a fresh provider Layer.

`compileExecutableMatrix` uses the separate `InvalidMatrixInput | MatrixFailed`
union. Invalid input reports every deterministic preflight issue before any
filesystem work. `MatrixFailed` preserves already committed Artifacts and all
cell failures in target input order; there is no matrix-wide rollback.

## Core JavaScript bundle capability

The narrow integration-author union is `InvalidJavaScriptBundle`,
`JavaScriptBundleAccessFailed`, or
`JavaScriptBundleTemporaryDirectoryFailed`. Its invalid reasons are finite and
machine-readable. Integrations map only genuine core error instances, so an
unrelated callback error with the same `_tag` passes through unchanged.

## Esbuild

Layer failure is `EsbuildVersionMismatch`. The scoped operation fails with
`InvalidBundleInput`, `EsbuildFailed`, `JavaScriptBundleInvalid`, or
`BundleMaterializationFailed`. Input and invalid-bundle reasons use closed
Schemas; external platform messages appear only in infrastructure `reason`
fields.

## Bun bundling

The existing Bun Layer still uses `ToolNotFound | ToolProbeFailed`; exact Bun
1.3.9 is enforced only when `withJavaScriptBundle` runs. Its operation union is
`BunBundleVersionMismatch`, `InvalidBundleInput`, `BunBundleSpawnFailed`,
`BunBundleFailed`, `BunBundleInvalid`, or
`BunBundleMaterializationFailed`. A spawn failure never stands for a completed
nonzero child, and a nonzero child retains separate bounded stdout/stderr
diagnostics. Input, invalid-output, and materialization-operation vocabularies
are finite. Genuine core bundle errors are mapped before caller code runs, so
a caller error with a colliding `_tag` retains its identity.

## Node SEA

Layer failure is `NodeSeaToolNotFound | NodeSeaProbeFailed`. Assembly fails
with `InvalidNodeSeaInput`, `NodeSeaPreparationFailed`, `NodeSeaSpawnFailed`,
`NodeSeaSyntaxCheckFailed`, `NodeSeaFailed`, or the four core publication
errors `OutputMissing`, `OutputInvalid`, `OutputLocked`, and
`PublicationFailed`.

Syntax rejection has its own tag because selected Node `--check` runs before
candidate acquisition. Main liveness, content drift, resolution mismatch,
asset validation, and builtin validation use finite input reasons. File access,
private-copy, digest, config, and stage decoding failures retain their named
preparation operation.

## Interruption

Interruption belongs to none of these unions. Closing Scope terminates active
children, skips queued matrix cells, cleans temporary state, and propagates the
exact interruption Cause. Atomic rename remains the publication point of no
return.
