# effect-build-bun

Provider-native Bun 1.3.14 operations in distinct in-process and selected-command
lanes.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Command } from "effect-build-bun";

const artifact = await Effect.runPromise(
  Command.CompileExecutable.compileExecutable({
    entrypoints: ["src/main.ts"],
    outfile: "dist/app",
    target: "bun-linux-x64",
    observation: "hashed",
    options: { minify: true },
  }).pipe(
    Effect.provide(Command.layer()),
    Effect.provide(NodeServices.layer),
  ),
);
```

`Api` exposes `Transpiler` (`make`, `transform`, `transformSync`, `scan`, and
`scanImports`), `Build`, and `CompileExecutable`. `Command` exposes `Build`,
`Watch`, and `CompileExecutable`. The two lanes remain different semantic owners
even where their native operation names overlap.

Command operations authenticate the exact selected executable before launch.
Provider-direct directory writes truthfully permit partial output after failure
or interruption; only core `Author/Executable` owns atomic single-file
replacement. The five-host and packed-consumer evidence gates remain open.
