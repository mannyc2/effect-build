# Errors

The two public operations have separate closed tagged-error unions. Match
`_tag` or use `Effect.catchTags`; do not parse diagnostic strings and do not add
matrix coordination tags to scalar build handling.

## BuildError

`compileExecutable` fails only with `BuildError.BuildError`:

| Tag                    | Meaning                                                    | Typical response                                               |
| ---------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| `ToolNotFound`         | compiler was not found on `PATH` or at the override        | install it or correct the Layer path                           |
| `ToolProbeFailed`      | the compiler probe failed or returned invalid data         | run the compiler directly and inspect its installation         |
| `ToolFailed`           | the compiler exited nonzero                                | inspect bounded stdout and stderr diagnostics                  |
| `TargetUnsupported`    | the selected compiler cannot emit the requested target     | choose a target from that provider's `Target`                  |
| `InvalidDriverOptions` | runtime input did not match the compiler's option contract | correct the typed compiler options                             |
| `OutputMissing`        | the compiler exited successfully without an output         | inspect compiler configuration and diagnostics                 |
| `OutputInvalid`        | output was not a valid executable for the requested target | correct target/configuration or replace the compiler           |
| `OutputLocked`         | atomic replacement could not access the destination        | close the process holding the destination and retry explicitly |
| `PublicationFailed`    | staging or atomic rename failed                            | inspect filesystem permissions and the reported operation      |

`ToolFailed.diagnostics` contains separate stdout and stderr entries. Each
entry has `text` and `truncated`; output is retained up to one MiB per channel.

## MatrixError

`compileExecutableMatrix` fails only with the separate two-tag
`MatrixError.MatrixError` union:

| Tag                  | Meaning                                                         | Typical response                                                                           |
| -------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `InvalidMatrixInput` | total preflight found one or more deterministic request issues  | correct every ordered issue; no output/staging, compile-argv, or build-child work occurred |
| `MatrixFailed`       | traversal completed with at least one typed scalar cell failure | inspect ordered failures and retain or remove committed Artifacts                          |

An `InvalidMatrixInput` issue identifies `input`, `entrypoint`, `outdir`,
`name`, `targets`, `cwd`, `digest`, `options`, `concurrency`, or `output`; a
target issue may also identify its input index. Preflight accumulates all
deterministic issues in stable order.

The compiler Layer's discovery probe runs before the operation. The preflight
guarantee concerns matrix output/staging work and compiler build invocations,
not Layer acquisition.

`MatrixFailed.artifacts` contains successful Artifacts in target input order.
`MatrixFailed.failures` contains every failed cell in target input order, with
its provider, target, intended absolute path, and original
`BuildError.BuildError`. These Artifacts have already been atomically committed.
The matrix does not roll them back, and retry is an explicit caller decision.

## Interruption

Interruption belongs to neither union. Closing the running Scope terminates
every active compiler child, skips queued matrix cells, and removes their
unused staging. Existing destinations and Artifacts committed before
interruption remain intact. The exact interruption Cause propagates unchanged;
it is never converted into `BuildError` or `MatrixError`.
