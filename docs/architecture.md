# Architecture

The package graph is a five-package star:

```text
effect-build-bun --------> effect-build
effect-build-deno -------> effect-build
effect-build-esbuild ----> effect-build
effect-build-node-sea ---> effect-build
```

Only Esbuild has another runtime edge, to exact raw `esbuild@0.28.2`. No
integration imports or declares an integration sibling.

## Four independent choices

Package manager, Effect orchestrator runtime, build tool, and Artifact target
are four separate choices. Applications provide one official platform Layer
at composition time. Importing Bun, Deno, Esbuild, or Node SEA selects an
integration, not the runtime hosting the Effect program.

## Ownership

| Core lifecycle owns                         | Integrations own                                      |
| ------------------------------------------- | ----------------------------------------------------- |
| scoped child processes and bounded output   | tool discovery, probing, and native invocation policy |
| sibling staging and candidate identity      | semantic input validation and diagnostics             |
| native executable validation                | Bun/Deno target tables and typed options              |
| optional hashing and atomic replacement     | Esbuild bundle policy and Node SEA assembly policy    |
| scoped bundle liveness and content identity | exact tool-specific stage observations                |
| cleanup-root and destination claims         | application-selected composition                      |

Core contains no Bun, Deno, Esbuild, or Node SEA catalog. The Provider author
SPI is command-only and is earned by Bun and Deno. It constructs each provider
service from one selected bound command, so Bun compile and bundle calls cannot
select different tools. The command is not an end-user service. Esbuild and
Node SEA use the narrow Integration functions directly; there is no guessed
common bundler or packager service.

## Compiler lifecycle

For Bun and Deno scalar compilation, core validates typed provider options and
target selection, resolves and claims the destination, creates sibling
staging, runs the selected command in Scope, validates the native output,
optionally hashes it, and atomically renames it. The compiler never writes
directly to the requested destination.

The selected command reports one canonical absolute executable path and
version. An explicit executable must resolve to that same reported path. Host
filename and execute-bit policy comes only from the application-provided
`Path.sep`; it is independent of the requested or observed output target.

Matrix total preflight validates the entire request before any filesystem or
child-process activity. Bounded collect-all traversal preserves target input
order. Successful cells commit independently; `MatrixFailed` returns their
already committed Artifacts plus every ordered failure and does not roll them
back. Interruption terminates active children and queued cells do not start.

## Scoped bundle lifecycle

A `JavaScriptBundle.Artifact` is a nominal live capability. Core observes an
absolute `.mjs` or `.cjs` file, safe byte count, digest, format, resolution
target, external imports, and stages. Borrowed bytes are never deleted. Owned
production receives one core-allocated cleanup root whose claim remains held
through producer teardown and awaited deletion.

The symmetric cleanup-root/destination claims prevent an executable from being
published beneath a live producer root and prevent a new producer root from
capturing an already claimed destination. Copying handle fields does not copy
authority.

## Independent bundle producers to Node SEA

`effect-build-esbuild` and `effect-build-bun` independently produce one scoped
bundle. Application code passes either handle to `effect-build-node-sea`;
none of the packages knows a sibling exists. Node SEA also accepts a valid
borrowed or future producer handle.

Before candidate acquisition, Node SEA authenticates the live handle, requires
Node resolution, validates externals against the selected exact Node builtin
authority, copies the main into its private operation directory, and verifies
the copy's digest. Both selected Node reads use only that private copy: first
`node --check`, then the SEA configuration consumed by direct `--build-sea`.
The final stage tuple is the authenticated main prefix followed by one Node
26.7.0 stage.

Node SEA supports exact `linux-x64-gnu`, never uses postject, and never
downloads or installs Node. Esbuild retains its fixed `node26.7` producer
target. Bun's `target=node` controls resolution and builtins, not a Node release
or syntax lowering. Exact syntax acceptance is owned by selected Node for both
producers. Bun metafile external edges are observations rather than a closed
dependency graph; generated code can contain imports absent from that record.

## Atomic publication

Atomic rename is the publication linearization point and point of no return.
Before rename begins, failure or interruption leaves the destination unchanged
and removes unused staging. Once rename begins, publication may complete even
if the waiting caller is interrupted; no rollback follows that point.

## Product boundary

The design rejects inspection products, public receipts, semantic plans,
replaceable executors, registries, fallbacks, caches, automatic downloads,
watch/plugins, signing, and sibling integration dependencies. Stage values are
observations, not manifests, closed-input claims, hermeticity, provenance, or
reproducibility evidence.

The v0.2 Bun/Deno import identities move directly to their package roots with
no fallback. The earlier combined Node SEA candidate was unreleased and is
superseded by granular application composition.
