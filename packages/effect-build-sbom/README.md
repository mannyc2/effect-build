# effect-build-sbom

Provide `Sbom.layer({ executable?, version? })` and platform services for Syft.
`generate({ subject, format, outfile })` accepts any core artifact as its subject.
`tested` is `>=1.50.0 <2.0.0`. Output is `Artifact.File`: use `format: "spdx-json"`
for SPDX 2.3 JSON or `format: "cyclonedx-json"` for CycloneDX 1.6 JSON.
Subject bytes are checked before Syft scans the original path to preserve
filename-based detection. Empty package lists are valid.
`cwd` resolves relative output paths, and `outfile` can use any filename.

[Setup and atomic output](../../docs/getting-started.md) · [Providers](../../docs/providers.md) · [Errors](../../docs/errors.md)
