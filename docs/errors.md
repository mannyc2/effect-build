# Errors and publication

Expected tool failures use a small tagged error vocabulary. Caller errors and foreign defects
retain their original behavior, and native session handle operations retain `PlatformError`.

## Tool failures

`Tool.ToolError` has `tool` and `reason` fields. The outer message prefixes the tool name,
and each reason is a real tagged error class with a readable message.

| Reason     | Fields                                 | Meaning                                           |
| ---------- | -------------------------------------- | ------------------------------------------------- |
| `NotFound` | `executable`                           | The PATH walk found no runnable candidate         |
| `Process`  | `detail`, sanitized `cause`            | Native spawn, read, or exit observation failed    |
| `Exit`     | `code`, `stderr`                       | The numeric exit code was outside `exitCodes`     |
| `Output`   | safe schema `cause`                    | Output did not decode through the selected schema |
| `Limit`    | `unit: "output" \| "line"`, `maxBytes` | Bounded text or a line exceeded its byte limit    |

Use `Effect.catchTag` for `ToolError`, and Effect's `catchReason` or `unwrapReason` to work
with its reason classes. All constructors expose real fields and `message`; the outer error
does not copy the reason's cause onto itself.

A valid decoded value does not establish command success: `run` and `stream` still drain
remaining output, observe late I/O failures, and check the exit code. Accepted numeric exit
codes default to `[0]`. A native signal failure is `Process`, preserving its sanitized
platform cause rather than inventing an exit code.

`Tool.make` can also fail with `ConfigError` when PATH configuration cannot be read.
An explicit executable skips that lookup; native launch failure then appears as `Process`.
Version probes warn once on failure, timeout, or an untested version.

Sink errors and event-transform errors remain the caller's `E`; the kernel preserves foreign
defects. Byte limits must be nonnegative safe integers. Invalid limit options are programmer
defects rather than another expected tool reason.

## Diagnostics and privacy

`Exit.stderr` contains only the bounded tail, defaulting to 8192 bytes. Exact
`Redacted<string>` values supplied through `redact` are removed before trimming across chunk
boundaries. Transformed values and unknown inherited secrets require the caller's own policy.

Tool errors retain no argv, environment, or stdout. Platform causes are rebuilt to remove
command-bearing fields. Output decoding errors use a fixed safe schema issue, so dynamic
record keys, custom parser messages, and input values cannot leak through the retained cause.
The caller can keep successful decoded reports or explicitly consume output.

`session` returns the native handle type in the caller's `Scope`. Spawn failure is
`ToolError/Process`; errors from subsequent handle operations remain sanitized
`PlatformError` values. The session does not check exit codes, collect stderr, or redact
caller-consumed output. Inherited diagnostics and caller-owned sinks follow the caller's logging policy.

## Atomic publication

`Atomic.file(destination, produce, { check? })` creates a private temporary directory under
the destination's parent. It passes a staged path with the final basename to `produce`, runs
the optional check, and renames that file once. Its success value is the absolute final path.

| Boundary                   | Result when it fails                                                      |
| -------------------------- | ------------------------------------------------------------------------- |
| Stage creation             | `AtomicError` with `step: "stage"`; the existing destination is preserved |
| Producer or optional check | Its own typed error; the existing destination is preserved                |
| File rename                | `AtomicError` with `step: "commit"`; publication failed                   |
| Cleanup                    | `AtomicError` with `step: "cleanup"`; the file may already be published   |

`AtomicError` carries `destination`, `step`, and `cause`. Cleanup failure after publication
does not roll back the committed output.

`Atomic.directory` stages a bundle in a private sibling directory and renames each leaf
file or symlink separately. It creates parent directories, retains unrelated destination files,
and omits empty directories. A failed commit can leave earlier files published. This is per-file
atomic replacement, and the application chooses any larger release transaction.

Bindings expose this behavior through `atomic: true`; direct native output is their default.

## Optional checks

| Error                     | Fields and boundary                                                        |
| ------------------------- | -------------------------------------------------------------------------- |
| `ExecutableError`         | `path`, `magic`; the first four bytes did not have recognized native magic |
| `DigestError/Read`        | `path`, cause; SHA-256 reading failed                                      |
| `DigestError/Mismatch`    | `path`, `expected`, `actual`; current bytes did not match                  |
| `LayoutError/InvalidPath` | `path`, detail; a relative leaf path broke the portable rules              |
| `LayoutError/Collision`   | `path`, previous path; normalized case or leaf/prefix paths collided       |

Executable checking is a magic sanity check. Native file read failures remain `PlatformError`;
the check establishes neither target architecture nor full executable validity.
Layout validation has no filesystem dependency and treats directories as implicit prefixes.
Digest verification reads current bytes; see [digests](digests.md).

Node SEA additionally exposes `NodeSeaError` for native configuration preparation and cleanup.
The binding owns that wrapper beside the operation that produces it.
