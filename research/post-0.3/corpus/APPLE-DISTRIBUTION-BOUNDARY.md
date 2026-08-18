# Apple executable correctness and distribution boundary

Date: 2026-08-18.
Status: **official-source research plus architecture inference; credential-backed proof open**.

This study closes the ontology gap in D11. It does not approve an Apple package for 0.4.

## Official-source findings

1. Node's SEA workflow requires macOS signing after executable construction; the documented
   ad-hoc form is `codesign --sign -`. In the legacy injection path, the old signature is removed
   before binary mutation. This is construction correctness, not a Developer ID trust claim.
   Source: [Node single executable applications](https://nodejs.org/api/single-executable-applications.html).
2. `deno compile` distinguishes the ad-hoc signature it applies on macOS from later distribution
   signing. Source: [Deno compile](https://docs.deno.com/runtime/reference/cli/compile/).
3. Bun documents macOS distribution signing as a post-compilation concern and shows runtime
   entitlements that can affect executable behavior. Those entitlements must not be generalized to
   other runtimes without proof. Source:
   [Bun macOS code signing guide](https://bun.com/docs/guides/runtime/codesign-macos-executable).
4. Apple assigns different certificate identities to Developer ID Application and Developer ID
   Installer. They are not interchangeable generic "signing" credentials. Source:
   [Create Developer ID certificates](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/).
5. Hardened Runtime and entitlements change executable security semantics; ordinary modern
   notarization expects valid distribution signing, a secure timestamp, and acceptable
   entitlements. Sources:
   [Creating distribution-signed code](https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac),
   [Notarizing macOS software](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution), and
   [Hardened Runtime](https://developer.apple.com/documentation/security/hardened-runtime).
6. `.app`, `.pkg`, DMG, and ZIP are different product forms. App bundles have a defined bundle
   structure and launch identity; installer packages express installer semantics; notarization and
   stapling support is container-specific. Sources:
   [Bundle structures](https://developer.apple.com/library/archive/documentation/CoreFoundation/Conceptual/CFBundles/BundleTypes/BundleTypes.html),
   [Packaging Mac software](https://developer.apple.com/documentation/xcode/packaging-mac-software-for-distribution), and
   [Customizing notarization](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow).
7. Nested code must be signed in the correct inside-out order. Command-line signature/assessment
   checks are valuable but are not a complete substitute for exercising Gatekeeper on the actual
   distributed product. Sources:
   [TN2206](https://developer.apple.com/library/archive/technotes/tn2206/_index.html) and
   [Code signing procedures](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/Procedures/Procedures.html).

## Architecture inference

Use four separate authorities:

```text
provider assembler
  -> locally valid executable
Apple container construction
  -> app / archive / disk image / installer candidate
distribution trust
  -> identity-signed/stapled candidates plus notarization and assessment observations
release system
  -> approval, clean-host verification, publication, and retention
```

### Provider assembler

The assembler owns only target-specific repair made necessary by its construction algorithm:

1. construct or mutate a staged candidate;
2. remove an invalid prior signature when required;
3. apply an ad-hoc signature when required for a runnable Mach-O;
4. perform target-aware structural/signature validation; and
5. atomically publish one candidate only for a build-host/target cell whose required correctness
   repair is available and proved.

It does not receive Developer ID credentials, choose entitlements, notarize, or claim distribution
identity. A platform/provider where no repair is required performs no signing step. Execution is a
certification responsibility on a compatible target host, not a universal production step: a
cross-target builder may be unable to execute or `codesign` its output. A macOS target produced on
another host is supported only if upstream already emits a valid candidate or a later macOS
correctness-finalization stage is modeled; otherwise that build-host/target cell is rejected before
publication.

### Candidate Apple provider surface

If Apple distribution enters effect-build, prefer provider-native operations rather than one
universal `signArtifact` abstraction:

```text
effect-build-apple/CodeSign
effect-build-apple/AppBundle
effect-build-apple/Zip
effect-build-apple/DiskImage
effect-build-apple/InstallerPackage
effect-build-apple/Notary
effect-build-apple/Staple
effect-build-apple/Assess
```

This is a candidate operation inventory, not an approved export map. Each mutating operation
consumes authenticated immutable input, works on staging, and returns a new authenticated artifact
plus input/output digests and operation observations. Signing, container construction, and stapling
change bytes and cannot preserve the producer digest.

`CodeSign` may distinguish ad-hoc signing from Developer ID Application signing, with artifact-kind
validation. Provider assemblers already own their proven ad-hoc repair, so a public duplicate is
optional. Developer ID Installer belongs to `InstallerPackage` or an explicitly named installer
signing operation, not generic code signing. Certificate selection must be unambiguous; display
names alone may not be sufficient. Hardened runtime and entitlements are caller-owned policy
because they can change JIT, dynamic loading, workers, native addons, and plugin behavior.

Notarization is a credentialed remote job with a submission id and explicit terminal result, not an
instantaneous file transformation and not a byte mutation. Stapling is a later local mutation
available only for supported product forms. `Assess` and signature verification are host-local
observations bound to the exact input digest; they do not return a new artifact.

### Consuming release system

The application/release system retains authority over:

- distribution form and channel;
- bundle identifiers, versions, icons, resources, install destinations, and scripts;
- entitlements and accepted runtime restrictions;
- credential provisioning and approval;
- notarization retry/incident policy;
- quarantine and clean-host acceptance;
- publication; and
- release-receipt retention.

The library may expose mechanisms, but it must not silently choose these policies.

## Product-form distinctions

- A raw executable is an executable result, not automatically a distributable Apple product.
- `.app` creates app-bundle identity and structure; it is not merely a directory around a CLI.
- A ZIP transports signed inner contents but is not itself a code-signing subject and cannot carry
  a stapled ticket as a ZIP container.
- A DMG may be signed, notarized, and stapled and is suitable for drag distribution.
- A directly distributed `.pkg` uses Developer ID Installer and is appropriate for installation
  locations, multiple components, privileges, or installer logic.
- Apple may issue a notarization ticket for a standalone binary, but the ticket cannot currently be
  stapled to that standalone binary. This and ZIP's no-staple boundary materially favor DMG or
  `.pkg` when offline Gatekeeper evidence matters.

Choosing one is product policy. A universal "Apple package" result would erase these distinctions.
The inventory above is explicitly for direct Developer ID distribution. Mac App Store distribution
would be a separate product scope with different signing identities, sandbox/provisioning/export
requirements, and publication authority.

## Credential-backed proof still required

Before any distribution operation ships:

1. exercise Node SEA ad-hoc correctness on macOS arm64 and x64 across supported Node relations and
   test macOS targets requested from Linux/Windows build hosts;
2. Developer-ID-sign Bun, Deno, and Node outputs with the minimum proven per-provider entitlements;
3. exercise JIT, workers, dynamic imports/loading, embedded assets, and native addons where claimed;
4. construct and launch a quarantined signed/notarized `.app`;
5. construct, sign, notarize, staple, install, run, and remove a `.pkg`;
6. construct and verify a signed/notarized/stapled DMG and test ZIP behavior separately;
7. record Notary acceptance, rejection, warnings, logs, timeout, service-unavailable, and
   unknown-outcome recovery by submission id, with no blind resubmission;
8. prove credential provenance and the keychain versus Notary API authority boundary;
9. combine strict `codesign`/`spctl` observations with actual clean-host quarantined Gatekeeper
   launch/install; and
10. prove that failure never mutates caller input, each successful mutating operation returns a new
    digest-addressed artifact, and notarization/assessment return observations bound to the exact
    unchanged input digest.

## Remaining maintainer choice

The architecture establishes the boundary. The maintainer still chooses whether Apple distribution
is a 0.4 product, a later first-party `effect-build-apple` package, or intentionally left to release
systems. The recommended 0.4 default is provider-specific correctness repair only while the
credential-backed program runs in parallel. If an Apple package is later selected, its initial
scope should explicitly choose direct Developer ID distribution or separately fund Mac App Store
research; this report recommends direct distribution only for the first package.
