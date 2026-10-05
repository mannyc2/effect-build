# effect-build

The portable kernel for typed native tool bindings. The 0.9.0 source API uses Effect 4.0.0
and is currently unreleased.

Import the six module namespaces from `effect-build`, or import their individual subpaths.
The application supplies an Effect platform layer.

## Resolve once, run a command

This is the complete [typechecked tool example](../../examples/tool-runs/src/main.ts).

```ts
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect } from "effect";
import { Tool } from "effect-build";
import { ChildProcess } from "effect/process";

const program = Effect.gen(function*() {
  const node = yield* Tool.make("node");
  const version = yield* node.run(
    ChildProcess.make(node.executable, ["--version"], { stdin: "ignore" }),
    node.text({ maxBytes: 4096 }),
  );
  yield* Console.log(version.trim());
});

// The application supplies its platform once, at the entry point.
NodeRuntime.runMain(program.pipe(Effect.provide(NodeServices.layer)));
```

`Tool.make(name, { executable?, version? })` captures the platform spawner. An explicit
executable is used exactly as supplied. Otherwise one deterministic PATH walk chooses the
first runnable file. Subsequent operations use that selection; they never install, retry
another candidate, or substitute an executable.

An optional version check runs once at construction, with ignored stdin, bounded output, and
a ten-second Effect deadline. An untested version, failed probe, or timeout logs one warning.
It does not reject a usable binding.

| Method                              | Ownership and result                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| `run(command, sink, options?)`      | Scoped execution; returns the sink result after draining output and checking the exit code |
| `stream(command, events, options?)` | Lazy execution; emits the transform's events and checks completion before ending           |
| `session(command)`                  | Caller-owned scope; returns the platform `ChildProcessHandle`                              |
| `text({ maxBytes })`                | Bounded UTF-8 text sink                                                                    |
| `lines({ maxLineBytes })`           | LF/CRLF line transform, including a final unterminated line                                |
| `decode(schema)(input)`             | Decodes output at the binding boundary                                                     |

Run options accept `exitCodes` (default `[0]`), `stderrTailBytes` (default 8192), and exact
`Redacted<string>` values to remove from stderr. `run` and `stream` drain piped stderr and
accessible additional output descriptors. They use one stdout reader and observe I/O failures
after a sink or event transform finishes. A stream consumer that stops early closes its process scope.

A session leaves consumption and exit policy with the caller. Its handle operations retain
the native `PlatformError` type, with command-bearing fields sanitized. stdout, stderr, and
`all` share native readers; choose one reader per byte source. See
[session recipes](../../docs/recipes.md#live-sessions).

## Errors

`ToolError { tool, reason }` has exactly five tagged error reasons: `NotFound`, `Process`,
`Exit`, `Output`, and `Limit`. Errors have readable messages; `Exit` keeps only a bounded
stderr tail. Tool errors carry no argv, environment, or stdout. Output decoding failures
retain a fixed safe schema error rather than input-bearing schema issues.

Caller sink and event errors remain in the error channel, and foreign defects remain defects.
PATH configuration can raise `ConfigError`. See the [error reference](../../docs/errors.md).

## Optional file operations

| Module        | Operations                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| `Atomic`      | `file(destination, produce, { check? })`, `directory(destination, produce)`; return final absolute paths |
| `Executable`  | `checkNative(path)`; four-byte ELF, Mach-O, or PE magic sanity check                                     |
| `Digest`      | `sha256(path)`, `verifySha256(path, expected)`; bounded incremental reads                                |
| `Environment` | `scrub(command, allowed)`; replace each command leaf's environment                                       |
| `Layout`      | `validatePortable(paths)`; validate relative file/symlink paths and collisions                           |

These operations are explicit opt-ins. `Atomic.file` publishes with one rename after an optional
check. `Atomic.directory` publishes each staged leaf separately, preserving unrelated
destination files. A failed directory commit can leave earlier files published; cleanup can
fail after publication. A magic check establishes neither the target nor full executable validity.

`Digest.sha256` reads current bytes on each execution. Use `Effect.cached` when the application
chooses a memoized lifetime; `Digest.verifySha256` always reads afresh. See
[digests](../../docs/digests.md) and the [typed utility example](../../examples/tool-runs/src/Optins.ts).

`Environment.scrub` sets only the supplied values with `extendEnv: false`; obtain them through
`Config` at the application edge. Native platforms can supplement system variables.
`Layout.validatePortable` accepts leaf paths with `/` separators and implicit directory prefixes.
It rejects traversal, Windows device names and reserved characters, and Unicode/case/prefix collisions.

## Testing

`effect-build/testing` exports the `ToolTest` namespace.

- `ToolTest.handle(options?)` supplies a native handle, defaulting to empty stdout/stderr,
  exit code zero, draining input sinks, and a successful kill.
- `ToolTest.layer(spawn)` installs a native spawner callback. Assert on the `Command` there
  and return a handle or fail with a native `PlatformError`.
- Binding construction still needs `FileSystem` and `Path`. Supply no-op services for command
  tests, or real services for file publication tests.

Replace the service itself with `Layer.succeed(Service, Service.of(...))` when testing an application.
The [ffmpeg tests](../../examples/ffmpeg-session/test) demonstrate both seams.

The [main documentation](../../docs/README.md) links the guides. `bun run docs` builds API
reference pages from the exports and their JSDoc.
