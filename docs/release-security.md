# Release boundary and evidence

The combined contract separates source implementation, ordinary CI,
non-publishing certification, release-point selection, npm publication, tag
creation, draft-Release creation, and public-Release publication. None implies
the next, and a green local or hosted run grants no mutation authority.

effect-build returns provider-native results. Durable artifacts exist only
after an explicit finalizer, and a downstream release owner adopts a finalized
file or tree through the path-free `effect-build/artifact-adoption@1`
projection: logical name, byte identity, and digest. The downstream owner—not
the effect-build library—owns release plans, durable mutation journals
(including Apple notarization continuation), upload, publication, and external
registry state.

## This repository's npm release boundary

Publishing effect-build's own npm packages is a separate distribution concern.
The generated `releaseCertification` contract admits exactly eleven public
packages and the 42-module public projection. Rolldown remains private and
`effect-build-rolldown` is reservation-only.

`.github/workflows/release.yml` has three hard-cut modes:

1. `prepare-exact-sha` checks an exact current-main SHA, installs the frozen
   dependency graph without lifecycle scripts, runs the complete verification
   gate, and creates one candidate containing eleven once-packed tarballs plus
   one manifest. This job has no OIDC or registry-mutation authority.
2. `certify-exact-sha` is a protected, no-checkout consumer of exact candidate
   bytes. It reauthenticates GitHub state immediately before use and is designed
   to prove GitHub claims plus one npm OIDC exchange and dry run per package
   without uploading a tarball. A separate protected certification workflow
   executes the exact publisher body against sealed fake GitHub/npm boundaries.
3. `publish-certified-bytes` is a separately authorized protected consumer of
   the exact candidate and readiness aggregate. It never repacks. Before each
   possible npm mutation it re-observes package bytes, provenance, and `latest`,
   and its state machine stops on conflict, unknown outcome, or incomplete
   prior publication. An exact published prefix may resume only while the same
   readiness packet remains valid. Once it expires, the release stops and
   requires a new-version decision; no manual tag repair, repack, or bypass is
   admitted.

Protected consumers execute no checked-out repository code. They obtain the
contract from the authenticated exact source SHA, compare artifact REST
coordinates and canonical `sha256:` digests, and parse candidate ZIP and npm
tarball bytes in memory with contract-pinned bounded readers. They reject
ambient registry authentication, supplied npm or Sigstore identity tokens,
proxy/extra-CA configuration, redirects outside exact origins, and unsupported
archive topology.

## Certification and retained evidence

Readiness authenticates the candidate separately plus exactly three ordered
hosted proofs:

1. exact-main CI at the exact source SHA;
2. exact protected-body execution against the stateful fake registry; and
3. eleven-package npm OIDC dry-run certification.

Every readiness input is an authenticated GitHub run or artifact coordinate.
There is no caller-authored receipt, external-evidence ingress, generated
activation fixture, or secret-backed observer. Direct observation of current
main, repository policy, and anonymous npm state happens inside the readiness
job and is never promoted from caller bytes. Final-public verification is
read-only and re-downloads npm and GitHub Release bytes before issuing its
receipt.

`scripts/release/build-terminal-reference.mjs` is the sole constructor for the
five terminal GitHub references used by this release: candidate, readiness,
exact-main CI, fake-registry, and npm OIDC certification. Run it only after the
named attempt has completed successfully. It authenticates the exact workflow,
event, source SHA, branch, run attempt, repository IDs, artifact metadata and
canonical REST digest; downloads the raw ZIP; accepts only the contract's exact
files; derives manifest or retained-receipt identity; and re-reads current main
before emitting canonical JSON. Artifact-reference expiry is the earlier of
the contract validity window and GitHub retention expiry. The read token is
consumed only by the sealed GitHub boundary and the CLI never prints it or a
raw OIDC/npm credential.

The post-merge command form is:

```sh
ACTIONS_READ_TOKEN="$(gh auth token)" \
  node scripts/release/build-terminal-reference.mjs \
    --kind <candidate|readiness|fake-registry|npm-oidc-certification> \
    --source-sha "$R" \
    --run-id "$RUN_ID" --run-attempt "$RUN_ATTEMPT" \
    --artifact-id "$ARTIFACT_ID" \
    --artifact-digest "sha256:$ARTIFACT_DIGEST_HEX" \
    > terminal-reference.json

ACTIONS_READ_TOKEN="$(gh auth token)" \
  node scripts/release/build-terminal-reference.mjs \
    --kind exact-main-ci --source-sha "$R" \
    --run-id "$CI_RUN_ID" --run-attempt "$CI_RUN_ATTEMPT" \
    > exact-main-ci-reference.json
```

`$ARTIFACT_DIGEST_HEX` above is the 64-lowercase-hex suffix from an
independently read REST artifact `digest`; the CLI argument is always the full
canonical `sha256:` form. Reference JSON contains no authority and must be
regenerated, never edited, if it expires.

Checkout-capable release jobs use one frozen Bun 1.3.14 bootstrap. Sigstore
verification is offline against an exact trusted-root target whose retained
TUF seed/root/timestamp/snapshot/targets chain is independently replayed during
contract generation. Runtime provenance verification has a fail-closed network
guard and retains no OIDC token.

The npm OIDC certification is intentionally narrow. Under pinned Node
24.14.1/npm 11.11.0 it rejects ambient npm/Sigstore tokens and registry auth,
validates GitHub OIDC claims without retaining the token, requires exactly one
private package-specific token-retrieval marker for each of the eleven dry
runs, and proves anonymous registry state is unchanged. It proves that the
exact protected workflow obtained package-specific authority at that instant.
It does not prove tarball upload, provenance generation, publication,
exclusive trusted-publisher administration, absence of legacy npm tokens, the
package publishing-access toggle, or account 2FA state.

Those npm administrative inventories are excluded from the v0.6.0 release
gate because npm exposes no supported read interface for all of them. A local
web login is neither required nor retained as release evidence. Real
publication remains the proof of registry mutation and provenance, with exact
byte/latest/provenance re-observation before every next mutation.

Repository Release immutability is an operator-admin preflight, not a hosted
readiness role: the workflow token intentionally lacks Administration-read
authority. The operator must observe `enabled: true` immediately before draft
creation and again immediately before publication. The draft is created only
after a guarded lightweight tag, with `--verify-tag`; all twelve assets are
uploaded, downloaded, and byte-verified before publication. Final-public
verification requires the actual published Release to report
`immutable: true` and fails closed otherwise.

Apple certification is an exact 28-coordinate deferred protocol: 2 native, 10
protected product, 6 clean-host, and 10 aggregate-verdict receipts. v0.6.0
ships the `effect-build-apple` API/library package but no signed or notarized
App, DMG, or PKG. Credential-backed Apple certification and its operational
journal were not run, have not passed, and are excluded from readiness. Local
codecs, fake boundaries, or ordinary CI do not prove Developer ID signing,
notarization, stapling, Gatekeeper behavior, clean-host use, or durable
continuation. Those products require a later, separately qualified release.

The local `verify` gate builds all workspace packages, validates the generated
contract and archive/trust projections, runs type, lifecycle, consumer, and
architecture tests, and proves the public surface stays exactly bounded. It is
implementation evidence only. Credentialed certification, release-point R,
npm publication, tag creation, GitHub Release creation/publication, repository
settings, and future external infrastructure each require their own exact
authority and terminal evidence.
