# effect-build-apple

Build macOS app bundles, disk images, and installers; sign, notarize, staple, and assess them and
bare executables with Apple's tools, as Effect programs. Products refine the core artifacts, so a
signed CLI goes into an archive and a signed app into a DMG with the same API.

**Experimental.** Unsigned app construction is checked with native macOS tools, and the
credentialed paths (signing, notarization, stapling, assessment) run through scripted processes.
The on-demand [signing workflow](https://github.com/mannyc2/effect-build/blob/main/.github/workflows/signing.yml)
signs, notarizes, and assesses a compiled CLI with Developer ID credentials but has not yet been
run.

```sh
npm install --save-dev --save-exact effect-build-apple@0.7.0 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108 @effect/platform-node-shared@4.0.0-rc.108
```

Everything runs on macOS through `xcrun` from the Xcode command-line tools. Signing needs a
Developer ID identity in a keychain; notarization needs App Store Connect credentials.

## Ship a CLI

A bare Mach-O executable signs with the hardened runtime and a secure timestamp, notarizes as a
ZIP, and is assessed with its accepted submission: Apple issues tickets for standalone binaries
but cannot staple one to them, so Gatekeeper fetches it.

```ts
import { Effect } from "effect";
import * as Apple from "effect-build-apple";
import * as Archive from "effect-build-archives";
import * as Bun from "effect-build-bun";

const darwin = (executable: Artifact.Executable, certificateSha1: string, credential: Apple.Notary.Credential) =>
  Effect.gen(function*() {
    const signed = yield* Apple.sign({ artifact: executable, certificateSha1, entitlements: Bun.entitlements });
    const submission = yield* Apple.notarize({ artifact: signed, credential, timeout: "30m" });
    const acceptance = yield* Apple.Notary.acceptedReference(submission);
    const assessed = yield* Apple.assess({ artifact: signed, acceptance });
    const installer = yield* Apple.pkg({
      artifact: signed,
      outfile: "dist/hello.pkg",
      identifier: "dev.example.hello",
      version: "1.0.0",
    });
    const archive = yield* Archive.tarGz({
      entries: [{ artifact: assessed, path: "hello" }],
      outfile: "dist/hello_darwin-arm64.tar.gz",
    });
    return { archive, installer };
  }).pipe(Effect.provide(Apple.layer()));
```

Bun-compiled executables need `Bun.entitlements`; other entitlements come as a plist artifact or
a list of keys. A PKG of a signed executable installs it under `/usr/local/bin` unless
`installLocation` says otherwise.

## Ship an app

`appBundle` builds `Example.app` around a Darwin executable; `sign` signs it; `dmg` and `pkg`
package it; the DMG is signed, notarized, stapled, and assessed. The
[signing module](https://github.com/mannyc2/effect-build/blob/main/examples/artifact-pipeline/src/signing.ts)
of the pipeline example has this flow in full.

```ts
const app = (executable: Artifact.Executable, certificateSha1: string, credential: Apple.Notary.Credential) =>
  Effect.gen(function*() {
    const app = yield* Apple.appBundle({
      executable,
      outdir: "dist/Example.app",
      bundleIdentifier: "dev.example.app",
      bundleName: "Example",
      version: "1",
      shortVersion: "1.0.0",
    });
    const signedApp = yield* Apple.sign({ artifact: app, certificateSha1, outdir: "dist/signed/Example.app" });
    const dmg = yield* Apple.dmg({
      artifact: signedApp,
      outfile: "dist/example.dmg",
      volumeName: "Example",
      applicationsLink: true,
    });
    const signedDmg = yield* Apple.sign({ artifact: dmg, certificateSha1 });
    const submission = yield* Apple.notarize({ artifact: signedDmg, credential });
    const acceptance = yield* Apple.Notary.acceptedReference(submission);
    const stapled = yield* Apple.staple({ artifact: signedDmg, acceptance, outfile: "dist/notarized/example.dmg" });
    return yield* Apple.assess({ artifact: stapled });
  }).pipe(Effect.provide(Apple.layer()));
```

## Operations

| Operation                                                                                                                                                         | Returns                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `appBundle({ executable, outdir, bundleIdentifier, bundleName, version, shortVersion?, displayName?, executableName?, minimumSystemVersion?, resources?, cwd? })` | `App`, a directory artifact with `product: "app"` |
| `sign({ artifact: App, certificateSha1, outdir?, entitlements?, nestedCode? })`                                                                                   | `SignedApp`                                       |
| `sign({ artifact: Dmg \| Pkg, certificateSha1, outfile? })`                                                                                                       | `SignedDmg`, `SignedPkg`                          |
| `sign({ artifact: Artifact.Executable, certificateSha1, outfile?, entitlements? })`                                                                               | `SignedExecutable`                                |
| `dmg({ artifact: SignedApp, outfile, volumeName, layout?, applicationsLink?, cwd? })`                                                                             | `Dmg`, a file artifact with `product: "dmg"`      |
| `pkg({ artifact: SignedApp \| SignedExecutable, outfile, identifier, version, installLocation?, cwd? })`                                                          | `Pkg`, a file artifact with `product: "pkg"`      |
| `notarize({ artifact, credential, timeout?, cwd? })`                                                                                                              | `Notary.Submission` with its status               |
| `Notary.submit`, `Notary.wait`, `Notary.info`, `Notary.log`                                                                                                       | The steps `notarize` composes, individually       |
| `Notary.acceptedReference(result)`                                                                                                                                | `AcceptedReference`, or `NotaryResultNotAccepted` |
| `staple({ artifact: SignedApp \| SignedDmg \| SignedPkg, acceptance, outdir? \| outfile? })`                                                                      | `StapledApp`, `StapledDmg`, `StapledPkg`          |
| `assess({ artifact: Stapled })`, `assess({ artifact: SignedExecutable, acceptance })`                                                                             | The same artifact, after Gatekeeper accepts it    |

Files take `outfile` and apps `outdir`; every producing operation also takes `atomic`, `onExists`,
and `prefix`. `sign` and `staple` default to the source path, replaced through staging unless
`atomic: false`. Apps and executables sign with the hardened runtime; every signature carries a
secure timestamp. Signed executables re-read their header, so `target` survives. Copied app trees
preserve framework symlinks. Universal (fat) Mach-O inputs are unsupported.

## Records

Products and signatures are refinements of the core artifacts: `SignedApp` is an
`Artifact.Directory` plus `product` and `signature: { certificateSha1, secureTimestamp, hardenedRuntime }`,
and stapled products add `ticket`. `Artifact.encode` drops these fields on purpose; persist them
with the exported schemas (`Apple.Model.SignedExecutable`, `Apple.Notary.Submission`, and the
rest) through `Schema.encodeSync`.

## Identities and credentials

- `certificateSha1` is the SHA-1 fingerprint of the signing identity in your keychain. Names are
  ambiguous and ad hoc signatures cannot be notarized, so only fingerprints are accepted.
- `Notary.Credential` is `{ kind: "keychain", profile, keychain? }` for a stored notarytool
  profile, `{ kind: "api-key", keyFile, keyId, issuer }` for an App Store Connect API key, or
  `{ kind: "apple-id", appleId, teamId, password }` with the password as an Effect `Redacted`.
- Apps and executables upload as ZIP archives; DMGs and PKGs upload as themselves.
- `notarize` submits and waits. When an interruption must be recoverable, call `Notary.submit`,
  persist the `SubmissionReference` with its schema, and call `Notary.wait` later; `Notary.info`
  and `Notary.log` retrieve results for a saved reference. `timeout` is a native notarytool
  duration such as `"30m"`, and a timeout does not cancel Apple's processing.

## Versions and errors

`Apple.layer({ executable?, version? })` resolves `xcrun` once; native commands come from the
active Xcode tools. `Apple.supported` is `>=70.0.0 <71.0.0` and `Apple.tested` is 70.0.0. Errors
are `InputInvalid` (tag `AppleInputInvalid`), `Artifact.ArtifactError`, `Executable.InspectError`,
`Executable.TargetMismatch`, `Tool.Failed`, `Tool.SpawnFailed`, `Commit.CommitError`,
`Notary.ResultNotAccepted` (a pending or rejected submission, status preserved), and
`Notary.ResponseInvalid` (malformed notarytool JSON).

[Recipes](https://github.com/mannyc2/effect-build/blob/main/docs/recipes.md) ·
[Compatibility](https://github.com/mannyc2/effect-build/blob/main/docs/compatibility.md) ·
[Errors and checks](https://github.com/mannyc2/effect-build/blob/main/docs/errors.md)
