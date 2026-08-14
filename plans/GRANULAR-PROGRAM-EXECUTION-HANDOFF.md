# Granular build program execution handoff

Prepared on 2026-08-14 as plan-only work. No source, configuration, test,
workflow, dependency, Git ref, or remote state was changed while producing this
handoff.

## Authoritative status

- The last formally completed implementation plan is **Plan 020**.
- Plan 021 is a preserved **BLOCKED/SUPERSEDED** four-package release-tool
  qualification record. Do not execute it.
- There is no Plan 022 artifact. Commit
  `60259f98a460b3d9b25b95221ca71b56c17d9d78` is the merged matrix-fixture
  change historically associated with PR 3; do not invent a missing plan.
- The executable successor program is exactly:

  ```text
  Plan 023 -> Plan 024 -> Plan 025 -> Plan 026
  ```

- Plans 023-025 change source in strict dependency order. Plan 026 changes
  only evidence/plan artifacts and does not publish.
- A future five-package release-activation plan is intentionally not authored
  yet. It needs Plan 026's actual candidate identities plus public evidence for
  five npm subjects and GitHub. Plan 021 cannot be relabeled to fill that role.

## Verified source and planning state

The source baseline for implementation is exact current-main commit:

```text
60259f98a460b3d9b25b95221ca71b56c17d9d78
```

The reconciled plan bundle currently lives in the source-untouched planning
worktree `/private/tmp/effect-build-public-toolkit`, whose older base is
`e09e0b7056833f5897600d69ff4fb097260a82ae`. That worktree is not an execution
baseline and its plan edits are intentionally uncommitted. The user's
`/Users/cjpher/.codex/worktrees/9a31/does-effect` checkout is also not an
execution baseline: it is on the older `codex/effect-build-v0.2.0` line and has
unrelated dirty plan work.

Create a fresh worktree/branch from exact `origin/main` and import only this
plan bundle before executing. Do not copy source from either planning checkout.
If `origin/main` no longer resolves to the SHA above, STOP and restamp every
live excerpt and command before source work.

The plan-only files to import are exactly:

```text
plans/021-adopt-certified-ts-release-0-2.md
plans/023-establish-core-artifact-lifecycle.md
plans/024-split-esbuild-node-sea-integrations.md
plans/025-add-bun-javascript-bundling.md
plans/026-certify-five-package-public-cut.md
plans/CORE-INTEGRATION-ARCHITECTURE-AUDIT.md
plans/GRANULAR-PROGRAM-EXECUTION-HANDOFF.md
plans/README.md
```

Commit that imported plan-only snapshot before Plan 023 Step 0. Do not absorb
other dirty plans, source, or generated files into it. After import, run:

```sh
test "$(git rev-parse origin/main)" = "60259f98a460b3d9b25b95221ca71b56c17d9d78"
git merge-base --is-ancestor 60259f98a460b3d9b25b95221ca71b56c17d9d78 HEAD
git diff --check
git status --short
shasum -a 256 \
  plans/021-adopt-certified-ts-release-0-2.md \
  plans/023-establish-core-artifact-lifecycle.md \
  plans/024-split-esbuild-node-sea-integrations.md \
  plans/025-add-bun-javascript-bundling.md \
  plans/026-certify-five-package-public-cut.md \
  plans/CORE-INTEGRATION-ARCHITECTURE-AUDIT.md \
  plans/README.md
```

Expected plan hashes are frozen below. This handoff file is excluded to avoid a
self-referential checksum.

```text
90fdd10b61b6e29912e2f9129a4907e10bf77b8bf43490837343163f9c22ab72  plans/021-adopt-certified-ts-release-0-2.md
74151e0adf9b91fc64e6a4d08c7c72ddc8f9b1c81b08a72d8e5b82714261e130  plans/023-establish-core-artifact-lifecycle.md
1017ac327f2b9292f5451e158f0560ab502cd8382ec85a6464c4800c627e4533  plans/024-split-esbuild-node-sea-integrations.md
b840b562874dab604893bb9e7f3760794caf75b431712a882de7815265dc5d97  plans/025-add-bun-javascript-bundling.md
dde9365b9adee2eb4677d72e7f060b80b25375f888f5072172f79e1ad98330b1  plans/026-certify-five-package-public-cut.md
e33d1bded9b5a195b4fef579693621c6359f15059f8b4a4432f480d8c55e8541  plans/CORE-INTEGRATION-ARCHITECTURE-AUDIT.md
c20494c4b0b377e7166fd65e1967a51d43e191308e52b686a1280cb22228e61c  plans/README.md
```

## Decisions already made

Do not reopen these during implementation unless live source contradicts the
named evidence:

1. Core owns only the durable File/Executable facts, `SystemTarget`, the one
   currently consumed `ResolutionTarget = "node"`, ordered stage/tool
   observations, the nominal scoped JavaScript-bundle capability, and narrow
   integration-author lifecycle functions.
2. There is no neutral `SyntaxMode` or `SyntaxTarget` in this program.
   Esbuild's exact `node26.7` target and Bun 1.3.9's producer-default behavior
   remain integration facts because Node SEA makes the same acceptance
   decision for every producer.
3. Core exports one `JavaScriptBundle.InvalidReason` Schema/type. Esbuild and
   Bun compose it with their private integration-specific reason Schemas; they
   do not copy the core literals.
4. Node SEA authenticates the live main, copies it with Effect
   `FileSystem.copyFile` into operation-private scoped staging, hashes that
   copy against the Artifact digest, and makes both `node --check` and
   `--build-sea` consume the copy.
5. Bun's metafile supplies only observed `external: true` edges, not a complete
   import graph. Entrypoint comparison is lexical; mixed canonical paths and
   `bun:wrap` pseudo-records are pinned characterization cases.
6. Bun 1.3.9 has a documented `import.meta.main` semantic divergence from
   native Node/Esbuild. Differential ordinary-bundle tests and idiom-heavy SEA
   smokes must preserve the evidence; do not source-scan, rewrite output, or
   call the producers interchangeable.
7. Use Effect as the composition/resource substrate: `Context.Service`,
   Layers capturing platform services, `Effect.fn` at reusable boundaries,
   `Effect.gen` for real sequences, `acquireUseRelease`/Scope for operation
   lifetime, `SynchronizedRef` for the one atomic claim state, and `Result` for
   synchronous validation. Installed beta.104/rc.108 source wins over stale
   skill spellings.
8. Source maps and Node SEA snapshot/code-cache modes remain deferred
   integration features. Watch, plugins, generic build/planning/executor
   services, manifests/receipts, stores/caches/CAS, remote/container execution,
   downloads, and deployment remain out of scope.

## Execution protocol

### Checkpoint 0: governance only

Plan 023 Step 0 is deliberately a separate task boundary. After the maintainer
explicitly requests execution of this selected program:

1. change only `AGENTS.md` to the exact
   `granular-integration-migration-v2` rules frozen in Plan 023;
2. verify and commit only that file;
3. end the task;
4. start a fresh task/context so the new repository instructions are loaded.

Do not combine this checkpoint with source changes.

### Plan 023: behavior-preserving foundation

Goal: compress current lifecycle/representations without adding a build
feature. Preserve Bun/Deno and the temporary combined Node SEA behavior.

Required handoff: one clean implementation SHA, exact CI/real-tool receipts,
and only Plan 023 plus README receipt edits left for Plan 024.

### Plan 024: granular Esbuild and Node SEA cut

Goal: atomically create `effect-build-esbuild`, expose the scoped Esbuild
continuation, replace Node SEA's opaque facade with bundle-to-executable
assembly, remove integration literals from core, and stabilize the private
main copy before Node reads it.

No package/tag/release may exist for the intermediate cut. Required handoff:
one clean implementation SHA, exact independent package/consumer evidence, and
only Plan 024 plus README receipt edits left for Plan 025.

### Plan 025: second producer pressure test

Goal: add `Bun.withJavaScriptBundle` to the existing selected-command service,
characterize Bun's real CLI/metafile/semantic behavior, and prove Bun and
Esbuild independently satisfy the same neutral scoped artifact contract.

This plan restamps final `granular-integration-v2` governance only after the
second producer evidence is green. Required handoff: one clean implementation
SHA and only Plan 025 plus README receipt edits left for Plan 026.

### Plan 026: exact-source certification, no publication

Goal: verify exact-source CI, real-tool lanes, five once-packed tarballs,
fourteen isolated/composed consumers, package independence, and the promotion
decision. It may write only the named evidence/plan artifacts and must not
publish, tag, create a release, or mutate trusted-publisher configuration.

The terminal state is: Plans 023-026 `DONE`, candidate certified, release still
blocked pending a newly authored five-package activation plan and external
authority/evidence.

## Tool and evidence prerequisites

- Package-manager Bun must be exact repository pin `1.3.14` before the first
  install/build command.
- Compiler Bun remains exact `1.3.9`; Deno/denort pins remain unchanged.
- Node SEA evidence uses exact Node `26.7.0` on Linux x64 GNU while ambient
  orchestration remains Node `24.14.1` where the plans specify it.
- Applications provide one official Effect platform Layer. Package source may
  not import `node:*`, invoke raw process APIs, or call `Effect.runPromise`.
- Host-specific evidence may be assigned only to the exact named mandatory CI
  jobs. Never replace it with a skip or a different SHA.
- Every receipt names the implementation SHA actually tested. A failed
  post-commit gate requires a new implementation commit and a complete rerun;
  never relabel dirty bytes with the prior SHA.

## New-task launch prompt

Use this after the plan bundle has been imported into a clean branch from the
exact baseline:

> Execute the active effect-build program in strict order: Plans 023, 024,
> 025, and 026. Plan 020 is the last completed plan; Plan 021 is historical and
> superseded; there is no Plan 022 artifact. Start by reading AGENTS.md and all
> four plans. Honor Plan 023's governance-only Step 0 as a separate task and
> fresh-context checkpoint. Preserve dirty work, use the exact pinned tools,
> use Bun commands, keep Effect beta packages aligned, and follow the
> Effect-native resource/Layer/Result contracts in the plans. Do not publish or
> tag. Do not improvise past a STOP condition. Persist through each plan's full
> deterministic, Effect-range, real-tool, packed-consumer, exact-SHA CI, and
> receipt gates, then hand off the exact implementation SHA to the next plan.
> The goal is Plans 023-026 DONE with a certified five-package candidate and a
> truthful still-blocked release boundary.

## Handoff STOP conditions

Stop before implementation if the plan hashes do not match, current main moved,
the execution worktree is dirty, the package-manager Bun pin is unavailable,
or the transitional governance commit has not been loaded in a fresh context.
During execution, each plan's narrower STOP conditions are authoritative. A
terminal instruction to finish the program does not authorize publication,
fallbacks, automatic downloads, source changes outside the named scope, or
inventing missing evidence.
