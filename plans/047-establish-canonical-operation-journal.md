# Plan 047: Establish the canonical operation journal

- **Status**: DESIGN COMPLETE; CROSS-REPOSITORY AND INFRASTRUCTURE
  IMPLEMENTATION NOT STARTED
- **Implementation repository**: `mannyc2/ts-release`
- **Implementation base**:
  `origin/main@1e9efd717ff9d5dc2dbe5e079894cd8e92eb7ed3`
- **Consumer repository**: `mannyc2/effect-build`, repository ID
  `1331906770`
- **Authority**: this file freezes a design only. It grants no ts-release
  clone/edit/commit/push/PR authority, AWS account/bucket/IAM mutation,
  workflow dispatch, credential use, Apple submission, or release authority.

## Decision

Implement one provider-neutral `CanonicalOperationJournal` in ts-release with
exactly one operational backend: an isolated Amazon S3 general purpose bucket
namespace reached through GitHub OIDC. The bucket is a dedicated journal
authority, not an existing application bucket. Its GitHub job role is scoped
only to the exact bucket and journal prefix. There is no GitHub `contents:
write`, PAT, long-lived AWS key, repository secret, SQLite, filesystem,
Actions-artifact, Git-ref, user-supplied store, or best-effort fallback.

This replaces the rejected Git-ref design. A `GITHUB_TOKEN` with `contents:
write` is repository-wide: a fake endpoint allowlist cannot narrow its actual
release, tag, or ref authority. Branch rulesets protect only matched refs and
cannot turn that token into a journal-prefix capability. The journal must not
receive authority over effect-build source or Releases merely to store Notary
continuations.

Do not build on effect-build PR 22. Its current conflicting head
`bda39cfd84bd15c0ab64be46b74381fc02dcf5a8` spans hundreds of files, and the
provisional journal commit in its history couples a local SQLite authority to
unrelated release work. Use its canonical-encoding and failure tests only as a
question oracle.

## One canon, one projection

ts-release must not import, mirror, decode, or reconstruct
`effect-build-apple/Notary.Submission`. Doing so would create a release cycle:
ts-release must be released before the effect-build 0.6.0 candidate can use
it, while effect-build-apple 0.6.0 does not yet exist on npm.

The boundary is exact:

1. effect-build-apple remains the sole semantic owner of strict deterministic
   codecs for `Submission`, `SubmissionReference`, `Observation`, `Log`, and
   `AcceptedReference`, plus the only valid correlation and reference
   derivations.
2. ts-release owns a canonical envelope, opaque payload bytes and digest,
   sequence/transaction identities, the minimal tag-level state machine, S3
   conditional writes, acknowledgment, re-read, and chain validation. It never
   branches on an Apple payload field.
3. The effect-build release integration composes the released ts-release store
   with the exact candidate's Apple codecs. The public effect-build-apple
   package does not depend on ts-release.
4. Qualification binds `{released ts-release version and source SHA, exact
   effect-build candidate SHA and Apple codec ID, AWS account ID, bucket ARN,
   region, role ARN, retention policy digest, and IAM/bucket-policy digest}`.

## Storage authority prerequisites

Before the first live byte is written, separately authorize and prove all of
the following. Any missing or drifting fact is a feasibility STOP:

1. One dedicated general purpose bucket has S3 Versioning and Object Lock
   enabled before its first journal object. Object Lock can never later be
   disabled and versioning cannot be suspended on that bucket.
2. The bucket applies one default **COMPLIANCE** retention period of ten years
   to every object version. The release role cannot shorten or bypass it. A
   lifecycle may transition retained versions to cheaper storage but cannot
   expire a version before retention ends.
3. Bucket ownership is bucket-owner-enforced and public access is blocked. On
   the journal prefix, the bucket policy denies `PutObject` to every principal
   whose `aws:PrincipalArn` is not the exact journal role ARN, including every
   other same-account or cross-account principal. It also denies that role any
   write outside the exact prefix. The exact account ID, region, bucket ARN,
   prefix, role ARN, retention, and policy digests are recorded without
   credentials.
4. The GitHub OIDC trust policy requires exact `aud=sts.amazonaws.com`, the
   repository's immutable owner/repository identity, the protected
   `apple-certification` environment on main, and the exact pinned reusable
   journal workflow through `job_workflow_ref`. No wildcard repository,
   environment, workflow, branch, or tag claim is admitted. Capture and
   validate those claims without retaining the OIDC token.
5. The session role grants only `s3:GetObject`, `s3:GetObjectVersion`,
   `s3:GetObjectAttributes`, `s3:PutObject`, and the minimum prefix-bounded
   list/version reads required for the exact journal namespace, plus read-only
   calls needed to re-observe bucket versioning, Object Lock, retention,
   bucket policy, caller identity, and the role's own policies.
6. The bucket policy denies `DeleteObject` and `DeleteObjectVersion` on the
   journal namespace to every principal, so no one can place a delete marker
   over the logical head. The role has explicit denies and no grants for those
   actions, `BypassGovernanceRetention`, `PutObjectRetention`,
   `PutObjectLegalHold`, ACL/tag mutation, multipart upload, copy, bucket-policy
   or Object-Lock/versioning mutation, and every IAM mutation. The bucket
   policy requires a signed `If-None-Match` or `If-Match` header on every
   journal `PutObject`.
7. Every request binds the expected bucket owner, region, bucket ARN, and exact
   prefix. No endpoint override, alternate bucket, path-style fallback, or
   ambient AWS profile is admitted.

The workflow receives only a short-lived OIDC role session. It rejects
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, shared AWS
credential/config files, and preexisting AWS profiles before requesting OIDC.

## Object and CAS protocol

For each external operation, derive one lowercase 64-hex `operationKey` from
the canonical operation identity. Let `R` be one lowercase 40-hex effect-build
release-point commit. Use exactly this namespace:

    operation-journal/v1/<R>/<operationKey>/

Neither variable contains a slash. Within it, use one mutable logical head key
and immutable event keys:

    head.bin
    events/<8-digit-sequence>/<transaction-uuid>.bin

Every candidate append gets a fresh transaction UUID in its canonical bytes,
even when two opaque payloads would otherwise be equal. Each event binds the
previous event digest, previous authoritative head VersionId/ETag, sequence,
operation key, codec ID, release point, workflow run/attempt, and payload
digest.

Append is one exact protocol:

1. Re-observe and fail closed on the OIDC claims, STS caller, bucket owner,
   region, versioning, Object Lock, COMPLIANCE default retention, bucket
   policy, role policy, and exact prefix before any event write.
2. Create the immutable event key with `If-None-Match: *`, exact
   `ChecksumSHA256`, and expected-bucket-owner. S3 Object Lock requires an
   integrity checksum for a retained upload. Re-read the exact returned
   VersionId, verify canonical bytes, checksum, retention mode/date, and record
   digest. A lost response is reconciled by exact-key/version enumeration and
   byte comparison; it is never blindly re-PUT.
3. Encode a new canonical head binding that event VersionId/checksum and the
   prior head VersionId/ETag. Create the first head with `If-None-Match: *` or
   update it with `If-Match: <previous-etag>`, always with exact SHA-256.
4. A durable acknowledgment exists only after strong GET/version re-read proves
   the candidate head version and event version form a valid chain from the
   operation root. Record:

       {
         bucketArn,
         prefix,
         eventKey,
         eventVersionId,
         eventChecksumSha256,
         headKey,
         headVersionId,
         headEtag,
         headChecksumSha256,
         recordDigest: "sha256:<64 lowercase hex>",
         sequence,
         transactionId,
         previousHeadVersionId,
         previousHeadEtag
       }

5. On 409 or 412, response loss, timeout, or transport interruption, perform a
   bounded strong re-read. Because head versions are retained, walk the latest
   bounded head-version chain by VersionId and find the transaction even if a
   later append is already current. If present and exact, recover its ACK. If
   absent and the current head still equals the verified event's recorded
   predecessor, reuse that exact event without another event PUT and make one
   bounded head CAS. If the head advanced and the reducer still admits the
   logical append, create one fresh event-attempt key/sequence with the same
   transaction and the newly observed predecessor, then make one bounded head
   CAS; the prior event remains an unreachable orphan. Test both branches. If
   presence or absence cannot be authoritative, return
   `JournalStorageOutcomeUnknown`; never resend an ambiguous provider request.

S3's strong read-after-write consistency and single-key conditional writes are
the storage primitive; this protocol does not pretend two object keys update
atomically. An orphan event version is non-authoritative until an acknowledged
head version reaches it. Every reader validates the full reachable chain and
rejects missing, extra, duplicate, overwritten-current, malformed, unretained,
or policy-drifted state.

## Generic state machine

The envelope admits only these tags:

    Empty
      -> IntentRecorded
           -> ReceiptRecorded
                -> ObservationRecorded*
                     -> TerminalRecorded
           -> OutcomeUnknown

- `IntentRecorded` is a conditionally created, acknowledged pre-dispatch
  authority. It binds the exact request basis, codec ID, operation/product
  coordinate, artifact identity, dispatch ID, workflow run/attempt, and fixed
  continuation policy. No provider call may occur before its ACK and re-read.
- `ReceiptRecorded` stores only opaque, consumer-encoded canonical provider
  bytes plus codec ID and digest. It is the sole successful provider receipt.
- `ObservationRecorded` stores opaque continuation observations. The generic
  journal does not decide whether an Apple status is Pending, Accepted, or
  Rejected.
- `TerminalRecorded` stores the consumer's opaque terminal projection and
  exact dependency digests. The Apple codec/correlation layer alone validates
  and derives an accepted or rejected result.
- A lone acknowledged intent on a fresh process is conservatively an unknown
  provider outcome. `OutcomeUnknown` may record a scrubbed failure, but the
  state is terminal and no resubmit transition exists.
- A second intent or provider receipt for the same operation is invalid.

## Apple composition and crash law

Process A acknowledges and re-reads `IntentRecorded`, calls the native Notary
submit exactly once, encodes the returned native `Submission` with the exact
effect-build-apple codec, appends those opaque bytes, then requires journal ACK
and re-read. Process B reads and verifies the full envelope chain, requires the
exact codec ID, lets effect-build-apple strictly decode every field, correlates
operation/artifact/architecture/tool identities, derives
`SubmissionReference`, and only then calls `info` or `log`.

- Before intent ACK: no provider call occurred; a contender may repeat only
  the storage admission protocol.
- After intent ACK and before/during submit, or before the first provider ID is
  durably acknowledged: `SubmissionOutcomeUnknown`; never resubmit.
- After a remote object mutation but before the client receives the response:
  bounded version re-read may recover its ACK.
- After receipt ACK: a fresh runner reconstructs the exact native reference
  through the Apple-owned decoder and derivation.

Private Notary log bodies, credentials, API-key/keychain coordinates, secret
paths, OIDC tokens, STS credentials, and raw AWS responses never enter the
journal. Only approved opaque projections or digests may appear.

## Governance and honest claim boundary

COMPLIANCE Object Lock preserves each referenced object version for the fixed
retention period, and the journal role has no delete/configuration authority.
This is a materially narrower authority than repository-wide GitHub contents
write. It is still not Byzantine-proof: an AWS account administrator can
change IAM/bucket policy for future writes, and a compromised admitted writer
can attempt a syntactically valid append. Therefore every operation re-observes
governance, validates the complete chain, compares the externally retained
prior ACK, and stops on any drift. The plan may call retained versions WORM for
their compliance period; it may not call the overall AWS account tamper-proof.

Permanently retain the downloaded final readiness ACK and release receipt in a
separate authority. Evidence-retirement after the ten-year lock remains a
separate future policy and deletion authority.

## Implementation and tests

Implement on a separate ts-release branch
`codex/operational-operation-journal` from the exact base above. The focused
shape is:

- canonical envelope, reducer, codecs, and public provider-neutral subpath;
- one exact S3 backend and OIDC/session-authority projection;
- no store selection option and no fallback backend;
- schema/transition/tamper golden tests;
- a stateful fake S3/STS/IAM boundary covering exact allowlists, event
  conditional create, head CAS, 409/412, response loss before/after mutation,
  later-head recovery, orphan events, checksums, version/retention/policy drift,
  bounded re-read, and fresh-process reconstruction;
- two real child-process crash/resume tests;
- packed Node and Bun consumer smoke tests.

In the separate effect-build release-readiness candidate, add the Apple-owned
strict codecs/derivations and a fake-Apple two-process integration proving that
process A preserves every required and optional `Submission` field and process
B reconstructs and correlates the exact reference without ts-release
interpreting those bytes.

Before Apple use, separately qualify a non-production scratch operation in the
exact provisioned bucket from two fresh GitHub-hosted runners, including one
deliberately lost response and one CAS race. Download and externally retain the
ACK, then prove a third credential-free reader validates the exact retained
versions and governance.

## Remaining authorities

1. Explicit local-write authority naming `mannyc2/ts-release`, exact base
   `1e9efd717ff9d5dc2dbe5e079894cd8e92eb7ed3`, and branch
   `codex/operational-operation-journal` is required before cloning/editing.
2. Commit, push, PR, review, merge, and ts-release publication remain separate.
3. Selecting the exact AWS account, bucket name/region, ten-year COMPLIANCE
   retention, OIDC provider/role, IAM policy, and bucket policy requires one
   separately reviewed infrastructure plan and exact-target mutation authority.
4. Creating the `apple-certification` environment, reusable journal workflow,
   and exact OIDC subject policy requires separate effect-build repository
   settings/workflow authority.
5. Live scratch-object/race/crash tests require exact bucket-prefix mutation
   authority.
6. No Apple submission may begin until an exact released ts-release version,
   the matching effect-build codec integration, live two-runner journal proof,
   and externally retained governance/ACK evidence all pass.
