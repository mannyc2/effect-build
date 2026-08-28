# effect-build-esbuild

Provider-native esbuild `Api` and `Command` lanes. The API lane preserves in-memory builds, transforms, analysis, formatting, and scoped contexts. The command lane preserves selected-command stdout builds, provider-direct directories, and scoped watch behavior.

```ts
import { Effect } from "effect";
import { Build } from "effect-build-esbuild/Api";

const result = await Effect.runPromise(
  Build.build({ entryPoints: ["src/main.ts"], bundle: true, write: false }),
);
```

Provider-direct directories may be partial after failure or interruption and are not represented as core finalized trees.
