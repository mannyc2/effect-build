# Provider drivers

## Bun

The in-process `Api` lane exposes native transpiler and build results. The `Command` lane exposes stdout/direct builds, watch, and atomic executable compilation. The host API is pinned to Bun 1.3.14; command selection records the exact executable content.

## Deno

The public `Command` lane exposes transpilation and executable compilation. Bundle memory/direct/stdout/watch/declaration candidates and compile-watch remain conditional and package-private. A producer finalizer must not be justified by relabeling one of those private research rows.

## esbuild

The `Api` lane preserves native build, transform, analysis, formatting, and scoped context values. The `Command` lane preserves selected-command build, direct-directory build, and watch semantics. Direct directories are provider-owned durable side effects, not core atomic trees.

## Node SEA

The `Command` lane drives direct `node --build-sea` assembly and core executable finalization. Main acquisition and native inspection remain explicit; target identity is not inferred from the construction host.

## Rolldown

All 19 live operations are implemented and tested as package-private evidence candidates, while the rejected watch-replacement row remains absent. The npm package is marked private and its root exports nothing.
