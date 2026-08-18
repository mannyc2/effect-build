# Command watch contract

**[INFERENCE]** A command watch is honest only if it distinguishes process facts from build facts. Effect v4 supplies a rich process contract; terminal text does not automatically add a build event protocol.

## Upstream process surface

**[UPSTREAM-DIRECT]** At `effect@4.0.0-rc.110`, `ChildProcess.Command` is an Effect requiring `ChildProcessSpawner | Scope.Scope` and yielding `ChildProcessSpawner.ChildProcessHandle`.

| Class | Exact member | Direct meaning |
|---|---|---|
| UPSTREAM-DIRECT | `pid` | direct child process identifier |
| UPSTREAM-DIRECT | `exitCode` | waits for numeric direct-child exit; the Node layer turns signal exit into `PlatformError` |
| UPSTREAM-DIRECT | `isRunning` | whether the direct child's exit deferred is incomplete |
| UPSTREAM-DIRECT | `kill(options?)` | requests termination, optionally escalating after `forceKillAfter`, and waits for the direct child exit in the Node layer |
| UPSTREAM-DIRECT | `stdin` | byte sink |
| UPSTREAM-DIRECT | `stdout` | byte stream |
| UPSTREAM-DIRECT | `stderr` | byte stream |
| UPSTREAM-DIRECT | `all` | merged/interleaved stdout and stderr byte stream |
| UPSTREAM-DIRECT | `getInputFd`, `getOutputFd` | extra descriptor sink/stream |
| UPSTREAM-DIRECT | `unref` | removes child from parent reference count and returns a re-reference Effect |
| UPSTREAM-DIRECT | `ChildProcessSpawner.streamString`, `streamLines` | text and line streams derived from spawned process output |
| UPSTREAM-DIRECT | `ChildProcessSpawner.lines`, `string` | scoped bounded-by-memory collection helpers |

**[UPSTREAM-DIRECT]** Node states that OS pipes have limited platform-specific capacity and a child can block if output is not consumed.

**[PROPOSAL]** A watch adapter must start draining every piped output channel immediately or configure it as `inherit`/`ignore`. It must not expose a handle while secretly leaving a provider's verbose stderr undrained.

## Honest portable contract

**[PROPOSAL] PROPOSAL — illustrative; need not compile.**

```ts
interface CommandWatch {
  readonly process: ChildProcessSpawner.ChildProcessHandle
  readonly stdoutText: Stream.Stream<string, PlatformError.PlatformError>
  readonly stderrText: Stream.Stream<string, PlatformError.PlatformError>
}

declare const start: (
  command: ChildProcess.Command
) => Effect.Effect<
  CommandWatch,
  PlatformError.PlatformError,
  Scope.Scope | ChildProcessSpawner.ChildProcessSpawner
>
```

**[PROPOSAL]** This contract promises:
- **[PROPOSAL]** a selected command was spawned through the configured Effect spawner;
- **[PROPOSAL]** raw output is available with stream backpressure;
- **[PROPOSAL]** callers can await direct-child exit, query running state, request kill, and close Scope;
- **[PROPOSAL]** no provider-ready or rebuild-complete event exists unless added by a provider-specific structured layer.

**[PROPOSAL]** This contract does not promise:
- **[PROPOSAL]** first successful build readiness;
- **[PROPOSAL]** one terminal line per rebuild;
- **[PROPOSAL]** stable human message wording;
- **[PROPOSAL]** exact global ordering between stdout and stderr;
- **[PROPOSAL]** termination of every descendant;
- **[PROPOSAL]** release of every inherited file lock;
- **[PROPOSAL]** rollback of provider-written files;
- **[PROPOSAL]** a numeric exit code for signal termination in the current Node layer.

## Provider-native structured watch contract

**[PROPOSAL]** A richer watch handle is justified when the official provider API supplies structured callbacks/events with documented completion boundaries.

**[PROPOSAL] PROPOSAL — illustrative; need not compile.**

```ts
interface StructuredWatchHandle<Event, Snapshot, E> {
  readonly events: Stream.Stream<Event, E>
  readonly latest: Effect.Effect<Option.Option<Snapshot>>
}

declare const watch: (
  request: ProviderWatchRequest
) => Effect.Effect<
  StructuredWatchHandle<ProviderWatchEvent, ProviderSnapshot, ProviderWatchError>,
  ProviderWatchAcquireError,
  Scope.Scope | ProviderHost
>
```

**[PROPOSAL]** Required laws:
- **[PROPOSAL]** each event boundary comes from official provider data, not terminal prose;
- **[PROPOSAL]** event ordering and concurrency are documented;
- **[PROPOSAL]** the first-ready condition is explicit;
- **[PROPOSAL]** successful and failed rebuilds are distinguishable;
- **[PROPOSAL]** release and unexpected exit are distinguishable;
- **[PROPOSAL]** a slow consumer has defined backpressure, dropping, or replay behavior;
- **[PROPOSAL]** provider version compatibility covers the event API.

## Experimental terminal parser

**[GITHUB-DIRECT]** The checked-in architecture rejects generic Bun/Deno typed command-watch events because the observed interfaces were human terminal output rather than stable machine-readable protocols.

**[INFERENCE]** Parsing such output can be useful operationally, but it is not a portable application contract.

**[PROPOSAL]** A parser may exist only with:
- **[PROPOSAL]** provider and exact-version pin;
- **[PROPOSAL]** locale/TTY/color mode assumptions;
- **[PROPOSAL]** bounded line handling;
- **[PROPOSAL]** `UnknownLine` preservation;
- **[PROPOSAL]** no positive readiness inference from silence;
- **[PROPOSAL]** no fallback to a different version grammar;
- **[PROPOSAL]** explicit experimental status.

**[PROPOSAL] PROPOSAL — illustrative; need not compile.**

```ts
type TerminalInterpretation<Known> =
  | {
      readonly _tag: "Known"
      readonly raw: string
      readonly observation: Known
    }
  | {
      readonly _tag: "UnknownLine"
      readonly raw: string
      readonly source: "stdout" | "stderr"
    }
```

**[INFERENCE]** Even a correctly parsed “rebuilt” line may precede stream flush, filesystem visibility, or provider post-processing. The parser's event semantics must be limited to what the text itself documents.

## Cancellation, force-kill, and reaping

**[UPSTREAM-DIRECT]** `ChildProcess.KillOptions` supports `killSignal` and optional `forceKillAfter`, after which the Effect Node layer attempts `SIGKILL`.

**[UPSTREAM-DIRECT]** The Effect Node layer:
- **[UPSTREAM-DIRECT]** attempts Windows `taskkill /pid ... /T /F` for process groups;
- **[UPSTREAM-DIRECT]** attempts negative-PID group signaling on non-Windows;
- **[UPSTREAM-DIRECT]** falls back to killing the direct process when group kill fails;
- **[UPSTREAM-DIRECT]** awaits the direct child's exit in the explicit `kill` path;
- **[UPSTREAM-DIRECT]** ignores errors in the Scope finalizer's cleanup path;
- **[UPSTREAM-DIRECT]** skips finalizer kill for an unreferenced child.

**[UPSTREAM-DIRECT]** Node documents that `kill()` only sends a signal; successful signal delivery does not prove termination; Windows handles recognized signals as abrupt forceful kills; and Linux descendants can survive parent termination.

**[INFERENCE]** Therefore the strongest portable statement is:

> **[INFERENCE]** On Scope closure, the configured Effect platform layer performs its documented best-effort finalization for a referenced direct child. The Node layer attempts process-group/direct termination and waits for the observed direct-child exit when its termination sequence succeeds; cleanup errors are ignored by that finalizer. Descendant death and lock release are not guaranteed.

**[PROPOSAL]** A provider operation that needs a stronger guarantee must add postconditions, such as:
- **[PROPOSAL]** polling for output lock release;
- **[PROPOSAL]** verifying known child PIDs from a provider protocol;
- **[PROPOSAL]** using an OS job object/cgroup/process supervisor with explicit semantics;
- **[PROPOSAL]** failing with `CleanupIncomplete` when verification cannot complete.

## Exit status and signals

**[UPSTREAM-DIRECT]** Node's native child process model distinguishes numeric `exitCode` from `signalCode`.

**[UPSTREAM-DIRECT]** The current Effect Node layer's public `ChildProcessHandle.exitCode` succeeds only with a numeric branded exit code and fails with `PlatformError` when Node reports signal termination.

**[INFERENCE]** effect-build should not claim a common `{ exitCode, signal }` result unless it changes or augments observation through an upstream-supported API. Parsing a message string to recover signal identity would be fragile and should not become a public law.

**[PROPOSAL]** Provider command errors should preserve the underlying `PlatformError`/cause and attach bounded provider diagnostics rather than flatten signal termination into a generic nonzero code.

## Stdout/stderr stream policy

**[UPSTREAM-DIRECT]** `stdout` and `stderr` are separate `Stream<Uint8Array, PlatformError>` values; `all` merges and interleaves them.

**[PROPOSAL]** For raw watch:
- **[PROPOSAL]** expose separate streams;
- **[PROPOSAL]** identify stream origin on any line-level merge;
- **[PROPOSAL]** do not claim byte-perfect cross-stream ordering;
- **[PROPOSAL]** document whether multiple subscriptions are supported or compete for a shared source;
- **[PROPOSAL]** bound line length and decoder state;
- **[PROPOSAL]** preserve undecodable bytes or fail explicitly rather than silently replacing them.

**[PROPOSAL]** For bounded one-shot capture:
- **[PROPOSAL]** drain both streams concurrently;
- **[PROPOSAL]** cap them independently;
- **[PROPOSAL]** report truncation;
- **[PROPOSAL]** decide whether cap overflow kills the child or continues draining/discarding;
- **[PROPOSAL]** wait for stream closure after direct-child exit.

## Provider output and publication during watch

**[INFERENCE]** A provider watch may write durable outputs before emitting terminal text and may overwrite files on every rebuild. Scope cleanup of the process does not roll back those writes.

**[PROPOSAL]** Direct-watch output must be classified as one of:
- **[PROPOSAL]** provider-owned borrowed output with a stable session directory and lease;
- **[PROPOSAL]** provider direct durable output with partial-state admission;
- **[PROPOSAL]** caller-managed output outside effect-build ownership.

**[PROPOSAL]** A generic command watch should default to the third classification unless an adapter proves more.

## Telemetry separation

**[UPSTREAM-DIRECT]** Effect spans/logs/metrics can be bridged to OpenTelemetry only when the application installs appropriate Layers/processors/readers.

**[UPSTREAM-DIRECT]** OpenTelemetry sampling may omit spans, and OTLP can retry, partially accept, or duplicate telemetry around uncertain acknowledgments.

**[INFERENCE]** A span named `effect-build.watch.rebuild` is an operator observation, not the consumer's rebuild event. The typed provider stream/callback—when one exists—must remain the source of application truth.

**[PROPOSAL]** Telemetry may mirror:
- **[PROPOSAL]** watch acquisition/release duration;
- **[PROPOSAL]** direct-child PID only under safe cardinality/privacy policy;
- **[PROPOSAL]** rebuild counts and durations;
- **[PROPOSAL]** parser unknown-line counts;
- **[PROPOSAL]** unexpected exit and cleanup-incomplete warnings.

**[PROPOSAL]** Telemetry must not carry unredacted argv, environment, source paths, source text, URLs with credentials, or complete provider output by default.
