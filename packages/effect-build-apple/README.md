# effect-build-apple

Effect-native mechanisms for direct Developer ID distribution of macOS artifacts.

This package keeps Apple distribution separate from compiler correctness. A compiler provider may perform the ad-hoc repair
required to make its own constructed Mach-O runnable; `effect-build-apple` starts when an application or release system
explicitly chooses an Apple product form and provides the corresponding policy and credentials.

The initial scope is direct distribution outside the Mac App Store. Mac App Store identities, sandboxing, provisioning,
export, and publication are not supported. Universal binary construction is also out of scope: x64 and arm64 inputs remain
separate artifacts unless a later product decision adds an authenticated `lipo`-style operation.

## Modules

| Subpath                               | Responsibility                                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `effect-build-apple/Artifact`         | Authenticated Apple artifact references, digests, manifests, and operation observations              |
| `effect-build-apple/CodeSign`         | Developer ID Application signing with explicit identity, runtime, entitlement, and nesting policy    |
| `effect-build-apple/AppBundle`        | Construct an `.app` candidate from caller-owned bundle identity, executable, resources, and metadata |
| `effect-build-apple/Zip`              | Create and round-trip-verify a transport ZIP around an authenticated app bundle                      |
| `effect-build-apple/DiskImage`        | Construct and verify a DMG candidate                                                                 |
| `effect-build-apple/InstallerPackage` | Construct a directly distributed `.pkg` with a distinct Developer ID Installer identity              |
| `effect-build-apple/Notary`           | Submit, reconcile, wait for, inspect history, and retrieve logs for credentialed notarization jobs   |
| `effect-build-apple/Staple`           | Staple and validate tickets on supported `.app`, DMG, and `.pkg` products                            |
| `effect-build-apple/Assess`           | Record digest-bound local signature and policy observations without mutating the input               |

The package, subpath, operation, and service names are selected for v0.5:

- `CodeSign`: `developerIdApplication`, `sign`, `Signer`, `layer`
- `Artifact`: `observeFile`, `observeTree`, `observeExecutable`, `isFileArtifact`, `isTreeArtifact`, `isKind`, `reference`, `revalidate`,
  `sameIdentity`
- `AppBundle`, `Zip`, and `DiskImage`: `create`, `Creator`, `layer`
- `InstallerPackage`: `developerIdInstaller`, `create`, `Creator`, `layer`
- `Notary`: `submit`, `operatorReconciliationEvidence`, `reconcile`, `info`, `wait`, `log`, `history`,
  `readReceipt`, `submittedReceiptPath`, `Notarizer`, `layer`
- `Staple`: `staple`, `Stapler`, `layer`
- `Assess`: `assess`, `Assessor`, `layer`

The operation names and non-Notary input/result structures are selected for v0.5. The exact Notary response/status decoder and
detailed receipt/reconciliation-evidence shapes remain provisional through certification cell A7, where credential-backed
accepted, rejected, warning, timeout, service-failure, and recovery fixtures must be captured.

The tagged error constructors listed by the generated public-surface contract are intentional public runtime values so Effect
programs can use tag-based recovery. Shared staging failures are expressed through the public `Artifact.LifecycleError` type;
package-internal lifecycle helpers are not part of the exported type graph.

## Lifecycle contract

Every byte-mutating operation authenticates its immutable input, works on a private staged copy, validates the result, and
publishes a new artifact with an algorithm-qualified SHA-256 digest and provenance that binds the input and output. Directory
artifacts use a deterministic, symlink-safe tree manifest. A failure or interruption removes staging and never changes the
caller's input.

File destinations commit atomically without clobbering. Tree destinations atomically replace this operation's own reservation,
so their parent directory is a caller-controlled trust boundary; the package does not claim protection from a hostile local
writer that removes and swaps the reservation between syscalls.

Private staging normalizes away extended attributes, ACLs, and AppleDouble/resource-fork metadata because the authenticated
artifact model does not represent them. Callers that need such metadata must supply it through a future explicit authenticated
contract rather than relying on ambient filesystem state. After signing, the product is normalized through that same boundary
and verified again; app verification is recursive. This rejects script or other signatures that depend on unmodeled extended
attributes instead of embedded Mach-O or bundle signature data.

Signing, container construction, and stapling therefore return new artifacts: none can preserve the producer digest.
Notarization is different. It is a remote job bound to the unchanged subject digest and transport digest, and it returns a
durable submission reference and observations rather than new product bytes. Assessment is also observational and must prove
that the inspected snapshot has the same digest before and after the check.

Tool selection is explicit or resolved once, and the selected executable is authenticated before use. Child processes are
scope-owned with bounded output. Interruption remains interruption; it is not translated into a typed tool failure.
Xcode-owned `notarytool` and `stapler` paths are caller-resolved rather than discovered by a hidden `xcrun` invocation; the
library never installs a tool or falls back to another executable.

`Artifact.observeExecutable` is the one-way bridge from a hashed macOS `effect-build/Artifact.Executable`: it independently
rehashes the committed bytes, binds the provider target to the thin Mach-O CPU type, and rejects missing digest identity, non-macOS
targets, FAT/universal input, or producer metadata mismatches.

## Policy and credential ownership

The caller owns:

- the product form and distribution channel;
- bundle identifiers, versions, resources, and the single-app installer destination;
- hardened runtime policy and every entitlement;
- Developer ID Application and Developer ID Installer identities as separate authorities;
- Notary credentials, retry and incident policy, and receipt retention;
- quarantine and clean-host acceptance; and
- merge, publication, and release authorization.

Developer ID identity selection must be unambiguous; a certificate display name alone is not sufficient. Developer ID
Application signing selects a canonical uppercase 40-hex SHA-1 certificate fingerprint and verifies the expected 10-character Team
ID, uses a secure timestamp, signs nested code inside-out, and never uses `codesign --deep` to sign. Every signing-plan item
states whether hardened runtime is enabled, and entitlements are authenticated caller inputs. Top-level non-bundled Mach-O
inputs require an explicit signing identifier. The normalized signed app and local app assessment use `--deep` only for
recursive verification, as Apple recommends. Installer packages use a separate Developer ID Installer descriptor whose
fingerprint and expected Team ID are independently verified.

v0.5 accepts only a caller-pre-provisioned `notarytool` Keychain Profile reference at layer composition time. The package does
not invoke `store-credentials`, accept raw Apple ID/password or API-key material, import or unlock keys, or coordinate iCloud
Keychain sync. Secret values must not appear in ordinary operation input, command lines, errors, observations, receipts, or
logs. The Notary response/status and durable receipt/evidence structures remain provisional as noted above.

## Product boundaries

- A raw executable can be Developer-ID-signed and submitted through a private ZIP transport, but a ticket cannot be stapled
  to the standalone binary.
- An `.app` has bundle identity and structure. It is not merely a directory around a CLI.
- A ZIP transports signed inner content. The ZIP itself is neither a code-signing subject nor a stapling target.
- A DMG can be signed, notarized, and stapled for drag distribution.
- A directly distributed `.pkg` contains exactly one authenticated `.app`, is built with `pkgbuild --timestamp`, is signed with
  Developer ID Installer, and is independently checked with `pkgutil --check-signature`.

The v0.5 installer boundary intentionally excludes `productbuild`, `productsign`, multi-component products, component package
composition, and installer scripts. Those forms need a separate lifecycle and certification design rather than hidden argv.

Notary submission is never blindly retried after an interrupted or ambiguous upload. In caller-controlled receipt storage, a
fsynced, no-clobber attempt receipt is published before submission; Apple’s returned identifier is committed to a separate
fsynced, no-clobber sidecar derived from the attempt ID. The library never overwrites either record. Later status, wait, and
log operations reread and compare that exact durable state before querying Apple.
The upload child stays interruptible, but after its complete response is available, parsing and durable publication of any
valid returned identifier are briefly uninterruptible so a post-child interruption cannot discard the remote-job handle.
A schema-valid submitted record read from disk is not query authority by itself: authority comes from the live submit result
or an explicit `operatorReconciliationEvidence` value. `reconcile` can bind independently recovered operator evidence to the
exact unknown-outcome attempt without uploading again. A client-side wait timeout does not cancel Apple's server-side job.
At the type level, `readReceipt` exposes stored state as `SubmittedReceipt`; only live `submit` and explicit `reconcile` return
the nominal `Submission` authority accepted by `info`, `wait`, and `log`. The runtime independently enforces that distinction.
Submission is no-wait, never uses `--force`, and requires an explicit S3-acceleration choice with no fallback to the opposite
policy. Stapling additionally requires an authenticated `Accepted` observation bound to the exact unstapled artifact digest.

Local `codesign`, `stapler`, `pkgutil`, and `spctl` checks are useful observations, not clean-host Gatekeeper certification.
See the repository's [Apple distribution guide](https://github.com/mannyc2/effect-build/blob/main/docs/apple-distribution.md)
for the artifact matrix and the credential-backed certification cells required before release.

## Platform services

Library source uses Effect platform services and imports no `node:*` modules. Applications provide one official Effect
platform layer at composition time.

## Primary references

- [Creating distribution-signed code for the Mac](https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac)
- [Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [Customizing the notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow)
- [Packaging Mac software for distribution](https://developer.apple.com/documentation/xcode/packaging-mac-software-for-distribution)
