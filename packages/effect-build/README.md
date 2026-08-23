# effect-build

Core currently exports the target vocabulary, artifact observations, closed
build errors, and the legacy external-tool kernel used by the built-in
providers.

```ts
import type * as Artifact from "effect-build/Artifact";
import * as BuildError from "effect-build/BuildError";
import * as Target from "effect-build/Target";
```

The current `effect-build/Toolchain` export is transition surface scheduled for
deletion in the v0.5 hard cut. It is not a stable third-party provider SPI and
will receive no compatibility alias. The replacement consists of law-tested,
role-specific `Author/*` capabilities, immutable generation primitives, and
closed portable profiles. See the
[`effect-build/v0.5-contract@1`](https://github.com/mannyc2/effect-build/blob/main/docs/v0.5-contract.md)
target decision.
