# Architecture

The package has one shared operation and one explicitly selected compiler.

## Independent axes

The orchestrator runtime supplies Effect's filesystem, path, crypto, and child
process services. The compiler module maps typed options and targets to its CLI.
The artifact target describes the native executable being produced. These are
three separate choices.

## Ownership

| Shared lifecycle owns          | Compiler adapter owns            |
| ------------------------------ | -------------------------------- |
| sibling staging and cleanup    | executable discovery and probe   |
| scoped spawn and interruption  | supported target mapping         |
| bounded stdout and stderr      | typed options and argv rendering |
| native executable validation   | compiler diagnostics             |
| optional SHA-256 digest        |                                  |
| atomic destination replacement |                                  |

The public call cannot provide raw argv or a process handle. Common contract
modules do not import either compiler.

## Lifecycle

1. Resolve the destination and create a sibling staging directory.
2. Render the selected compiler's argument vector.
3. Spawn one compiler inside an Effect Scope while stdout, stderr, and exit are
   consumed concurrently.
4. Require a regular native executable matching the requested target.
5. Compute a digest only when requested.
6. Atomically rename the staged executable to the destination.
7. Close the Scope and remove unused staging on every exit.

## Atomic publication states

| Event                                 | Existing destination      | Staging                        |
| ------------------------------------- | ------------------------- | ------------------------------ |
| compile succeeds and output validates | replaced atomically       | removed                        |
| compiler rejects input                | unchanged                 | removed                        |
| output is missing or invalid          | unchanged                 | removed                        |
| destination is locked                 | unchanged; `OutputLocked` | removed                        |
| interruption                          | unchanged                 | child terminated, then removed |

The compiler never writes directly to the requested destination.

## Divergence register

- Compilation writes to a sibling staged path before atomic rename. A compiler
  that embeds the requested output path may therefore record the staged path.
- Interruption closes Scope and kills the compiler instead of leaving it
  running.
- Compiler project files and environment retain the CLI defaults. The current
  API does not snapshot or sanitize them.

## Boundaries checked in tests

- `effect/unstable/process` is imported only by
  `src/standalone/internal/Process.ts`.
- Library source has no `node:*` imports and no `Effect.runPromise` calls.
- Package exports and runtime keys match `tooling/public-api.json`.
- All examples compile against a packed installation.
