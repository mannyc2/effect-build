# effect-build

The core of the effect-build toolkit: the target vocabulary, artifact
types, the closed build-error set, and the external-tool kernel every compiler,
archive, Python, native-package, signing, notarization, and SBOM provider in
the twelve-package lockstep surface is built on.

The package root is a namespace facade; import from the exact subpath:

```ts
import type * as Artifact from "effect-build/Artifact"; // Executable, FileArtifact, Bundle, FinalizedArtifact, Tool
import * as BuildError from "effect-build/BuildError"; // ToolNotFound, ToolFailed, UnsupportedTarget, PublishFailed, ArtifactVerificationFailed
import * as Target from "effect-build/Target"; // the eight-target table, info(), host()
import * as Toolchain from "effect-build/Toolchain"; // resolve, run, probe, publish
```

`Toolchain` owns resolve-once tool selection, scoped child processes with
bounded output capture, version probing with warn-only tested ranges, and
staged publication. Executables and ordinary files always carry exact byte
length and SHA-256 identity. Bundles carry an exact, symlink-aware manifest,
reject overlays, and commit the whole directory atomically. Verified read and
private materialization operations form the trust boundary between producers.
Ordinary-file producers may validate the exact captured bytes held for the
atomic commit, so validation and publication cannot observe different payloads.
See the [repository](https://github.com/mannyc2/effect-build)
for the full toolkit.
