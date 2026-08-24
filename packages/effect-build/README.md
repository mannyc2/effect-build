# effect-build

Core exports the target vocabulary, authenticated executable observations,
closed build errors, and role-specific authoring capabilities.

```ts
import type * as Artifact from "effect-build/Artifact";
import * as Generation from "effect-build/Author/Generation";
import * as Tool from "effect-build/Author/Tool";
import * as BuildError from "effect-build/BuildError";
import * as Target from "effect-build/Target";
```

The v0.5 hard cut removed `effect-build/Toolchain`, mutable core bundle
declarations, and ambient host-target inference without compatibility aliases.
`Author/Generation` publishes immutable content-addressed trees and advances a
single current reference. Provider profile and Node SEA target APIs remain
release-blocking work. See the
[`effect-build/v0.5-contract@1`](https://github.com/mannyc2/effect-build/blob/main/docs/v0.5-contract.md)
target decision.
