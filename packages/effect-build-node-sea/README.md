# effect-build-node-sea

Selected-command Node single-executable assembly through `effect-build-node-sea/Command`.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Command from "effect-build-node-sea/Command";

const artifact = await Effect.runPromise(
  Command.AssembleExecutable.assembleDirect({
    main: { _tag: "File", path: "dist/main.cjs", format: "commonjs" },
    outfile: "dist/app",
    observation: "hashed",
  }).pipe(
    Effect.provide(Command.layer()),
    Effect.provide(NodeServices.layer),
  ),
);
```

The selected Node executable is reauthenticated before launch; core executable inspection establishes the artifact target and atomic handoff.
