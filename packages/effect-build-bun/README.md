# effect-build-bun

Bun compilation and native build operations as Effect v4 programs, with explicit output ownership.

## Install

```sh
npm install --save-exact effect-build-bun@0.7.0 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108
```

These examples use Effect v4 and its matching Node platform package.

Install Bun **1.3.14** separately. The command lane admits that exact version. It can be called from a Node-hosted
Effect program; the in-process API lane requires the build script itself to run under Bun 1.3.14.

## Compile an executable

Create `src/main.ts` containing `console.log("Hello!")`, then save the following as `build.mts`.
Run it from your application directory with Node **24.14.1** and the compiler on PATH. The omitted `target` selects
the provider's native target. Use a fresh output path for each build.

```ts
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect } from "effect";
import { Command } from "effect-build-bun";

const compiler = Command.layer();
const program = Command.CompileExecutable.compileExecutable({
  entrypoints: ["src/main.ts"],
  outfile: "dist/app.exe",
  observation: "hashed",
}).pipe(
  Effect.tap((artifact) => Console.log(artifact.path, artifact.target, artifact.digest.value)),
  Effect.provide(compiler),
  Effect.provide(NodeServices.layer),
);

NodeRuntime.runMain(program);
```

```sh
node build.mts
```

`NodeRuntime.runMain` handles Ctrl+C so the scoped compiler process can close.

The returned `HashedExecutable` records the finalized path, inspected target, byte count, SHA-256 digest, and tool
identity. Existing destinations are rejected. The package never installs a compiler or silently tries another one.

## Choose a lane

| Module                     | Operations and output                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| `effect-build-bun/Api`     | `Build`, `Transpiler`, and `CompileExecutable`: native Bun values and provider-direct output |
| `effect-build-bun/Command` | `Build`, `Watch`, and `CompileExecutable`: selected Bun subprocess operations                |

`Api.layer` supplies the native Bun services. `Command.layer()` resolves and observes one executable; use its
`executable` option for an explicit absolute path. Selected bytes are checked again immediately before each launch.

`Command.CompileExecutable.compileExecutable` and `compileExecutableMatrix` use core executable finalization.
`Api.CompileExecutable.compileExecutableDirect` preserves Bun's direct output behavior. Native API and directory
operations do not acquire atomicity merely because they run inside an Effect. Direct outputs can be partial after
failure or interruption; Bun's native build API has no cancellation handle.

## More

[Getting started](https://github.com/mannyc2/effect-build/blob/main/docs/getting-started.md) · [Error handling](https://github.com/mannyc2/effect-build/blob/main/docs/errors.md) · [Runnable Bun examples](https://github.com/mannyc2/effect-build/blob/main/examples/README.md) · [Provider guide](https://github.com/mannyc2/effect-build/blob/main/docs/providers.md)
