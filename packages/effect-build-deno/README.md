# effect-build-deno

Deno compilation and native build operations as Effect v4 programs, with explicit output ownership.

## Install

```sh
npm install --save-exact effect-build-deno@0.6.3 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108
```

These examples use Effect v4 and its matching Node platform package.

Install Deno **2.9.5** separately. The command lane currently admits that exact version: 2.9.6 removed exposed options. See the [compatibility audit](https://github.com/mannyc2/effect-build/blob/main/docs/provider-compatibility-audit.md). Your build script may run under
Node while the selected Deno executable performs compilation or transpilation.

## Compile an executable

Create `src/main.ts` containing `console.log("Hello!")`, then save the following as `build.mts`.
Run it from your application directory with Node **24.14.1** and the compiler on PATH. The omitted `target` selects
the provider's native target. Use a fresh output path for each build.

```ts
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect } from "effect";
import { Command } from "effect-build-deno";

const compiler = Command.layer();
const program = Command.CompileExecutable.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app.exe",
  observation: "hashed",
  bundle: true,
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

## Public operations

Import `effect-build-deno/Command`, or `{ Command }` from `effect-build-deno`.

- `CompileExecutable.compileExecutable` and `compileExecutableMatrix` finalize executable output through core.
- `Transpile.transpile` returns stdout bytes.
- `Transpile.transpileToDirectory` emits JavaScript to a provider-owned directory.
- `Transpile.emitDeclarations` emits Deno's TypeScript declarations to a provider-owned directory.

Directory outputs can be partial after failure or interruption. Bundle, bundle-watch, declaration-bundle, and
compile-watch candidates remain package-private; there is no public `Api` lane in this version.

`Command.layer()` selects one Deno executable and checks its bytes before every launch. Its optional `executable`
sets an explicit absolute path. `denoDir` provides explicit cache authority. A runtime override must use the layer's
`denort` option; inherited or per-call `DENORT_BIN` is not accepted as unverified compiler authority.

## More

[Getting started](https://github.com/mannyc2/effect-build/blob/main/docs/getting-started.md) · [API guide](https://github.com/mannyc2/effect-build/blob/main/docs/api.md) · [Error handling](https://github.com/mannyc2/effect-build/blob/main/docs/errors.md) · [Runnable Deno examples](https://github.com/mannyc2/effect-build/blob/main/examples/README.md) · [Provider guide](https://github.com/mannyc2/effect-build/blob/main/docs/drivers.md)
