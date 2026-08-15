# Plan 034: Bound native-inspection allocation and document digest cost

## Status

- Priority: P1
- Effort: M
- Risk: MEDIUM
- Depends on: 031
- Planned at: `e8c1557509a9236df8e5eb236293527c3f4fd21d`

## Outcome

Keep range-driven native inspection but remove quadratic chunk concatenation
and reduce the unconditional initial read. Retain one-shot SHA-256 honestly
until Effect exposes an incremental platform-neutral digest service.

## Evidence

`ExecutableLifecycle.ts::collectRange` folds by allocating and copying the
entire accumulated buffer for every stream chunk. `inspectNativeExecutableFile`
always reads up to one MiB before the parser requests any extra range. Optional
digest still uses `FileSystem.readFile` plus `Crypto.digest`; rc.108 Crypto has
no incremental public API.

## Scope

- `packages/effect-build/src/standalone/internal/ExecutableLifecycle.ts`
- `packages/effect-build/src/standalone/internal/NativeExecutable.ts` only for
  a smaller seed/range contract
- `test/unit/standalone-contract.test.ts`
- `test/unit/standalone-publication.test.ts`
- `docs/api.md`, `docs/architecture.md`
- benchmarks only under `test/**` and only if deterministic
- this plan and `plans/README.md`

## Steps

1. Add a fake streaming FileSystem that emits very small chunks and records
   requested offsets/lengths. Characterize ELF, PE, thin Mach-O, FAT32 with
   distant slices, truncation, and the parser's maximum read count.

2. Replace repeated concatenation with one bounded collection: accumulate chunk
   references and copy once into the exact requested size, failing on short or
   excess bytes. No unbounded stream or whole-file inspection.

3. Select the smallest initial seed that covers magic and first-level headers;
   let `NativeExecutableRangeRequired` request bounded additional ranges. Freeze
   maximum request count and total bytes per supported container in tests.

4. Keep optional digest behavior byte-for-byte identical and document that it
   performs a separate full-file read with the current Effect Crypto service.
   Do not import `node:crypto`, add a crypto adapter, or claim constant memory.
   Open an upstream/future note for incremental Effect digest rather than a
   fake abstraction.

5. Verify:

   ```sh
   bun run build
   bun x vitest run test/unit/standalone-contract.test.ts test/unit/standalone-publication.test.ts
   bun run verify
   bun run verify:effect
   git diff --check
   ```

## STOP conditions

- parser needs an unbounded range or more than the frozen maximum;
- supported fixture observation changes;
- implementation introduces a Node-only crypto dependency in core.

## Maintenance / compression ledger

Removes repeated O(n squared) copies and oversize seed reads. No new public
protocol; digest cost remains explicit.
