# effect-build-esbuild

Provider-native esbuild 0.28.2 operations in separate in-process and
selected-command lanes.

```ts
import { Effect } from "effect";
import { Build } from "effect-build-esbuild/Api";

const result = await Effect.runPromise(
  Build.build({ entryPoints: ["src/main.ts"], bundle: true, write: false }),
);
```

`Api` exposes `Build`, `BuildToDirectory`, `Transform`, `AnalyzeMetafile`,
`FormatMessages`, `Context`, and `ContextToDirectory`. Context owners are scoped,
drain active work, and close once. `Command` exposes `Build`,
`BuildToDirectory`, and `Watch`; command output is bounded and the exact selected
tool is reauthenticated before launch.

Command Serve is an implemented package-private conditional candidate. Rejected
synchronous/shared-service controls and all former direct provider subpaths are
absent. Five-host, dual Node/Bun host-runtime, and packed-consumer evidence
remains open.
