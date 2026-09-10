# effect-build-windows

Sign Windows executables and MSIX packages with the Windows SDK SignTool, as Effect programs. A
signed executable keeps its verified target and flows straight into an archive or an installer.

**Experimental.** Native CI compiles, signs, timestamps, verifies, and runs a PE executable with a
temporary self-signed certificate on a disposable runner. Production certificates and native MSIX
signing are unverified: PFX, store, and Trusted Signing credentials pass scripted tests, and the
on-demand [signing workflow](https://github.com/mannyc2/effect-build/blob/main/.github/workflows/signing.yml)
exercises Trusted Signing with real identities but has not yet been run.

```sh
npm install --save-dev --save-exact effect-build-windows@0.7.0 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108 @effect/platform-node-shared@4.0.0-rc.108
```

Signing runs on Windows with the Windows SDK's `signtool.exe`.

## Usage

```ts
import { Effect } from "effect";
import * as Archive from "effect-build-archives";
import * as Windows from "effect-build-windows";

const windows = (executable: Artifact.Executable) =>
  Effect.gen(function*() {
    const signed = yield* Windows.sign({
      artifact: executable,
      kind: "store",
      thumbprint: process.env.SIGNING_THUMBPRINT ?? "",
      timestampUrl: "http://timestamp.digicert.com",
    });
    return yield* Archive.zip({
      entries: [{ artifact: signed, path: "hello.exe" }],
      outfile: "dist/hello_windows-x64.zip",
    });
  }).pipe(Effect.provide(Windows.layer({ executable: process.env.EFFECT_BUILD_SIGNTOOL })));
```

`sign({ artifact, timestampUrl, outfile?, cwd?, description?, descriptionUrl?, atomic?, onExists?, prefix?, ...credential })`
takes a Windows `Artifact.Executable` or an MSIX `Artifact.File` and one credential:

| Credential                                                 | SignTool                                                                                                                                        |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ kind: "store", thumbprint, storeName?, machineStore? }` | A certificate in the Windows store, including hardware tokens and cloud key providers.                                                          |
| `{ kind: "pfx", file, password? }`                         | A PFX file; the password is an Effect `Redacted` and is scrubbed from any error.                                                                |
| `{ kind: "trusted-signing", library, metadata }`           | Azure Trusted Signing: the client library and account metadata paths, passed as `/dlib` and `/dmdf`. Azure identity comes from the environment. |

The operation verifies the input bytes, signs with SHA-256, adds an RFC 3161 SHA-256 timestamp
from `timestampUrl`, verifies the Authenticode signature, and returns the same artifact kind with
fresh `bytes` and `sha256` plus a `signature` record (`fileDigest`, `timestampProtocol`,
`timestampDigest`, `timestampUrl`, `verification`). Executables re-read their header, so `target`
and `format` survive. SignTool warnings (exit code 2) fail the operation: a release signature with
warnings is a failure.

- Executables must end in `.exe` and MSIX files in `.msix`, on both input and output. `outfile`
  defaults to the input path, replaced through staging unless `atomic: false`.
- `timestampUrl` is required and must be HTTP(S); `descriptionUrl` must be HTTPS. Neither may
  carry credentials, a query, or a fragment.
- `cwd` resolves relative output and PFX paths.

## Versions

`Windows.layer({ executable?, version? })` resolves SignTool once, reading its full four-component
version from the binary's resource. `Windows.supported` is `>=10.0.26100 <11.0.0` and
`Windows.tested` is 10.0.26100. String ranges compare the first three components; a predicate
receives all four. See [tools and providers](https://github.com/mannyc2/effect-build/blob/main/docs/providers.md).

## Errors

`Windows.SignError` is `InputInvalid` (tag `WindowsInputInvalid`), `Artifact.ArtifactError`,
`Executable.InspectError`, `Executable.TargetMismatch`, `Tool.Failed`, `Tool.SpawnFailed`, or
`Commit.CommitError`.

[Signing module of the pipeline example](https://github.com/mannyc2/effect-build/blob/main/examples/artifact-pipeline/src/signing.ts) ·
[Recipes](https://github.com/mannyc2/effect-build/blob/main/docs/recipes.md) ·
[Errors and checks](https://github.com/mannyc2/effect-build/blob/main/docs/errors.md)
