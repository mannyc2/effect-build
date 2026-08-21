# Plan 039: Implement the frozen core capability laws

## Status

- Priority: P0 architecture foundation
- Effort: XL
- Risk: HIGH lifecycle, interruption, and public author contracts
- Depends on: exact 0.4 surface-freeze commit
- Status: DONE
- Publication authority: NONE

## Authority and objective

Stage the implementation of only the `effect-build` subpaths, names, types,
and laws recorded in `research/post-0.3/freeze/SURFACE.json`. The migration
disposition in `research/post-0.3/freeze/MIGRATION.json` is equally binding.
Keep the released 0.3 package export map unchanged: Plan 044 owns the one
coordinated public hard cut after Plans 039-043 are complete. This plan may not
add a provider operation, compatibility alias, profile, package, release
mutation, or fourth Author module.

The public core is:

```text
effect-build/Artifact
effect-build/SystemTarget
effect-build/Matrix
effect-build/Author/Tool
effect-build/Author/BorrowedOutput
effect-build/Author/Executable
```

The package root re-exports only the exact namespace keys in `SURFACE.json`.

## Required implementation

1. Before changing any implementation-facing path—including `packages/**`,
   `package.json`, `bun.lock`, `tooling/public-api.json`, `scripts/**`,
   `examples/**`, and production-facing documentation—land a workflow-only
   phase handoff on a research-clean head. The current freeze receipt and
   aggregate certificate become immutable ancestor evidence. Commit a durable
   trust anchor containing the exact freeze `sourceSha`, aggregate run ID and
   attempt, certification artifact ID and SHA-256 digest, and the certification
   and constituent-receipt digests. Introduce a disjoint Plan 039 implementation
   manifest, expected-claim set, exact-head certifier, and historical-artifact
   authentication; the implementation lane must never invoke
   `certify-surface-freeze.mjs` or `validate-freeze.mjs`. Prove the handoff
   itself green before the first production edit.
2. Implement the shared Artifact, SystemTarget, and Matrix vocabulary with the
   exact representations and export names in the frozen map. Byte counts use
   the frozen unbounded decimal representation; hashed and unhashed variants
   stay distinct.
3. Stage `Author/Tool` over the official Effect `ChildProcess.Command` contract.
   The provider-private Layers in Plans 040-043 own explicit-path or one-time
   PATH selection, complete content identity, launch reauthentication, and the
   finite admission policy; core must not grow an unused generic runtime
   service for mechanisms that sibling packages cannot import after publish.
4. Stage the `Author/BorrowedOutput` contract for producer-owned, revocable
   file/tree authority consumed only through its scoped continuation. The
   contract and R4 laws freeze containment, mutation detection, bounded
   observation, one acquisition/close winner, and deterministic expiry. Each
   concrete producer implements and recertifies those laws in its owner plan;
   there is no hidden cross-package runtime export.
5. Stage the `Author/Executable` contract for a private same-parent candidate,
   native inspection, optional streamed hashing, destination-lock refusal,
   atomic rename, and cleanup before commit. Provider failures remain typed
   and interruption remains Cause. Provider plans own the private runtime
   implementation because the frozen core surface exports only this contract.
6. Implement the R7 Matrix vocabulary and report: stable
   provider/operation/index cell identity, positive bounded concurrency,
   input-ordered normal results, independent commits, and no rollback. Bun and
   Deno own the scalar scheduler that enforces exactly one call per started
   cell and preserves interruption in Plans 041 and 042.
7. Prepare the exact internal replacements and deletion set for every core
   authority marked `remove` or `replace` by the migration map. Keep the 0.3
   public exports intact until Plan 044; do not add a second public path or a
   compatibility delegate while staging the new modules.

## Tests and certification

- Start with internal contract tests for the exact future root/subpath map and
  retain characterization tests for the unchanged released 0.3 export map.
- Reproduce the R3 evaluator suite and the portable R4 Author contract/rent
  laws against the immutable research models, and typecheck the actual staged
  Author contracts against the external adapter. Authenticate the freeze's
  exact R4 runtime receipt as historical input; Plans 040-043 must reproduce
  each applicable runtime probe against their concrete implementation.
- Run the external Author adapter against an isolated nonpublishable contract
  fixture and prove it uses only the three staged Author contracts across
  compatible duplicate core copies. Plan 044 owns the real package export and
  once-packed-tarball adapter gate.
- Reproduce the R4 hashed/unhashed file, tree, and executable paths;
  symlink/traversal and same-size mutation; close/acquire races; partial
  candidates; destination locks; interruption; and post-commit behavior. This
  validates the frozen laws without inventing a rent-free core engine that no
  published provider can consume.
- Run the R7 suite for Bun- and Deno-shaped scalar fixtures without importing a
  provider into core.
- Run `bun run verify`, the R3/R4/R7 law suites, and a Plan 039
  implementation receipt on the exact implementation head. The research-only
  freeze receipt remains immutable ancestor evidence and is not reproduced on
  a production-changing commit.
- Prove the freeze-only receipt profile and the Plan 039 implementation profile
  are disjoint: no expected-claim auto-discovery, receipt directory, producer,
  or aggregate certificate may mix the two profiles.

## Stop conditions

Stop rather than widening the design if implementation requires a generic
provider registry, matcher DSL, public mutable process handle, fourth Author
module, root callable alias, whole-file hashing buffer, cross-device commit, or
translation of interruption into a typed failure. A required change to the
frozen map needs a new explicit surface decision; it is not part of Plan 039.
