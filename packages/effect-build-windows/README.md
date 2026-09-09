# effect-build-windows

**Experimental:** native Windows CI signs, timestamps, verifies, and runs an executable
with a temporary self-signed certificate. Production certificates and native MSIX
signing remain unverified; portable tests use a scripted SignTool process, and the
on-demand [signing workflow](../../.github/workflows/signing.yml) exercises Trusted Signing.
Import `* as Windows` from `"effect-build-windows"` and
provide platform services plus `Windows.layer({ executable?, version? })` for SignTool.
`supported` is `>=10.0.26100 <11.0.0`. Versions come from the tool's binary resource and remain complete; string
ranges compare three components, while predicates receive the fourth revision too.

`sign` takes a Windows `Artifact.Executable` or an MSIX `Artifact.File`, `timestampUrl`, and one credential:
`kind: "store"` with `thumbprint` (hardware tokens and cloud key providers included), `kind: "pfx"` with `file`
and an optional Effect `Redacted` password, or `kind: "trusted-signing"` with the Azure Trusted Signing client
`library` and account `metadata` paths, which SignTool receives as `/dlib` and `/dmdf` while Azure identity
comes from the environment.
It verifies input bytes, signs with SHA-256, adds an RFC 3161 SHA-256 timestamp,
and checks Authenticode before returning the same artifact kind with fresh hashes
and `signature` fields. Executables retain their verified target and format and
can pass directly into an archive or package.
Source/output paths must end in `.exe` for executables or `.msix` for files;
`outfile` defaults to the input path.
`cwd` resolves relative output and PFX paths; `atomic: false` writes directly.
PFX passwords are scrubbed from native failures. Timestamp URLs require HTTP(S);
optional `descriptionUrl` requires HTTPS. Neither allows credentials/query/fragment.

[Executable → sign → ZIP and MSIX examples](../../examples/artifact-pipeline/src/signing.ts) · [Setup](../../docs/getting-started.md) · [Errors](../../docs/errors.md)
