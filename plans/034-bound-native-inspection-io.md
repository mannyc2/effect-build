# Plan 034: Bound native-inspection allocation and document digest cost

## Status

- Priority: P1
- Effort: M
- Risk: MEDIUM
- Depends on: 031
- Planned at: `e8c1557509a9236df8e5eb236293527c3f4fd21d`
- Completion: `DONE`

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

## Receipt

- **Implementation baseline SHA**:
  `341c86ea3bc3f4c695e14209d126c7637e25e695`, the clean Plan 032 receipt
  commit. The plan remained within its named scope; `NativeExecutable.ts` did
  not need to change because every supported parser branch terminated within
  the frozen range budget.
- The allocation-only refactor was isolated first in
  `ddc163d736907267fd27e22878a8c095cd7a3198`. Its fake FileSystem emitted 257
  one-byte chunks without changing the thin Mach-O observation, rejected short
  and excess ranges through the existing typed boundary, and proved that an
  excess chunk followed by Fail+Interrupt is fully drained so interruptor
  `34034` survives. The old and new implementations both passed 66 focused
  tests with one intentional skip; the change removed repeated accumulated-
  buffer allocation without changing the one-MiB seed or request policy.
- The deliberate IO-contract commit is
  `3c70be6df80aa3aa5c700250dfbe6d118c0226d0`. Before implementation, eight
  seed/ceiling assertions failed. Core now begins with at most 64 bytes and
  permits exactly two additional parser-requested ranges. Production-path
  stream traces freeze unchanged observations and exact maxima: ELF64 three
  calls / 233,536 requested bytes, PE two / 70, thin Mach-O one / 64, and
  FAT32 three / 81,992. Focused unit verification passed 71 tests with one
  intentional skip; the unit-plus-docs gate passed 80 with one skip.
- The collector retains only bounded chunk references, drains the requested
  stream, rejects short or excess output, and performs one final allocation
  and copy only when the exact requested length is present. No distant gap is
  read or allocated, no whole-file native inspection or Node-only crypto path
  was introduced, and all malformed-byte failures remain typed.
- Digest behavior is unchanged and now explicit in `docs/api.md` and
  `docs/architecture.md`: `digest: false` performs no full-file read;
  `digest: true` performs one separate `FileSystem.readFile` and passes that
  identical buffer to one one-shot Effect `Crypto.digest("SHA-256", ...)`
  call. The test preserves exact published bytes and SHA-256. Constant-memory
  digesting remains future work until Effect exposes a platform-neutral
  incremental service.
- Exact package-manager Bun was `1.3.14` (`0d9b296a`). Focused build, type,
  format, and diff gates passed. The required full local gate was rerun at the
  cumulative clean source `a034e3bafcbed5ab7639fa28ed40840e21b3c012`,
  which contains no later core change: `bun run verify` passed five typetest
  files, 230 unit tests with one intentional skip, 14/14 packed consumers, 68
  architecture tests, lint, and formatting. `bun run verify:effect` passed
  both `4.0.0-beta.104` and `4.0.0-rc.108`; each endpoint passed the same 230
  unit tests, one skip, and 14/14 fresh packed consumers.
- Exact Plan 034 source SHA
  `3c70be6df80aa3aa5c700250dfbe6d118c0226d0` passed all twelve jobs in CI run
  `31866882172`: node-sea `94969289408`, Deno target support `94969289409`,
  bun-bundle `94969289430`, real-tools `94969289446`, Bun target support
  `94969289450`, Ubuntu publication `94969289452`, esbuild `94969289458`,
  quality `94969289465`, Effect rc.108 `94969289471`, Effect beta.104
  `94969289483`, Windows publication `94969289486`, and macOS publication
  `94969289506`. Both implementation commits are coherent and the cumulative
  worktree was clean before this receipt; no public API, package edge,
  candidate, registry, tag, or release state changed.
