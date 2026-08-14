# effect-build-deno

Deno compiler provider for `effect-build`.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Deno from "effect-build-deno";

const program = Deno.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  options: { bundle: true },
}).pipe(
  Effect.provide(Deno.layer()),
  Effect.provide(NodeServices.layer),
);

await Effect.runPromise(program);
```

Applications provide an official Effect platform Layer at composition time.
The provider selects the Deno compiler, not the orchestrator runtime.
