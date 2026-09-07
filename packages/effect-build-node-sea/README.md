# effect-build-node-sea

Assemble a Node single executable with the selected command's native `node --build-sea` operation, then inspect and
finalize the resulting executable through effect-build core.

## Install

```sh
npm install --save-exact effect-build-node-sea@0.7.0 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108
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

## Embed file or byte assets

Each asset uses one explicit input form:

```ts
const assets = [
  { _tag: "File", key: "message", path: "assets/message.txt" },
  { _tag: "Bytes", key: "binary", contents: new Uint8Array([0, 128, 255]) },
] as const;
```

File paths resolve against `cwd`. Byte contents are defensively copied during preparation. Both forms are written
to the operation's private staging directory for Node to embed; callers need no temporary asset file. Keys must
be unique and non-empty. Untagged assets and records mixing `path` with `contents` are rejected.

To embed an existing finalized file or executable, lend its verified bytes directly:

```ts
import * as Command from "effect-build-node-sea/Command";
import * as File from "effect-build/Author/File";

const assembleWithPayload = (artifact: File.VerifiedInput) =>
  File.withVerifiedBytes(artifact, (contents) =>
    Command.AssembleExecutable.assembleDirect({
      main: { _tag: "File", path: "src/main.cjs", format: "commonjs" },
      assets: [{ _tag: "Bytes", key: "payload", contents }],
      outfile: "dist/app-with-payload",
      observation: "hashed",
    }));
```

Provide the same command and platform layers as above. The main can retrieve the exact embedded bytes with
`require("node:sea").getAsset("payload")`. Changes to the source artifact before verified consumption fail with
`FileVerificationFailed` before assembly starts. This handoff reuses the held bytes without reopening the original
path or creating another finalized file.

`Command.layer()` selects the builder and optional base executable once. Set `builderExecutable` and
`baseExecutable` to explicit absolute paths when needed; distinct builder and base selections must report the same
version. Selected bytes are reauthenticated before launch. There is no postject fallback, automatic installation,
or target inference from the build script's host.

## More

[Getting started](https://github.com/mannyc2/effect-build/blob/main/docs/getting-started.md) · [Error handling](https://github.com/mannyc2/effect-build/blob/main/docs/errors.md) · [Runnable SEA example](https://github.com/mannyc2/effect-build/blob/main/examples/README.md) · [Provider guide](https://github.com/mannyc2/effect-build/blob/main/docs/providers.md)
