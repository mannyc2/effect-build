# Plan 043: Implement direct Node SEA assembly

## Status

- Priority: P1 provider implementation
- Effort: L
- Risk: HIGH exact binary identity and durable executable mutation
- Depends on: Plan 039
- Status: TODO
- Publication authority: NONE

## Authority and objective

Stage only `effect-build-node-sea/AssembleExecutable` and its future
namespace-only root re-export from `research/post-0.3/freeze/SURFACE.json`.
Keep the released export map unchanged until Plan 044 performs the coordinated
cut.
Every released 0.3 identity follows its exact disposition in
`research/post-0.3/freeze/MIGRATION.json`.
The public verb is `assembleExecutable`: it assembles an authenticated Node
main and exact base executable; it does not compile source.

The initial admitted coordinate is direct Node 26.7.0 `--build-sea` on the
exact Linux x64 GNU host/target and main formats recorded in the surface map.

## Required implementation

1. Select Node through `Author/Tool`, require exact full-content identity and
   the `--build-sea` capability, and bind builder/base equality before output
   mutation. Before claiming default support, exact executable receipts must
   contribute the concrete admission key to immutable provider policy; the
   frozen reviewed-key set is empty and observed coordinates cannot self-admit.
2. Accept only the frozen authenticated file/bytes main forms and formats.
   Reject changed borrowed input, target mismatch, inadmissible externals, and
   unsupported runtime coordinates before commit.
3. Invoke direct `node --build-sea`; do not generate a preparation blob, use
   postject, or publish a legacy injection fallback.
4. Use `Author/Executable` for the private candidate, native/runtime/target
   validation, optional digest, and atomic publication.
5. Preserve commit-state truth under interruption: before-commit candidates
   clean up; after-commit artifacts remain committed.
6. Prepare `createExecutable`, the flat root service/errors, Integration
   coupling, and old bundle continuation dependencies for the exact migration
   deletion set. Do not remove them or add public delegates before Plan 044.

Portable Node-main/SEA profiles and recipes, Node 25 support, legacy blob
injection, cross-target assembly, code cache/snapshot promises, and Apple
distribution are deferred. Candidate-correctness repair may be added only for
a separately admitted host cell.

## Tests and certification

- Reproduce exact Node capability, CJS/ESM, assets, malformed configuration,
  selected binary identity, builder/base equality, native inspection,
  execution, replacement, digest, and interruption tests.
- Add negative tests for Node mismatch, mutation, unsupported host/target,
  externals/native addons, legacy blob/inject paths, and old exports.
- Exercise a nonpublishable source-level consumer of the staged
  `AssembleExecutable` module. Plan 044 owns the real package export and
  once-packed consumer.
- Run `bun run verify`, the real Node SEA job, and a Plan 043 implementation
  receipt on the exact implementation head. Authenticate the immutable freeze
  receipt separately; do not weaken its research-only scope.

## Stop conditions

Stop if direct assembly is unavailable at the admitted coordinate, if the
builder/base relation cannot be authenticated, if publication cannot stay
atomic, or if a legacy injector/fallback is required. Do not weaken the exact
surface into a portable profile.
