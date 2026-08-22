# Research-branch landing and minimum-version plan

Status: ACTIVE
Audited: 2026-08-22 against origin at main `60259f9`.
Gate C decided 2026-08-22 by the maintainer: **Option 1, full frozen scope.**
The minimum version is the Plan 044 certified v0.4.0 candidate, reached by
executing Plans 040-043 exactly as frozen; `SURFACE.json` and
`MIGRATION.json` are not amended.

## 1. What actually exists

Eleven open remote branches and seven open draft PRs look like parallel
sprawl, but the ancestry graph is one linear research stack with exactly two
live tips. Every other branch is a frozen prefix of that stack.

```text
main (60259f9, stale since Plan 022)
  └─ codex/granular-integration-program        +30   contains the v0.3.0 tag (f06f96c)
       └─ claude/research-corpus-reconciliation-63pjhg   +102  immutable base c4cefd0
            ├─ research/r2-bun-native-breadth            tip, folded forward
            ├─ research/r2-deno-native-breadth           tip, folded forward
            ├─ research/r2-esbuild-native-breadth        tip, folded forward
            ├─ research/r2-node-sea-native-breadth       tip, folded forward
            ├─ research/r2-rolldown-native-breadth       tip, folded forward
            ├─ research/r1-r2-shadow-synthesis           tip, folded forward
            └─ research/interface-mechanisms-study-baseline  +144  contains ALL of the above
                 ├─ research/interface-mechanisms-beyond-cli-host-api  +1  (PR #10) LIVE TIP
                 └─ codex/post-0.3-native-capability-architecture      +2  (PR #4)  LIVE TIP
                      = Plan 039 DONE, export-inert, CI-certified at e12e930
```

Facts that shape the plan:

- `main` does not contain the v0.3.0 release. The tag points into
  `codex/granular-integration-program`, which is 30 commits ahead of `main`
  and 0 behind. The default branch is 146 commits behind the live head.
- None of the seven open PRs (#4-#10) targets `main`. Each targets another
  research branch, so merging all of them still never advances `main`.
- The content of PRs #5-#9 is already an ancestor of both live tips (the
  study baseline folded every r2 dossier and the shadow synthesis forward).
  Those PRs are records, not pending work.
- A written finish plan already exists on the post-0.3 branch: Plans 039-044
  with `research/post-0.3/freeze/SURFACE.json` and `MIGRATION.json` as frozen
  authority. Plan 039 is DONE (certified, released 0.3 export map
  byte-identical). Plans 040-043 stage the esbuild, Bun, Deno, and Node
  program provider lanes; Plan 044 is the single hard cut certifying an
  unpublished five-package v0.4.0 candidate.

## 2. The actual planning gaps

1. **No landing step.** Every plan in the 039-044 program states
   "Publication authority: NONE" and forbids merge/tag/release, but nothing
   anywhere defines when or how work lands on `main`. Even v0.3.0 shipped
   from a side branch. The stack keeps growing because landing is never
   authorized.
2. **No branch/PR retirement rule.** Finished research branches stay open as
   draft PRs against other research branches, so the open-branch count only
   ever increases.
3. **No minimum-version definition.** Plan 044's v0.4.0 candidate is the
   only defined finish line, and it is gated on four more XL plans
   (040-043). There is no sanctioned smaller cut.

## 3. Proposed program

### Gate A — bring `main` current (no new code)

1. Open a PR from `codex/granular-integration-program` to `main` and merge
   it. `main` then contains the actual v0.3.0 release history. Zero risk:
   the branch is 0 behind `main`.
2. Open a PR from `codex/post-0.3-native-capability-architecture` to `main`
   and merge it after ordinary CI. This is research corpus + Plan 039
   internals only; the released export map is byte-identical (certified at
   `e12e930`, runs `32514192080` / `32514192057`). Landing it does not
   publish anything and does not violate the plans' no-release rule.
3. Decide PR #10 (the interface-mechanisms study, one commit): either fold
   it onto `main` the same way after step 2, or close it if the study should
   stay a branch-only record. Recommendation: fold it — it is 26 files under
   `research/post-0.3/` and conflicts with nothing.

After Gate A, `main` is the single line of history again.

### Gate B — retire the record branches

1. Close PRs #5, #6, #7, #8 with a comment noting their heads are ancestors
   of `main` (post Gate A). Close #9 per its own "do not merge" charter.
   Close or retarget #4 once its head is merged.
2. For immutability, tag the frozen coordinates that the corpus cites by SHA
   (`c4cefd0` base, each r2 head, `a301765` study baseline) as
   `research-marker/<name>`, then delete the eight `research/*` and
   `claude/*` branches plus `codex/granular-integration-program`. The SHAs
   remain reachable via tags; the branch list drops to `main` plus whatever
   is actively being implemented.

### Gate C — define the minimum version (one maintainer decision)

Pick one, record it here, and stop revisiting it:

- **Option 1 — minimum = frozen v0.4.0 (default).** Execute Plans 040-044
  as written. This is the already-frozen scope; no amendment needed.
- **Option 2 — reduced first cut.** Amend `MIGRATION.json` once to defer the
  Bun/Deno API lanes (Plans 041-042) and cut v0.4.0 from core + esbuild lane
  + Node program profile (040, 043, 044). Smaller, but requires reopening
  the freeze, which the corpus was designed to prevent. Choose this only if
  040-043 at full scope is not affordable.

Recommendation: Option 1. The freeze is the expensive artifact already paid
for; amending it costs more certainty than it saves work.

### Gate D — execution cadence (stop the stacking)

For each remaining plan (040, 041, 042, 043, 044): one branch off current
`main`, one PR to `main`, merge on green + plan receipt, delete the branch.
No plan branch may be based on another open plan branch. This single rule is
what prevents the current situation from recurring.

### Gate E — release decision

Plan 044 deliberately ends at an unpublished certified candidate. Add the
explicit final step now so "finished" is defined: after Plan 044, a
maintainer decision either publishes the certified 0.4.0 bytes via the
existing ts-release protocol (as done for 0.3.0) and tags `v0.4.0` on
`main`, or records deferral with a reason. Either outcome closes the
program.

## 4. Execution log (2026-08-22)

Gates A and B were executed the same day the maintainer approved the plan.

- **Gate A step 1 — DONE.** PR #11 merged `codex/granular-integration-program`
  (`15c811b`, the v0.3.0 history) into `main` at `e1b4405`.
- **Gate A step 2 — DONE.** PR #4 was retargeted from its research base to
  `main` and merged at `7b33d3e`. `main` now carries the research corpus, the
  0.4 freeze authority, and the certified Plan 039 head `e12e930`.
- **Gate A step 3 — REVISED.** Folding PR #10 onto `main` (merge `9961f72`)
  was wrong and was reverted by PR #15 (`1dba833`). The Plan 039
  certification boundary (`research/post-0.3/implementation/profile.json`
  `implementationAllowedPaths`) admits only Plan 039 implementation paths
  after handoff `7de4ffe`; the study's 26 files are outside it and turned
  `test:architecture` and the plan-039 certifier red. Corrected disposition:
  the study stays on `research/interface-mechanisms-beyond-cli-host-api`
  until a later plan (040+ or 044) widens or retires the path boundary. The
  same constraint applies to this document, which is why it lives on
  `claude/research-branches-planning-9lsjvr` rather than `main`.
- **Gate B step 1 — DONE.** PRs #5, #6, #7, #8, #9 closed with pointers to
  their absorbed heads; every cited SHA (`c4cefd0`, the five r2 heads,
  `aa8f958`, `a301765`) is verified reachable from `main`.
- **Gate B step 2 — BLOCKED (cosmetic only).** This session's push
  credentials cannot create tags or delete remote branches. Since all heads
  are reachable from `main`, deletion loses nothing; the maintainer can
  delete the absorbed branches from the GitHub UI at leisure. Keep
  `research/interface-mechanisms-beyond-cli-host-api` until its study lands.
- **Gate C — DECIDED.** Option 1, full frozen scope (recorded above).
- **Plan 040 — DONE.** PR #16 merged the export-inert Esbuild lane to `main`
  at `3ced06d`; exact-head run `32585389513` produced the authenticated Plan
  040 implementation certificate.
- **Plan 041 — DONE.** The export-inert Bun selected-command executable lane
  is staged with its exact-head implementation certificate; the released 0.3
  export map remains unchanged.
- **Plan 042 — DONE.** The export-inert Deno selected-command executable lane
  is staged with the Plan 041 artifact as an authenticated predecessor; the
  released 0.3 export map remains unchanged.
- **Next action:** execute Plan 043 (`plans/043-publish-single-node-program-profile.md`)
  on one branch off `main` under the Gate D cadence.

## 5. Summary of the finish line

Minimum version = the Plan 044 certified v0.4.0 candidate, reached by five
merges to `main` (Gates A, then 040-044 under Gate D), with the branch count
reduced from eleven to one plus the active plan branch. Everything else open
today is already-absorbed history and closes without loss.
