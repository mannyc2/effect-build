# Plan 031: Make native executable inspection total and canonical

## Status

- Priority: P0
- Effort: M
- Risk: HIGH correctness/security
- Depends on: 027; compatible with 028
- Planned at: `e8c1557509a9236df8e5eb236293527c3f4fd21d`

## Evidence and invariant

`packages/effect-build-node-sea/src/internal/SelectedNodeExecutable.ts::uint64`
throws `SelectedNodeExecutableInvalid("elf-offset-overflow")`; several calls
inside its `Effect.gen` are not wrapped, so malformed bytes can defect instead
of returning the Layer's typed failure. Core
`NativeExecutable.ts` accepts duplicate ELF `PT_INTERP` by last-write-wins and
does not explicitly classify FAT64 Mach-O magic.

Every malformed byte sequence must deterministically become an existing typed
probe/output error. The parser must have one unambiguous observation for ELF
interpreter and Mach-O container kind. Valid thin/FAT32 and current ELF/PE
fixtures remain unchanged.

## Scope

- `packages/effect-build/src/standalone/internal/NativeExecutable.ts`
- `packages/effect-build/src/standalone/internal/ExecutableLifecycle.ts`
- `packages/effect-build-node-sea/src/internal/SelectedNodeExecutable.ts`
- `test/unit/standalone-contract.test.ts`
- `test/unit/standalone-publication.test.ts`
- `test/unit/node-sea.test.ts`
- provider target fixtures only if a malformed fixture belongs there
- architecture/docs only for an existing guarantee sentence
- this plan and `plans/README.md`

## Steps

1. Add table-driven malformed-byte tests for unsafe 64-bit offsets/counts,
   arithmetic overflow, truncated program headers, duplicate `PT_INTERP`, FAT64
   big-endian and byte-swapped magic, zero/excessive slice counts, overlapping
   or out-of-range slices, and recursive range requests. For the Node selector,
   assert `Exit.Failure` contains `SelectedNodeExecutableInvalid`, never a Die.

2. Put every unsafe integer conversion and offset calculation behind one total
   Result/typed-Effect boundary. Do not use exceptions as control flow outside
   a locally contained parser adapter.

3. Reject a second ELF interpreter deterministically. Do not silently choose
   first or last. Keep the exact one-interpreter `linux-x64-gnu` observation.

4. Either implement FAT64 fully with bounded safe offsets and tests or reject
   both FAT64 magic values with one finite `unsupported-fat64` reason. This
   plan recommends explicit rejection; FAT32 already serves the named consumer.

5. Freeze a small, stable internal reason set. Map core parser failures to
   `OutputInvalid` and selected-Node failures to
   `SelectedNodeExecutableInvalid`; do not expose raw thrown messages.

6. Verify:

   ```sh
   bun run build
   bun x vitest run test/unit/standalone-contract.test.ts test/unit/standalone-publication.test.ts test/unit/node-sea.test.ts
   bun run test:types
   bun run verify
   bun run verify:effect
   git diff --check
   ```

## STOP conditions

- malformed fixture can Die or request unbounded reads;
- valid published target fixture changes;
- FAT64 support is added without a real universal-Node consumer and bounded
  slice tests.

## Maintenance / compression ledger

Removes defect and last-write-wins parser paths. Adds finite failure reasons,
not a second executable representation.
