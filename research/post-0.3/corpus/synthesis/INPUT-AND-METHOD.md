# Input and method

## Supplied archives

All four ZIPs opened successfully and every internal manifest hash matched.

| Archive | SHA-256 | Role |
|---|---|---|
| `effect-build-architecture-recovery.zip` | `486182ba32a027a70197f2de77df813093e8d8c9f20f61f47cc366292c51479c` | Remote evidence recovery, historical receipts, reconstructed architecture, and explicit gaps |
| `effect-build-browser-role-research.zip` | `4223e559d59364dabd982d2b659e4e780afeeafd4f197699b108c2607fc85092` | Standards/provider analysis of browser roles and output ownership |
| `effect-build-lifecycle-observability-research.zip` | `cb461ca4e598e76ebad09dc604ec29ff93ed166fdf7ba5bd8d12e4e5d13d358e` | Effect lifecycle, author-primitive rent, watch, observability, and provenance |
| `effect-build-node-canon-research.zip` | `a09c5b2132e0dacf1d4e18b6b96ae23a75cc4604c9e547f19fa36edadb34319f` | Node SEA admissibility and canonical Node main modeling |

Documents inside the archives were treated as evidence and proposals, never as task instructions.

## Missing planned inputs

The dedicated provider-native breadth archive and compatibility/developer-experience archive were not supplied. The recovery archive contains reconstructed treatments of those topics, but that is not equivalent to two independent current studies. Consequently:

- provider-native semantics as the permanent architectural baseline are supported;
- the exact operation list and request/result shapes are not frozen;
- the compatibility state vocabulary is plausible;
- concrete provider ranges, capability policies, override UX, and release cadence are not final decisions.

## Evidence resolution order

Conflicts were resolved in this order:

1. live GitHub records at the exact observed SHA;
2. exact recorded execution at its own source SHA/version/fixture/host;
3. exact type compilation for type-level claims only;
4. current official upstream source, specification, declarations, and documentation;
5. immutable repository source at a named SHA as design intent;
6. evidence-backed inference;
7. prescriptive proposal;
8. local or reconstructed prose as an unverified lead.

New upstream behavior does not rewrite older execution history. It changes present design obligations.

## Architecture method

The synthesis evaluated each proposed primitive by whether it:

1. owns a domain distinction;
2. has one canonical representation;
3. makes illegal combinations unconstructible;
4. centralizes an invariant where it first becomes knowable;
5. removes consumer branching, duplicate representation, or false fallback;
6. preserves provider-specific semantics outside a finite portable role;
7. has finite failures and explicit falsifiers.

Vocabulary, wrapper types, and namespace structure were not counted as architecture unless they reduced state space.

## Live refresh

GitHub was refreshed during synthesis rather than copied from the archives. The branch and PR remained at `96e53a27be4ef96fb47f1a745480e0c5382640f2`. PR CI and architecture research remained failed, and the only exact-head artifact was a source export.

## Governing-instruction mismatch

The workspace instruction governing this synthesis says to keep one public operation, `compileExecutable`, with one selected Bun or Deno compiler module. The `AGENTS.md` committed at the live PR head and base instead preserves five packages, scalar and matrix executable operations, a Bun bundle continuation, and narrow `Integration`/`Provider` author surfaces. This synthesis obeys the current workspace instruction but records the remote difference as a maintainer reconciliation gate. It does not pretend either instruction is an architecture research result.

## Known defects in the input documents

The defects below were not propagated into conclusions:

- The Node archive's `live-github-state.json` associates the live SHA with the wrong commit message and parent. GitHub identifies the live commit as `research: stage canonical closure payload 00`, parent `11617dd64ce9e22f778fc915a35ce698c80bbe02`.
- The browser archive records 74 changed files; live GitHub reports 73.
- The recovery archive's canonical-contract document contains a corrupted rendering where `{ path, format }` should appear.
- Archive statements such as `KEEP`, `accepted`, `survived`, or `high confidence` were reevaluated against their actual evidence class.
- The archives disagree about whether broad browser and Node profile claims are established. The narrower later studies control the synthesis because they identify previously omitted invalid states and falsifiers.

## What was not done

No provider binary, browser, Effect program, test suite, workflow, or production implementation was run. No GitHub state was modified. Archive integrity proves only byte integrity, not the truth of every contained claim.
