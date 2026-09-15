# effect-build-apple

Build macOS app bundles, disk images, and installers; sign, notarize, staple, and assess them
with Apple's tools, as Effect programs. Local products refine core artifact records.

**Experimental.** Unsigned app construction is checked with native macOS tools. Credentialed
operations run through scripted processes; the on-demand
[signing workflow](https://github.com/mannyc2/effect-build/blob/main/.github/workflows/signing.yml)
has not yet run with Developer ID credentials.

```sh
npm install --save-dev --save-exact effect-build-apple@0.8.0 effect@4.0.0-rc.115 @effect/platform-node@4.0.0-rc.115 @effect/platform-node-shared@4.0.0-rc.115
```

Everything runs through `xcrun` from the Xcode command-line tools on macOS. Signing needs a
Developer ID identity in a keychain; notarization needs App Store Connect credentials.

## Choose distribution checks explicitly

Signing, packaging, stapling, and Gatekeeper assessment are independent operations. None
requires a previous wrapper receipt or a content hash. Verification runs only when you call
`verifySignature`, `validateTicket`, or `Artifact.verify` yourself.

```ts
import { Effect } from "effect";
import { Artifact } from "effect-build";
import * as Apple from "effect-build-apple";
import * as Archive from "effect-build-archives";
import * as Bun from "effect-build-bun";

const darwin = (executable: Artifact.Executable, certificateSha1: string, credential: Apple.Notary.Credential) =>
  Effect.gen(function*() {
    const signed = yield* Apple.sign({ artifact: executable, certificateSha1, entitlements: Bun.entitlements });
    yield* Apple.verifySignature({ artifact: signed });
    const result = yield* Apple.Notary.notarize({ artifact: signed, credential, timeout: "30m" });
    yield* Apple.Notary.expectAccepted(result);
    yield* Apple.assess({ artifact: signed });
    return yield* Archive.tarGz({
      entries: [{ artifact: signed, path: "hello" }],
      outfile: "dist/hello_darwin-arm64.tar.gz",
    });
  }).pipe(Effect.provide(Apple.layer()));
```

Provide platform services and a runtime at application composition time. Bun-compiled
executables need `Bun.entitlements`; other entitlements come as a plist artifact or a list of
keys. A bare executable uploads as a ZIP and can be assessed, but cannot be stapled.

## Package and staple an app

`appBundle` builds an app around a Darwin executable. `dmg` and `pkg` accept unsigned apps;
`pkg` also accepts a standalone Darwin executable. Choose signing and verification in the
release program when the distribution requires them.

```ts
const image = (app: Apple.App, certificateSha1: string, credential: Apple.Notary.Credential) =>
  Effect.gen(function*() {
    const signedApp = yield* Apple.sign({ artifact: app, certificateSha1 });
    yield* Apple.verifySignature({ artifact: signedApp });
    const dmg = yield* Apple.dmg({ artifact: signedApp, outfile: "dist/example.dmg", volumeName: "Example" });
    const signedDmg = yield* Apple.sign({ artifact: dmg, certificateSha1 });
    yield* Apple.verifySignature({ artifact: signedDmg });
    const result = yield* Apple.Notary.notarize({ artifact: signedDmg, credential });
    yield* Apple.Notary.expectAccepted(result);
    const stapled = yield* Apple.staple({ artifact: signedDmg, outfile: "dist/notarized/example.dmg" });
    yield* Apple.validateTicket({ artifact: stapled });
    return yield* Apple.assess({ artifact: stapled });
  }).pipe(Effect.provide(Apple.layer()));
```

Files take `outfile` and apps `outdir`. Producers accept `atomic`, `onExists`, and `prefix`.
`sign` and `staple` default to the source path, replaced through staging unless `atomic: false`.
Compose checks inside an outer `Commit.atomic` producer when those checks must precede
replacement of the release directory. The complete
[signing example](https://github.com/mannyc2/effect-build/blob/main/examples/artifact-pipeline/src/signing.ts)
includes CLI, app, and Windows flows.

## Operations

| Operation | Input and result |
| --- | --- |
| `appBundle` | Darwin executable and resources → `App` |
| `dmg` | `App` → `Dmg` |
| `pkg` | `App` or Darwin `Artifact.Executable` → `Pkg` |
| `sign` | Product or Darwin executable → its signed refinement |
| `verifySignature({ artifact })` | Product or executable → the same record after native signature verification |
| `staple` | `App`, `Dmg`, or `Pkg` → a fresh product record |
| `validateTicket({ artifact })` | Product → the same record after `stapler validate` |
| `assess({ artifact })` | Product or Darwin executable → the same record after Gatekeeper assessment |
| `Notary.submit` | Product or Darwin executable → Apple's `SubmissionId` |
| `Notary.wait`, `Notary.info`, `Notary.log` | Submission ID and credentials → native status and details |
| `Notary.notarize` | Convenience composition of submit and wait |
| `Notary.expectAccepted(result)` | Explicitly fail unless the result is accepted |

Signing currently selects certificate fingerprints, secure timestamps, and hardened runtime
for apps/executables. Its `signature` field describes the signing operation; signing does not
run a second verification command. Executables retain their declared target through a header
check after signing. Copied app trees preserve framework symlinks. Universal Mach-O inputs
are unsupported.

A PKG installs an app under `/Applications` or an executable under `/usr/local/bin`, unless
`installLocation` says otherwise. Resource layouts reject exact conflicts and unsafe paths;
case or Unicode spelling conflicts fail only when the destination filesystem conflates them.
Call `Layout.validatePortable` explicitly when the release must reject such spellings on all hosts.

## Resume notarization by native ID

No local artifact record is needed to inspect or wait for a job created elsewhere.

```ts
const resume = (submissionId: Apple.Notary.SubmissionId, credential: Apple.Notary.Credential) =>
  Apple.Notary.wait({ submissionId, credential, timeout: "30m" }).pipe(
    Effect.flatMap(Apple.Notary.expectAccepted),
    Effect.provide(Apple.layer()),
  );
```

`submit` uploads current contents. Apps/executables are packed into a scoped temporary ZIP;
DMGs and PKGs upload directly. Persist the returned ID before waiting when interruption recovery
matters. A wait timeout does not cancel Apple's processing. Results preserve pending/rejected
statuses until the caller explicitly invokes `expectAccepted`.

## Records and credentials

`App`, `Dmg`, and `Pkg` add a `product` field to core artifacts. Signed records add `signature`.
Stapling changes bytes and returns a fresh base product without retaining an old digest,
signature record, or receipt. `Artifact.encode` projects core fields only; persist richer
records using their exported Effect schemas, such as `Apple.SignedExecutable` or
`Apple.Notary.Submission`. Content identity remains an explicit `Artifact.withSha256` operation.

- `certificateSha1` is a 40-digit certificate fingerprint.
- `Notary.Credential` selects a keychain profile, an App Store Connect API key, or an Apple ID.
  Apple ID passwords use Effect `Redacted` values.
- `Apple.layer({ executable?, version? })` resolves `xcrun` once. Native commands come from the
  active Xcode tools. Supported xcrun versions are `>=70.0.0 <71.0.0`; 70.0.0 is tested.
- Errors include `Tool.InputInvalid`, `Artifact.ArtifactError`, executable inspection/target
  errors, native tool failures, and commit failures. Notary response decoding reports
  `Notary.ResponseInvalid`; `expectAccepted` can fail with `Notary.ResultNotAccepted`.

[Recipes](https://github.com/mannyc2/effect-build/blob/main/docs/recipes.md) ·
[Compatibility](https://github.com/mannyc2/effect-build/blob/main/docs/compatibility.md)
