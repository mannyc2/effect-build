# effect-build

Canonical Effect v4 contracts for durable hashed artifacts, selected tool identity, scoped borrowed output, atomic file/tree/executable finalization, bounded matrices, system targets, and path-free downstream adoption.

```ts
import * as Artifact from "effect-build/Artifact";
import * as File from "effect-build/Author/File";
import * as Tool from "effect-build/Author/Tool";
import * as Tree from "effect-build/Author/Tree";
```

Pure producers use `Artifact.intrinsicProvenance`; selected-tool producers preserve the exact `Tool.Observation`. Only hashed durable artifacts can be projected for downstream adoption. The package provides no generic provider runner, registry, fallback, installer, release plan, journal, or publication API.
