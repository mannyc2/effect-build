# effect-build-rolldown

Effect-native [Rolldown](https://rolldown.rs) operations: scoped in-process
bundles from `effect-build-rolldown/Build` and watcher events as a `Stream`
from `effect-build-rolldown/Watch`.

```ts
import { Effect } from "effect";
import * as Build from "effect-build-rolldown/Build";

const output = await Effect.runPromise(
  Build.generate({ input: "src/main.ts" }, { format: "esm" }).pipe(
    Effect.provide(Build.layer),
  ),
);

for (const chunk of output.output) console.log(chunk.fileName);
```

`Build.make` returns a scoped handle whose native `close` is owned by the
Scope; `generate` bundles in memory and `write` bundles onto disk. Failures
surface as `RolldownFailed` with rolldown's own diagnostics on `.errors`.

See the [repository](https://github.com/mannyc2/effect-build) for the full
toolkit.
