# effect-build-node-sea

Node SEA provider for `effect-build`. It bundles with exact esbuild 0.28.2 and
assembles with an already-installed exact Node 26.7.0 Linux x64 GNU executable.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as NodeSea from "effect-build-node-sea";

const program = NodeSea.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  options: { format: "esm" },
}).pipe(
  Effect.provide(NodeSea.layer()),
  Effect.provide(NodeServices.layer),
);

await Effect.runPromise(program);
```

The package never downloads Node and supports exactly `linux-x64-gnu`.
