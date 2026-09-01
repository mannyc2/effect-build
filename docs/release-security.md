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

The same-repository external-evidence producers are deliberately inert until a
generated activation pins all three producer identities. The future identities
for npm authority and GitHub Release governance are the exact
`npm-authority.yml@refs/heads/main` and
`github-release-governance.yml@refs/heads/main` workflow URIs. Each workflow is
an `observe` -> `sign` -> `upload` hard cut. While blocked, workflow-level and
all three job permissions are empty; `observe` and `sign` are single inline
STOPs with no third-party actions; and every job repeats the main/source-SHA
dispatch guard. `upload` has no OIDC authority, consumes only bounded canonical
base64 signed-byte outputs, derives its artifact name from the fixed role and
validated source SHA, and alone may run the pinned upload action. Signed-byte
substitution there can only make the independent verifier reject the artifact.

Supported activation cannot be obtained by adding identities and OIDC
permission alone. It must first qualify an exact Node 24.14.1 plus audited
repository observer closure with no third-party action in the credentialed
observation TCB, and a separate exact Node 24.14.1 plus audited signer/dependency
closure with no third-party `uses:`. The closed activation then grants only
`contents: read` to `observe`, only `id-token: write` to `sign`, and no GitHub
token permission to `upload`, atomically with every generated identity. Until
both hosted bootstraps are qualified, both STOPs remain and no evidence can be
created.

Their shared signer uses only GitHub's per-job OIDC request capability, Fulcio,
and Rekor v2. The generated contract pins Node, the `@sigstore/sign` 4.1.0
package/integrity and exact internal DSSE source closure, OIDC audience and
request authority/bounds, and exact Fulcio/Rekor origins, paths, methods, TLS,
timeouts, response bounds, and zero redirects/retries. Repository-owned raw
HTTPS clients use bundled roots, exact SNI, no agent, identity encoding, strict
headers and lengths, and a strict UTF-8 JSON decoder that rejects duplicate keys
at every nesting level. They never follow a redirect carrying an OIDC token or
Fulcio body. Ambient Actions/runtime variables, `NODE_OPTIONS`, TLS bypass,
proxy/extra-CA authority, pre-supplied credentials, endpoint escape, partial or
encoded bodies, and token-bearing errors all fail closed. The signed payload
and logical reference are derived from the generated contract's closed fields,
receipt protocol, source binding, freshness window, and byte digests. A
short-lived producer artifact is only a handoff to the separately validated
transport-only ingress workflow.

GitHub Release governance has an additional mandatory STOP. Reading
`repos/mannyc2/effect-build/immutable-releases` requires repository
Administration permission (read), but GitHub Actions exposes no `administration`
permission for the workflow `GITHUB_TOKEN`. No supported ephemeral
Administration-read observation mechanism is provisioned. A future sealed
boundary must obtain only that read authority without using the workflow token,
a GitHub secret, variable, workflow input, artifact, or caller-authored receipt;
it must never log, hash, sign, or upload credential material and must destroy
the authority before Sigstore OIDC signing. The pure collector and receipt
builder already constrain the exact endpoint response, commit `enabled` and
`enforced_by_owner` into `decisionReceiptDigest`, and select one of the
contract's two decisions. Until the credential boundary is implemented and
reviewed, `produce-github-release-governance.mjs` exits nonzero without reading
the endpoint or creating evidence.

The npm-authority producer has an additional mandatory STOP. Publication/OIDC
certification remains pinned to Node 24.14.1/npm 11.11.0. Authority observation
is separately pinned to npm 11.19.1 because current trusted-publisher tooling
requires npm 11.15.0 or later; its registry integrity, manifest, exact CLI
entry, command sources, and canonical entire installed package-tree closure are
contract-authenticated. Every authority call executes that authenticated
realpath through the pinned Node runtime, never PATH `npm`. A supported receipt must use an
ephemeral non-token `mannyc1` session, an exact npmjs registry argv, an exactly
empty account token inventory, exact sole-maintainer `mannyc1` projection for
all eleven public packages plus reservation-only Rolldown, and exact publishing
access `Require two-factor authentication and disallow tokens` for all twelve.
Trusted-publisher records remain exactly the eleven public packages; Rolldown
must have none. The npm API requires account 2FA and package write entitlement
even though the admitted observation operations are read-only. There is no
qualified publishing-access endpoint, so one must not be invented.

No supported ephemeral npm plus GitHub-administration observation mechanism is
provisioned. A future implementation must provide both authorities without a
GitHub secret, variable, workflow input, artifact, npm token environment
variable, or caller-authored receipt; it must never log, hash, sign, or upload
credential material and must destroy the observation authority before Sigstore
OIDC signing. Deleting a GitHub `NPM_TOKEN` secret does not prove npm-side token
revocation. Until the exact interface is implemented and reviewed,
`produce-npm-authority.mjs` exits nonzero and creates no evidence.

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
