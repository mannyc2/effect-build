# effect-build-deno

The public `Command` lane exposes Deno transpilation and executable compilation. Bundle memory, stdout, direct-directory, watch, declaration-bundle, and compile-watch candidates remain package-private under their evidence gates.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Command } from "effect-build-deno";

const artifact = await Effect.runPromise(
  Command.CompileExecutable.compileExecutable({
    entrypoint: "src/main.ts",
    outfile: "dist/app",
    observation: "hashed",
    bundle: true,
  }).pipe(
    Effect.provide(Command.layer()),
    Effect.provide(NodeServices.layer),
  ),
);
```
