# effect-build-apple

**Experimental:** credentialed signing and notarization use scripted-process tests;
unsigned app construction is also checked with native macOS tools, and the on-demand
[signing workflow](../../.github/workflows/signing.yml) exercises Developer ID signing
and notarization with real credentials.
`import * as Apple from "effect-build-apple"` for `appBundle`, `sign`, `dmg`, `pkg`,
`notarize`, `staple`, and `assess`. Products refine core file/directory artifacts.
Provide platform services and `Apple.layer({ executable?, version? })` for xcrun 70.
Signing needs macOS and Developer ID certificates; notarization also needs credentials.

`appBundle` takes a Darwin executable and bundle metadata. `sign` takes a certificate
SHA-1 directly; apps may declare nested code and entitlements. `dmg` packages a
signed app; `pkg` packages a signed app or a signed executable, which installs under
`/usr/local/bin` unless `installLocation` says otherwise. Files use `outfile`; apps use `outdir`. Signing/stapling
default to the source path, with staged replacement unless `atomic: false`.
`sign` also takes a standalone Darwin `Artifact.Executable`, the shape a CLI ships in:
it applies the hardened runtime and a secure timestamp, and re-reads the header so
the target survives. Entitlements are a plist artifact or a list of keys;
Bun-compiled executables need `Bun.entitlements`. Signed executables notarize as ZIP
archives through the same `notarize`. Apple issues tickets for standalone binaries
but cannot staple them, so pass the accepted reference to
`assess({ artifact, acceptance })` instead of `staple`; Gatekeeper fetches the ticket.
`notarize` submits a private copy with a keychain, API-key, or Apple ID credential.
Apple ID passwords use Effect `Redacted`. Pass its result through
`Notary.acceptedReference` before `staple`, then `assess` the stapled product.
For recoverable waiting, call `Notary.submit` first, persist the returned
`SubmissionReference` with its exported Effect schema, then call `Notary.wait`.
`notarize` is the convenience composition of those operations; interruption during
the upload itself can still occur before a submission ID is received.
`Notary.info` and `Notary.log` retrieve later results from a saved reference.

[Pipeline example](../../examples/artifact-pipeline/src/signing.ts) · [Setup](../../docs/getting-started.md) · [Errors](../../docs/errors.md)
