# Apple distribution

`effect-build-apple` is the v0.5 direct Developer ID distribution boundary. It models Apple signing, product construction,
notarization, stapling, and local assessment as explicit Effect operations over authenticated artifacts. It does not turn
compiler assembly into an implicit release pipeline.

Status: implementation and certification are separate. Passing unit, architecture, and local integration tests establishes
implementation behavior only. Credential-backed Apple certification, quarantined clean-host Gatekeeper acceptance, merge,
and release remain independently earned authorities.

The package, subpath, operation, and service names below are selected for v0.5. Non-Notary input/result structures are selected
with that public surface. The exact Notary JSON field/status decoder and detailed receipt/reconciliation-evidence shapes remain
provisional through A7, where credential-backed response and recovery fixtures must be captured.

## Authority boundaries

```text
compiler provider
  -> locally valid executable; provider-specific ad-hoc correctness repair only
effect-build-apple construction
  -> authenticated app / ZIP / DMG / installer candidates
effect-build-apple distribution trust
  -> identity-signed artifacts, Notary observations, stapled artifacts, local assessments
consuming release system
  -> credentials, policy, clean-host acceptance, merge, publication, retention
```

The compiler provider never receives Developer ID or Notary credentials. Apple operations depend on `effect-build` core, not
on a sibling compiler provider, and accept authenticated outputs from Bun, Deno, Node SEA, or another producer without
granting that producer distribution authority.

The release system retains every product decision: distribution form, bundle identity and version, icons and resources, the
single-app install destination, entitlements, acceptable runtime restrictions, credentials, incident and retry policy,
quarantine testing, and publication. Installer scripts and multi-component composition are not v0.5 inputs.

The v0.5 Notary authority is one caller-pre-provisioned `notarytool` Keychain Profile reference, supplied at layer composition
time. The package never invokes `store-credentials`, accepts raw Apple ID/password or API-key material, imports or unlocks
keys, or coordinates iCloud Keychain sync. Those credential lifecycle actions remain outside the library. The Notary
response/status and durable receipt/evidence structures remain provisional as noted above.

## Public operation inventory

| Subpath            | Boundary                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `Artifact`         | Artifact kinds, SHA-256 authentication, tree manifests, provenance, and observations           |
| `CodeSign`         | Developer ID Application signing; explicit identity, timestamp, nesting, runtime, entitlements |
| `AppBundle`        | `.app` structure and caller-supplied bundle identity                                           |
| `Zip`              | Transport archive creation and round-trip verification around an authenticated app bundle      |
| `DiskImage`        | DMG construction and structural verification                                                   |
| `InstallerPackage` | `.pkg` construction and Developer ID Installer signing                                         |
| `Notary`           | Submission, durable reconciliation by submission id, wait, information, history, and logs      |
| `Staple`           | Ticket mutation and validation on supported products                                           |
| `Assess`           | Digest-bound host-local signature and policy observations                                      |

The selected named surface is:

- `Artifact`: `observeFile`, `observeTree`, `observeExecutable`, `isFileArtifact`, `isTreeArtifact`, `isKind`, `reference`, `revalidate`,
  `sameIdentity`
- `CodeSign`: `developerIdApplication`, `sign`, `Signer`, `layer`
- `AppBundle`, `Zip`, and `DiskImage`: `create`, `Creator`, `layer`
- `InstallerPackage`: `developerIdInstaller`, `create`, `Creator`, `layer`
- `Notary`: `submit`, `operatorReconciliationEvidence`, `reconcile`, `info`, `wait`, `log`, `history`,
  `readReceipt`, `submittedReceiptPath`, `Notarizer`, `layer`
- `Staple`: `staple`, `Stapler`, `layer`
- `Assess`: `assess`, `Assessor`, `layer`

No universal `signArtifact` operation erases artifact-kind rules. `CodeSign` does not accept ZIP or installer-package inputs;
Developer ID Installer is a distinct authority owned by `InstallerPackage`. Provider assemblers retain only their proven
ad-hoc correctness repair, so the Apple package does not expose a second implicit compiler-finalization path.

The authenticated artifact vocabulary is closed for this scope: regular-file `mach-o`, `entitlements`, `resource`, `zip`,
`disk-image`, and `installer-package` artifacts; tree `app-bundle` and `resource` artifacts. Every artifact has a mandatory
algorithm-qualified SHA-256 identity. File identity also records byte length and mode; tree identity is a deterministic sorted
manifest of directory modes, file modes/lengths/digests, and symbolic-link targets. An Apple operation never accepts an
unauthenticated path as a substitute.

`observeFile`, `observeTree`, and the provider-specific `observeExecutable` bridge are the only public minting boundaries.
`revalidate` rejects forged or changed descriptors, while
`sameIdentity` intentionally ignores paths and compares authenticated content identity so a staged copy can be proved equal to
its source.

`observeExecutable` is the provider bridge: it accepts only a hashed macOS `effect-build/Artifact.Executable`, independently
rehashes the committed path, and requires the provider byte count and SHA-256 to match before minting a Mach-O artifact. It
binds the provider target to a thin Mach-O CPU type and rejects FAT/universal input.

| Operation                 | Accepted authenticated input                                                                                    | Result                                                                                 | Lifecycle                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------- |
| `CodeSign.sign`           | Mach-O, app bundle, or disk image; authenticated entitlements may support explicit plan items                   | new artifact of the same kind plus identity/signature observations and provenance      | mutation                                |
| `AppBundle.create`        | Mach-O plus optional file/tree resources                                                                        | new app bundle                                                                         | construction                            |
| `Zip.create`              | app bundle                                                                                                      | new ZIP whose extracted app identity is proved equal to the input                      | construction                            |
| `DiskImage.create`        | app bundle                                                                                                      | new verified UDZO disk image                                                           | construction                            |
| `InstallerPackage.create` | app bundle plus distinct Developer ID Installer authority                                                       | new signature-checked installer package                                                | construction and signing                |
| `Notary.submit`           | Mach-O, app bundle, ZIP, disk image, or installer package                                                       | durable attempt/submission receipt bound to unchanged subject and transport identities | remote observation, no product mutation |
| `Staple.staple`           | app bundle, disk image, or installer package plus an authenticated digest-matched `Accepted` Notary observation | new stapled and validated artifact of the same kind                                    | mutation                                |
| `Assess.assess`           | Mach-O, app bundle, disk image, or installer package                                                            | local-static signature and policy observations bound to an unchanged snapshot          | observation                             |

ZIP and installer-package inputs are rejected by `CodeSign` before signing; ZIP and raw Mach-O are rejected by `Staple` before
stapling; ZIP is rejected by `Assess` before assessment. These rules are operation boundaries rather than deferred tool
diagnostics.

## Authenticated artifact lifecycle

Every mutating operation follows one lifecycle:

1. authenticate the immutable input by its algorithm-qualified SHA-256 digest or deterministic, symlink-safe tree manifest;
2. resolve and authenticate the selected system tool;
3. copy the input into private staging without following unsafe links;
4. reauthenticate the staged copy before invoking the tool;
5. perform exactly the requested mutation with bounded output and scope-owned processes;
6. validate and digest the result; and
7. publish a new artifact plus provenance binding the input, tool, observations, and output.

Failures and interruption clean staging and leave the caller's input unchanged. Interruption stays in Effect's interruption
channel. Signing, app/ZIP/DMG/package construction, and stapling change bytes; their output digest cannot equal the producer
digest by contract.

File publication is atomic and no-clobber. Tree publication atomically replaces a directory reservation created by the same
operation and rejects cooperative concurrent publishers; the destination parent must be caller-controlled. v0.5 does not claim
exclusive publication against a hostile local writer that removes and swaps that reservation between syscalls.

Private staging strips extended attributes, ACLs, and AppleDouble/resource-fork metadata because those fields are not present
in the authenticated artifact identity. Ambient metadata therefore cannot silently enter a product; supporting it later would
require an explicit authenticated representation and certification cell. A signed product is normalized through the same
boundary and verified again before publication, with recursive verification for apps. That fails closed when a script or other
signature depends on unmodeled extended attributes rather than embedded Mach-O or bundle signature data.

Construction keeps its product inputs narrow:

- `AppBundle.create` consumes one authenticated Mach-O plus optional authenticated file/tree resources at normalized relative
  resource destinations. Bundle identifier, bundle and executable names, versions, and minimum system version are explicit
  caller policy. It produces a no-clobber `.app` candidate with a validated property list.
- `Zip.create` accepts only an authenticated app bundle. It uses `ditto` keep-parent semantics, extracts the staged ZIP, and
  proves that the extracted app tree identity matches the input before publication.
- `DiskImage.create` accepts only an authenticated app bundle plus an explicit volume name. It creates a UDZO image and runs
  `hdiutil verify` before no-clobber publication.
- `InstallerPackage.create` accepts exactly one authenticated app bundle plus explicit package identity, version, and absolute
  install location. It authenticates a distinct Developer ID Installer certificate by fingerprint, Team ID, class, and signing
  trust, invokes `pkgbuild` with a mandatory secure timestamp, and binds the independently observed
  `pkgutil --check-signature` leaf certificate to that exact authority before publication. It does not invoke `productbuild` or
  `productsign`, compose components, or accept installer scripts.

Notarization and assessment do not fit that mutation pipeline:

- Notary authenticates a private submission snapshot and returns a durable remote-job reference and digest-bound receipt. An
  `.app` or standalone Mach-O is submitted through a private ZIP transport; that transport digest and the original subject
  digest are both retained. ZIP, DMG, and signed flat package inputs are submitted directly from authenticated private copies.
- Assessment works against an authenticated private snapshot and records the exact unchanged digest before and after local
  `codesign`, `pkgutil`, or `spctl` observations. A policy rejection is an assessment value, not evidence that the tool failed
  to execute.

### Unknown Notary outcomes

Notary submission has a real ambiguity window: upload or registration may have begun before the client receives Apple's
submission identifier. In caller-controlled receipt storage, the operation writes and fsyncs a no-clobber attempt receipt
before network submission. Once Apple returns an identifier, it publishes a separately fsynced, no-clobber submitted sidecar
derived from the attempt ID; the base attempt is never overwritten by the library. If the command is interrupted, times out,
or exits ambiguously without an identifier, the base receipt remains an unknown outcome and blocks blind resubmission.
Operator reconciliation is required.

The upload child remains interruptible. After its complete response is available, response parsing and publication of any
valid returned identifier form a short uninterruptible durability region; a post-child interruption is honored only after the
sidecar commit attempt, so it cannot erase the sole known handle to Apple's remote job.

After an identifier is known, `info`, `wait`, and `log` reread and compare the exact durable base-plus-sidecar state before
querying the same server-side job. A schema-valid submitted sidecar read from storage is data, not authority: queries require
either the value returned by the authenticated live submit or an explicit authenticated in-memory value from
`operatorReconciliationEvidence`. When an operator recovers an ID independently, `reconcile` binds that evidence and ID to
the exact durable attempt without starting another upload; the submitted sidecar records that operator-reconciliation source.
A stored sidecar narrows to the public `SubmittedReceipt` type, while only live `submit` and explicit `reconcile` return the
nominal `Submission` authority accepted by `info`, `wait`, and `log`; the runtime independently enforces the same boundary.
A client-side wait timeout
preserves the identifier because Apple's job continues. Provider response fields that are not yet understood are retained for
diagnosis, but the exact JSON decoder and public status union are provisional until credential-backed accepted, rejected,
warning, timeout, and service-failure fixtures are captured.

The initial submit is no-wait and never uses `--force`. S3 acceleration is an explicit layer decision, and an error never
triggers a fallback submission with the opposite choice. The caller supplies exact `notarytool` and `stapler` paths, normally
resolved out of band through Xcode; the library does not hide a second tool-selection step inside an operation.

## Product-form matrix

| Product form       | Distribution signing subject                    | Notary transport              | Staple target | Local assessment  |
| ------------------ | ----------------------------------------------- | ----------------------------- | ------------- | ----------------- |
| Standalone Mach-O  | executable, Developer ID Application            | private ZIP around executable | no            | execute           |
| `.app`             | nested code inside-out, then bundle             | private ZIP around bundle     | `.app`        | execute           |
| ZIP                | signed inner contents; ZIP itself is not signed | ZIP                           | no            | extracted product |
| DMG                | disk image, Developer ID Application            | DMG                           | DMG           | open              |
| signed flat `.pkg` | package, Developer ID Installer                 | package                       | package       | install           |

Hardened runtime and entitlements are caller-owned policy because they can change JIT, dynamic loading, workers, native
addons, and plugin behavior. Developer ID Application signing requires a canonical uppercase 40-hex SHA-1 certificate fingerprint
and the expected 10-character Team ID, a secure timestamp, an explicit caller-ordered inside-out plan, and no `--deep`. Every
plan item explicitly enables or disables hardened runtime; any entitlements file is itself authenticated input. A standalone
top-level Mach-O also requires an explicit signing identifier. `--deep` is never used to sign; the normalized app and local app
assessment use it only for Apple-recommended recursive verification. Installer construction independently verifies a distinct
Developer ID Installer fingerprint and expected Team ID before giving only that exact fingerprint to `pkgbuild`.

ZIP is a transport, not a signed or stapled outer product. Standalone binaries likewise cannot carry a stapled ticket. DMG or
`.pkg` is therefore preferable when offline ticket evidence is a product requirement. `Assess` rejects ZIP itself; callers
authenticate and assess its extracted product instead.

## Certification cells

The following cells are required before Apple distribution operations are released. Until evidence is attached to an exact
source revision and exact artifact digests, a cell is **not earned**.

| Cell                              | Evidence required                                                                                                                                                                                                                     | Authority established                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| A0 — deterministic implementation | Unit, type, public-surface, architecture, packed-consumer, and failure/interruption tests without credentials                                                                                                                         | API and lifecycle implementation only    |
| A1 — local macOS tools            | Real-tool app, ZIP, and DMG construction/validation plus pre-tool artifact-kind rejection and non-credential assessment behavior on the supported Xcode/macOS floor                                                                   | Local adapter compatibility only         |
| A2 — runtime signing              | Developer-ID-sign Bun, Deno, and Node SEA outputs for separately built macOS x64 and arm64 artifacts; exercise every claimed JIT, worker, dynamic import/load, embedded-asset, and native-addon mode with minimum proven entitlements | Runtime-specific signing compatibility   |
| A3 — app product                  | Construct, sign inside-out, notarize, staple, validate, and launch an `.app`; bind bundle identity, inputs, receipt, and output digests                                                                                               | Direct app-distribution candidate        |
| A4 — ZIP transport                | Archive signed inner content, notarize the ZIP, extract it, and prove explicitly that ZIP has no signing or stapling claim                                                                                                            | ZIP transport behavior                   |
| A5 — disk image                   | Construct, sign, notarize, staple, validate, mount, and launch from a DMG                                                                                                                                                             | Direct drag-distribution candidate       |
| A6 — installer package            | Construct and Developer-ID-Installer-sign a flat package; notarize, staple, validate, install, run, and remove it                                                                                                                     | Direct installer candidate               |
| A7 — Notary recovery              | Accepted, rejected, warning, log, wait-timeout, service-unavailable, interruption, and unknown-outcome recovery by durable submission id, with no blind resubmission                                                                  | Remote-job decoder and recovery behavior |
| A8 — credential boundary          | Prove fingerprint and Team ID matching, distinct Application/Installer authorities, pre-provisioned Notary Keychain Profile provenance, no credential creation/import/unlock/sync, and complete secret redaction                      | Credential selection and containment     |
| A9 — immutability                 | Prove failures never mutate caller inputs, mutations return new authenticated outputs, and observations bind the exact unchanged subject digest                                                                                       | Artifact lifecycle invariant             |

At Apple implementation revision `5718e83907e8e463a16c2dc186e70fa3f5ca90a1`,
the local A0, A1, and A9 gates were green, but no retained exact-revision
receipt or CI record was issued, so none is formally earned. A2 through A8 are
also not earned. No Developer ID or Notary credential was exercised.

Universal binary construction is not one of these cells. x64 and arm64 outputs are independently built and certified. Adding a
universal artifact would require a separately approved operation, digest/provenance model, and test matrix.

### Clean-host Gatekeeper cells

Local `codesign --verify`, `stapler validate`, `pkgutil --check-signature`, and `spctl --assess` results are retained as useful
digest-bound observations, but they do not certify the user's distribution experience. For each claimed product and
architecture, a separate clean supported Mac must acquire the actual release transport with quarantine metadata and exercise
Gatekeeper through the normal launch, open, or install flow. The evidence must bind the downloaded bytes, notarization receipt,
stapled output where supported, host version and architecture, decision, and execution/install/removal result.

Clean-host acceptance is a release certification cell, not a unit test and not a substitute for credential-backed signing and
notarization evidence.

| Clean-host cell | Required exercise on each claimed x64 and arm64 product                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| G-App           | Acquire the quarantined app transport, extract it, pass Gatekeeper, launch it, and exercise its claimed runtime behavior                          |
| G-ZIP           | Acquire and extract the quarantined ZIP, prove there is no ZIP-level staple claim, pass Gatekeeper on its inner product, and run it               |
| G-DMG           | Acquire the quarantined DMG, open it through the normal user flow, validate the stapled product, copy or launch the app as documented, and run it |
| G-PKG           | Acquire the quarantined package, open it through Installer, pass Gatekeeper, install, run, and remove it cleanly                                  |

The frozen v0.5 product includes all four forms, so all four G cells on both
architectures are required: eight clean-host coordinates with no silent
pruning. Narrowing that matrix requires an explicit Stage 0 contract revision.
Rosetta execution does not certify a native x64 build, and no result implies a
universal-binary claim.

### Certification receipt

Each completed cell produces a retained, redacted receipt containing:

- the exact source revision, package version, lockfile digest, and clean-worktree assertion;
- build host OS and architecture plus selected tool paths, versions, and SHA-256 identities;
- input, intermediate transport, signed, stapled, and distributed artifact digests and tree manifests as applicable;
- certificate fingerprint, Team ID, certificate kind and validity interval, without private-key material;
- Notary submission id, subject and transport digests, terminal status, warning summary, and log digest;
- assessment observations and, for G-cells, clean-host OS/architecture, quarantine evidence, user-flow decision, and execution or
  install/removal result; and
- an explicit verdict naming only the operation, artifact kind, architecture, and product form actually certified.

Capability cells such as adverse-response decoding may be bound to the exact implementation revision and supported Apple tool
version. Product cells and every G-cell are byte-specific and must be repeated for the exact artifacts selected for release.

### Certification artifact

Certification is a separate post-candidate workflow, not a field that the
candidate producer or release coordinator may self-assert. Its exact authority is
`.github/workflows/apple-certification.yml` at `refs/heads/main`, event
`workflow_dispatch`, run attempt exactly 1. Protected release inputs bind
`appleCertificationWorkflowRunId`,
`appleCertificationWorkflowRunAttempt`, `appleCertificationArtifactId`, and
`appleCertificationArtifactDigest`.

The Actions artifact is named `effect-build-v0.5.0-apple-certification` and
contains exactly canonical `apple-certification-index.json` and opaque
`effect-build-v0.5.0-apple-certification.bin`. The
`effect-build/apple-certification-index@1` index binds the exact candidate source,
candidate workflow run/attempt, descriptor and payload artifact IDs and REST
digests, candidate-descriptor content digest, complete certification workflow
identity, opaque bundle name/byte length/SHA-256, and verdict `certified`. Its
cell sets are exact: A0 through A9 once each; all 14 row-major distribution
coordinates formed by the seven frozen scenarios on `macos-x64` then
`macos-aarch64`; and all eight row-major `G-App`, `G-ZIP`, `G-DMG`, and `G-PKG`
clean-host coordinates on those two targets. Distribution identifiers use literal
`|` separators and this scenario order:
`developer-id-sign-bun-executable|<target>`,
`developer-id-sign-deno-executable|<target>`,
`developer-id-sign-node-sea-executable|<target>`,
`notarized-stapled-app-bundle|<target>`,
`notarized-zip-transport|<target>`,
`notarized-stapled-disk-image|<target>`, and
`notarized-stapled-installer-package|<target>`, expanding each target in the
frozen `macos-x64`-then-`macos-aarch64` order. Clean-host identifiers are
`<G-product>|<target>` in the frozen product-then-target order. Missing,
duplicate, unexpected, pruned, non-certified, or candidate-mismatched evidence
blocks release.

The index and bundle authenticate the certification envelope, not a frozen A7
payload schema. Exact Notary provider JSON/status decoding and detailed Notary
receipt/reconciliation-evidence body shapes remain opaque to the release
coordinator and provisional through credential-backed A7. A7 may still require a
breaking Notary-shape change before v0.5; changing those opaque bytes necessarily
changes the bundle digest and requires a new certification artifact.

## Merge and release authority

Four statuses must remain distinct:

1. **Implemented** means the code and non-credential verification gates pass in the isolated worktree.
2. **Apple-certified** means the credential-backed and clean-host cells above have evidence for exact artifacts; a certificate
   on one candidate commit does not automatically certify a different merge or release build.
3. **Merged** means an authorized integration placed the change on the target branch and the exact merge SHA passed its gates.
4. **Released** means the separately authorized exact-prepacked coordinator
   consumed the tested fixed-seven candidate, authenticated the retained
   exact-revision Apple evidence, completed every A and G cell, converged all
   seven registry records, and published GitHub last. Merge does not authorize
   publication.

The current release workflow is deliberately quarantined and always fails; it
does not build, pack, sign, notarize, tag, or publish. The future coordinator
must consume the exact prebuilt/tested tarballs and the independently produced
certification artifact, obtain fresh protected `npm` environment approval, and
bind all three Actions wrappers—candidate descriptor, candidate payload, and
certification artifact—into `effect-build/release-escrow@2`. The canonical
`effect-build/release-manifest@2` embeds the certification index plus its exact
run ID/attempt/artifact ID/name/REST digest subject and binds the opaque bundle's
name, byte length, and SHA-256. That `.bin` bundle is the ninth final asset after
the seven tarballs and manifest; escrow is the tenth staged asset and is removed
only after npm convergence. An ad hoc environment-variable or SHA assertion is
not certification authority. Candidate creation, certification, merge, protected
approval, namespace bootstrap, and publication remain distinct authorities.

The deterministic v0.5 package order is `effect-build`, `effect-build-apple`, `effect-build-bun`, `effect-build-deno`,
`effect-build-esbuild`, `effect-build-node-sea`, and `effect-build-rolldown`.

## Explicit exclusions

- Mac App Store signing, sandboxing, provisioning profiles, export, and App Store publication
- universal/fat binary construction or architecture merging
- automatic entitlement selection or runtime-specific entitlement folklore
- `productbuild`, `productsign`, multi-component/component-package composition, or installer scripts
- display-name-only certificate selection
- `codesign --deep` while signing; recursive verification still uses it
- raw secrets in operation input, command lines, logs, errors, receipts, or artifacts
- Notary credential creation, raw Apple ID/password or API-key input, key import/unlock, or iCloud Keychain synchronization
- blind Notary resubmission after interruption or an unknown outcome
- claims that host-local assessment equals quarantined clean-host Gatekeeper acceptance

## Primary sources

- [Creating distribution-signed code for the Mac](https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac)
- [Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [Customizing the notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow)
- [Packaging Mac software for distribution](https://developer.apple.com/documentation/xcode/packaging-mac-software-for-distribution)
- [Node single executable applications](https://nodejs.org/api/single-executable-applications.html)
