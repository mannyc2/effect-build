# Plan 031: Make native executable inspection total and canonical

## Status

- Priority: P0
- Effort: M
- Risk: HIGH correctness/security
- Depends on: 027; compatible with 028
- Planned at: `e8c1557509a9236df8e5eb236293527c3f4fd21d`
- Completion: `DONE`

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
- `packages/effect-build-node-sea/src/internal/NodeSea.ts` only for the
  selected-executable cause-preserving error-mapping call site
- `test/unit/standalone-contract.test.ts`
- `test/unit/standalone-publication.test.ts`
- `test/unit/node-sea.test.ts`
- provider target fixtures only if a malformed fixture belongs there
- architecture/docs only for an existing guarantee sentence
- this plan and `plans/README.md`

The creating parent explicitly approved the `NodeSea.ts` scope correction at
the live implementation baseline
`217b79fe315bd13c55027b7c0ae14a4286ecb89f`. The earlier
`217b79fb29c6f510ac286910b2e9673d6448fd53` spelling in the request was a
transcription error; a fresh local read matched the corrected SHA before work
continued.

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

## Receipt

- **Implementation baseline SHA**:
  `217b79fe315bd13c55027b7c0ae14a4286ecb89f`. The creating parent confirmed
  that the earlier `217b79fb29c6f510ac286910b2e9673d6448fd53` spelling was
  a transcription error, and a fresh local `git rev-parse HEAD` matched the
  corrected SHA before work continued.
- **Approved scope correction**: the creating parent explicitly added
  `packages/effect-build-node-sea/src/internal/NodeSea.ts` only for the
  selected-executable call-site mapping. Its existing `Effect.mapError` erased
  interruptor `31032` in the red `makeNodeSeaService` Fail+Interrupt test. The
  approved `catchCause` -> `failCause(Cause.map(...))` change maps only the
  typed Fail to `NodeSeaProbeFailed` while retaining sibling Interrupt/Die
  structure. It adds no generic helper, public error, export, or package edge.
- Tests were added first. The initial core table had nine expected failures
  while 30 tests stayed green: duplicate `PT_INTERP`, both FAT64 magics, four
  invalid FAT32 range/overlap shapes, a table/thin-CPU mismatch, and a nested
  FAT slice. The selected-Node table had five expected failures while 17 tests
  stayed green: three unsafe-u64 Dies, safe-add overflow misclassification, and
  dynamic `open-failed` text. Publication had three finite-reason mismatches.
  Review then found and reproduced two valid-behavior regressions (mixed
  x64+i386 FAT32 and six distant slices) and two call-site interruption losses;
  each received a red regression before its fix.
- Core parsing now uses one finite `NativeExecutableInvalid` reason set behind
  the lifecycle's local `Result.try` adapter. Unsafe offsets and ranges cannot
  defect at the typed boundary; duplicate ELF interpreters fail
  deterministically; both FAT64 encodings return `unsupported-fat64`; FAT32
  validates table/slice bounds and overlap, derives architecture from metadata,
  and inspects exactly one deterministic supported thin slice. Unsupported
  slices remain range-checked without changing valid mixed-FAT behavior.
- Selected-Node u64/add/multiply/range operations return `Result` and enter the
  typed Effect channel through `Effect.fromResult`. File open/read failures use
  fixed finite reasons, and cause-aware mapping preserves mixed-cause topology.
  Direct table rows prove every malformed case is an
  `Exit.Failure<SelectedNodeExecutableInvalid>` with no Die.
- Production publication proves a sparse ELF performs exactly the initial
  one-MiB read plus its 56-byte program-header and bounded interpreter range.
  FAT32 requires at most one distant supported-slice header request. Parser
  failures and mixed read causes preserve old/absent destination bytes, skip
  target resolution/publication, retain interruption, and remove scoped
  staging.
- Exact package-manager Bun was `1.3.14` (`0d9b296a`). Final `bun run build`
  passed; the focused three-file run passed 85 tests with one intentional skip;
  `bun run test:types` passed five files; and `git diff --check` passed.
- Final `bun run verify` passed 221 unit tests with one intentional skip, 14/14
  once-packed consumers, 41 architecture tests, lint, and formatting. Final
  `bun run verify:effect` passed both `4.0.0-beta.104` and `4.0.0-rc.108`, each
  with 221 unit tests, one intentional skip, and 14/14 packed consumers.
- The coherent implementation source commit is
  `dc155461612026ff1dcb82e4695b99ddb943b4fd`. Exact-SHA CI run
  `31863227257` completed successfully at that SHA. All twelve jobs passed:
  node-sea `94960034767`, quality `94960034779`, bun-bundle `94960034790`,
  Ubuntu publication `94960034795`, Bun target support `94960034808`, esbuild
  `94960034813`, macOS publication `94960034821`, Effect rc.108 `94960034826`,
  Deno target support `94960034827`, Effect beta.104 `94960034828`, real-tools
  `94960034835`, and Windows publication `94960034876`.
- The source commit changed only the eight files in the reconciled Plan 031
  scope. Its worktree was clean after commit and push. This final receipt and
  README status are plan-only evidence.
