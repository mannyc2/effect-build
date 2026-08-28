# effect-build-bun

Provider-native Bun operations in permanent `Api` and `Command` lanes.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Command } from "effect-build-bun";

const artifact = await Effect.runPromise(
  Command.CompileExecutable.compileExecutable({
    entrypoints: ["src/main.ts"],
    outfile: "dist/app",
    observation: "hashed",
  }).pipe(
    Effect.provide(Command.layer()),
    Effect.provide(NodeServices.layer),
  ),
);
```

`Api` preserves native in-memory results and provider-direct directories. `Command` selects exact Bun bytes, applies Bun-owned admission, and reauthenticates immediately before launch. Only executable compilation uses core atomic finalization.
