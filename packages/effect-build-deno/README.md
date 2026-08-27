# effect-build-deno

Provider-native Deno 2.9.5 command operations.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Command } from "effect-build-deno";

const artifact = await Effect.runPromise(
  Command.CompileExecutable.compileExecutable({
    entrypoint: "src/main.ts",
    outfile: "dist/app",
    target: "x86_64-unknown-linux-gnu",
    observation: "hashed",
    bundle: true,
    minify: true,
    allowRead: true,
  }).pipe(
    Effect.provide(Command.layer()),
    Effect.provide(NodeServices.layer),
  ),
);
```

The public `Command` lane exposes `Transpile` and `CompileExecutable`. There is
no public `Api` root: an empty twin would violate M8. API Bundle, command Bundle, and CompileWatch
are implemented and tested package-private conditional candidates; an open gate
does not authorize their promotion.

Permission lists reject present empty values before provider work. Command
operations authenticate the exact selected executable before launch, and direct
directory output makes no rollback claim. Five-host and packed-consumer evidence
remains open.
