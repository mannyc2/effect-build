# effect-build-apple

Build macOS apps, DMGs, and installer packages, then sign, notarize, staple, and
assess them as composable Effect programs. Every product is a core `Artifact.File`
or `Artifact.Directory` with product-specific fields.

```ts
import * as Apple from "effect-build-apple";

const app = yield* Apple.appBundle({
  executable, outdir: "dist/Hello.app", bundleIdentifier: "com.example.hello",
  bundleName: "Hello", version: "1.0.0",
});
const signed = yield* Apple.sign({ artifact: app, certificateSha1 });
const submitted = yield* Apple.notarize({
  artifact: signed, credential: { kind: "keychain", profile: "release" },
});
const acceptance = yield* Apple.Notary.acceptedReference(submitted);
const stapled = yield* Apple.staple({ artifact: signed, acceptance });
yield* Apple.assess({ artifact: stapled });
```

Provide `Apple.layer({ executable?, version? })` and your runtime's platform layer.
The service resolves `xcrun` once; the active Xcode command-line tools select the
native programs, and `producedBy` records that xcrun binary. `tested` selects xcrun
70. Override its version guard explicitly for another toolchain.

`dmg` accepts a signed app and optional layout resources and an Applications link.
`pkg` accepts a signed app, identifier, version, and optional install location.
`sign` takes a certificate SHA-1 fingerprint directly. Apps can declare nested
code and entitlement artifacts; nested code is signed before its containers.
Files use `outfile`, app directories use `outdir`, and signing/stapling default
to replacing the source. Mutation uses sibling staging by default; `atomic: false`
writes directly. Inputs are checked against their recorded hashes before use.

Notarization retains a reference to the submitted signed artifact. Accepted
references can be serialized, and `Notary.info` / `Notary.log` retrieve later
provider results. Apps are zipped privately for submission. Apple ID passwords
use `Redacted`, and tool failures redact credentials from native diagnostics.

Credentialed signing and Apple network operations are experimental: portable
tests exercise real files through scripted native processes; local unsigned app
construction also uses native `plutil`. Run credentialed workflows on macOS with
the required Developer ID certificates and notarization credentials installed.
