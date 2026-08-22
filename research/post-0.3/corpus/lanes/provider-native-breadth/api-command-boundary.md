# API / command boundary

## Decision rule

Retain separate lanes only when they differ in at least one of: construction authority, project/config discovery, host requirements, callback/plugin authority, lifecycle ownership, output ownership, diagnostics/result semantics, target/runtime selection, or ambient permissions. The words “API” and “command” are not themselves domains.

| Provider / operation | Host API | Selected command | Boundary verdict |
|---|---|---|---|
| Bun bundle | Virtual files, callback plugins, structured `BuildOutput`, memory artifacts or direct writes | Selected Bun binary, cwd/env, CLI config, direct files, human streams, process watch | **Real split** for bundle and executable operations |
| Bun watch | No reviewed host watch handle on `Bun.build()` | Long-running CLI watcher and signal lifetime | **Command-only public operation** unless a host handle appears and is sourced |
| Deno bundle | Experimental structured outputs; optional direct write; host ambient authority | Experimental stdout/files, project/config/import map/lock discovery, process watch | **Real split**, but experimental and permission-gated |
| Deno compile | No equivalent reviewed host compile API | Selected command owns runtime acquisition, target, permissions, includes and cache | **Command operation** |
| esbuild build/transform | Rich structured API and callbacks | Selected binary can reproduce only serializable options; human diagnostics/files | Split may be useful for selected binary authority, but not a complete mirrored namespace |
| esbuild context | Host API owns rebuild/watch/serve/cancel/dispose | CLI watch/serve has process/human-stream semantics, not the same handle | **Host scoped context**, not symmetric lanes |
| Node SEA assembly | No symmetric JavaScript host builder; Node command plus filesystem/postprocessor | Builder/base executable, direct generation or legacy injection, external signing tools | **Explicit pipeline operations**, not `Api`/`Command` twins |
| Node SEA assets | Runtime `node:sea` lookup API | No command peer | **Runtime capability**, separate domain |

## Attempted falsifier of the split

For each row, ask whether changing only the transport (function call versus argv) leaves authority, lifecycle, configuration, host and result semantics invariant. It does not for Bun/Deno bundles, but the falsifier succeeds against a blanket taxonomy: esbuild context methods have no truthful command twins; Node SEA runtime assets have no command twin; Deno compile has no host twin; Bun full-stack executable is provider-only. Therefore complete mirrored namespaces are **FALSIFIED** while local lane distinctions survive.

## Public consequence

Prefer operation names/modules (`build`, `transform`, `makeContext`, `bundle`, `compileExecutable`, `assembleSea`, `getAsset`) and encode the boundary only where it carries semantics: e.g. a selected-command constructor or operation-specific module. Do not commit every provider forever to empty or artificial sibling namespaces.
