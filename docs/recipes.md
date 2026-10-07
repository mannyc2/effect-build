# Recipes

Bindings supply native operations. Compose their service methods with ordinary Effect
programs and choose the file, environment, and lifecycle policies your application needs.

## Compose a build

Obtain the binding with `yield* Service`, call its methods in `Effect.gen`, and pass returned
paths to subsequent operations. Use `Effect.forEach` for a target matrix. Packaging, signing,
digest generation, and final release publication stay in the caller's workflow.

The [Bun example](../examples/bun-build/src/main.ts) returns a bundle directory with
`atomic: true`. The [utility example](../examples/tool-runs/src/Optins.ts) demonstrates
portable path validation, atomic text publication, and SHA-256 recording. See
[digests](digests.md) for its complete publication function.

Atomic output is optional. File commits use one rename; directory commits rename each produced
leaf and preserve unrelated destination files. See [publication boundaries](errors.md#atomic-publication)
before choosing an application-wide release transaction.

## Replace a service in an application test

Use `Layer.succeed(Service, Service.of(...))`. The service's actual shape checks the double,
including method results, errors, and scope requirements. The
[Encoder tests](../examples/ffmpeg-session/test/Encoder.test.ts) replace `Ffmpeg` directly
and drive the watchdog with `TestClock`.

A transport test instead supplies `ToolTest.layer`, asserts on the native command in its spawn
callback, and returns `ToolTest.handle`. Handle options can provide stdout/stderr, input/output
descriptors, an exit Effect, and a kill function. Fail a stream or exit Effect with a
`PlatformError` to exercise native I/O errors.

The [binding tests](../examples/ffmpeg-session/test/bindings.test.ts) also supply
`FileSystem.layerNoop({})` and `Path.layer`. File-writing opt-ins need real or purpose-built
filesystem services. There is no generated test-layer or scripted-step language.

## Decode finite output

Choose a byte bound, run the command with `tool.text({ maxBytes })`, and decode the result
through `tool.decode(schema)`. The [Ffprobe binding](../examples/ffmpeg-session/src/Ffprobe.ts)
shows bounded CSV and JSON protocols, duplicate codec rows, and finite numeric parsing.

Decoding succeeds only after `run` has also drained the command and accepted its exit code.
Malformed output produces `ToolError/Output` whose `detail` names the schema path and expectation,
such as `Expected string at status`, without output values or output-derived record keys. Text and line bounds
produce `ToolError/Limit`.

## Replace a command environment

The [typed utility example](../examples/tool-runs/src/Optins.ts) uses a caller-supplied allowlist:

```ts
export const nodeVersion = Effect.fn("Optins.nodeVersion")(
  function*(allowed: Readonly<Record<string, string>>) {
    // Bindings accept the same `mapCommand` option, so it scrubs their commands too.
    const node = yield* Tool.make("node", { mapCommand: Environment.scrub(allowed) });
    return yield* node.run(
      ChildProcess.make(node.executable, ["--version"], { stdin: "ignore" }),
      node.text({ maxBytes: 4096 }),
    );
  },
);
```

Obtain the allowed values through `Config` at the application edge. The transformation replaces
every pipeline leaf's environment with those values and `extendEnv: false`, including variables
a binding adds itself, so allow those too. `mapCommand` runs on every command the tool or binding
starts, including its version probe; use it also for native options a binding does not expose,
such as `killSignal` and `forceKillAfter`. Resolution still uses the construction-time PATH. Native backends can supply system variables; filesystem and
network access follow the native tool.

## Live sessions

Use `tool.session(command)` inside the caller's scope when an application owns input pipes,
progress consumption, and stop policy. It returns the platform handle, so extra file descriptors,
kill options, and errors use the platform's own types.

The [Ffmpeg binding](../examples/ffmpeg-session/src/Ffmpeg.ts) requests raw video on stdin and
raw audio on fd3. Its [Encoder](../examples/ffmpeg-session/src/Encoder.ts) keeps one writer
per input, uses capacity-two queues, and consumes progress concurrently with `exitCode`.
A blocked tick trips a watchdog only when video output has stopped advancing.

Each byte source has one reader. stdout EOF and the last progress event do not establish
process exit. Drain piped stderr concurrently or choose native inherited diagnostics.
The native `all` stream shares the same readers as stdout/stderr.

Race persistent writers against exit observation so a stopped child cannot leave a blocked
write as the application's only observer. Interruption closes the scope; the command's native
`killSignal` and `forceKillAfter` determine process cleanup. Effect's test clock controls the
application watchdog; the platform's kill grace timer follows the backend's real clock.

For event-only consumers, prefer `tool.stream`: it starts lazily and drains remaining stdout
after the event transform ends, then checks completion. Consumer cancellation closes its scope
instead of waiting for unread output.
