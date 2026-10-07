# Getting started

The 0.9.0 source checkout exposes native tool bindings as Effect services. These examples
use the checkout's workspace packages.

## Prepare the checkout

Use Node 22.19 or newer and Bun 1.3.14 for repository tooling. The checked-in TypeScript
entry points run with Node 24.14.1. Packages are ESM-only. The source checkout pins Effect
and its platform packages to 4.0.0.

From the repository root:

```sh
bun install --frozen-lockfile
bun run build
bun run --cwd examples/tool-runs test
```

The first example resolves `node`, runs its version command, and prints bounded text.
Here is its complete [source](../examples/tool-runs/src/main.ts):

```ts
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect } from "effect";
import { Tool } from "effect-build";
import { ChildProcess } from "effect/process";

const program = Effect.gen(function*() {
  const node = yield* Tool.make("node");
  const version = yield* node.run(
    ChildProcess.make(node.executable, ["--version"], { stdin: "ignore" }),
    node.text({ maxBytes: 4096 }),
  );
  yield* Console.log(version.trim());
});

// The application supplies its platform once, at the entry point.
NodeRuntime.runMain(program.pipe(Effect.provide(NodeServices.layer)));
```

`Tool.make` resolves once and captures the supplied process spawner. `ChildProcess.make`
is Effect's native command description. `node.run` consumes stdout through the bounded
text sink, drains remaining piped output, and accepts exit code zero. Platform construction
belongs at the application's entry point.

## Build with a service

The [Bun example](../examples/bun-build/src/main.ts) creates a small source file and bundles
it with the native Bun executable:

```ts
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, FileSystem, Layer, Path } from "effect";
import { Bun } from "effect-build-bun";

const program = Effect.gen(function*() {
  const bun = yield* Bun;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-example-" });
  const main = path.join(directory, "main.ts");
  yield* fs.writeFileString(main, 'console.log("built with Effect");\n');
  const output = yield* bun.build({
    entrypoints: [main],
    outdir: path.join(directory, "output"),
    target: "bun",
    atomic: true,
  });
  yield* Console.log(output);
});

const services = Bun.layer().pipe(Layer.provideMerge(NodeServices.layer));
NodeRuntime.runMain(program.pipe(Effect.scoped, Effect.provide(services)));
```

Run it with Bun available on PATH:

```sh
bun run --cwd examples/bun-build test
```

`yield* Bun` obtains the service; `bun.build` returns an Effect whose success value is the
absolute output directory. `Bun.layer()` captures the selected compiler and services once.
`Layer.provideMerge` also makes the application's filesystem and path services available.

The example chooses `atomic: true`: bundle files are produced in a private sibling directory
and each file is renamed into the output directory. The example's temporary root is removed
when its scope closes. An application uses its own destination and decides how long outputs live.

`bun.compile` creates a native executable and accepts Bun's native target spelling.
Its full input and return type are documented in the
[Bun binding](../packages/effect-build-bun/README.md). Other bindings follow the same service pattern.

Next, read [tools and bindings](providers.md), [errors and publication](errors.md), or
[recipes](recipes.md). [Compatibility](compatibility.md) distinguishes the runtime running
Effect from the tools it launches.
