# effect-build-bun

Bun compiler and scoped JavaScript-bundle provider for `effect-build`. One
`Compiler` Layer selects one Bun command for all three operations.

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

`withJavaScriptBundle` produces one ESM or CJS Node-resolution bundle and keeps
it live only for the callback:

```ts
const bundleProgram = Bun.withJavaScriptBundle(
  { entrypoint: "src/main.ts", format: "esm" },
  (main) => Effect.succeed(main.stages),
).pipe(
  Effect.provide(Bun.layer()),
  Effect.provide(NodeServices.layer),
);
```

The bundle operation requires selected Bun 1.3.9. Direct executable compile
retains its existing version-observation behavior. Bun `target=node` controls
resolution and builtin treatment, not a Node release or syntax target. The
pinned producer's default syntax behavior is not encoded in the neutral
Artifact, and `observedExternalImports` is not a closed dependency graph.

Applications provide an official Effect platform Layer at composition time.
The provider selects the Bun compiler, not the orchestrator runtime.
