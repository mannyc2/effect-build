# Releases

The release target is `effect-build/v0.5-contract@1` in
[`tooling/v05-contract.json`](../tooling/v05-contract.json). Stage 0 has
quarantined the candidate's unsafe green-main publisher. The current manual
workflow deliberately fails and has read-only permissions; it cannot publish.

## Candidate

A future read-only job may construct a candidate automatically from one exact
source SHA. It builds once, packs the seven packages once, inspects and hashes the
seven tarballs, and tests those exact bytes. The authenticated candidate is the
only package-byte input the privileged workflow may consume; the separate Apple
certification artifact supplies evidence only. That workflow may not checkout,
install, build, or pack.

The candidate job uploads the seven-tarball payload first and then a detached
canonical descriptor. The payload is exactly seven top-level regular `.tgz` files
named by the records; directories, links, unsafe paths, duplicates, the
descriptor, and extras are forbidden. The descriptor binds the payload's
GitHub-assigned ID/name/SHA-256 without trying to contain its own digest; release
inputs bind both independently assigned artifact IDs and REST digests. The
decoded descriptor must repeat the input payload ID/digest pair exactly.
Artifact REST digests use exact `sha256:<lowercase-hex>` form, and the descriptor
artifact contains only `release-candidate.json`. Descriptor bytes are RFC 8785
canonical JSON plus one LF, with no unknown fields or JSON numbers and with exact
field types, package/dependency order, package-versus-packed-name equality,
literal `sha512-` plus canonical SHA-512 base64, positive-decimal-string
IDs/attempts/byte counts, and UTC
second timestamps. Authoritative API run ID, attempt, event, ref, head SHA,
conclusion, and both artifact records must match the inputs and embedded values.
The successful push run, main-branch source, run-head and checkout SHA, exact
version `0.5.0`, timestamps, and exact seven package records are all rechecked
before approval or registry observation.

Apple certification is a separate post-candidate operation. The authenticated
workflow is `.github/workflows/apple-certification.yml` at `refs/heads/main`,
triggered only by `workflow_dispatch`, and its run attempt must be exactly 1. The
protected release inputs bind
`appleCertificationWorkflowRunId`,
`appleCertificationWorkflowRunAttempt`, `appleCertificationArtifactId`, and
`appleCertificationArtifactDigest`; environment variables, branch tips, and
caller-supplied SHA assertions are not authority. The certification Actions
artifact is named `effect-build-v0.5.0-apple-certification` and contains exactly
canonical `apple-certification-index.json` and opaque
`effect-build-v0.5.0-apple-certification.bin`. Its
`effect-build/apple-certification-index@1` index binds the complete candidate
run/attempt, descriptor and payload artifact subjects and REST digests,
descriptor content digest, exact source SHA, certification workflow identity,
bundle name/length/SHA-256, verdict `certified`, A0 through A9, the exact 14
distribution coordinates, and the exact eight clean-host coordinates. It may
bind opaque redacted receipt bytes, but the release coordinator never decodes or
freezes A7's provisional Notary provider JSON/status or detailed
receipt/reconciliation-evidence body shapes.

The 24-hour candidate freshness bound applies through the final zero-mutation
preflight. Before npm, the privileged job may only frame the already-verified
descriptor, payload, and Apple-certification Actions wrapper bytes into one
canonical, three-body length-delimited `effect-build/release-escrow@2` container;
it still may not checkout, install, build, pack, sign, notarize, or certify. The
draft must contain and verify that temporary escrow plus all nine final assets—ten
staged assets in total—before npm can start.

After the first exact GitHub mutation, the same run ID/attempt may advance tag,
draft, and escrow only while continuously holding the release lease. A recovery
entry at tag-only, empty-draft, or unauthenticated partial staging cannot
continue a candidate. A freshly approved, zero-npm rollback applies for
Available, ExpiredOrDeleted, or Unknown
Actions-artifact state: it records that state without using candidate bytes,
deletes only the exact nonpublic draft by release ID if present, deletes only the
exact lightweight candidate tag, and reobserves after each step. A new fresh
candidate is required after rollback. Once an equivalent escrow container binds
the exact descriptor, payload, and certification artifacts, partial final-asset
staging may resume from
Available originals or identical ExpiredOrDeleted escrowed wrappers; Unknown
waits with zero mutation. A new tag dispatch is rollback-only before that escrow
binding. Rollback proves only
the immutable dispatch inputs, authoritative candidate run/source SHA, exact
nonpublic GitHub subjects, and all-Absent registry state; it does not claim the
missing descriptor, package, certification-index, or certification-bundle bytes.
Initial and recovery runs share the exact
workflow-level `effect-build-release-v0.5.0` concurrency group with
`cancel-in-progress: false`, held through deletion and reobservation.

Once that escrow and all nine final assets are complete, logical expiry or
physical Actions-artifact deletion cannot strand the release. A recovery run
extracts the three identical wrappers from escrow, reconstructs the canonical
descriptor and certification index, and revalidates the embedded descriptor,
certification artifact subject, opaque certification bundle, seven tarballs,
release manifest, escrow job, protected approval, tag, and draft. An expired
all-Absent set or contiguous Equivalent prefix can continue from exact escrow; a
gap, Conflict, Unknown, or unknown artifact state cannot.
This wrapper-recovery rule applies only while npm work remains. Once all seven
registry records are Equivalent, an unknown Actions artifact state is outside
the terminal proof set.

Trigger and run-attempt admission select exactly one protocol arm before any
authentication. Candidate, certification, escrow, final-manifest, or
rollback-subject evidence is then authenticated only as required by that arm.
The descriptor, payload, and certification artifact records are classified
independently at one observation time. `Unknown` has precedence over
`ExpiredOrDeleted`, which has precedence over `Available`; all three records must
be Available to use the originals. A matching 200 response whose valid
`expires_at` is not in the future is ExpiredOrDeleted even if its `expired` flag
is still false. Pre-escrow rollback records the aggregate state but authenticates
no candidate or certification bytes and makes no certification claim.

## Fixed-seven convergence

The normative order is:

1. `effect-build`
2. `effect-build-apple`
3. `effect-build-bun`
4. `effect-build-deno`
5. `effect-build-esbuild`
6. `effect-build-node-sea`
7. `effect-build-rolldown`

Each exact coordinate is observed as `Absent`, `Equivalent`, `Conflict`, or
`Unknown`; `NotReached` is report-only. Preflight all seven before mutation. An
initial Conflict or Unknown stops with zero mutations. Publish only the first
Absent coordinate whose predecessors are Equivalent, reobserve after every
response, and advance only on Equivalent. A later run resumes an Equivalent
prefix—or the all-Absent set after complete escrow—and publishes only its Absent
suffix. Observations use three fixed
10-second attempts within 35 seconds; publication itself is never retried.

GitHub staging starts before npm: it creates one lightweight `v0.5.0` tag at the
candidate SHA, creates or resumes one exact draft Release, uploads the one
temporary escrow container, and then uploads the seven candidate tarballs, one
canonical RFC 8785 `effect-build/release-manifest@2`, and the exact opaque
`effect-build-v0.5.0-apple-certification.bin` without overwrite. These are the
nine final assets. The manifest embeds the exact descriptor, canonical
certification index, certification-artifact run/attempt/ID/name/digest subject, and
escrow-run receipt. It also binds the public bundle name, length, and SHA-256.
Only after all seven npm coordinates converge may the coordinator delete the
temporary escrow asset, verify the exact nine final assets, and publish the
non-prerelease draft as latest. A lost response after escrow deletion resumes
from the exact phase-correct tag and draft, nine final assets, canonical manifest
and its embedded candidate/certification/escrow subjects, and seven authoritative
Equivalent registry records. That arm forbids Actions wrapper recovery and any
npm or asset mutation; an already-Equivalent public Release is
observation-only. The candidate-descriptor digest covers its canonical file bytes
including LF, and the certification-index digest covers its own canonical file
bytes including LF; neither hashes an Actions artifact wrapper.

## Apple promotion gate

`effect-build-apple` source and its selected public surface are integrated into
the seven-package candidate, but no Apple product-form release authority is
earned by that source integration. At Apple implementation revision
`5718e83907e8e463a16c2dc186e70fa3f5ca90a1`, A0, A1, and A9 were locally green
without a retained exact-revision receipt or CI record; they therefore remain
formally not earned. A2 through A8 and the eight G product-form × architecture
clean-host cells are also not earned. Promotion of either `effect-build-apple`
or v0.5 stops until the complete exact-candidate evidence is retained.

The certification index must enumerate A0 through A9 exactly once. It must also
enumerate, without pruning and in frozen row-major order, the seven distribution
scenarios—Developer-ID-sign Bun, Deno, and Node SEA executables, plus notarized
app, ZIP, DMG, and PKG products—on `macos-x64` then `macos-aarch64`, for exactly
14 coordinates. Its clean-host matrix similarly enumerates `G-App`, `G-ZIP`,
`G-DMG`, and `G-PKG` on those two targets, for exactly eight coordinates. A
missing, duplicate, unexpected, non-certified, or candidate-mismatched cell is a
release-blocking conflict.

The release coordinator consumes only the already-built, exact-prepacked
candidate. It does not sign, notarize, staple, assess, rebuild, or repack Apple
artifacts, and it does not treat an ad hoc environment-variable assertion as
certification authority. Apple credentials and Notary submissions belong only
to the separate certification operation. The coordinator authenticates that
operation's canonical index, opaque bundle bytes, exact Actions subject, and
candidate binding, not its credential-bearing internals. npm publication remains
governed by the one protected `npm` environment and fixed-seven convergence
protocol below.

## Authority

Candidate construction may be automatic and read-only. Initial staging and
publication require a manual `.github/workflows/release.yml` dispatch from
`refs/heads/main` and approval through the protected `npm` environment. The approved publisher is
exactly `mannyc2/effect-build`; all seven package bindings, npm trusted-publishing
provenance, candidate-equal source SHA, public access, and the `latest` dist-tag
are required for registry equivalence. Initial publication also requires the
candidate source/run-head/checkout SHA, release run/workflow SHA, and protected
main head after approval to be identical. Every privileged run must be attempt

1. A greater attempt is rejected with zero mutations before subject
   classification or rollback because approval history cannot correlate a review
   record to a run attempt. Resumption is a new manual dispatch from the
   equivalent `v0.5.0` tag, with fresh approval; observing an already-Equivalent public Release is the sole
   no-new-approval, zero-mutation exception. The environment must have exactly one
   configured User reviewer entry, one required approval, self-review and administrator
   bypass disabled, only `main` and the exact `v0.5.0` tag admitted, and no timer or
   custom rule. Choosing the reviewer User ID, freezing the read-back npm
   environment ID, and verifying the full configuration are
   release-blocking Stage 9 work; read-back is required before unquarantine and
   before each publication attempt. The escrow receipt binds exactly the documented
   run-approval-history `approved` state, approving User ID, and npm environment
   ID/name. That endpoint exposes no approval timestamp or deployment ID, and the
   receipt claims neither. A green main run, certification, or merge does
   not authorize publication. npm staged publishing is not part of v0.5.

Both `effect-build-apple` and `effect-build-rolldown` were anonymously observed
absent from npm on 2026-08-23. Each needs a separately authorized, audited
reservation publication before its trusted-publisher binding can be created and
read back; staged publishing cannot bootstrap an absent coordinate. This
repository change does not authorize or perform either namespace bootstrap,
trusted-publisher changes, npm publication, Git tags, or a GitHub Release. Those
remain separate explicit actions. Successful publication must later be followed
by anonymous tarball, digest, provenance, dist-tag, consumer, manifest, tag, and
Release-asset verification.
