# `effect-build` architecture recovery package

This archive is a read-only evidence inventory and transparent architecture reconstruction for `mannyc2/effect-build` PR #4. It contains no repository edits, implementation source, package archive, toolchain, cache, credential, publication action, or claim that the architecture is implemented or certified at the current head.

## Source coordinates

| Coordinate | SHA/status |
|---|---|
| Release-line base | `15c811bb9904142a33d119766b62082f3c689f13` |
| Released v0.3.0 source | `f06f96ca88b6278e5f23a898d758b99fa9322108` |
| PR body's stale “final research head” | `af4887c36753a82c3c97fafc54b3c368cd98b34d` |
| Last fully reproduced structured receipt head | `9b0d2f59567a7684b62df932c67b7a96050b605f` |
| Last substantive research head | `49cd5e1be7917bf14e89068afb4fa47cf78488fb` |
| Current PR/branch head observed | `96e53a27be4ef96fb47f1a745480e0c5382640f2` |

Observation time: `2026-08-17T15:40:18Z`.

## Strongest recovered conclusions

1. **Permanent provider-native `Api` and `Command` surfaces are justified.** Host APIs and selected commands have different authority, request/result types, lifecycle, diagnostics, configuration, cancellation, and direct-write behavior; profiles cannot replace them.
2. **C2 is the strongest architecture:** provider-native surfaces plus finite role profiles and ordinary Effect recipes. A generalized transformation algebra adds invalid states and erases provider meaning.
3. **`NodeMainProgram` is a truthful main-entry role; arbitrary importability is not.** Bun and Esbuild agreed when run as main and differed when imported.
4. **`NodeMainExecutable` is a truthful Node-specific assembly role.** Node SEA and a research comparison adapter produced the same application result from one bundled main; builder/base mismatch is a hard relation.
5. **A narrowed `BrowserModuleApplication` is plausible, but the general implementation remains missing.** Broad static-web failed; the complete HTML/CSS/asset discovery/rewrite/browser matrix is an implementation gate.
6. **Raw provider-native watch is distinct from portable typed watch events.** Scoped process/stdout/stderr/exit/kill/reap is valid; machine-readable readiness/rebuild normalization was falsified.
7. **Only three new core author modules are justified:** `Tool`, `BorrowedOutput`, and `Executable`. Effect already owns path/filesystem/process/scope/stream/telemetry semantics.
8. **Compatibility must be operation- and provider-owned.** Use complete ranges/disjoint sets, prerelease semantics, capability probes, known-incompatible holes, relational requirements, strict default, and explicit unknown-but-capable override.

## Most important evidence boundary

Successful structured receipts were preserved through `9b0d2f59567a7684b62df932c67b7a96050b605f`. The later substantive job at `49cd5e1be7917bf14e89068afb4fa47cf78488fb` passed ten generic laws but failed TypeScript checking before later certification steps and created no receipt artifact. Current-head source export success is not architecture certification.

## Partial patch recovery

`evidence/recovered-part-00/part-00` is the exact 8,000-byte Git blob content. It decodes to a 6,000-byte incomplete gzip prefix and yields 17,355 exact decompressed patch bytes. The patch contains one complete workflow diff and the beginning of a Plan 039 diff. No continuation was invented or applied.

See `evidence/recovered-part-00/RECOVERY-NOTES.md` for all hashes and boundaries.

## Evidence classes

| Class | Meaning in this archive |
|---|---|
| `REMOTE-EXECUTED` | A named remote Actions run/job executed the behavior and preserved matching evidence |
| `REMOTE-COMPILED` | A named remote run compiled/type-checked the contract, without automatically proving runtime semantics |
| `OFFICIAL-UPSTREAM-CONTRACT` | Current official provider/Effect documentation or declarations |
| `REPOSITORY-DOCUMENTED` | Immutable source/prose/test/fixture at an exact Git SHA; not automatically executed |
| `RECONSTRUCTED-INFERENCE` | Transparent synthesis from multiple durable sources |
| `PRESCRIPTIVE-RECOMMENDATION` | New design recommendation |
| `UNVERIFIED-CLAIM` | Plausible or documented locally, but no sufficient durable remote proof |
| `FALSIFIED` | A proposed contract failed a named probe/falsifier |

These classes are intentionally never merged.

## Package map

- `evidence/` — live GitHub state, full commit sequence, artifact metadata, material claim register, receipts, source coordinates, official sources, and exact transport recovery.
- `reconstruction/` — evidence-backed decision, contracts, profiles, Node pipeline, lifecycle, compatibility, browser, watch/observability, and certification design.
- `drafts/` — new documentation drafts and TODO Plans 039–044; none are repository edits or recovered verbatim prose.
- `gaps/` — lost/unverified material, contradictions, implementation-only gates, and maintainer decisions.

## Integrity verification

From an extracted archive root:

```sh
sha256sum -c SHA256SUMS
```

`SHA256SUMS` covers every archive member except itself, including `MANIFEST.json`. `MANIFEST.json` records exact ordinary-member hashes and derivation metadata. Its self-entry uses a documented canonicalized-self digest because a file cannot contain its own exact byte digest without a circular fixed-point problem; the exact byte digest of `MANIFEST.json` is in `SHA256SUMS`.

## Material intentionally excluded

- source snapshot archives and full source trees;
- `node_modules`, Bun/Deno/Node/Esbuild/Rolldown toolchains, package caches, compiler binaries;
- released or candidate package archives;
- credentials, tokens, cookies, environment secrets;
- unrelated project files.

## Limitations

- Ordinary GitHub APIs cannot prove the absence of unreachable/dangling server objects or private/local copies.
- The commit ledger contains the complete observed 66-commit post-base sequence, but exact per-commit changed-file enumeration was retained only for anchor commits; other rows are explicitly marked as path-family reconstruction.
- Current official Deno and Node contracts have evolved since the branch's versioned probes. This archive preserves both the historical observations and the current upstream design implications.
- This package does not authorize implementation, merge, release, or publication.
