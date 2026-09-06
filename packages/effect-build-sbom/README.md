# effect-build-sbom

Generate SPDX JSON 2.3 or CycloneDX JSON 1.6 from an exact finalized file or directory with a selected Syft executable.
The validated SBOM is returned as an atomically finalized `Artifact.HashedFile`.

## Install

```sh
npm install --save-exact effect-build-sbom@0.6.3 effect-build@0.6.3 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108
```

These examples use Effect v4 and its matching Node platform package.

Install **Syft 1.50.x** separately. `Generate.layer()` selects it from PATH; use `Generate.layer({ executable })` for
an explicit path. Selection is observed once and the same bytes are checked again before launch.

## Scan a finalized directory

Pass the `HashedTree` returned by your tree producer. The helper returns an Effect that you can compose with the
producer and run at the application's entry point.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Generate from "effect-build-sbom/Generate";
import type * as Artifact from "effect-build/Artifact";

const generator = Generate.layer();

export const createSbom = (snapshot: Artifact.HashedTree) =>
  Generate.generateSpdxJson(
    new Generate.GenerateInput({
      subject: new Generate.DirectorySubject({ snapshot }),
      outfile: "dist/app.spdx.json",
    }),
  ).pipe(
    Effect.provide(generator),
    Effect.provide(NodeServices.layer),
  );
```

Use `new Generate.FileSubject({ artifact })` to scan a finalized file instead. Directory inputs are lent as
verified private snapshots; file inputs are lent as verified bytes. Syft is explicitly told which subject kind to use;
this API does not select images, contact container daemons, or pull registry references.

For CycloneDX, call `generateCycloneDxJson` and use a `.cdx.json` destination. `generate(format, input)` exposes the
same two formats, and `formatProjection` supplies the extension, media type, and specification name.

The output path must not exist. Exact held output bytes must decode as UTF-8 and satisfy the selected versioned
document schema before atomic finalization. Schema validation establishes document structure, not proof that every
dependency was discovered by the scanner.

## More

[Getting started](https://github.com/mannyc2/effect-build/blob/main/docs/getting-started.md) · [API guide](https://github.com/mannyc2/effect-build/blob/main/docs/api.md) · [Error handling](https://github.com/mannyc2/effect-build/blob/main/docs/errors.md)
