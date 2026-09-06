# effect-build-esbuild

esbuild builds, transforms, analysis, and scoped contexts as Effect v4 programs. Choose the native API for in-memory
results or the command lane when your build must select and authenticate a specific executable.

## Install

```sh
npm install --save-exact effect-build-esbuild@0.6.3 effect@4.0.0-rc.108
```

This example uses Effect v4. The package includes esbuild **0.28.2** as a dependency.

## Build in memory

This example needs no input files and writes no output files. Save it as `build.ts` and run it with a
TypeScript-capable Node runtime.

```ts
import { Effect } from "effect";
import { Build } from "effect-build-esbuild/Api";

const result = await Effect.runPromise(
  Build.build({
    stdin: { contents: 'export const greeting = "Hello!";', loader: "ts" },
    bundle: true,
    format: "esm",
    write: false,
  }),
);

console.log(result.outputFiles[0]?.text);
```

`Build.build` requires `write: false` and returns the native esbuild result. It needs no effect-build service layer.

## Choose an operation

| Import                         | Public modules                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `effect-build-esbuild/Api`     | `Build`, `BuildToDirectory`, `Transform`, `AnalyzeMetafile`, `FormatMessages`, `Context`, `ContextToDirectory` |
| `effect-build-esbuild/Command` | `Build`, `BuildToDirectory`, `Watch`, and `layer()`                                                            |

API contexts and command watches require an Effect scope; keep rebuild, watch, and serve work inside that scope.
The standalone command `Serve` candidate is not publicly exported.

For the command lane, install a matching Effect platform adapter, provide its services, and provide
`Command.layer()`. It selects esbuild **0.28.2** from PATH or an explicit absolute `executable` and reauthenticates
those bytes before launch. The API dependency alone does not put its executable on your shell's PATH.

Directory operations preserve esbuild's direct writes. They may leave partial output after failure or interruption
and do not return a core atomically finalized tree.

## More

[Getting started](https://github.com/mannyc2/effect-build/blob/main/docs/getting-started.md) · [API guide](https://github.com/mannyc2/effect-build/blob/main/docs/api.md) · [Error handling](https://github.com/mannyc2/effect-build/blob/main/docs/errors.md) · [Runnable build and watch examples](https://github.com/mannyc2/effect-build/blob/main/examples/README.md) · [Provider guide](https://github.com/mannyc2/effect-build/blob/main/docs/drivers.md)
