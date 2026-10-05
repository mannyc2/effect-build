import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Redacted, Sink } from "effect";
import { SignTool } from "effect-build-windows";
import * as Tool from "effect-build/Tool";
import { ChildProcess } from "effect/process";

const native = SignTool.layer({ executable: process.env.EFFECT_BUILD_SIGNTOOL }).pipe(
  Layer.provideMerge(NodeServices.layer),
);

// CertificateRequest exports a temporary PFX directly; no certificate store is changed.
const certificate = [
  "$ErrorActionPreference = 'Stop'",
  "$rsa = [System.Security.Cryptography.RSA]::Create()",
  "$rsa.KeySize = 2048",
  "$request = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=Effect Build Integration', $rsa, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)",
  "$request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false, $false, 0, $true))",
  "$request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new([System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature, $true))",
  "$usage = [System.Security.Cryptography.OidCollection]::new()",
  "$null = $usage.Add([System.Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.3'))",
  "$request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($usage, $true))",
  "$cert = $request.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-5), [DateTimeOffset]::UtcNow.AddHours(1))",
  "[System.IO.File]::WriteAllBytes($env:EFFECT_BUILD_TEST_PFX_FILE, $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $env:EFFECT_BUILD_TEST_PFX_PASSWORD))",
  "$cert.Dispose()",
  "$rsa.Dispose()",
].join("; ");

it.live(
  "real SignTool signs with a temporary PFX and reports its untrusted chain",
  () =>
    Layer.build(native).pipe(Effect.flatMap((context) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-signtool-pfx-" });
        const file = path.join(root, "signed-node.exe");
        const pfx = path.join(root, "fixture.pfx");
        const password = Redacted.make("effect-build-fixture-password");
        yield* fs.copyFile(process.execPath, file);
        const unsigned = yield* fs.readFile(file);
        const powershell = yield* Tool.make("powershell.exe", { executable: process.env.EFFECT_BUILD_POWERSHELL });
        yield* powershell.run(
          ChildProcess.make(powershell.executable, [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            certificate,
          ], {
            stdin: "ignore",
            env: { EFFECT_BUILD_TEST_PFX_FILE: pfx, EFFECT_BUILD_TEST_PFX_PASSWORD: Redacted.value(password) },
            extendEnv: true,
          }),
          Sink.drain,
          { redact: [password] },
        );
        assert.isAbove((yield* fs.readFile(pfx)).length, 0);
        const signtool = yield* SignTool;
        assert.strictEqual(
          yield* signtool.sign({ path: file, credential: { _tag: "Pfx", file: pfx, password } }),
          file,
        );
        assert.notDeepEqual(yield* fs.readFile(file), unsigned);
        const verification = yield* Effect.flip(signtool.verify({ path: file }));
        assert.strictEqual(verification.reason._tag, "Exit");
        assert.include(verification.message.toLowerCase(), "not trusted");
        assert.notInclude(verification.message, Redacted.value(password));
      }).pipe(Effect.provideContext(context))
    )),
  60_000,
);

it.live(
  "real SignTool keeps native signing and verification failures",
  () =>
    Layer.build(native).pipe(Effect.flatMap((context) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-signtool-" });
        const file = path.join(root, "unsigned.exe");
        yield* fs.writeFileString(file, "not a PE image");
        const signtool = yield* SignTool;
        const signing = yield* Effect.flip(
          signtool.sign({ path: file, credential: { _tag: "Pfx", file: path.join(root, "missing.pfx") } }),
        );
        assert.strictEqual(signing.reason._tag, "Exit");
        assert.isAbove(signing.message.length, 0);
        const verification = yield* Effect.flip(signtool.verify({ path: file }));
        assert.strictEqual(verification.reason._tag, "Exit");
      }).pipe(Effect.provideContext(context))
    )),
  30_000,
);
