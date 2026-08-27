# effect-build-sbom

Effect-native SPDX JSON 2.3 and CycloneDX JSON 1.6 generation through Syft.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Sbom from "effect-build-sbom/Generate";
import type * as Artifact from "effect-build/Artifact";

declare const releaseSnapshot: Artifact.Bundle; // exact finalized release tree

const artifact = await Effect.runPromise(
  Sbom.generateSpdxJson(
    new Sbom.GenerateInput({
      subject: new Sbom.DirectorySubject({ snapshot: releaseSnapshot }),
      outfile: "dist/release.spdx.json",
    }),
  ).pipe(
    Effect.provide(Sbom.layer({ executable: "/opt/syft-1.50.0/syft" })),
    Effect.provide(NodeServices.layer),
  ),
);
// { _tag: "File", path, bytes, tool, sha256 }
```

`DirectorySubject` accepts an exact finalized Bundle, reconstructs a private
verified snapshot, and always renders `--from dir`; `FileSubject` accepts a
finalized file identity and always renders `--from file`. That is the whole scan-subject policy: Syft never guesses an
image, contacts a daemon, pulls a registry reference, or falls back to another
source kind. Output is version-qualified and decoded against the package's
SPDX JSON 2.3 or CycloneDX JSON 1.6 projection before publication. Validation
uses fatal UTF-8 decoding and runs over the exact bytes held by
`Toolchain.publishFile` for the atomic commit. Required SPDX package download
locations, the official CycloneDX component-type vocabulary, and positive
integer document versions are enforced. The filename must match the selected
`.spdx.json` or `.cdx.json` projection. Both operations return the core
`FileArtifact`; the package also exports component-aware document schemas and
stable format/media-type projections.
