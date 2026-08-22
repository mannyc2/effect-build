# Recovery notes for `part-00`

This directory preserves only bytes that were remotely present at Git SHA `96e53a27be4ef96fb47f1a745480e0c5382640f2`. Nothing here was applied to a worktree, and no missing continuation was invented.

## Exact measurements

| Layer | Bytes | SHA-256 | Status |
|---|---:|---|---|
| Raw `part-00` | 8,000 | `907c48e8f5453ecf0445ee64eec0f47348bbeb3554f9a081a9916005aad54c06` | recovered verbatim |
| Base64-decoded gzip prefix | 6,000 | `efa703027261558f0d927af1a73f626c6d0ff68ba7c0c525e6d6a2bf4494b6ec` | exact prefix; incomplete |
| Partially decompressed patch | 17,355 | `d246fe3c2c96a40fe6ca19eb6bfba0e718a9108640b5c9b8c8c248c750d709fa` | exact recoverable output |
| Expected complete gzip | unknown | `b6de99d6ce6c40fe874edb01e3734905b94d6c18dc757625e89644deeacdfa7a` | not recovered |

The raw Git blob identity is `4c905dac23dad8d75ff2b58d3a0e3a9bf3d40811`. The gzip decoder did not reach end-of-stream (`eof=false`). The observed partial-gzip digest therefore cannot satisfy the workflow's expected digest.

> **Provenance:** `REPOSITORY-DOCUMENTED` · observation · confidence **high** · https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/.github/research/closure-patch/part-00


## Visible diffs before truncation

1. `.github/workflows/architecture-research.yml` — complete diff section, approximately 9,768 recovered bytes.
2. `plans/039-establish-core-capability-boundaries.md` — partial diff section, approximately 7,587 recovered bytes; the stream ends mid-sentence.

“Complete” above means the next `diff --git` header was reached in the recovered byte stream. It does **not** mean the full patch contained only those files.

## Transport workflow state

At commit `11617dd64ce9e22f778fc915a35ce698c80bbe02`, `.github/workflows/research-toolchain-export.yml` was converted into a path-triggered workflow named `apply-canonical-architecture-closure`. It concatenated `part-*`, decoded gzip, checked the expected digest, applied the patch, ran formatting/type checks/laws, enforced research-only scope, committed, and pushed. At the observed head:

- only `part-00` exists;
- `.github/research/APPLY_CANONICAL_CLOSURE` does not exist;
- no run of that path-triggered workflow was observed;
- the digest gate would reject this incomplete payload before `git apply`;
- `research/post-0.3/canonical/**` is absent.

> **Provenance:** `REPOSITORY-DOCUMENTED` · observation · confidence **high** · https://github.com/mannyc2/effect-build/blob/96e53a27be4ef96fb47f1a745480e0c5382640f2/.github/workflows/research-toolchain-export.yml#L1-L79


## Search boundary

Branches, tags, releases, PR refs, current Actions artifacts, PR comments, and reviews were inventoried. No additional chunk or canonical closure commit was found. GitHub's ordinary reachable-object APIs do not enumerate arbitrary unreachable/dangling Git objects, so “no dangling commit exists” remains an unverified claim rather than a proven negative.
