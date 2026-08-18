# Bun dossier

## State model

[BUN-002 · UPSTREAM-DIRECT] Bun has two materially different construction authorities: the embedded host API can accept virtual files and callback plugins, while a selected `bun build` command owns binary identity, cwd, environment, project discovery, signal handling, and process streams. `Bun.build()` is a one-shot promise in the reviewed declaration; documented watch is a CLI-process lifetime.

| ID | Operation | Surface | Input/output ownership | Lifecycle | Role/shape | Evidence |
|---|---|---|---|---|---|---|
| B01 | Bun.build one-shot | host API | borrowed or provider-direct | one-shot Promise; cancel UNKNOWN | NodeMainProgram narrow / thin Effect function | UPSTREAM-DIRECT; source-established |
| B02 | virtual-file build | host API | borrowed | one-shot | none / direct function | UPSTREAM-DIRECT; source-established |
| B03 | direct-write bundle | host API | provider-direct | one-shot; atomicity UNKNOWN | BrowserModuleOutputSet narrow / function/private staging adapter | UPSTREAM-DIRECT; source-established |
| B04 | bun build one-shot | selected command | process/direct writes | scoped child | role only after normalization / selected command function | UPSTREAM-DIRECT; source-established |
| B05 | bun build --watch | selected command | owned process | signal/rebuild session | none / scoped opaque handle | UPSTREAM-DIRECT; source-established |
| B06 | plugins/loaders | host API | callbacks bounded to call/context | provider callback lifecycle | none / direct function/service only if reused | UPSTREAM-DIRECT; source-established |
| B07 | HTML graph bundle | API/command | memory/direct write | one-shot or CLI watch | HTML module graph narrow / provider-native function | UPSTREAM-DIRECT; source-established |
| B08 | splitting/chunks/assets/maps/metafile | API/command | memory/direct | one-shot | none / native result passthrough | UPSTREAM-DIRECT; source-established |
| B09 | compile executable | API/command | durable direct | one-shot; cancel UNKNOWN | BunExecutable only / selected command or thin host function | UPSTREAM-DIRECT; source-established |
| B10 | full-stack HTML executable | API/command | durable | one-shot | none / provider-native operation | UPSTREAM-DIRECT; source-established |

## Source-established truths

`Bun.build`, HTML entry bundling, plugins/loaders, splitting/chunks/assets/source maps/metafiles, direct writes, and executable compilation are source-established at Bun 1.3.14. Outputs are native `BuildArtifact`/message objects in the host lane; direct `outdir` changes ownership from borrowed bytes to provider-written files. Compilation embeds Bun, so its target tuple includes OS, architecture, libc and CPU distinctions, not just JavaScript syntax.

## False similarities and preserved distinctions

A `build` name does not make host and command lanes substitutable: callbacks and virtual files are not serializable; CLI watch owns a process; target `node` controls resolution/builtins but does not select a Node release. Bun's executable is not a Node SEA or Deno executable. HTML graph bundling is not automatically a generic static-site contract.

## Provider-only breadth

Full-stack HTML executable compilation, Bun plugin callbacks, virtual-file graphs, Bun-native target tuples, and embedded Bun/Node API behavior have no honest complete peer. These should remain provider-native even if a narrow direct-main or module-owned browser graph role is later proven.

## Runtime gates

Probe interruption before/after direct writes; output atomicity; plugin finalization/concurrency; CLI watch rebuild/failure/signal behavior; every executable target tuple and runtime identity; HTML top-level links/public paths/assets; and any claim that a host build can be cancelled.
