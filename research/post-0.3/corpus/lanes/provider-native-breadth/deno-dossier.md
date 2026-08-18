# Deno dossier

## State model

[DENO-002 · UPSTREAM-DIRECT] Current bundling is experimental. The host `Deno.bundle()` and `deno bundle` may share an engine but do not share authority or result semantics: the host can return structured in-memory outputs or write directly; the command can stream stdout, discover project/config/import-map/lock state, and own a watch process.

| ID | Operation | Surface | Input/output ownership | Lifecycle | Role/shape | Evidence |
|---|---|---|---|---|---|---|
| D01 | Deno.bundle memory | host API | borrowed | one-shot; cancel UNKNOWN | Browser output narrow / experimental thin function | UPSTREAM-DIRECT; source-established |
| D02 | Deno.bundle write | host API | provider-direct | one-shot; atomicity UNKNOWN | HTML graph narrow / function/private staging | UPSTREAM-DIRECT; source-established |
| D03 | deno bundle stdout | selected command | borrowed stream | child process | single stream only if finite / selected command | UPSTREAM-DIRECT; source-established |
| D04 | deno bundle outdir/split | selected command | process/direct writes | one-shot | browser output narrow / selected command | UPSTREAM-DIRECT; source-established |
| D05 | deno bundle --watch | selected command | owned process | signal/rebuild session | none / scoped opaque handle | UPSTREAM-DIRECT; source-established |
| D06 | bundle declarations/check | API/command | memory/direct/process | one-shot | none broad / provider-native operation | UPSTREAM-DIRECT; source-established |
| D07 | deno compile | selected command | durable direct | one-shot plus acquisition | DenoExecutable only / selected command | UPSTREAM-DIRECT; source-established |
| D08 | compile runtime acquisition | command sub-operation | durable | process/network lifecycle | none / private adapter or explicit policy | UPSTREAM-DIRECT; source-established |
| D09 | compiled runtime Deno.bundle | runtime observation | runtime process | one-shot | none / no surface | FALSIFIED; falsified |
| D10 | bundle permission boundary | host API | host operation | one-shot | none / documented unknown | UNKNOWN; requires-runtime-proof |

## Source-established truths

The current docs establish experimental host and command bundling, project/config/import-map/lock participation, module/declaration/HTML modes, and `deno compile` runtime acquisition, includes, permissions and target semantics. Compile creates a Deno runtime executable, not a neutral native artifact.

## False similarities and preserved distinctions

The exact receipts falsify three tempting equations: a compiled Deno 2.9.3 executable did not expose `Deno.bundle`; broad static-web output lost a top-level linked stylesheet; a rolled-up declaration retained a local type import. Comments implying ordinary read/write permission checks also conflict with exact no-grant probes, so the stable permission contract remains UNKNOWN rather than silently resolved.

## Provider-only breadth

Runtime acquisition/cache behavior, embedded Deno permissions, project graph semantics, import maps/lockfiles, experimental declaration/HTML modes, and Deno runtime identity are provider-only. Host memory output and command stdout/direct-write behavior must remain separate when ownership matters.

## Runtime gates

Run an explicit permission matrix across read/write/net/cache/config/import-map/lock and compiled hosts; verify API availability inside compiled executables across versions; exercise declaration closure, HTML top-level links, watch signals/rebuilds, stdout framing, direct-write partial failure, offline cache, and target/runtime identity.
