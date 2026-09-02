# effect-build-apple

Effect-native direct Developer ID distribution operations for macOS. The
package keeps the product forms separate instead of erasing their different
Apple semantics behind a generic signing or packaging function.

## Operations

- `AppBundle.buildAppBundles` constructs exactly one arm64 and one x64 `.app`,
  from canonical `HashedExecutable` and `HashedFile` inputs. It rejects wrong-target,
  swapped, non-Mach-O, universal/fat, mutable, and colliding inputs before
  publication, then validates each `Info.plist` with `plutil`.
- `DiskImage.createDiskImages` constructs exactly one arm64 and one x64 UDZO
  disk image from exact `DeveloperIdApplicationBundle` manifests and finalized
  layout files. It strictly re-verifies each private app snapshot with
  `codesign`, rejects layout collisions, and performs verify plus read-only
  attach checks with `hdiutil`, including exact mounted app-manifest and layout-file
  revalidation; detach failure rejects publication.
- `InstallerPackage.buildInstallerPackages` uses `pkgbuild` and `productbuild`
  to construct exactly two unsigned installer packages from private,
  manifest-verified Developer-ID app snapshots under their original `.app`
  names, strictly re-verifies them with `codesign`, then inspects their payloads
  with `pkgutil`.
- `CodeSign.signApp` applies a Developer ID Application identity to an exact app
  manifest, stages finalized app and nested entitlements, signs nested code
  deepest-first, and performs strict verification. `signDiskImage` applies the
  application identity to a UDIF image. `signInstallerPackage` separately uses
  a Developer ID Installer identity and checks the package signature. These
  operations return distinct nominal artifact states carrying signer and native
  verifier facts; generic core artifacts cannot enter downstream release APIs.
- `Notary.submit`, `Notary.submitApp`, `Notary.info`, and `Notary.log` expose
  credential-free, digest-bound provider facts. File submission is a closed
  union of Developer-ID-signed DMG and pkg artifacts; ZIP transport is private
  to `submitApp`. `submitApp` creates a ZIP from
  a symlink-aware private app snapshot, extracts it, and requires its manifest
  to equal the app before submitting the exact ZIP bytes. A submit whose
  response is lost fails as `SubmissionOutcomeUnknown`; it is never blindly
  retried.
- `Notary.acceptedReference` is the only narrowing from provider results to
  stapling evidence. `Staple.stapleApp` and `Staple.stapleFile` require that
  evidence to match the exact pre-staple bundle manifest or file bytes, then
  natively re-verify, staple, validate, and publish nominal stapled artifacts.
- `Assess.assess` performs product-specific Gatekeeper assessment followed by
  strict `codesign` or `pkgutil` verification against private exact snapshots.
  It accepts only stapled artifact states and returns `GatekeeperAccepted`.
  Two-architecture producers validate both inputs before publication and remove
  the first newly published result if the second tool operation fails. Callers
  must still choose distinct, non-existing output paths.

Every tool executable is resolved once, observed, and reauthenticated
immediately before every launch. Notarization and stapling select the actual
`notarytool` and `stapler` executables rather than trusting `xcrun` to route to
an unauthenticated binary. Layer options require an exact caller-adjudicated
version fact because several Apple system tools do not expose independent
semantic versions. The package probes tools when constructing a layer but has
no hidden version registry, admission range, or warning policy; the release
acceptance matrix owns supported-build evidence.

## Credentials and durable state

Developer ID Application and Developer ID Installer identities are distinct
process-local services selected by exact certificate SHA-1. Notary credentials
are also process-local. Prefer a pre-created keychain profile so secret bytes
never enter the process command line; the API-key layer passes only the private
key file coordinate. Typed failures scrub identity and credential coordinates.
No operation returns these services or stores secret keychain/API-key
coordinates. Signed artifacts deliberately retain the public certificate SHA-1
and exact signing/verifier tool facts as durable provenance. Every product,
submission, acceptance reference, stapling ticket, and assessment also retains
its exact `arm64` or `x64` architecture; crossing architecture slots is a typed
pre-publication failure.

Persist `Notary.Submission` in the release journal, including its optional
`stapleTarget` and `transportTool`, its architecture, and its
`submissionTool`, then construct a `SubmissionReference` from all of those
durable fields on a fresh runner. `info` and `log` correlate Apple's response
to that exact ID and preserve the submitted transport, stapling-target, and
submission-tool identities separately from the acceptance-observation tool.
This package deliberately does not create a second workflow journal and does
not conceal the response-loss gap before the first submission ID is recorded.

## Acceptance boundary

The package-local fake-runner suite proves exact argv, held-byte boundaries,
symlink-chain preservation, ZIP-to-app projection, collision rejection,
rollback, typed failures, provider result facts, runner-two resumption,
acceptance correlation, and secret non-persistence. It does not claim Apple
acceptance.

The v0.6.0 release includes this npm API/library package, but no
credential-backed Apple artifact. Developer ID signing, notarization,
stapling, Gatekeeper, quarantined clean-host execution, and the durable AWS
Notary journal were not run and have not passed. They are explicitly excluded
from v0.6.0 readiness and outputs. Producing signed/notarized App, DMG, or PKG
artifacts requires a later, separately qualified release with its own
credentials, journal, hosts, evidence, and publication decision.
