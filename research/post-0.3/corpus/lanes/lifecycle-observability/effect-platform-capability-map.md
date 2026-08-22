# Effect v4 platform capability map

**[UPSTREAM-DIRECT]** Version pin: `effect@4.0.0-rc.110` at `66114151c2b4640bf773f2b3456ce70d679422f6`. Source paths below are relative to the official `Effect-TS/effect` repository at that tag.

## Resource lifetime and interruption

| Class | Effect facility | Exact API names | What upstream directly supplies | What it does not directly supply |
|---|---|---|---|---|
| UPSTREAM-DIRECT | active lifetime service | `Scope.Scope`, `Scope.Closeable`, `Scope.make`, `Scope.makeUnsafe` | A scope with `sequential` or `parallel` finalization and explicit `Empty`, `Open`, and `Closed` states. | Build-artifact ownership, path authority, mutation policy, or durability. |
| UPSTREAM-DIRECT | finalizer registration | `Scope.addFinalizer`, `Scope.addFinalizerExit` | Registers cleanup; exit-aware finalizers receive the exact `Exit` stored at close; registration on a closed scope runs immediately. | A proof that cleanup physically succeeded or that escaped values became unusable. |
| UPSTREAM-DIRECT | hierarchy | `Scope.fork`, `Scope.forkUnsafe` | Parent closure closes a child with the same exit; closing the child detaches it from the parent. | Automatic containment of filesystem descendants or OS process descendants. |
| UPSTREAM-DIRECT | closure | `Scope.close`, `Scope.closeUnsafe`, `Scope.use` | Runs finalizers in configured order; `Scope.use` closes with the workflow's exit. | A transaction, rollback, or linear type system. |
| UPSTREAM-DIRECT | fresh scoped region | `Effect.scoped` | Creates and closes a fresh scope around a scoped effect. | Non-escape of the returned value. |
| UPSTREAM-DIRECT | acquisition/release | `Effect.acquireRelease` | Registers release after successful acquisition; acquisition is protected from interruption. | Exact caller-cause identity when user-defined release failures are allowed to combine with the primary cause. |
| UPSTREAM-DIRECT | bracketed use | `Effect.acquireUseRelease` | Runs acquisition and release uninterruptibly while restoring interruption for `use`; release receives the use `Exit`. | A policy for whether cleanup failure should replace, combine with, or be reported beside a caller failure. |
| UPSTREAM-DIRECT | exit/cause preservation tools | `Effect.exit`, `Effect.onExit`, `Effect.onExitPrimitive`, `Effect.failCause`, `Exit.Exit`, `Cause.Cause` | Makes success, typed failure, defect, and interruption inspectable and permits re-failing with a complete cause. | Automatic preservation if an adapter catches and reconstructs errors or converts interruption into a new typed error. |

**[INFERENCE]** Scope is temporal authority over registered finalizers. It is not semantic authority over the values acquired within that time region.

**[INFERENCE]** An API may honestly say “the finalizer was scheduled and run as an Effect.” It may not infer “the file is gone,” “the process tree is dead,” or “the value cannot be used” without observing those separate facts.

## FileSystem and Path services

| Class | Facility | Exact API names | Direct capability | Boundary relevant to effect-build |
|---|---|---|---|---|
| UPSTREAM-DIRECT | filesystem service | `FileSystem.FileSystem` | Typed service boundary for filesystem effects and `PlatformError.PlatformError`. | It supplies mechanics, not build-specific lease, cleanup-root, destination-claim, or publication laws. |
| UPSTREAM-DIRECT | canonical observation | `FileSystem.FileSystem.realPath`, `stat`, `readLink` | Resolves an existing path and observes object metadata/link targets. | A prior observation can become stale immediately; canonicalization does not confer continuing liveness. |
| UPSTREAM-DIRECT | access/existence | `access`, `exists` | Checks access or existence at a point in time. | Neither is a reservation, lease, or race-free proof. |
| UPSTREAM-DIRECT | directory/file creation | `makeDirectory`, `makeTempDirectory`, `makeTempDirectoryScoped`, `makeTempFile`, `makeTempFileScoped` | Creates ordinary or scope-cleaned temporary locations. | The service contract does not make returned path strings non-escapable; physical deletion can still encounter platform errors. |
| UPSTREAM-DIRECT | reads | `readFile`, `readFileString`, `stream`, `open` | Bounded read, text read, streaming read, and scoped file-handle access. | effect-build must define when byte count/digest are coherent, required, and revalidated. |
| UPSTREAM-DIRECT | writes | `writeFile`, `writeFileString`, `sink`, scoped `File.write`, `File.writeAll`, `File.sync`, `File.truncate` | File output and flush/truncation primitives. | No common multi-file transaction or artifact commit protocol. |
| UPSTREAM-DIRECT | movement/removal | `rename`, `remove`, `copy`, `copyFile` | Host filesystem mutation. | Cross-platform replacement, lock, crash-durability, and rollback semantics require narrower laws and platform evidence. |
| UPSTREAM-DIRECT | directory listing/glob | `readDirectory`, `glob` | Enumerates host paths. | A listing is not a stable tree snapshot while concurrent mutation is possible. |
| UPSTREAM-DIRECT | watching | `watch` with `WatchEvent` variants `Create`, `Update`, `Remove` | Filesystem event stream. | Filesystem events do not prove provider rebuild readiness, build success, or artifact coherence. |
| UPSTREAM-DIRECT | platform path service | `Path.Path` | `sep`, `basename`, `dirname`, `extname`, `format`, `fromFileUrl`, `isAbsolute`, `join`, `normalize`, `parse`, `relative`, `resolve`, `toFileUrl`, `toNamespacedPath`. | `Path.Path` transforms path strings; it does not access the filesystem or canonicalize an existing object. |

**[INFERENCE]** `HostPath.Observed` can add value only by recording a particular `FileSystem` observation and its time/identity facts. It should not reproduce the method surface of `FileSystem.FileSystem` or `Path.Path`.

**[PROPOSAL]** Containment should be proven twice: lexically with `Path.Path` before access, and canonically with `FileSystem.realPath` for every existing root/object that may traverse symlinks. The result is still a point-in-time check, not a race-free capability on all platforms.

## Commands, processes, exit, signals, and streams

| Class | Facility | Exact API names | Direct capability | Boundary relevant to effect-build |
|---|---|---|---|---|
| UPSTREAM-DIRECT | command model | `ChildProcess.Command`, `ChildProcess.StandardCommand`, `ChildProcess.PipedCommand` from `effect/unstable/process` | Command values store executable, argv, options, or pipelines and are themselves `Effect<ChildProcessHandle, PlatformError, ChildProcessSpawner | Scope.Scope>`. | A second public `Author/Command` is redundant unless it adds selection/compatibility authority rather than process mechanics. |
| UPSTREAM-DIRECT | construction | `ChildProcess.make`, `ChildProcess.pipeTo`, `ChildProcess.prefix`, `ChildProcess.setCwd`, `ChildProcess.setEnv` | Template, array, and pipeline construction; cwd/environment combinators. | effect-build should pass the exact selected executable rather than reimplement parsing, process handles, or signal policy. |
| UPSTREAM-DIRECT | I/O configuration | `ChildProcess.CommandInput`, `CommandOutput`, `StdinConfig`, `StdoutConfig`, `StderrConfig`, `AdditionalFdConfig` | `pipe`, `inherit`, `ignore`, `overlapped`, input `Stream`, output `Sink`, and extra descriptors. | A wrapper that narrows this without a domain invariant destroys useful upstream capability. |
| UPSTREAM-DIRECT | termination options | `ChildProcess.Signal`, `ChildProcess.KillOptions` | Signal vocabulary, default `SIGTERM`, optional `forceKillAfter` followed by `SIGKILL`. | Signal delivery is not a portable proof of process-tree termination. |
| UPSTREAM-DIRECT | raw process handle | `ChildProcessSpawner.ChildProcessHandle` | `pid`, `exitCode`, `isRunning`, `kill`, `stdin`, `stdout`, `stderr`, `all`, `getInputFd`, `getOutputFd`, `unref`. | The handle reports the direct process abstraction; provider-specific readiness/rebuild semantics are not implied. |
| UPSTREAM-DIRECT | convenience execution | `ChildProcessSpawner.spawn`, `exitCode`, `streamString`, `streamLines`, `lines`, `string` | Scoped spawn, exit wait, streaming text/lines, and bounded collection. | Text lines are not automatically typed provider events. |
| UPSTREAM-DIRECT | stdout/stderr representation | `Stream.Stream<Uint8Array, PlatformError.PlatformError>` | Independent byte streams and a merged/interleaved `all` stream. | Ordering between independent streams is not a semantic event order; unconsumed OS pipes can block a child. |
| UPSTREAM-DIRECT | Node implementation | `NodeChildProcessSpawner.layer` | Resolves cwd through Effect services, spawns Node child processes, scopes handles, attempts group kill, falls back to direct kill, waits for observed exit, and supports Windows `taskkill /T /F`. | Finalizer termination errors are passed through `Effect.ignore`; this is best-effort cleanup, not a strong success guarantee. |
| UPSTREAM-DIRECT | exit representation in Node layer | handle `exitCode` | Returns a branded numeric `ExitCode` for ordinary numeric exit. Signal termination is converted to `PlatformError`. | The public handle does not expose a separate signal-code field, so an effect-build result must not claim exact signal identity unless it observes it elsewhere. |
| UPSTREAM-DIRECT | platform process behavior | Node `child_process` official docs | `kill()` sends a signal that may not terminate; `killed` only means successful signal delivery; Windows recognized signals kill abruptly; Linux descendants can survive parent kill; stdio may remain open after the `exit` event. | “Interrupted,” “signal requested,” “direct child exited,” “streams drained,” “descendants exited,” and “locks released” are distinct states. |

**[INFERENCE]** “Reaped” is honest only for the direct observed child whose exit has been awaited. It should not be used as shorthand for every descendant, every inherited descriptor, or every filesystem lock.

**[PROPOSAL]** For a bounded one-shot command, run the official command in an internal scope and concurrently drain required output streams. For a long-running command watch, expose the official scoped handle and streams rather than buffering indefinitely or inventing typed lifecycle events.

## Services and Layers

| Class | Facility | Exact API names | Direct capability | Boundary relevant to effect-build |
|---|---|---|---|---|
| UPSTREAM-DIRECT | service keys | `Context.Service`, `Context.Reference`, service `.use`, `.useSync`, `.context`, `.of` | Typed context keys that are themselves Effects; class-style services may expose `make`. | The runtime key string is service identity; duplicate unrelated keys can alias. Public integration services need stable, unique keys. |
| UPSTREAM-DIRECT | service graph | `Layer.Layer<ROut, E, RIn>` | Describes provided services, build errors, and dependencies; supports scoped resources and lifecycle hooks. | A Layer is construction/lifetime policy, not a build operation result or a substitute for an explicit session handle. |
| UPSTREAM-DIRECT | memoization | Layer `MemoMap`, `Layer.makeMemoMap`, `Layer.buildWithMemoMap` | Shares construction of the same Layer instance and releases it after the last observer. | Memoization does not imply global singleton selection across independently constructed layers or package copies. |
| UPSTREAM-DIRECT | scoped construction | `Layer.effect`, `Layer.effectDiscard`, `Layer.fromBuild`, `Layer.fromBuildMemo`, `Layer.build`, `Layer.buildWithScope` | Constructs service layers, supports discard-only setup, exposes scoped layer building, and closes failed child construction scopes. | Provider compatibility policy and selected executable identity remain effect-build concerns. |

**[INFERENCE]** A selected tool belongs naturally in a Layer when selection/version probing is intended to be stable for that Layer lifetime. The Layer should capture one canonical executable and expose command construction from that captured fact.

## Logging, tracing, metrics, annotations, and OpenTelemetry

| Class | Facility | Exact API names | Direct capability | Boundary relevant to effect-build |
|---|---|---|---|---|
| UPSTREAM-DIRECT | logging | `Effect.log`, level-specific log functions, `Effect.annotateLogs`, `Effect.annotateLogsScoped`, `Logger.Logger`, `Logger.layer` | Structured log messages with level, cause, fiber, timestamp, and scoped annotations; configurable logger layers. | Logs are diagnostic observations, not guaranteed durable application events. |
| UPSTREAM-DIRECT | tracing | `Effect.withSpan`, `Effect.withSpanScoped`, `Effect.annotateSpans`, `Tracer.Tracer`, `Tracer.Span` | Span lifetime, parentage, attributes, links, events, sampling flag, kind, and completion `Exit`. | A span may be non-recording or unexported; span names/attributes do not define provider event semantics. |
| UPSTREAM-DIRECT | metrics | `Metric.counter`, `Metric.gauge`, `Metric.frequency`, histograms/summaries, `Metric.update`, `Metric.value`, `Effect.track`, `trackSuccesses`, `trackErrors`, `trackDefects`, `trackDuration` | Concurrent aggregate measurements and effect-level tracking combinators. | Metrics intentionally aggregate; they cannot reconstruct individual build/artifact histories. |
| UPSTREAM-DIRECT | OpenTelemetry package | `@effect/opentelemetry` `effect@4.0.0-rc.110` | `NodeSdk`, `WebSdk`, `OtelTracer`, `OtelLogger`, `OtelMetrics`, and `Resource` modules. | Effect itself does not require exporters or processors merely because application code creates spans/logs/metrics. |
| UPSTREAM-DIRECT | Node OTel wiring | `NodeSdk.layer`, `NodeSdk.layerTracerProvider` | Conditionally installs tracing, metrics, and logging from supplied processors/readers; provider shutdown is scoped with timeout. | Shutdown/flush effects are ignored and time-bounded, so telemetry export is not a commit protocol. |
| UPSTREAM-DIRECT | OTel tracing bridge | `OtelTracer.make`, `OtelTracer.layer`, `layerGlobal`, `withSpanContext`, `currentOtelSpan` | Bridges Effect spans to OTel attributes/events/links/status and propagation. | Export occurs only with configured provider/processors and remains subject to sampling/export behavior. |
| UPSTREAM-DIRECT | OTel logs bridge | `OtelLogger.make`, `OtelLogger.layer`, `layerLoggerProvider` | Maps Effect levels, annotations, trace/span IDs, and log spans into OTel logs. | Log delivery and retention are outside the build operation's typed result. |
| UPSTREAM-DIRECT | OTel metrics bridge | `OtelMetrics.makeProducer`, `registerProducer`, `layer` | Exposes Effect metrics to OTel readers with cumulative/delta temporality. | Aggregation and reader cadence preclude use as a rebuild-event protocol. |
| UPSTREAM-DIRECT | OTel sampling/export protocol | OpenTelemetry Trace SDK and OTLP specifications | Sampling may reduce collected/exported spans; OTLP supports partial acceptance, retry, concurrent in-flight requests, and possible duplicates after uncertain acknowledgment. | Telemetry cannot be the sole evidence that an application-visible state transition occurred exactly once. |

## Capability overlap conclusion

| Class | Concern | Effect already owns | effect-build-specific authority still justified |
|---|---|---|---|
| INFERENCE | process execution | command construction, scoped handles, I/O streams/sinks, signals, kill timeout, exit wait, services/layers | exact tool selection, tested compatibility, required capability probes, no fallback, build-step observation |
| INFERENCE | temporary resources | scoped finalizers and temp path creation | cleanup-root exclusivity, destination overlap rejection, containment, revocable liveness, mutation/digest checks, typed expiry |
| INFERENCE | durable file | filesystem writes/rename/stat | staging protocol, candidate validation, artifact observation, commit point, partial-outcome vocabulary |
| INFERENCE | executable | raw command/file mechanics | native format/runtime/system-target inspection and executable-specific publication policy |
| INFERENCE | observability | spans, logs, metrics, annotations, OTel bridges | stable bounded semantic names/attributes and separation from provider observations/provenance |
| INFERENCE | source identity | path and filesystem services | only namespace-specific source identities and durable source-to-artifact lineage |
