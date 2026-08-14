# Architecture

The package has one executable-publication lifecycle at exactly two
cardinalities: scalar `compileExecutable` and homogeneous-provider
`compileExecutableMatrix`. A caller selects one compiler module explicitly.

## Four independent axes

The Bun package manager owns workspace installation. The orchestrator runtime
supplies Effect services. The selected provider maps typed options and target
to its producer. The Artifact target describes the native executable being
produced. These are four separate choices.

## Ownership

| Core lifecycle owns                       | Provider packages own                        |
| ----------------------------------------- | -------------------------------------------- |
| total matrix request preflight            | executable discovery and probe inputs        |
| canonical matrix names and collision test | provider target-table authority              |
| bounded, stable collect-all traversal     | typed options and command rendering          |
| candidate identity and sibling staging    | target-to-producer mapping                   |
| native executable validation              | provider diagnostics                         |
| optional SHA-256 digest                   | selected compiler byte characterization      |
|                                           | Node SEA's scoped bundle and producer inputs |
| atomic destination replacement            |                                              |

Core additionally owns every scoped command child and bounded output. The
closed composed SPI gives Node SEA only that core-owned bounded executor, not
the raw process service or a process handle. Node SEA retains its private
esbuild continuation lifetime plus Node-specific discovery, arguments, and
diagnostics.

The public calls cannot provide raw argv, a process handle, a provider value,
or a generic registry. Root provider-correlated schemas may import only the
pure provider target-contract projections. They never import provider public
modules, adapters, discovery, or execution code.

## Scalar cell lifecycle

1. Validate the runtime target and provider options. Entrypoint, outfile, cwd,
   and digest remain typed-only fields trusted from the scalar TypeScript call.
2. Resolve the destination and create a sibling staging directory.
3. Render the selected compiler's argument vector.
4. Spawn one compiler inside an Effect Scope while stdout, stderr, and exit are
   consumed concurrently.
5. Require a regular native executable matching the requested target.
6. Compute a digest only when requested.
7. Atomically rename the staged executable to the destination.
8. Close the Scope and remove unused staging on every exit.

The compiler never writes directly to the requested destination.

## Matrix lifecycle

The matrix adds one deterministic boundary around the scalar cell lifecycle:

1. Validate every request field, the non-empty provider target tuple, shared
   options, positive-safe-integer concurrency, and all canonical final paths in
   one total preflight pass.
2. If any issue exists, return every ordered issue as `InvalidMatrixInput`
   before filesystem work, argv rendering, or child spawn.
3. Otherwise traverse cells with bounded concurrency. Each active cell owns the
   complete scalar staging, process, validation, digest, and commit lifecycle.
4. Preserve target input order regardless of completion order. On complete
   traversal, return ordered Artifacts or one `MatrixFailed` containing ordered
   committed Artifacts and ordered cell failures.

Cells commit independently. A later or concurrent failure does not roll back a
successful cell. Interruption closes active Scopes and terminates their children,
skips queued cells, removes unused staging, and preserves earlier commits. The
exact interruption Cause is propagated rather than translated into a matrix
error.

## Atomic publication states

| Event                                  | Existing destination      | Staging                                  |
| -------------------------------------- | ------------------------- | ---------------------------------------- |
| compile succeeds and output validates  | replaced atomically       | removed                                  |
| compiler rejects input                 | unchanged                 | removed                                  |
| output is missing or invalid           | unchanged                 | removed                                  |
| destination is locked                  | unchanged; `OutputLocked` | removed                                  |
| interruption before publication begins | unchanged                 | child terminated if active, then removed |
| interruption after rename starts       | may already be replaced   | removed                                  |

For a matrix, this table applies independently to every cell. The matrix itself
does not add a transaction or rollback layer. Atomic rename is the publication
linearization point and point of no return. Failure or interruption before
publication begins leaves the existing destination unchanged. Once rename
starts, publication may linearize even when the waiting caller observes
interruption; the destination can therefore contain the new executable without
an Artifact having been returned. There is no rollback after that point.

## Divergence register

- Compilation writes to a sibling staged path before atomic rename. A compiler
  that embeds the requested output path may therefore record the staged path.
- Interruption closes Scope and kills the compiler instead of leaving it
  running.
- Compiler project files and environment retain the CLI defaults. The public
  API does not snapshot or sanitize them.
- Foreign target output is validated but not executed on the Linux support
  runner. Execution remains a separate current-host check.

## Composed Node SEA provider

The released surface includes Bun, Deno, and Node SEA scalar and homogeneous
matrix operations. The Node SEA package owns a continuation-scoped bundle ->
exact selected Node SEA topology and reuses core's native validation and
publication boundary. Its bundle,
configuration, candidate, and child are temporary Scope-owned state; only the
validated final executable remains after both nested Scopes close.

Node SEA characterizes the selected Node tool independently from output
publication: it requires exact ELF64 little-endian x86-64 bytes with a GNU
interpreter before trusting the tool's metadata and `--build-sea` probes.

The internal ordered stages report that esbuild and the selected Node producer
were observed doing work. Stage observations are not build receipts or
reproducibility evidence. They do not establish closed inputs, identical
invocations, or byte equality. Direct and composed operations are not
replaceable executors: both still use the same local filesystem and process
backend.

The maintainer selected Node SEA as a product after the historical promotion
decision. That adds a fourth provider package, not a third operation or a
public stage protocol. The rejected inspection, receipt, semantic-plan,
replaceable-executor, cache, remote, signing, and download products remain absent.

## Product boundary

The package does not provide standalone bundling or transforms, type checking,
declaration emission, code generation, watch mode, dev servers, task graphs,
workspaces, caching, remote execution, container construction, signing,
release-manifest checksums, publication, package release, or streaming events.
Cross-provider work and heterogeneous entry points/options remain scalar Effect
composition.

## Boundaries checked in tests

- `effect/unstable/process` is confined to core's private process boundary and
  the public Layer requirement declaration; no provider package imports it.
- Library source has no `node:*` imports and no `Effect.runPromise` calls.
- Package exports and runtime keys match `tooling/public-api.json`.
- Internal esbuild, direct Node SEA assembly, lifecycle, and stage
  implementation representations are not package entrypoints.
- All examples compile against a packed installation.
- Provider target-table literals exactly equal the authored required cells in
  `tooling/support-matrix.json`.
- Every Bun and Deno target is compiled with its pinned real compiler on Linux
  x64 and independently inspected with `/usr/bin/file`; ELF outputs also use
  `/usr/bin/readelf`. Foreign native outputs are never executed on that runner.
