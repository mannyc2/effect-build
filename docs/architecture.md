# Architecture

The three-package graph has one executable-publication lifecycle in core at
exactly two cardinalities: scalar `compileExecutable` and homogeneous-provider
`compileExecutableMatrix`. A caller selects one provider package explicitly.

```text
effect-build-bun  ─┐
                   ├─> effect-build
effect-build-deno ─┘
```

## Four independent axes

The package manager installs the graph. The orchestrator runtime supplies
Effect's filesystem, path, crypto, and child-process services. The selected
provider maps its typed options and target to its compiler CLI. The Artifact
target describes the native executable being produced. These are four separate
choices; workspace Bun 1.3.14 is not compiler Bun 1.3.9.

## Ownership

| Core shared lifecycle owns                | Provider package owns              |
| ----------------------------------------- | ---------------------------------- |
| executable discovery and probe            | executable identity and probe argv |
| total matrix request preflight            | native target-token mapping        |
| canonical matrix names and collision test | typed options and argv rendering   |
| bounded, stable collect-all traversal     | target-to-CLI mapping              |
| sibling staging and cleanup               | compiler diagnostics               |
| scoped spawn and interruption             |                                    |
| bounded stdout and stderr                 |                                    |
| native executable validation              |                                    |
| optional SHA-256 digest                   |                                    |
| atomic destination replacement            |                                    |

The public calls cannot provide raw argv, a process handle, a provider value,
or a generic registry. Core owns one closed value containing the six Bun and
six Deno canonical target sets; its Artifact and MatrixError schemas and the
provider Target schemas derive from it. Providers own only their exact native
CLI token maps. Core never imports a provider package, providers never import
one another, and providers reach core only through public exports.

`effect-build/Provider.define` is the only authoring SPI. It accepts closed
Bun/Deno definition data and returns the two operations, Target schema, and
Layer. Process, discovery, staging, validation, hashing, and atomic publication
remain private to core.

## Scalar cell lifecycle

1. Validate the scalar input and provider options.
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

| Event                                 | Existing destination      | Staging                        |
| ------------------------------------- | ------------------------- | ------------------------------ |
| compile succeeds and output validates | replaced atomically       | removed                        |
| compiler rejects input                | unchanged                 | removed                        |
| output is missing or invalid          | unchanged                 | removed                        |
| destination is locked                 | unchanged; `OutputLocked` | removed                        |
| interruption                          | unchanged                 | child terminated, then removed |

For a matrix, this table applies independently to every cell. The matrix itself
does not add a transaction or rollback layer.

## Divergence register

- Compilation writes to a sibling staged path before atomic rename. A compiler
  that embeds the requested output path may therefore record the staged path.
- Interruption closes Scope and kills the compiler instead of leaving it
  running.
- Compiler project files and environment retain the CLI defaults. The public
  API does not snapshot or sanitize them.
- Foreign target output is validated but not executed on the Linux support
  runner. Execution remains a separate current-host check.

## Product boundary

The package does not provide standalone bundling or transforms, type checking,
declaration emission, code generation, watch mode, dev servers, task graphs,
workspaces, caching, remote execution, container construction, signing,
release-manifest checksums, publication, package release, or streaming events.
Cross-provider work and heterogeneous entry points/options remain scalar Effect
composition.

## Boundaries checked in tests

- `effect/unstable/process` is implemented only by
  `packages/effect-build/src/standalone/internal/Process.ts`; the public SPI
  mentions its service requirement type-only.
- Package source has no `node:*` imports and no `Effect.runPromise` calls.
- Package exports and runtime keys match `tooling/public-api.json`.
- Six clean Node consumers install the three tarballs through npm and Bun.
- The provider Target schemas exactly equal the authored required cells in
  `tooling/support-matrix.json` and derive from the one core correlation value.
- Every Bun and Deno target is compiled with its pinned real compiler on Linux
  x64 and independently inspected with `/usr/bin/file`; ELF outputs also use
  `/usr/bin/readelf`. Foreign native outputs are never executed on that runner.
