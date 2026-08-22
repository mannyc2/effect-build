# effect-build provider-native breadth research

Observation: **2026-08-17T21:04:37Z**. Live head: **`96e53a27be4ef96fb47f1a745480e0c5382640f2`**. This package is read-only architecture research. It does not implement code, freeze exports, select version ranges, or certify a release.

## Executive finding

[PROP-001 · PROPOSAL] Broadest coherent surface is operation-specific native functions plus real scoped handles and private plumbing adapters. The broadest coherent product is not a universal build algebra and not a mirrored provider-wide `Api`/`Command` taxonomy. It is a provider-native set of operation-specific Effect functions and modules that preserve native request/result types, project and plugin authority, output ownership, lifecycle, target/runtime distinctions, and diagnostics. A Context service is earned only when construction acquires reusable selected state; a scoped handle is earned only when a provider owns a lifetime.

[FAL-001 · FALSIFIED] A generalized build algebra is not lossless across all providers. [FAL-002 · FALSIFIED] Complete mirrored Api/Command namespaces fail operation-level symmetry. Operation-level lanes can still be real: Bun and Deno host bundling differ from selected-command process authority, while esbuild's decisive state split is one-shot build versus `BuildContext`, and Node SEA is an assembly/mutation pipeline rather than a symmetric host/command builder.

## Portable opportunities

[PROP-002 · PROPOSAL] Narrow direct-main NodeMainProgram is plausible. Its honest canonical representation is a direct-main program with native metadata; it must exclude importable-module semantics. [PROP-003 · PROPOSAL] Narrow BrowserModuleGraphApplication is plausible but lower-confidence. It must exclude arbitrary top-level linked assets and remains gated by Deno's experimental status and permission model. A runtime-neutral executable and generic typed CLI watch stream are withdrawn.

## Possible 0.4 subset, separately reasoned

[PROP-004 · PROPOSAL] Possible 0.4 subset: native one-shots and esbuild context; defer generic roles/watch protocol. This is a product proposal, not an export map: retain existing public behavior; add operation-specific one-shot native functions where they remove real wrapper duplication; add an esbuild scoped context; expose selected-command operations only where binary/project/process authority is material; keep staging, publication, process, and diagnostic adapters package-private; defer cross-provider roles until adversarial matrices pass.

## Live-state caveats

[GITHUB-001 · GITHUB-DIRECT] Live PR and branch head are 96e53a27be4ef96fb47f1a745480e0c5382640f2. [GITHUB-002 · GITHUB-DIRECT] PR body claims af4887c36753a82c3c97fafc54b3c368cd98b34d as final head, conflicting with live ref. [GITHUB-003 · GITHUB-DIRECT] Both live-head workflows concluded failure and retained zero artifacts. The current manifests still expose only the 0.3 roots, so future lanes and profiles are proposals, not implementation. The required synthesis archive was unavailable and was excluded without inference.

## Contents

- `provider-operation-inventory.csv` and `.md`: 54 operations/capabilities with exact source coordinates and evidence states.
- Four provider dossiers and the Effect capability map.
- Boundary, loss, role, naming, candidate, and falsifier analyses.
- Exact runtime probe specifications for every unresolved behavior.
- Machine-readable live state and evidence ledger.

## Instruction conflict record

The reviewed root `AGENTS.md` has Git blob `8323e8cb3f795fea8d71f460412c43f21997ac11` and SHA-256 `2804cce7b22dcba052f83a72004e9bddc312baeb798f48b8fe8278389bcce34e`. It directs a narrow five-package architecture and forbids generic public services pending evidence/approval. Those are repository instructions, not proof that their preferred architecture is semantically correct. No nested conflicting `AGENTS.md` was found in the bounded reviewed tree.

### Verbatim material excerpts

> “No generic public service or target family is authorized before Plan 038 produces evidence and receives explicit parent approval.”

> “`effect-build/Integration.executeCommand` is the one bounded/scoped integration-author command function.”

> “Interruption closes Scope and terminates active children. Do not translate interruption into a build error. Atomic rename remains the publication point of no return.”

These quotes are recorded as repository instructions, not as architectural evidence.
