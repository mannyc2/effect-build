# effect-build-rolldown

Bundle and transform with [Rolldown](https://rolldown.rs) as scoped Effect programs. Rolldown
1.2.5 is a pinned dependency: the wrapper uses `rolldown/experimental`, whose types move outside
semver. No tool layer is needed.

```sh
npm install --save-dev --save-exact effect-build-rolldown@0.7.0 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108 @effect/platform-node-shared@4.0.0-rc.108
```

## Usage

```ts
import { Effect } from "effect";
import * as Rolldown from "effect-build-rolldown";

const bundle = Rolldown.buildToDirectory({ input: "src/main.ts", outdir: "dist/app", output: { format: "es" } });
```

## Operations

| Operation                                         | Returns               | Notes                                                                                                     |
| ------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------- |
| `buildToDirectory({ ...input, outdir, output? })` | `Artifact.Directory`  | Native input options plus `atomic`, `onExists`, `prefix`; `output.dir` and `output.file` are owned here.  |
| `build(options)`                                  | `RolldownOutput`      | The native call; `write: false` keeps output in memory. Accepts an array for several builds.              |
| `make(input)`                                     | `{ generate, write }` | A scoped builder; in-flight work finishes before the scope closes it.                                     |
| `watch(options)`                                  | `Stream<WatchEvent>`  | `BUNDLE_END` and `ERROR` events with a `superseded` count for a slow consumer; native results are closed. |
| `transform(filename, source, options?)`           | `TransformResult`     | The native utility.                                                                                       |
| `DevEngine.make(input, output?, options?)`        | scoped dev engine     | Experimental, mirroring Rolldown's own experimental engine.                                               |

## Errors

`Rolldown.Failed` (tag `RolldownFailed`) keeps Rolldown's `errors` and the original rejection;
`InputInvalid` (tag `RolldownInputInvalid`) rejects reserved output options. `Rolldown.tested`
reports the pinned version.

[Recipes](https://github.com/mannyc2/effect-build/blob/main/docs/recipes.md) ·
[Errors and checks](https://github.com/mannyc2/effect-build/blob/main/docs/errors.md)
