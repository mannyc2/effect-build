# R2 provider-native breadth supplement — Rolldown

Date: 2026-08-20.  
Status: **bounded R2 research work product**; not an export map, support range,
implementation authorization, or certification.

Effect-build base: `claude/research-corpus-reconciliation-63pjhg` at
`c4cefd0acc2b7854cc25513967af1a8d415ccab0`. The source and output branches were reverified at that SHA before publication.

Upstream: Rolldown `v1.2.4`, commit `483c64833c0fb0d1b75f1339accf781c0a09b335`. Source coordinates are pinned in
`EVIDENCE-COORDINATES.csv`.

## Method and limits

This pass reconciles the pinned package metadata, public/experimental TypeScript surface,
native loader, CLI/config surface, plugin model, and the archived effect-build Rolldown receipt
against the repository's governance, semantic-key, lifecycle, publication, compatibility, and
Node-canon laws.

Pinned declarations/source establish advertised shape and control flow. Package metadata
establishes exports, engines, bin, and optional-native relations. The archived receipt establishes
only its exact Ubuntu x64 fixture. None establishes unexecuted concurrency, cancellation, cleanup,
interruption, partial-write, or cross-host behavior.

Deliverables:

- `ATOMIC-CLAIMS.csv`: **160** claims;
- `PROVIDER-OPERATIONS.csv`: **22** operations;
- `EVIDENCE-COORDINATES.csv`: **51** evidence coordinates;
- this report; and
- `MANIFEST.sha256`.

## Finding

Rolldown's truthful surface is broader than one bundle function:

- reusable `RolldownBuild` acquisition, generate, write, and close;
- experimental one-shot memory/direct-write build;
- two watch publication modes and watcher close;
- three selected-command operations;
- transform, parse, minify, resolve, scan, config, declaration, and module-runner utilities;
- experimental `DevEngine`; and
- a rich plugin sub-operation system.

Twenty-two rows are the largest current inventory, not a recommendation to ship 22 exports.

## Canonical operations

| ID | operation | lane | lifecycle | publication | package/profile |
|---|---|---|---|---|---|
| `OP-ROL-001` | `acquire-reusable-build` | `host-api` | `scoped-acquisition` | `none` | `defer` / `candidate-only` |
| `OP-ROL-002` | `generate` | `scoped-handle` | `reusable` | `none` | `defer` / `narrow-seed-passed` |
| `OP-ROL-003` | `write` | `scoped-handle` | `reusable` | `provider-direct-durable` | `defer` / `not-applicable` |
| `OP-ROL-004` | `close-reusable-build` | `scoped-handle` | `release` | `none` | `defer` / `supporting-lifecycle-only` |
| `OP-ROL-005` | `build-one-shot-generate` | `host-api` | `one-shot` | `none` | `defer` / `candidate-only` |
| `OP-ROL-006` | `build-one-shot-write` | `host-api` | `one-shot` | `provider-direct-durable` | `defer` / `not-applicable` |
| `OP-ROL-007` | `watch-direct-write` | `host-api` | `scoped-session` | `provider-direct-durable` | `defer` / `not-applicable` |
| `OP-ROL-008` | `watch-skip-write` | `host-api` | `scoped-session` | `none` | `defer` / `candidate-only` |
| `OP-ROL-009` | `close-watch-session` | `scoped-handle` | `release` | `none` | `defer` / `supporting-lifecycle-only` |
| `OP-ROL-010` | `cli-bundle-stdout` | `selected-command` | `one-shot` | `none` | `defer` / `not-applicable` |
| `OP-ROL-011` | `cli-bundle-write` | `selected-command` | `one-shot` | `provider-direct-durable` | `defer` / `not-applicable` |
| `OP-ROL-012` | `cli-watch` | `selected-command` | `scoped-process-session` | `provider-direct-durable` | `defer` / `not-applicable` |
| `OP-ROL-013` | `transform-source` | `host-api` | `one-shot` | `none` | `defer` / `not-node-main` |
| `OP-ROL-014` | `parse-source` | `host-api` | `one-shot` | `none` | `defer` / `not-applicable` |
| `OP-ROL-015` | `minify-source` | `host-api` | `one-shot` | `none` | `defer` / `not-applicable` |
| `OP-ROL-016` | `resolve-module` | `host-api` | `reusable` | `none` | `defer` / `not-applicable` |
| `OP-ROL-017` | `scan-graph` | `host-api` | `one-shot-with-cleanup` | `none` | `defer` / `not-applicable` |
| `OP-ROL-018` | `acquire-dev-engine` | `host-api` | `scoped-session` | `mixed-configured` | `defer` / `reject-current` |
| `OP-ROL-019` | `close-dev-engine` | `scoped-handle` | `release` | `none` | `defer` / `supporting-lifecycle-only` |
| `OP-ROL-020` | `emit-isolated-declaration` | `host-api` | `one-shot` | `none` | `defer` / `reject-current` |
| `OP-ROL-021` | `module-runner-transform` | `host-api` | `one-shot` | `none` | `reject` / `reject-current` |
| `OP-ROL-022` | `load-config` | `host-api` | `one-shot` | `none` | `defer` / `not-applicable` |

Lifecycle or publication differences force separate semantic keys. Therefore generate/write,
memory/direct-write build, watch/skip-write, and CLI stdout/write/watch are distinct operations.
Close rows remain lifecycle support.

## Ownership

`rolldown(input)` acquires reusable provider state. `generate` and `write` are methods on that
owner; `close`/`Symbol.asyncDispose` release it. An Effect `Scope` may own the handle if selected,
but the methods should not become unrelated root services.

Open proof obligations include concurrent generate/write, output collisions, close races,
idempotency, post-close behavior, interruption cleanup, and native external-memory ownership.
The archived fixture is only a narrow generate/close seed.

Watch is a separate scoped session. Bundle events may carry result handles that require their own
close, so watcher close and result close are independent. CLI watch is instead an owned child
process.

`DevEngine` owns different state—development builds, lazy entries, HMR/output callbacks—and is not
an alias for watch or `RolldownBuild`.

## Publication

Memory generate and utility operations return caller-owned values and publish nothing.

Write, direct-write build, ordinary watch, CLI write, and CLI watch use
`provider-direct-durable` publication. No evidence establishes staging, transactional publication,
rollback, or atomic rename. A provider result is not automatically a wrapper-authenticated
artifact receipt, and interruption may leave durable remnants.

Plugins reinforce this boundary: `generateBundle` may mutate the output set before publication;
`writeBundle` runs after writes; plugin context may emit files or use filesystem capabilities.

## CLI, config, utilities, and plugins

CLI stdout is human-oriented and is not promoted to a structured chunk contract. Selected-command
identity must be observed separately from imported package identity and reauthenticated at launch.

`loadConfig` executes caller-selected configuration code and must retain an explicit trust boundary.

Parse is a public utility at this coordinate. Transform/minify, resolver, scan, declaration, and
DevEngine are experimental. Deprecated Vite-only module-runner transform is rejected as a general
provider operation. Declaration and DevEngine remain rejected from the current profile pending
separate contracts.

Architecture-significant plugin sub-operations include options, build/resolve/load/transform,
render hooks, `generateBundle`, `writeBundle`, `closeBundle`, `watchChange`, and `closeWatcher`.
They remain sub-operations of their provider owner unless upstream gives them independent
acquisition and release.

## Package and host identity

Truthful identity is relational:

```text
JavaScript package
+ native loader
+ selected platform package or WASI fallback
+ loaded native bytes
+ host runtime
```

Version alone is insufficient. Selection depends on platform, architecture, and on Linux the libc
family. The Node engine field is installation metadata, not certification. Bun is an independent
host cell.

Compatibility must fail closed for missing/ambiguous native packages, incoherent package/native
identity, unsupported host relations, missing capabilities, selected-command replacement, and
known operation/lane holes. An untested-version override may admit only policy uncertainty after
those gates pass.

## Node-main boundary

Provider success and strict `IncrementalNodeMain` success are independent. The portable role adds
Node-main format/resolution, entry identity, builtin/external policy, dynamic import, metadata,
repeatability, lifecycle, and substitution laws. A provider pass cannot silently widen that role.

## Disposition

Candidate later provider-package core:

- acquire reusable build;
- generate;
- close;
- optional one-shot memory build;
- provider-specific parse/transform/minify where demanded.

Defer behind probes:

- direct write and one-shot write;
- watch and CLI modes;
- resolver, scan, and config.

Reject from the current profile:

- DevEngine;
- isolated declaration emission;
- deprecated module-runner transform.

## Adversarial probes

Required probe set:

1. repeated generate: determinism, retained state, memory growth;
2. concurrent generate: serialization and result separation;
3. concurrent writes to same/different destinations;
4. close racing generate/write;
5. close idempotency and post-close behavior;
6. external-memory release and use-after-release;
7. one-shot interruption and finally cleanup;
8. direct-write interruption and remnant inventory;
9. watch event order and `skipWrite`;
10. watcher close during rebuild and repeated close;
11. CLI stdout with multiple outputs/diagnostics;
12. CLI write/watch termination and remnants;
13. plugin ordering, failure, concurrency, and close cleanup;
14. resolver reuse and release discovery;
15. scan cleanup and interruption;
16. DevEngine callback backpressure/publication/close;
17. package-loader-native coherence across host/libc cells;
18. selected-command replacement detection.

Strict `IncrementalNodeMain` testing is a nineteenth independent profile probe.

## Non-claims

This pass establishes no supported version range, Bun correctness, complete native host matrix,
write atomicity, cancellation contract, concurrency safety, interruption cleanup, watch delivery
guarantee, DevEngine support, declaration correctness, or portable Node-main certification.

## Conclusion

Retain the 22 operation rows as research inventory; keep lifecycle/publication splits explicit;
treat package/native/host identity relationally; use the archived fixture only as a narrow seed;
run the named probes before support decisions; and keep package shipment independent from
`IncrementalNodeMain` admission.
