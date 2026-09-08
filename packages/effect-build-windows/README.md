# effect-build-windows

**Experimental:** tests use a scripted SignTool process; real credentialed signing
is not exercised in CI. Import `* as Windows` from `"effect-build-windows"` and
provide platform services plus `Windows.layer({ executable?, version? })` for SignTool.
The SDK baseline is `>=10.0.26100 <11.0.0`. Native versions remain complete; string
ranges compare three components, while predicates receive the fourth revision too.

`signMsix` takes an `Artifact.File`, `timestampUrl`, and either `kind: "store"` with
`thumbprint` or `kind: "pfx"` with `file` and optional Effect `Redacted` password.
It verifies input bytes, signs with SHA-256, adds an RFC 3161 SHA-256 timestamp,
and checks Authenticode before returning a file with `signature` fields.
Source/output paths must end in `.msix`; `outfile` defaults to the input path.
`cwd` resolves relative output and PFX paths; `atomic: false` writes directly.
PFX passwords are scrubbed from native failures. Timestamp URLs require HTTP(S);
optional `descriptionUrl` requires HTTPS. Neither allows credentials/query/fragment.

[Pipeline example](../../examples/artifact-pipeline/src/signing.ts) · [Setup](../../docs/getting-started.md) · [Errors](../../docs/errors.md)
