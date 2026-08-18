# esbuild dossier

## State model

[ESB-002 · UPSTREAM-DIRECT] esbuild's strongest state distinction is not `Api` versus `Command`; it is one-shot operations versus a `BuildContext` that owns an incremental native engine. The JavaScript API itself communicates with a long-lived native child process, and contexts expose rebuild, watch, serve, cancel, and dispose.

| ID | Operation | Surface | Input/output ownership | Lifecycle | Role/shape | Evidence |
|---|---|---|---|---|---|---|
| E01 | build one-shot | host API | borrowed/direct | one request over child | NodeMainProgram narrow / thin Effect function | UPSTREAM-DIRECT; source-established |
| E02 | transform | host API | memory | one-shot | SourceTransform only / thin function | UPSTREAM-DIRECT; source-established |
| E03 | context creation | host API | incremental engine | Scope/dispose required | ScopedIncrementalBuild / scoped handle | UPSTREAM-DIRECT; source-established |
| E04 | context.rebuild | scoped handle | context-owned | repeatable until dispose | IncrementalNodeMain narrow / handle method | UPSTREAM-DIRECT; source-established |
| E05 | context.watch | scoped handle | context-owned watcher | dispose stops | none generic / handle method | UPSTREAM-DIRECT; source-established |
| E06 | context.serve | scoped handle | owned server | stop/dispose/cancel | none / handle method | UPSTREAM-DIRECT; source-established |
| E07 | context.cancel | scoped handle | context-owned | waits for cancel completion | none / handle method | UPSTREAM-DIRECT; source-established |
| E08 | context.dispose | scoped handle | finalizer | terminal lifecycle | none / Scope finalizer | UPSTREAM-DIRECT; source-established |
| E09 | plugins/loaders | host API | callback lifetime | build/context | none / function/context | UPSTREAM-DIRECT; source-established |
| E10 | metafile/analyze | host API | borrowed | one-shot/context | none / native passthrough | UPSTREAM-DIRECT; source-established |
| E11 | CLI build/watch/serve | selected command | process/session | signals | none / selected command if needed | UPSTREAM-DIRECT; source-established |
| E12 | JS API native child | package implementation | long-lived child | stdin/work lifetime | none / private adapter | UPSTREAM-DIRECT; source-established |

## Source-established truths

Build, transform, plugins/loaders, metafiles, structured diagnostics, memory/direct writes, targets/platforms, externals/packages, source maps, and context lifecycle are source-established at 0.28.2. `transform` is text-to-text and must not be forced into a graph-build request. `write:false` yields borrowed output bytes; `write:true` produces durable files.

## False similarities and preserved distinctions

A CLI one-shot may be selected for binary authority, but there is no reason to mirror every context method under a `Command` namespace. `cancel()` is best-effort context control and requires race probes; `watch()` callback ownership differs from a human CLI stream; `serve()` owns sockets and request handling, not just output files.

## Provider-only breadth

Transform, plugin callback namespaces and watch hooks, `BuildContext`, integrated serve, detailed metafile analysis, and esbuild-native diagnostics are provider-only. A direct-main role may use build output, but importable Node semantics, external-package behavior, and code splitting cannot be erased.

## Runtime gates

Probe cancel/rebuild/dispose races; dispose during watch/serve; plugin cleanup and concurrent callbacks; memory lifetime after context disposal; direct-write partial failure/overwrite safeguards; serve shutdown; target/platform/package combinations; diagnostics and metafile schema preservation.
