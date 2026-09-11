# effect-build-sbom

Generate SPDX 2.3 or CycloneDX 1.6 JSON software bills of materials for release artifacts with
[Syft](https://github.com/anchore/syft), as Effect programs.

```sh
npm install --save-dev --save-exact effect-build-sbom@0.7.0 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108 @effect/platform-node-shared@4.0.0-rc.108
```

Syft 1.50 or newer must be installed.

## Usage

```ts
import { Effect } from "effect";
import { Artifact } from "effect-build";
import * as Sbom from "effect-build-sbom";

const sbom = (executable: Artifact.Executable) =>
  Effect.gen(function*() {
    const lockfile = yield* Artifact.file("package-lock.json", { name: "hello", version: "1.0.0" });
    return yield* Sbom.generate({
      subject: executable,
      source: lockfile,
      format: "cyclonedx-json",
      outfile: "dist/hello.cdx.json",
    });
  }).pipe(Effect.provide(Sbom.layer()));
```

`generate({ subject, source?, format, outfile, cwd?, atomic?, onExists?, prefix? })` returns the
SBOM as an `Artifact.File`. `format` is `spdx-json` or `cyclonedx-json`.

- `subject` is the release artifact the inventory describes: any core artifact, always verified.
  Without `source`, Syft scans the subject at its original path, so filename-based detection
  still works.
- `source` is a verified source directory or a named lockfile. When given, Syft scans it instead
  of the subject, which is how a compiled TypeScript executable gets an inventory of the
  dependencies that were bundled into it. Include the manifests and lockfiles Syft supports.

A successful scan means Syft wrote an inventory of the packages it could discover. It does not
establish completeness: a compiled executable can yield zero packages even when it embeds Effect,
and a source scan can list dependencies the bundler dropped or miss lockfile formats Syft does
not read. Empty package lists are valid output. Keep the relationship between the source you
scanned and the artifact you shipped in your release records.

## Versions and errors

`Sbom.layer({ executable?, version? })` resolves Syft once; `Sbom.supported` is `>=1.50.0 <2.0.0`
and `Sbom.tested` is 1.50.0. `Sbom.GenerateError` is `Tool.InputInvalid`,
`Artifact.ArtifactError`, `Tool.Failed`, `Tool.SpawnFailed`, or `Commit.CommitError`.

[Recipes](https://github.com/mannyc2/effect-build/blob/main/docs/recipes.md) ·
[Tools and providers](https://github.com/mannyc2/effect-build/blob/main/docs/providers.md) ·
[Errors and checks](https://github.com/mannyc2/effect-build/blob/main/docs/errors.md)
