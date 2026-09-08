# effect-build-apple

**Experimental:** credentialed signing and notarization use scripted-process tests;
unsigned app construction is also checked with native macOS tools.
`import * as Apple from "effect-build-apple"` for `appBundle`, `sign`, `dmg`, `pkg`,
`notarize`, `staple`, and `assess`. Products refine core file/directory artifacts.
Provide platform services and `Apple.layer({ executable?, version? })` for xcrun 70.
Signing needs macOS and Developer ID certificates; notarization also needs credentials.

`appBundle` takes a Darwin executable and bundle metadata. `sign` takes a certificate
SHA-1 directly; apps may declare nested code and entitlement artifacts. `dmg` and
`pkg` package signed apps. Files use `outfile`; apps use `outdir`. Signing/stapling
default to the source path, with staged replacement unless `atomic: false`.
`notarize` submits a private copy with a keychain, API-key, or Apple ID credential.
Apple ID passwords use Effect `Redacted`. Pass its result through
`Notary.acceptedReference` before `staple`, then `assess` the stapled product.
`Notary.info` and `Notary.log` retrieve later results from a saved reference.

[Pipeline example](../../examples/artifact-pipeline/src/signing.ts) · [Setup](../../docs/getting-started.md) · [Errors](../../docs/errors.md)
