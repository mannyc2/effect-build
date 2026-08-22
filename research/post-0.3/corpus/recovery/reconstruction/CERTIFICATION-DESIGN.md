# Certification design

**Status:** reconstructed documentation; not recovered verbatim source.  
**Purpose:** Specify the exact-head evidence needed before implementation claims, while preserving the distinction between law tests, compilation, real execution, and release authority.  
**Observed remote head:** `96e53a27be4ef96fb47f1a745480e0c5382640f2`  
**Last substantive research head:** `49cd5e1be7917bf14e89068afb4fa47cf78488fb`  
**Last fully reproduced receipt boundary:** `9b0d2f59567a7684b62df932c67b7a96050b605f`

This document does not assert that the described API is implemented, remotely certified at the current head, or ready to merge.


## What current evidence certifies—and does not

- At `9b0d2f59567a7684b62df932c67b7a96050b605f`, two architecture-research runs completed successfully and preserved structured receipts with `result: reproduced` for 18 claims.
- At `49cd5e1be7917bf14e89068afb4fa47cf78488fb`, the research job passed ten generic law tests, then TypeScript contract checking failed; later certification steps were skipped and no structured receipt artifact was emitted.
- At `96e53a27be4ef96fb47f1a745480e0c5382640f2`, source-export workflows succeeded, but architecture/CI checks failed or were not the closure workflow. The missing patch was never applied.

Therefore no exact-head architecture certification exists for `96e53a27be4ef96fb47f1a745480e0c5382640f2`.

> **Provenance:** `REMOTE-EXECUTED` · observation · confidence **high** · Actions runs/jobs/artifacts indexed in evidence/ARTIFACT-LEDGER.json and evidence/RECEIPT-INDEX.md


## Certification layers

Never collapse these layers into one “CI passed” statement:

| Layer | Evidence class | Required proof |
|---|---|---|
| Static repository scope | `REPOSITORY-DOCUMENTED` / remote certifier | Exact diff from approved base; production/export paths unchanged for research-only PR |
| Contract compilation | `REMOTE-COMPILED` | Exact TypeScript contracts compile at all supported Effect/provider declaration endpoints |
| Pure law execution | `REMOTE-EXECUTED` | Ownership, compatibility, protocol, error/Cause, planning-before-mutation laws pass |
| Real provider execution | `REMOTE-EXECUTED` | Exact Bun/Deno/Esbuild/Node versions execute representative operations and falsifiers |
| Browser execution | `REMOTE-EXECUTED` | Real browsers load rewritten applications in required modes |
| Platform publication | `REMOTE-EXECUTED` | Linux/macOS/Windows staging, locks, interruption, atomic publication, cleanup |
| Packed consumer/importability | `REMOTE-COMPILED` and `REMOTE-EXECUTED` | Published subpaths/types import from packed packages, duplicate-core and peer-range consumers pass |
| Aggregate exact-head certificate | generated receipt | All required jobs match one source SHA and expected matrix; no stale or skipped evidence |
| Release authority | maintainer-controlled | Separate approval, version, changelog, trusted publishing, tag/release; never inferred from research CI |

## Required workflow topology

### 1. `scope-and-head`

- Check out exact `${ github.sha }` with credentials disabled for read-only certification.
- Verify ancestry from release-line base and released source.
- Compare approved base to exact head.
- Fail if research-only certification changed `packages/**`, package/export authority, lockfile, release workflows, settings, or unrelated files.
- Fetch remote PR/branch head immediately before aggregate result and require equality.

### 2. `contracts`

- Install exact locked project dependencies.
- Install pinned research-only parsers/SemVer dependencies without committing lock changes.
- Generate contract markdown deterministically and require clean diff.
- Type-check canonical contracts and all package/declaration endpoints.
- Record compiler/runtime/package versions.

### 3. `laws`

- Run profile, compatibility, ownership, expiry, mutation, containment, duplicate-core, exact-failure/Cause, and publication state-machine tests.
- Every expected conclusion maps to one named assertion set.
- A claim cannot be marked established merely because its receipt file exists.

### 4. Provider matrices

Separate jobs by provider/lane/operation and version. Include oldest/current/newest, known-incompatible, missing-capability, override, and prerelease cells as applicable. Preserve small JSON receipts; exclude caches/toolchains/source archives from the durable evidence package.

### 5. Browser matrix

Run Chromium, Firefox, and WebKit where feasible for unminified/minified/source-map modes. Record application assertions, network requests, console errors, and complete output manifest digests.

### 6. Platform publication matrix

- Linux, macOS, Windows.
- Single-file staging/publication, destination overlap, same-parent replacement, interruption, active executable locks, cleanup after process exit, and native target inspection.
- Windows lock behavior must be observed, not inferred from local prose.

### 7. Aggregate certificate

The aggregate job consumes only receipts whose `sourceSha` equals the exact head and whose job/matrix identities match the expected set. It emits `certification.json` containing:

```json
{
  "schema": "effect-build/architecture-certification@3",
  "sourceSha": "<exact head>",
  "baseSha": "15c811bb9904142a33d119766b62082f3c689f13",
  "repositoryScope": { "result": "passed", "changedPaths": [] },
  "jobs": [{ "runId": 0, "jobId": 0, "name": "...", "conclusion": "success" }],
  "artifacts": [{ "id": 0, "digest": "sha256:...", "size": 0 }],
  "claims": [{ "id": "...", "class": "REMOTE-EXECUTED", "result": "established" }],
  "remoteHead": "<freshly observed head>",
  "result": "certified"
}
```

The aggregate fails on skipped required jobs, stale source SHA, missing artifact digest, unexpected matrix omissions, dirty generated docs, remote-head movement, or scope drift.

## Receipt design

Each receipt should include:

- schema and claim ID;
- exact source SHA/base SHA;
- workflow run/job/attempt;
- OS/architecture;
- exact tools/packages/runtimes and digests where available;
- request/fixture identity;
- assertions and falsifiers;
- sanitized stdout/stderr summaries or hashes;
- output manifest/artifact observations;
- evidence class (`REMOTE-COMPILED` or `REMOTE-EXECUTED`);
- conclusion and confidence;
- creation time and retention policy.

## Failure semantics

Certification is fail-closed:

- A compiled prototype is not execution evidence.
- A passed generic law suite before a later type-check failure is retained as partial evidence, not a successful run.
- A source snapshot artifact is not a receipt.
- A commit message containing “certify” is not certification.
- A previous-head receipt cannot certify a later head.
- Repository prose marked `established` is not upgraded to remote execution without matching receipts.

## Implementation-only transition

After the architecture documentation is approved, implementation work must occur in separate commits/PRs with production-path authority. It must recreate the canonical contracts and tests from specifications, not apply this recovered partial patch or treat reconstructed prose as source code.
