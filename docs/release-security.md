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
   without uploading a tarball. It remains fail-closed while the contract's
   external-evidence identities and signers are blocked.
3. `publish-certified-bytes` is a separately authorized protected consumer of
   the exact candidate and readiness aggregate. It never repacks. Before each
   possible npm mutation it re-observes package bytes, provenance, and `latest`,
   and its state machine stops on conflict, unknown outcome, or incomplete
   prior publication.

Protected consumers execute no checked-out repository code. They obtain the
contract from the authenticated exact source SHA, compare artifact REST
coordinates and canonical `sha256:` digests, and parse candidate ZIP and npm
tarball bytes in memory with contract-pinned bounded readers. They reject
ambient registry authentication, supplied npm or Sigstore identity tokens,
proxy/extra-CA configuration, redirects outside exact origins, and unsupported
archive topology.

## Certification and retained evidence

The non-publishing path is split across dedicated workflows:

- release certification executes the exact generated protocol and distinguishes
  local fake-boundary qualification from readiness-admissible protected-body
  certification;
- evidence ingress is transport-only and grants caller bytes no authority;
- release readiness re-downloads and authenticates exact run, attempt,
  artifact, workflow, source, and external DSSE/Sigstore identities before
  producing one aggregate;
- final-public verification is read-only and re-downloads npm and GitHub
  Release bytes before issuing its receipt.

Checkout-capable release jobs use one frozen Bun 1.3.14 bootstrap. Sigstore
verification is offline against an exact trusted-root target whose retained
TUF seed/root/timestamp/snapshot/targets chain is independently replayed during
contract generation. Runtime evidence verification has a fail-closed network
guard and retains no OIDC token.

Apple certification is an exact 28-coordinate protocol: 2 native, 10 protected
product, 6 clean-host, and 10 aggregate-verdict receipts. The repository-owned
workflow is deliberately STOP-only until exact producer, runner, credential,
and external Notary-journal interfaces are qualified and a separately reviewed
generated activation is merged. Local codecs, fake boundaries, or ordinary CI
do not prove Developer ID signing, notarization, stapling, Gatekeeper behavior,
clean-host use, or durable continuation.

The local `verify` gate builds all workspace packages, validates the generated
contract and archive/trust projections, runs type, lifecycle, consumer, and
architecture tests, and proves the public surface stays exactly bounded. It is
implementation evidence only. Credentialed certification, release-point R,
npm publication, tag creation, GitHub Release creation/publication, repository
settings, and external infrastructure each require their own exact authority
and terminal receipt.
