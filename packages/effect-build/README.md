# effect-build

The core of the effect-build toolkit: the target vocabulary, artifact
types, the closed build-error set, and the external-tool kernel the
providers (`effect-build-bun`, `effect-build-deno`, `effect-build-esbuild`,
`effect-build-node-sea`, `effect-build-rolldown`) are built on.

The package root is a namespace facade; import from the exact subpath:

```ts
import type * as Artifact from "effect-build/Artifact"; // Executable, Bundle, Tool
import * as BuildError from "effect-build/BuildError"; // ToolNotFound, ToolFailed, UnsupportedTarget, PublishFailed
import * as Target from "effect-build/Target"; // the eight-target table, info(), host()
import * as Toolchain from "effect-build/Toolchain"; // resolve, run, probe, publish
```

`Toolchain` owns resolve-once tool selection, scoped child processes with
bounded output capture, version probing with warn-only tested ranges, and
staged publication (atomic rename for executables, per-file renames for
bundles). See the [repository](https://github.com/mannyc2/effect-build)
for the full toolkit.
