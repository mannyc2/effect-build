# Plan 033: Add dependency automation and reduce non-release CI duplication

## Status

- Priority: P1
- Effort: M
- Risk: MEDIUM
- Depends on: 032
- Planned at: `e8c1557509a9236df8e5eb236293527c3f4fd21d`
- Completion: `DONE`

## Outcome

Automate bounded dependency visibility for the Bun workspace and make ordinary
CI faster without weakening release evidence. Release/candidate jobs remain
cold, exact, and uncached.

## Scope

- `.github/dependabot.yml` (new if absent)
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml` only for assertions that it remains uncached
- `package.json`
- `test/architecture/generated-and-ci.test.ts`
- `test/architecture/workspace-topology.test.ts`
- docs, this plan, `plans/README.md`

## Steps

1. Add Dependabot for `package-ecosystem: bun`, repository root, weekly cadence,
   and a conservative open-PR limit. Group only compatible dev tooling; keep
   Effect/platform endpoint pins aligned as one group and raw esbuild exact.
   Assert the configuration references current `bun.lock`, not a phantom
   npm/pnpm lock.

2. Add a non-mutating audit command that reports direct and transitive
   vulnerabilities and exits nonzero at the selected severity. Pin the command
   version/tool behavior. Document that an audit is registry intelligence, not
   a proof of safety. Do not run an automatic fix.

3. Cache dependency downloads only in ordinary `.github/workflows/ci.yml` jobs
   where it materially pays. Cache keys include runner, Bun version, Node
   version, and `bun.lock` hash. Never cache built `dist`, candidate tarballs,
   real compiler assets, or Node SEA producer. Keep `package-manager-cache:
   false` and no dependency cache in `release.yml` and future publish jobs.

4. Remove duplicated full `bun run verify` from specialized jobs when `quality`
   already gates them via `needs`, but retain each lane's focused build/test and
   independent setup. Keep the twelve named support/evidence axes. Decide the
   orphan `test:host:extra` script: either add a documented nonrequired CI lane
   with explicit tool availability or remove the script/docs; no dead command.

5. Add an architecture assertion that every new unit/architecture test file is
   registered by the explicit package script, closing the current omission
   hazard.

6. Verify:

   ```sh
   bun install --frozen-lockfile
   bun run build
   bun run test:architecture
   bun run verify
   bun run verify:effect
   git diff --check
   ```

   Required exact-SHA CI must remain twelve successful jobs; compare wall time
   without claiming improvement unless observed.

## STOP conditions

- official GitHub tooling no longer supports the repository's Bun lock format;
- caching touches candidate/publish bytes or compiler tool assets;
- a specialized real-tool/support lane is removed;
- dependency updates can split the Effect beta package family.

## Maintenance / compression ledger

Adds one automation config and one audit gate; removes repeated quality work
from specialized CI while preserving capability evidence.

## Receipt

- **Implementation baseline SHA**:
  `3c70be6df80aa3aa5c700250dfbe6d118c0226d0`, the coherent Plan 034 source
  commit. The source slice stayed within the named files except for one bounded
  lock-authority reconciliation: `bun.lock` was added only after this plan's
  new audit gate found a critical vulnerability in an exact root dependency.
- Tests were written first. The initial focused run rejected absent Dependabot,
  audit, cache, release-cold, Node SEA dependency, and recursive test-
  registration contracts. Review corrected the red design before source work:
  only Node SEA may depend on `quality`; Bun groups use explicit patterns rather
  than unsupported `dependency-type`; `@effect/platform-*` includes the shared
  platform endpoint; esbuild is neither grouped nor ignored; and the complete
  set of cache-bearing jobs is frozen.
- `.github/dependabot.yml` now targets the Bun ecosystem at `/` weekly, limits
  open version-update pull requests to three, keeps Effect plus every platform
  endpoint in one minor/patch group, and groups only the explicitly listed
  compatible development tools. Existing architecture evidence proves
  `bun.lock` is the sole root lock. Exact esbuild remains a separate raw pin.
- `audit:dependencies` is exactly `bun audit --audit-level=high` under pinned
  Bun 1.3.14. Its first real advisory query found critical
  [`GHSA-5xrq-8626-4rwp`](https://github.com/advisories/GHSA-5xrq-8626-4rwp)
  in `vitest@3.2.4`; the official patched 3.x version is `3.2.6`. No automatic
  or broad update ran. Only the exact Vitest pin and its
  corresponding Bun lock package records/integrities changed. The post-fix
  command exited zero with `No vulnerabilities found`; JSR packages outside
  npm's registry intelligence were explicitly reported as skipped, so the
  audit is not described as proof of safety.
- Ordinary CI caches only Bun downloads for exactly `quality`, `esbuild`,
  `node-sea`, `bun-bundle`, `real-tools`, `target-support`, and
  `publication-hosts`. Pinned `actions/cache` v6.1.0 resolves to
  `55cc8345863c7cc4c66a329aec7e433d2d1c52a9`; the exact runner-temporary path
  and key bind runner OS/architecture, Bun 1.3.14, Node 24.14.1, and
  `bun.lock`. No restore prefix exists and the cache environment is present
  only on the frozen install step. `release.yml` is byte-identical and its
  setup-node steps retain `package-manager-cache: false`; candidate/publish
  bytes, `dist`, compiler assets, and the SEA producer remain uncached.
- Node SEA alone now has `needs: quality` and replaces its duplicate full
  verification with `bun run build` plus its focused real integration. All
  twelve evidence axes and their independent setup remain. The orphan
  `test:host:extra` command was removed. A recursive topology assertion now
  requires the explicit unit and architecture scripts to enumerate every test
  file exactly.
- Exact Bun 1.3.14 (`0d9b296a`) accepted the updated frozen lock with no
  changes. Focused architecture verification passed 49/49 tests. `bun run
  verify` passed five typetest files, 230 unit tests with one intentional skip,
  14/14 packed consumers, 68 architecture tests, lint, and formatting. `bun
  run verify:effect` passed both `4.0.0-beta.104` and `4.0.0-rc.108`; each
  endpoint passed the same 230 unit tests, one skip, and 14/14 fresh packed
  consumers. Build, type, audit, formatting, frozen-install, and diff gates all
  passed.
- The coherent seven-file source commit is
  `a034e3bafcbed5ab7639fa28ed40840e21b3c012`. Exact-SHA CI run
  `31867293489` passed all twelve jobs: Bun target support `94970281863`,
  Effect beta.104 `94970281876`, Windows publication `94970281877`, Effect
  rc.108 `94970281887`, quality `94970281893`, Ubuntu publication
  `94970281896`, bun-bundle `94970281906`, esbuild `94970281920`, macOS
  publication `94970281931`, Deno target support `94970281976`, real-tools
  `94970282017`, and node-sea `94970464099`.
- Timing is recorded without an improvement claim. Against predecessor run
  `31866882172`, Node SEA active time fell from 131 seconds to 37 seconds
  because duplicated verification disappeared, but first-run end-to-end
  workflow time rose from 135 seconds to 154 seconds because Node SEA now
  correctly waits for `quality` and the audit/cache steps are new. The earned
  result is less duplicated CI work and a stronger gate, not a demonstrated
  shorter critical path.
- The worktree was clean before this receipt. No Effect endpoint split, public
  package/API change, candidate repack, release-cache change, npm mutation,
  tag, or GitHub Release occurred.
