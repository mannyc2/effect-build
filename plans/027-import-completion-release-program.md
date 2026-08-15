# Plan 027: Import and authorize the completion/release program

> **Executor contract**: start from clean commit
> `e8c1557509a9236df8e5eb236293527c3f4fd21d` on
> `codex/granular-integration-program`. Cherry-pick the exact plan-only commit
> named in the handoff task. Read this plan and
> `COMPLETION-RELEASE-ARCHITECTURE-AUDIT.md` fully. Do not change production
> source in this plan. Any drift outside `plans/**` is a STOP.

## Status

- Priority: P0
- Effort: S
- Risk: LOW
- Depends on: completed Plan 026
- Planned at: `e8c1557509a9236df8e5eb236293527c3f4fd21d`, 2026-08-14
- Completion: `DONE`

## Outcome

Make Plans 028-038 the canonical successor program without rewriting the
certified Plan 026 receipts. Restamp governance only enough to authorize the
correctness program and its explicit approval gates.

## Verified baseline

Plan 026 records implementation source
`2dda53151e877ab89708d0b0fbafa5f00d06ad58`, CI run `31855513747`, and
candidate run `31855652066`. The current branch head is the later plan/docs
receipt commit. The five source packages and their public APIs must remain
unchanged here.

## Scope

May modify only:

- `AGENTS.md`;
- `test/architecture/docs-contract.test.ts` (parent-approved generation-marker
  assertion update only);
- `plans/027-import-completion-release-program.md` receipt/status;
- `plans/README.md`.

Read-only: all other files. Out of scope: source, manifests, workflows, npm,
GitHub tags/releases, and the ts-release repository.

## Steps

1. Establish a clean exact baseline.

   ```sh
   test "$(git rev-parse HEAD^)" = "e8c1557509a9236df8e5eb236293527c3f4fd21d" || \
     test "$(git merge-base e8c1557509a9236df8e5eb236293527c3f4fd21d HEAD)" = \
       "e8c1557509a9236df8e5eb236293527c3f4fd21d"
   git diff --check
   git status --short
   ```

   Expected: only the imported plan commit differs from the baseline. STOP on
   production drift or untracked non-plan files.

2. Read `AGENTS.md`, the audit, Plans 028-038, and the Plan 026 receipt. Update
   `AGENTS.md` to one transitional generation such as
   `completion-release-program-v1` with these exact policies:

   - the certified five-package star and current public operations remain the
     baseline;
   - Plans 028-034 may perform their bounded internal fixes;
   - no generic public service is authorized before Plan 038's decision gate;
   - no external ts-release mutation without parent-task approval;
   - no npm ownership/trust mutation without parent-task approval;
   - no publish, tag, or GitHub Release without parent-task approval;
   - candidate bytes are packed once and publication may consume only those
     exact bytes;
   - no fallback/manual publish may replace a failed coordinated release.

3. Update the README status table to mark Plan 027 DONE and Plans 028-038 TODO.
   Do not edit historical plan receipts.

4. Run:

   ```sh
   test "$(bun --version)" = "1.3.14"
   bun run build
   bun run test:architecture
   git diff --check
   git diff --name-only
   ```

   Expected: architecture tests pass after the governance restamp and the diff
   contains only the three allowed files.

5. Commit only those files. Record the commit SHA and zero-diff status here.

## STOP conditions

- imported plan hashes do not match the handoff;
- Plan 026 receipt cannot be reproduced from Git/GitHub read-only evidence;
- governance would authorize publication or a generic service implicitly;
- any source change is required.

## Maintenance / compression ledger

This plan replaces an ambiguous collection of old 027-037 drafts with one
ordered program. It introduces no runtime representation.

## Receipt

- Plan-only import commit: `f1052a83f9da93851e9a8e3f5853e7dfa465ef4a`;
  its parent is exact baseline
  `e8c1557509a9236df8e5eb236293527c3f4fd21d`, and its tree matches supplied
  plan commit `747923943d34802ebb9b744c80fcdea7b1dfd69d`.
- Governance implementation commit:
  `56c9abba2be605ac47b904a027b7bc80e3a6bab5`.
- The parent approved the exact governance restamp and then explicitly widened
  this plan by one assertion after the first architecture run proved
  `test/architecture/docs-contract.test.ts` hard-coded the superseded marker.
  No surrounding positive or negative contract assertion changed.
- Exact package-manager gate used Bun `1.3.14` (`0d9b296a`). The frozen install
  reported 116 installs across 181 packages with no change.
- `bun run build` passed. `bun run test:architecture` passed 6 files and 41
  tests. `git diff --check` passed, and the implementation diff contained only
  `AGENTS.md`, this plan's scope correction, and the one-line architecture
  assertion.
- The worktree was clean immediately after the governance implementation
  commit. This receipt and the matching README status are plan-only evidence.
