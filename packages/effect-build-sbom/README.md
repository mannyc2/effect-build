# effect-build-sbom

Provide `Sbom.layer({ executable?, version? })` and platform services for Syft.
`generate({ subject, format, outfile })` accepts any core artifact as its subject.
`supported` is `>=1.50.0 <2.0.0`; CI tests 1.50.0. Output is `Artifact.File`: use `format: "spdx-json"`
for SPDX 2.3 JSON or `format: "cyclonedx-json"` for CycloneDX 1.6 JSON.
Subject bytes are checked before Syft scans the original path to preserve
filename-based detection. A successful scan means Syft wrote an inventory of
packages it could discover; it does not establish a complete dependency inventory.
A compiled TypeScript executable can yield zero packages even when it embeds
dependencies such as Effect. Empty package lists are valid.

Supply `source` with a verified source directory or named lockfile to inventory
source dependencies associated with the release artifact:

```ts
const source = yield* Artifact.directory("project", producer);
const sbom = yield* Sbom.generate({
  subject: executable, source, format: "cyclonedx-json", outfile: "dist/sbom.json",
});
```

With `source`, both artifacts are verified and Syft scans `source` instead of the
compiled subject. Include the relevant manifests and supported lockfiles. This
is a source inventory, which may include dependencies omitted by bundling and
may miss unsupported lockfile formats; it is not a proof of the compiled file's
complete contents. Keep the source/build relationship in the release's records.
`cwd` resolves relative output paths, and `outfile` can use any filename.

[Setup and atomic output](../../docs/getting-started.md) · [Providers](../../docs/providers.md) · [Errors](../../docs/errors.md)
