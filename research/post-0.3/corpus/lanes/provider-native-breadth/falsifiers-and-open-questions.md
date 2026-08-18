# Falsifiers and open questions

## Falsified candidates

- [FAL-001 · FALSIFIED] A generalized build algebra cannot preserve the complete native product surface without raw provider cases and escape hatches.
- [FAL-002 · FALSIFIED] Complete mirrored `Api`/`Command` namespaces do not survive operation-level symmetry testing.
- [REC-004 · FALSIFIED] Runtime-neutral executable.
- [REC-005 · FALSIFIED] Broad static-web role.
- [REC-006 · FALSIFIED] Generic typed CLI watch events for the exact Bun/Deno fixtures.
- [REC-010 · FALSIFIED] Rolled-up declaration output in the exact Deno fixture.

## Open source questions (`UNKNOWN`)

1. Does Bun document or expose a supported host cancellation mechanism for `Bun.build`, and what are direct-write cleanup guarantees?
2. What stable permission/ambient-authority commitment, if any, applies to experimental `Deno.bundle` after the no-grant receipt contradiction?
3. Which Deno bundle modes and declarations will remain, change or be removed before stabilization?
4. What exact ownership/lifetime guarantee applies to retained esbuild output bytes after context disposal, and what races are promised for cancel/dispose?
5. What complete Node SEA builder/base version relation is supported across direct generation, legacy injection, OS and architecture?
6. Which signing, verification and notarization steps belong in effect-build versus the consuming release system?
7. Are there any additional historical/nested `AGENTS.md` files outside the bounded reviewed tree that conflict with root rules?
8. The required synthesis ZIP was unavailable; whether it contains material evidence is unknown.

## Role falsifiers

`NodeMainProgram` is withdrawn if a consumer inside its direct-main domain must branch by provider for module format, external resolution, runtime behavior, output identity or lifecycle. `BrowserModuleGraphApplication` is withdrawn if either provider drops a promised module-owned edge, cannot expose a closed output graph, or needs incompatible ambient authority hidden by the role.

## Maintainer-only decisions

The maintainer decides public names and export layout; whether existing `Compiler` services remain/deprecate; exact support/version policy; whether experimental Deno surface carries acceptable compatibility rent; whether either portable role is valuable enough to certify; the 0.4 subset and release priority; signing/trust scope; and when implementation, execution and certification gates are satisfied. Source research cannot decide these product/governance questions.
