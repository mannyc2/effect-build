# effect-build-esbuild

Effect-native esbuild operations, in-process and in-memory: one-shot
builds from `effect-build-esbuild/Build`, scoped incremental contexts from
`effect-build-esbuild/Context`, and watch mode as a `Stream` from
`effect-build-esbuild/Watch`.

```ts
import { Effect } from "effect";
import * as Build from "effect-build-esbuild/Build";

const result = await Effect.runPromise(
  Build.build({ entryPoints: ["src/main.ts"], bundle: true, write: false }).pipe(
    Effect.provide(Build.layer),
  ),
);
```

Options are esbuild's own with one refinement: `write` must be the literal
`false` — outputs stay in memory. `Build.transform` transpiles one file,
`Build.analyzeMetafile` renders the native size report, `Context.make`
returns a scoped context whose native `dispose` is owned by the Scope
(cancel-then-dispose), and `Watch.changes` retains one pending completed build.
A newer completion replaces an older pending completion and reports the count
on `change.superseded`; broken rebuilds arrive as values on
`change.result.errors`, and ending the stream stops the watcher. Failures are `EsbuildFailed`, exposing the
native `errors`/`warnings` by reference. This native cancel/dispose behavior is
not the portable OS process-tree cancellation guarantee. See the
[repository](https://github.com/mannyc2/effect-build) for the full toolkit.
