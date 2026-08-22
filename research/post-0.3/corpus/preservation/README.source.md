# effect-build preserved evidence — 2026-08-17

This archive preserves the still-downloadable original GitHub Actions artifact ZIPs and reachable Git objects used by the post-0.3 `effect-build` architecture research. It is an evidence archive, not architecture certification, implementation evidence, a release receipt, or a recovery of the missing closure source.

## Result

- Repository: `mannyc2/effect-build`
- Historical draft PR: `#4`
- Observed research branch head: `96e53a27be4ef96fb47f1a745480e0c5382640f2`
- Capture window: `2026-08-17T18:52:24Z` through `2026-08-17T19:00:16Z`
- Preserved artifacts: **19 of 19 targets**
  - 18 structured-receipt artifacts from nine exact historical source SHAs
  - one source-export artifact for `96e53a27be4ef96fb47f1a745480e0c5382640f2`
- Unavailable or expired at observation: **none**
- Git objects: all 17 refs advertised by GitHub at capture time plus explicit refs for five named anchor commits
- Supplied synthesis ZIP: included once, byte-identically, with its four embedded inputs verified against its own manifest

Every downloaded artifact ZIP matched GitHub's live size and SHA-256 exactly. The bytes under `artifacts/original/` came directly from the GitHub REST artifact-download endpoint and were not extracted, recompressed, normalized, or reconstructed.

## Contents

- `artifact-ledger.json` and `artifact-ledger.csv`: live API identity, run and job provenance, source SHA, expiration, local filename, size, SHA-256, and terminal preservation status for all 19 targets.
- `artifacts/original/*.zip`: the original downloaded artifact containers, named with both artifact ID and artifact name.
- `git-object-ledger.json`: bundle identity, anchor commit metadata, and independent restore checks.
- `git-bundle/effect-build-reachable-2026-08-17.bundle`: a self-contained Git bundle containing the captured refs and explicit archival anchor refs.
- `inputs/effect-build-research-synthesis-2026-08-17.zip`: the supplied synthesis and its four embedded research/recovery archives.
- `live-github-state.json`: the PR, branch, run, artifact, ref, and checkout observations used for this capture.
- `metadata/`: raw read-only GitHub API responses and local verification records.
- `MANIFEST.json` and `SHA256SUMS`: inventory and integrity data for every ordinary archive member.

## Claim boundaries

The 18 receipt artifacts apply only to the exact source SHA recorded in each artifact. The latest fully reproduced receipt source in this set is `9b0d2f59567a7684b62df932c67b7a96050b605f`. Those receipts do not certify `49cd5e1be7917bf14e89068afb4fa47cf78488fb`, `96e53a27be4ef96fb47f1a745480e0c5382640f2`, or any later source.

Artifact `9275193303` is a source snapshot only. Its successful export does not prove that the architecture contracts compile, that research conclusions pass, or that the source is production-ready.

The included synthesis and its documents remain evidence, reconstruction, or proposals according to their own provenance. Preservation does not turn them into authoritative instructions or recovered original closure bytes.

## Recorded digest disagreement

The supplied recovery ledger recorded artifact `9275193303` with `sha256:eddd5b92e076359d103abcf1640baf467449abfb624b2933c9fbf404863a22cb`. At preservation time, GitHub reported `sha256:edddbe810ad37d8f67e109c82ebf66b8ca75ae090727f15840862ee8ef997353`, and the one downloaded ZIP independently hashed to the latter value. Both observations remain in `artifact-ledger.json`; the earlier value was not silently overwritten.

## Verification

After extracting the outer archive:

```sh
shasum -a 256 -c SHA256SUMS
find artifacts/original -name '*.zip' -exec unzip -tqq {} \;
unzip -tqq inputs/effect-build-research-synthesis-2026-08-17.zip
git bundle verify git-bundle/effect-build-reachable-2026-08-17.bundle
```

The preservation procedure additionally restored the bundle into a fresh bare repository, ran `git fsck --full --strict`, and verified all five named anchor commits with `git cat-file -e '<sha>^{commit}'`.

## Mutation boundary

GitHub access was read-only: repository, PR, branch, run, job, ref, and artifact GETs plus artifact downloads and Git fetch/clone operations. No push, comment, PR edit, workflow dispatch, label, release, setting change, merge, tag, or publication occurred. The existing user checkout was not used to build the bundle and was not modified.
