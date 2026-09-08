# effect-build-windows

Experimental: CI checks file behavior with a scripted tool; it does not sign with
real credentials.

```ts
import * as Windows from "effect-build-windows";

const signed = Windows.signMsix({
  artifact: unsignedMsix,
  kind: "store",
  thumbprint: certificateThumbprint,
  timestampUrl: "http://timestamp.digicert.com",
});
```

Provide `Windows.layer()` and platform services. The layer resolves `signtool`
from PATH; `executable` selects another binary. Its native `/?` version is recorded
in full. String `version` ranges compare the first three SDK components; a
predicate receives the complete version, including its fourth revision component.
The experimental baseline is `>=10.0.26100 <11.0.0`.

`signMsix` accepts a core `Artifact.File` with a `.msix` path. It verifies the
input bytes, signs a copy using SHA-256 and an RFC 3161 SHA-256 timestamp, then runs
Authenticode verification before committing the result. The result is an
`Artifact.File` with `signature` recording those settings. `outfile` defaults to
the input path; `cwd` resolves relative output and PFX paths. `atomic: false`
writes directly. Source and output must both use the `.msix` extension.

For a PFX file, pass `kind: "pfx"`, `file`, and an optional Effect `Redacted`
`password`. For the certificate store, pass `kind: "store"`, `thumbprint`, and
optional `storeName` and `machineStore`. PFX passwords are scrubbed from tool
failure arguments and diagnostics. `description` and HTTPS `descriptionUrl` add
signed product information. Timestamp URLs must be HTTP(S); URLs cannot contain
credentials, queries, fragments, or whitespace.
