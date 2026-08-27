# effect-build-nfpm

Effect-native production of Debian, RPM, Alpine, Arch Linux, and unsigned MSIX
packages with nFPM.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Nfpm from "effect-build-nfpm/Package";
import type * as Artifact from "effect-build/Artifact";

declare const executable: Artifact.Executable; // exact prior producer result

const artifact = await Effect.runPromise(
  Nfpm.buildDeb(
    new Nfpm.PackageInput({
      metadata: new Nfpm.PackageMetadata({
        name: "my-cli",
        version: "1.2.3",
        architecture: "amd64",
        maintainer: "Release Team <release@example.test>",
        description: "My command line application",
        contents: [
          new Nfpm.PackageContent({
            artifact: executable,
            dst: "/usr/bin/my-cli",
            mode: 0o755,
          }),
        ],
      }),
      release: "1",
      mtime: "2009-11-10T23:00:00Z",
      outfile: "dist/my-cli.deb",
    }),
  ).pipe(
    Effect.provide(Nfpm.layer({ executable: "/opt/nfpm-2.47.0/nfpm" })),
    Effect.provide(NodeServices.layer),
  ),
);
// { _tag: "File", path, bytes, tool, sha256 }
```

Required identity, metadata, and contents are schema-checked. Every payload is
re-verified against its finalized byte length and SHA-256, then materialized
from those exact bytes in private staging and rendered only as nFPM `type: file`. Callers cannot reinterpret a finalized file as a tree, directory,
symlink, another packager's content, or a format-specific architecture.
Destinations are one canonical absolute package-file path; relative, dot,
traversal, empty-segment, backslash, root, and trailing-slash spellings are
rejected before nFPM runs. `release`, canonical UTC `mtime`, and optional exact
file modes are first-class closed fields; no arbitrary native configuration
escape hatch remains. MSIX accepts only the exported `MsixOptions` family of
durable classes and only on the MSIX operation. Ambient-variable expansion,
globbing, content expansion, scripts, overrides, signing subtrees, and
format-specific architecture overrides cannot enter the rendered
configuration. The requested filename must match the selected format, and the
five named operations close the packager choice.
The layer resolves and probes nFPM once, never installs or substitutes it,
stages beside the final destination, and commits one finalized `FileArtifact`
atomically.
