import { Effect, Redacted } from "effect";
import { Artifact } from "effect-build";
import * as Apple from "effect-build-apple";
import * as Archive from "effect-build-archives";
import * as Bun from "effect-build-bun";
import * as Windows from "effect-build-windows";

// CI typechecks signing examples; running them requires the caller's signing credentials.
export const buildWindowsRelease = (
  executable: Artifact.Executable,
  credential: Windows.Credential,
  timestampUrl: string,
) => Effect.gen(function*() {
  const signed = yield* Windows.sign({ ...credential, artifact: executable, outfile: "dist/signed/example.exe", timestampUrl });
  const archive = yield* Archive.zip({ entries: [{ artifact: signed, path: "example.exe" }], outfile: "dist/example-windows.zip" });
  return { executable: signed, archive };
}).pipe(Effect.provide(Windows.layer({ executable: process.env.EFFECT_BUILD_SIGNTOOL })));

export const signWindowsPackage = (
  artifact: Artifact.File,
  pfxFile: string,
  password: Redacted.Redacted<string>,
  timestampUrl: string,
) => Windows.sign({
  artifact, outfile: "dist/signed.msix", kind: "pfx", file: pfxFile, password, timestampUrl,
}).pipe(Effect.provide(Windows.layer()));

// A CLI ships as a bare Mach-O: hardened runtime plus Bun's JIT entitlements, notarized as a ZIP, assessed rather than stapled.
export const buildDarwinRelease = (
  executable: Artifact.Executable,
  certificateSha1: string,
  credential: Apple.Notary.Credential,
) => Effect.gen(function*() {
  const signed = yield* Apple.sign({ artifact: executable, certificateSha1, outfile: "dist/signed/example", entitlements: Bun.entitlements });
  const submission = yield* Apple.Notary.notarize({ artifact: signed, credential, timeout: "30m" });
  const acceptance = yield* Apple.Notary.acceptedReference(submission);
  const assessed = yield* Apple.assess({ artifact: signed, acceptance });
  const archive = yield* Archive.tarGz({ entries: [{ artifact: assessed, path: "example" }], outfile: "dist/example-darwin.tar.gz" });
  return { executable: assessed, archive, submission };
}).pipe(Effect.provide(Apple.layer()));

export const buildAppleRelease = (
  executable: Artifact.Executable,
  certificateSha1: string,
  credential: Apple.Notary.Credential,
) => Effect.gen(function*() {
  const app = yield* Apple.appBundle({
    executable, outdir: "dist/Example.app", bundleIdentifier: "dev.effect-build.example",
    bundleName: "Example", executableName: "example", version: "1", shortVersion: "1.0.0",
  });
  const signedApp = yield* Apple.sign({ artifact: app, certificateSha1, outdir: "dist/signed/Example.app" });
  const dmg = yield* Apple.dmg({
    artifact: signedApp, outfile: "dist/example.dmg", volumeName: "Example", applicationsLink: true,
  });
  const installer = yield* Apple.pkg({
    artifact: signedApp, outfile: "dist/example.pkg", identifier: "dev.effect-build.example", version: "1.0.0",
  });
  const signedDmg = yield* Apple.sign({ artifact: dmg, certificateSha1 });
  const submission = yield* Apple.Notary.notarize({ artifact: signedDmg, credential });
  const acceptance = yield* Apple.Notary.acceptedReference(submission);
  const stapled = yield* Apple.staple({ artifact: signedDmg, acceptance, outfile: "dist/notarized/example.dmg" });
  const assessed = yield* Apple.assess({ artifact: stapled });
  return { app: signedApp, dmg: assessed, installer, submission };
}).pipe(Effect.provide(Apple.layer()));
