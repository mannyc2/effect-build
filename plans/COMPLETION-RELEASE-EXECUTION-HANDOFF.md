# Completion/release execution handoff

## Mission

Execute Plans 027-038 from the certified five-package baseline. Close every
named repository correctness issue, qualify one exact multi-package release
coordinator, explicitly establish npm ownership/trust, publish only newly
recertified exact bytes, and then evaluate—not presume—the generic service API.

## Starting authority

- Repository: `https://github.com/mannyc2/effect-build.git`
- Branch lineage: `codex/granular-integration-program`
- Required baseline: `e8c1557509a9236df8e5eb236293527c3f4fd21d`
- Last completed plan: 026
- Certified implementation source:
  `2dda53151e877ab89708d0b0fbafa5f00d06ad58`
- Exact CI/candidate evidence: `31855513747` / `31855652066`
- Package manager: Bun 1.3.14; keep the Effect beta/RC family aligned
- Planning source: the plan-only commit named in the task prompt

At entry, verify the branch/worktree is clean before cherry-picking the
plan-only commit. Never absorb unrelated worktree changes into this program.

## Execution graph

```text
027 governance/import
 ├─ 028 tool + host authority ─┐
 ├─ 029 Bun interruption ─────┤
 ├─ 030 scalar preflight ─────┼─> 032 workflow/consumer hardening ─┬─> 033 CI/deps
 └─ 031 native parser ────────┘                                    ├─> 035 ts-release
           └─> 034 inspection IO                                  │      └─> 036 npm trust
                                                                  └────────────┬─> 037 release
                                                                                └─> 038 generic API gate
```

Plans 028-031 may use separate commits and can be implemented independently,
but run the complete verification suite after merging them before Plan 032.
Plan 034 may proceed while external approval for Plan 035 is pending. No plan
may treat unavailable approval as evidence of a blocker if independent local
work remains.

## Approval routing

Message the parent task and wait for an explicit answer before:

1. creating a branch or editing `mannyc2/ts-release` (Plan 035);
2. logging into npm for mutation, publishing reservation versions, changing
   maintainers, or configuring trusted publishers (Plan 036);
3. dispatching any npm publish/tag/GitHub Release job (Plan 037);
4. restamping governance or exporting `JavaScriptBundler`,
   `ExecutableBuilder`, `ExecutableAssembler`, or another generic public
   service (Plan 038).

Each request must include exact source SHA, intended mutation, scope, evidence,
recovery boundary, and what work will continue while approval is pending. Do
not transmit secrets, OTPs, cookies, or `.env` contents.

## Verification discipline

For every source plan:

1. add the focused red test first;
2. implement only the plan's files/symbols;
3. run its focused gates;
4. run `bun run verify` and `bun run verify:effect`;
5. record exact commands/outcomes in the plan before marking DONE;
6. commit a coherent plan slice and require a clean worktree.

Real compiler/target/SEA evidence is Linux-specific and must come from exact-SHA
push CI when unavailable locally. Never replace an unavailable real gate with a
fake. Keep current twelve evidence axes until a plan explicitly retains their
capability under a smaller workflow.

After Plans 028-034, restart certification from source. The Plan 026 candidate
is historical evidence only; source changes make its tarballs ineligible for
publication.

## Release invariant

```text
validated exact source
  -> five tarballs packed once
  -> locked isolated/composed consumers
  -> manifest and artifact identity
  -> prepublish read-only observation
  -> ordered npm subjects
  -> GitHub subject last
```

There is no atomic npm transaction. Safety is immutable version coordinates,
hash identity, prerequisite ordering, observation before mutation, and recovery
from equivalent/partial/unknown state. A conflict stops. A response loss is
observed, not blindly retried. Manual publication is not a fallback.

## Architectural boundary

The current granular lifecycle is real and stays public:

- Bun/Deno compile source directly to executables;
- Bun/Esbuild provide scoped JavaScript bundle continuations;
- Node SEA consumes a live bundle and creates a durable executable;
- core owns artifact/liveness/validation/publication semantics;
- application Effect code composes integrations through Layers and Scope.

Plan 038 asks whether two bundle producers have now earned a generic
`JavaScriptBundler` service. It must not retroactively make release depend on
that answer. A single `ExecutableBuilder` method over source-or-bundle is
invalid; test a parameterized protocol family and the more precise
`ExecutableAssembler<JavaScriptBundle>` role.

## Hard exclusions

- no generic build DAG, SemanticPlan, executor registry, CAS/cache protocol,
  remote/container backend, transport, automatic download, plugin system,
  watch mode, package build pipeline, deployment layer, or raw argv escape;
- no integration-to-integration dependency;
- no source mutation in the planning task;
- no repacking certified bytes;
- no npm/GitHub mutation without approval;
- no Fable substitution or external code transmission.

## Completion

The task is complete only when each plan is DONE or has an evidence-backed
maintainer decision saying why it remains NOT EARNED. If Plan 037 publishes,
the final report must link the exact source, CI run, candidate artifact,
registry versions/integrities, tag/release, and fresh public consumers. If Plan
038 does not promote a service, that is a successful architectural result when
the rent test is documented.
