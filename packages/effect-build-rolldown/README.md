# effect-build-rolldown

Effect-native [Rolldown](https://rolldown.rs) operations: scoped in-process
bundles from `effect-build-rolldown/Build` and completed watcher results as a `Stream`
from `effect-build-rolldown/Watch`.
`effect-build-rolldown/Profile` is one explicit Layer for both closed portable
authoring services. Rolldown 1.2.5 does not bundle CSS, so stylesheet bytes must
be supplied as explicit authenticated browser resources.

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

`Build.make` returns a scoped handle; `generate` bundles in memory and `write`
bundles onto disk. `Watch.events` retains one pending completed result, reports
the number of replaced completions on `event.superseded`, closes every native
result before delivery, and awaits its one watcher close on stream shutdown.
Cleanup failures remain in Effect Cause. Failures surface as `RolldownFailed`
with rolldown's own diagnostics on `.errors`.

See the [repository](https://github.com/mannyc2/effect-build) for the full
toolkit.
