# effect-build-node-sea

Assemble a Node single executable with the selected command's native `node --build-sea` operation, then inspect and
finalize the resulting executable through effect-build core.

## Install

```sh
npm install --save-exact effect-build-node-sea@0.6.3 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108
```

These examples use Effect v4 and its matching Node platform package.

The reviewed command is **Node 26.7.0 on Linux x64 with glibc**. The selected binary must expose `--build-sea`.
Other operating systems and architectures are rejected. `allowUntestedVersion` only relaxes the exact Node version
check; it does not widen platform support.

## Assemble an executable

Create `src/main.cjs` containing `console.log("Hello from SEA!")`, then save the following as `build.mts`.
Run it from your application directory on the admitted Linux host, with Node **26.7.0** available on PATH.
The output path must not already exist.

```ts
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect } from "effect";
import * as Command from "effect-build-node-sea/Command";

const compiler = Command.layer();
const program = Command.AssembleExecutable.assembleDirect({
  main: { _tag: "File", path: "src/main.cjs", format: "commonjs" },
  outfile: "dist/app",
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

`Command.AssembleExecutable` is the public operation module. Prepare the JavaScript entrypoint before assembly;
this package is not a TypeScript bundler. Its main input makes file versus in-memory acquisition explicit.

`Command.layer()` selects the builder and optional base executable once. Set `builderExecutable` and
`baseExecutable` to explicit absolute paths when needed; distinct builder and base selections must report the same
version. Selected bytes are reauthenticated before launch. There is no postject fallback, automatic installation,
or target inference from the build script's host.

## More

[Getting started](https://github.com/mannyc2/effect-build/blob/main/docs/getting-started.md) · [API guide](https://github.com/mannyc2/effect-build/blob/main/docs/api.md) · [Error handling](https://github.com/mannyc2/effect-build/blob/main/docs/errors.md) · [Runnable SEA example](https://github.com/mannyc2/effect-build/blob/main/examples/README.md) · [Provider guide](https://github.com/mannyc2/effect-build/blob/main/docs/drivers.md)
