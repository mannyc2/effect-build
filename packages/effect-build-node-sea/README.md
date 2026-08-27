# effect-build-node-sea

Effect-native Node single-executable-application assembly from
`effect-build-node-sea/AssembleExecutable`, driving `node --check` and
`node --build-sea` directly.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as AssembleExecutable from "effect-build-node-sea/AssembleExecutable";

const artifact = await Effect.runPromise(
  AssembleExecutable.assembleExecutable({
    main: { _tag: "File", path: "dist/main.cjs", format: "commonjs" },
    outfile: "dist/app",
    assets: { "config.json": "config/production.json" },
  }).pipe(
    Effect.provide(AssembleExecutable.layer()),
    Effect.provide(NodeServices.layer),
  ),
);
```

Mains come from a file or raw bytes (commonjs or module), assets embed as
a keyed record, and the output targets the host through a builder node
(≥ 26.7) with an optional separate `baseExecutable`. The layer selects
and probes node once and warns outside the CI-tested range; it never
installs or substitutes. See the
[repository](https://github.com/mannyc2/effect-build) for the full toolkit.
