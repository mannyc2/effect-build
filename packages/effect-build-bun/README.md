# effect-build-bun

Bun compiler provider for `effect-build`.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Bun from "effect-build-bun";

const program = Bun.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
}).pipe(
  Effect.provide(Bun.layer()),
  Effect.provide(NodeServices.layer),
);

await Effect.runPromise(program);
```

Applications provide an official Effect platform Layer at composition time.
The provider selects the Bun compiler, not the orchestrator runtime.
