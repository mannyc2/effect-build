# Errors

Every build failure is a tagged schema error. Match `_tag` or use
`Effect.catchTags`; do not parse diagnostic strings.

| Tag                    | Meaning                                                    | Typical response                                               |
| ---------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| `ToolNotFound`         | compiler was not found on `PATH` or at the override        | install it or correct the Layer path                           |
| `ToolProbeFailed`      | the compiler probe failed or returned invalid data         | run the compiler directly and inspect its installation         |
| `ToolFailed`           | the compiler exited nonzero                                | inspect bounded stdout and stderr diagnostics                  |
| `TargetUnsupported`    | the selected compiler cannot emit the requested target     | choose an available target or compiler                         |
| `InvalidDriverOptions` | runtime input did not match the compiler's option contract | correct the typed compiler options                             |
| `OutputMissing`        | the compiler exited successfully without an output         | inspect compiler configuration and diagnostics                 |
| `OutputInvalid`        | output was not a valid executable for the requested target | correct target/configuration or replace the compiler           |
| `OutputLocked`         | atomic replacement could not access the destination        | close the process holding the destination and retry explicitly |
| `PublicationFailed`    | staging or atomic rename failed                            | inspect filesystem permissions and the reported operation      |

`ToolFailed.diagnostics` contains separate stdout and stderr entries. Each entry
has `text` and `truncated`; output is retained up to one MiB per channel.

Interruption is not converted into one of these errors. Closing the running
Scope terminates the child process and leaves an existing destination intact.
