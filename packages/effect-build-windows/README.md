# effect-build-windows

Sign one finalized unsigned MSIX package with Windows SignTool. The operation stages verified input bytes, signs and
verifies the candidate, and returns a new atomically finalized `Artifact.HashedFile`.

## Install

```sh
npm install --save-exact effect-build-windows@0.6.3 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108
```

These examples use Effect v4 and its matching Node platform package.

Run on Windows with SignTool installed, an accessible signing certificate, and a reachable RFC 3161 timestamp
service. The source must already be a canonical hashed MSIX artifact, for example from `effect-build-nfpm`.

## Compose signing with certificate-store credentials

This helper accepts your explicit input, certificate-store selection, and SignTool options. Construct them in your
application from its configuration and run the returned Effect at the entry point.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as SignMsix from "effect-build-windows/SignMsix";

export const signPackage = (
  input: SignMsix.SignMsixInput,
  certificate: SignMsix.CertificateStoreOptions,
  tools: SignMsix.LayerOptions,
) => {
  const signer = SignMsix.layer(tools);
  const credentials = SignMsix.certificateStoreCredentialLayer(certificate);
  return SignMsix.signMsix(input).pipe(
    Effect.provide(signer),
    Effect.provide(credentials),
    Effect.provide(NodeServices.layer),
  );
};
```

`new SignMsix.SignMsixInput({...})` requires `source`, a fresh `outfile` ending in `.msix`, and `timestampUrl`.
`new SignMsix.CertificateStoreOptions({...})` selects an exact certificate `thumbprint`, with optional `storeName`
and `machineStore`. `SignMsix.layer({ executable, version })` allows explicit tool selection and a version fact when
the executable's help output cannot supply one.

Alternatively, `pfxCredentialLayer({ file, password })` uses a PFX file and an optional Effect `Redacted` password.
Credential material is process-local and scrubbed from provider-owned typed diagnostics. It is never returned as
artifact provenance or persisted by this package.

The signing policy is SHA-256, with an RFC 3161 SHA-256 timestamp and Authenticode verification. The selected SignTool
bytes are checked before signing and verification. Existing output is rejected. No operation installs a tool, retries
a signing attempt, or owns release continuation or publication.

## More

[Getting started](https://github.com/mannyc2/effect-build/blob/main/docs/getting-started.md) · [API guide](https://github.com/mannyc2/effect-build/blob/main/docs/api.md) · [Error handling](https://github.com/mannyc2/effect-build/blob/main/docs/errors.md) · [Release and credential boundaries](https://github.com/mannyc2/effect-build/blob/main/docs/release-security.md)
