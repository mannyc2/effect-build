# effect-build-windows

Effect-native Windows artifact operations. `SignMsix` copies an unsigned MSIX
into private same-parent staging, Authenticode-signs it with SHA-256, requests
an RFC 3161 SHA-256 timestamp, verifies it with the Authenticode policy and
`/tw` (so an absent timestamp is a failing SignTool warning), and atomically
publishes one canonical `FileArtifact`.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect, Layer, Redacted } from "effect";
import * as SignMsix from "effect-build-windows/SignMsix";
import type * as Artifact from "effect-build/Artifact";

declare const unsignedMsix: Artifact.FileArtifact; // finalized nFPM result

const credential = SignMsix.pfxCredentialLayer({
  file: "certificate.pfx",
  password: Redacted.make("process-local-secret"),
});

const artifact = await Effect.runPromise(
  SignMsix.signMsix(
    new SignMsix.SignMsixInput({
      source: unsignedMsix,
      outfile: "dist/app.msix",
      timestampUrl: "https://timestamp.example.test/rfc3161",
    }),
  ).pipe(
    Effect.provide(
      SignMsix.layer({ executable: "C:/Windows Kits/signtool.exe" }).pipe(
        Layer.provide(credential),
      ),
    ),
    Effect.provide(NodeServices.layer),
  ),
);
```

The alternative certificate-store layer selects one certificate by exact
thumbprint and supports the native store name and machine-store switches.
The unsigned input is re-verified against its finalized byte identity before
SignTool receives a private copy. PFX paths/passwords and certificate-store coordinates remain process-local
and are scrubbed from typed tool diagnostics. The integration never installs,
retries, falls back, or returns credentials.
