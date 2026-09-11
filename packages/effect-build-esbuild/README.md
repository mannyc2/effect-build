# effect-build-esbuild

Bundle and transform with [esbuild](https://esbuild.github.io) as Effect programs. esbuild is a
peer dependency (`>=0.28.2 <0.29.0`, tested with 0.28.2): your install's esbuild runs in process,
and no tool layer is needed.

```sh
npm install --save-dev --save-exact effect-build-esbuild@0.7.0 esbuild@0.28.2 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108 @effect/platform-node-shared@4.0.0-rc.108
```

## Usage

```ts
import { Effect } from "effect";
import * as Esbuild from "effect-build-esbuild";

const bundle = Esbuild.buildToDirectory({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  sourcemap: true,
  outdir: "dist/app",
});
```

## Operations

| Operation                                  | Returns                             | Notes                                                                                                                   |
| ------------------------------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `buildToDirectory({ ...options, outdir })` | `Artifact.Directory`                | Native build options plus `atomic`, `onExists`, `prefix`. Staged as a sibling, so relative imports and maps stay valid. |
| `build(options)`                           | esbuild's `BuildResult`             | The native call, with native write behavior and result types.                                                           |
| `transform(input, options?)`               | esbuild's `TransformResult`         |                                                                                                                         |
| `analyzeMetafile(metafile, options?)`      | `string`                            |                                                                                                                         |
| `context(options)`                         | `{ rebuild, watch, serve, cancel }` | Requires a scope; closing it cancels and disposes the context.                                                          |

## Errors

`EsbuildFailed` keeps esbuild's `errors` and `warnings` arrays and the original exception;
`Tool.InputInvalid` rejects `outfile` or `write` in directory builds.
`Esbuild.supported` and `Esbuild.tested` report the peer range and the tested version.

[Recipes](https://github.com/mannyc2/effect-build/blob/main/docs/recipes.md) ·
[Errors and checks](https://github.com/mannyc2/effect-build/blob/main/docs/errors.md)
