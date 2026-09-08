# effect-build-sbom

Generate SPDX 2.3 and CycloneDX 1.6 JSON documents with Syft and return an
`Artifact.File`.

```ts
import * as Sbom from "effect-build-sbom";

const document = yield* Sbom.generate({
  subject: artifact,
  format: "spdx-json",
  outfile: "dist/sbom.json",
});
```

Provide `Sbom.layer()` and platform services. Set `executable` to select a Syft
binary, or `version` to override the tested range `>=1.50.0 <2.0.0`.

`subject` accepts a file, executable, or directory artifact. Its current bytes are
verified before Syft scans the original path, preserving filename-based package
detection. Syft scans explicitly as a file or directory. Documents with no detected
packages are valid outputs.

Use `format: "cyclonedx-json"` for CycloneDX. `outfile` is resolved against `cwd`
when supplied and can use any filename. Output is hashed before the final rename;
`atomic: false` writes directly. Failures use `InputInvalid` and the shared artifact,
tool, and commit errors.
