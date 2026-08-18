# Provider operation inventory

Observed 2026-08-17T21:04:37Z. The CSV is normative for field completeness; this document is the readable index. Every row preserves six distinct judgments: semantic validity, demonstrated behavior, public compatibility, priority, implementation, and certification.

| ID | Provider | Operation | Surface | Ownership | Lifecycle | Candidate shape | Evidence class | Status |
|---|---|---|---|---|---|---|---|---|
| B01 | Bun | Bun.build one-shot | host API | borrowed or provider-direct | one-shot Promise; cancel UNKNOWN | thin Effect function | UPSTREAM-DIRECT | source-established |
| B02 | Bun | virtual-file build | host API | borrowed | one-shot | direct function | UPSTREAM-DIRECT | source-established |
| B03 | Bun | direct-write bundle | host API | provider-direct | one-shot; atomicity UNKNOWN | function/private staging adapter | UPSTREAM-DIRECT | source-established |
| B04 | Bun | bun build one-shot | selected command | process/direct writes | scoped child | selected command function | UPSTREAM-DIRECT | source-established |
| B05 | Bun | bun build --watch | selected command | owned process | signal/rebuild session | scoped opaque handle | UPSTREAM-DIRECT | source-established |
| B06 | Bun | plugins/loaders | host API | callbacks bounded to call/context | provider callback lifecycle | direct function/service only if reused | UPSTREAM-DIRECT | source-established |
| B07 | Bun | HTML graph bundle | API/command | memory/direct write | one-shot or CLI watch | provider-native function | UPSTREAM-DIRECT | source-established |
| B08 | Bun | splitting/chunks/assets/maps/metafile | API/command | memory/direct | one-shot | native result passthrough | UPSTREAM-DIRECT | source-established |
| B09 | Bun | compile executable | API/command | durable direct | one-shot; cancel UNKNOWN | selected command or thin host function | UPSTREAM-DIRECT | source-established |
| B10 | Bun | full-stack HTML executable | API/command | durable | one-shot | provider-native operation | UPSTREAM-DIRECT | source-established |
| D01 | Deno | Deno.bundle memory | host API | borrowed | one-shot; cancel UNKNOWN | experimental thin function | UPSTREAM-DIRECT | source-established |
| D02 | Deno | Deno.bundle write | host API | provider-direct | one-shot; atomicity UNKNOWN | function/private staging | UPSTREAM-DIRECT | source-established |
| D03 | Deno | deno bundle stdout | selected command | borrowed stream | child process | selected command | UPSTREAM-DIRECT | source-established |
| D04 | Deno | deno bundle outdir/split | selected command | process/direct writes | one-shot | selected command | UPSTREAM-DIRECT | source-established |
| D05 | Deno | deno bundle --watch | selected command | owned process | signal/rebuild session | scoped opaque handle | UPSTREAM-DIRECT | source-established |
| D06 | Deno | bundle declarations/check | API/command | memory/direct/process | one-shot | provider-native operation | UPSTREAM-DIRECT | source-established |
| D07 | Deno | deno compile | selected command | durable direct | one-shot plus acquisition | selected command | UPSTREAM-DIRECT | source-established |
| D08 | Deno | compile runtime acquisition | command sub-operation | durable | process/network lifecycle | private adapter or explicit policy | UPSTREAM-DIRECT | source-established |
| D09 | Deno | compiled runtime Deno.bundle | runtime observation | runtime process | one-shot | no surface | FALSIFIED | falsified |
| D10 | Deno | bundle permission boundary | host API | host operation | one-shot | documented unknown | UNKNOWN | requires-runtime-proof |
| E01 | esbuild | build one-shot | host API | borrowed/direct | one request over child | thin Effect function | UPSTREAM-DIRECT | source-established |
| E02 | esbuild | transform | host API | memory | one-shot | thin function | UPSTREAM-DIRECT | source-established |
| E03 | esbuild | context creation | host API | incremental engine | Scope/dispose required | scoped handle | UPSTREAM-DIRECT | source-established |
| E04 | esbuild | context.rebuild | scoped handle | context-owned | repeatable until dispose | handle method | UPSTREAM-DIRECT | source-established |
| E05 | esbuild | context.watch | scoped handle | context-owned watcher | dispose stops | handle method | UPSTREAM-DIRECT | source-established |
| E06 | esbuild | context.serve | scoped handle | owned server | stop/dispose/cancel | handle method | UPSTREAM-DIRECT | source-established |
| E07 | esbuild | context.cancel | scoped handle | context-owned | waits for cancel completion | handle method | UPSTREAM-DIRECT | source-established |
| E08 | esbuild | context.dispose | scoped handle | finalizer | terminal lifecycle | Scope finalizer | UPSTREAM-DIRECT | source-established |
| E09 | esbuild | plugins/loaders | host API | callback lifetime | build/context | function/context | UPSTREAM-DIRECT | source-established |
| E10 | esbuild | metafile/analyze | host API | borrowed | one-shot/context | native passthrough | UPSTREAM-DIRECT | source-established |
| E11 | esbuild | CLI build/watch/serve | selected command | process/session | signals | selected command if needed | UPSTREAM-DIRECT | source-established |
| E12 | esbuild | JS API native child | package implementation | long-lived child | stdin/work lifetime | private adapter | UPSTREAM-DIRECT | source-established |
| S01 | Node SEA | direct --build-sea | selected command | durable direct | one-shot child | selected command | UPSTREAM-DIRECT | source-established |
| S02 | Node SEA | CommonJS main | build + runtime | durable/runtime process | build then run | native config | UPSTREAM-DIRECT | source-established |
| S03 | Node SEA | ESM main | build + runtime | durable/runtime process | build then run | native config | UPSTREAM-DIRECT | source-established |
| S04 | Node SEA | asset embedding/runtime API | config + runtime API | durable + borrowed no-copy view | build then run | provider-native capability | UPSTREAM-DIRECT | source-established |
| S05 | Node SEA | code cache | build config | durable | build/runtime | native option | UPSTREAM-DIRECT | source-established |
| S06 | Node SEA | startup snapshot | build config | durable | build executes code | native operation | UPSTREAM-DIRECT | source-established |
| S07 | Node SEA | execArgv policy | config + runtime | durable/runtime | runtime-owned | native config | UPSTREAM-DIRECT | source-established |
| S08 | Node SEA | legacy blob/injection | selected commands/postprocessor | durable staged | multi-process | private or explicit pipeline | UPSTREAM-DIRECT | source-established |
| S09 | Node SEA | signing/verification | external post-processing | durable trust artifact | external process chain | separate mutation operation | UPSTREAM-DIRECT | source-established |
| S10 | Node SEA | builder/base relation | selected relation | durable | build then validation | preflight/private validation | RECORDED-EXECUTION | historically-observed |
| F01 | Effect | ChildProcess command | Effect primitive | scoped process | Scope/kill/finalizer | use directly/private adapter | UPSTREAM-DIRECT | source-established |
| F02 | Effect | Scope | Effect primitive | owned lifetime | close on exit/interruption | use directly | UPSTREAM-DIRECT | source-established |
| F03 | Effect | Stream/Sink | Effect primitive | stream ownership | scoped/interruption | use directly | UPSTREAM-DIRECT | source-established |
| F04 | Effect | FileSystem/Path | Effect services | service-scoped | operation-specific | private/public only if domain | UPSTREAM-DIRECT | source-established |
| F05 | Effect | Context/Layer | Effect primitives | scoped if Layer.scoped | scope-dependent | selective service/Layer | UPSTREAM-DIRECT | source-established |
| F06 | Effect | Cause/interruption | Effect primitive | fiber lifecycle | interruption distinct | use directly + finite provider errors | UPSTREAM-DIRECT | source-established |
| F07 | Effect | logging/tracing | Effect primitives | runtime-owned | span lifetime | thin instrumentation | UPSTREAM-DIRECT | source-established |
| R01 | cross-provider | NodeMainProgram | portable role candidate | native ownership | implementation-specific | finite role/adapters | PROPOSAL | proposed |
| R02 | cross-provider | BrowserModuleGraphApplication | portable role candidate | native memory/write | one-shot | finite role/adapters | PROPOSAL | requires-runtime-proof |
| R03 | cross-provider | RuntimeExecutable | rejected role | durable | one-shot | withdraw | FALSIFIED | falsified |
| R04 | cross-provider | TypedWatchEvents | rejected role | owned session | provider-specific | opaque native handles | FALSIFIED | falsified |
| R05 | cross-provider | operation-owned public surface boundary | architecture inference | provider-native | shape selected from actual lifecycle | operation-specific function/service/handle | INFERENCE | inferred |

## Reading rule

`source-established` means an exact upstream declaration or document establishes the stated shape. `historically-observed` is bounded to the recorded receipt. `inferred` records architecture reasoning rather than provider behavior. `proposed`, `requires-runtime-proof`, and `falsified` must not be upgraded by naming, repeated prose, or lack of adopters.
