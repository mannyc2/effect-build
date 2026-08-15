# Plan 033: Add dependency automation and reduce non-release CI duplication

## Status

- Priority: P1
- Effort: M
- Risk: MEDIUM
- Depends on: 032
- Planned at: `e8c1557509a9236df8e5eb236293527c3f4fd21d`

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
