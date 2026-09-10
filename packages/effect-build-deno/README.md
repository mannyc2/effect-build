# effect-build-deno

Compile executables, bundle, and transpile TypeScript with [Deno](https://deno.com), as Effect
programs. Executables come back as `Artifact.Executable` records with their target read from the
header; bundles and transpiled trees as `Artifact.Directory`.

```sh
npm install --save-dev --save-exact effect-build-deno@0.7.0 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108 @effect/platform-node-shared@4.0.0-rc.108
```

Deno 2.9.5 or newer must be installed. The provider drives the `deno` CLI from Node or Bun.

## Usage

```ts
import { Effect } from "effect";
import * as Deno from "effect-build-deno";

const program = Effect.gen(function*() {
  const cli = yield* Deno.compile({
    entrypoint: "src/cli.ts",
    outfile: "dist/cli",
    target: "linux-x64",
    options: { allowNet: true, allowRead: ["./config"] },
  });
  const bundle = yield* Deno.bundle({
    entrypoints: ["src/app.ts"],
    outdir: "dist/app",
    options: { platform: "browser", minify: true },
  });
  return [cli, bundle];
}).pipe(Effect.provide(Deno.layer({ executable: process.env.EFFECT_BUILD_DENO })));
```

## Operations

| Operation                                                                                 | Returns                      | Runs                                                                                                      |
| ----------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| `compile({ entrypoint, outfile, target?, options?, scriptArgs?, cwd?, env?, onOutput? })` | `Deno.CompileArtifact`       | `deno compile`. The artifact is an `Artifact.Executable` plus `runtime` when an explicit denort was used. |
| `bundle({ entrypoints, outdir, options?, ... })`                                          | `Artifact.Directory`         | `deno bundle` into a directory.                                                                           |
| `transpile({ files, outdir, options?, ... })`                                             | `Artifact.Directory`         | `deno transpile`: TypeScript to JavaScript, file by file.                                                 |
| `watch({ entrypoint, outfile, options?, stdio?, watchExclude?, noClearScreen? })`         | `{ tool, process, outfile }` | `deno compile --watch`, rebuilding `outfile` while the scope is open.                                     |

Every producing operation also takes `atomic`, `onExists`, and `prefix`
([atomic output](https://github.com/mannyc2/effect-build/blob/main/docs/errors.md#atomic-output)).
Native flags go in `options`: permissions (`allowNet`, `denyRead`, `allowAll`, `permissionSet`, and
the rest), project options (`config`, `importMap`, `lock`, `frozen`, `nodeModulesDir`, `vendor`,
`conditions`), and compile options (`include`, `exclude`, `icon`, `noTerminal`, `engine`, `minify`,
`bundle`). `scriptArgs` are appended after the entrypoint.

## Targets

`target` accepts the core targets and Deno's native triples. Deno has no musl target. Deno embeds
the output basename in the executable, so staging preserves it and Windows outputs must end in
lowercase `.exe`. `Deno.layer({ runtime })` points at an explicit `denort` file: its path and hash
are recorded (and exported as `DENORT_BIN`) without executing it.

## Versions

`Deno.supported` is `>=2.9.5 <3.0.0` and `Deno.tested` is 2.9.5. Deno 2.9.6 removed two flags, so
on 2.9.6 and later `transpile` rejects `conditions` and `compile`/`watch` reject `allowScripts`;
every other operation stays available. See
[tools and providers](https://github.com/mannyc2/effect-build/blob/main/docs/providers.md).

## Native API

`effect-build-deno/api` wraps `Deno.bundle`: `Bundle.memory` (`write: false`, results in memory)
and `Bundle.direct` (`write: true` to `outputPath` or `outputDir`), with a `layer`. It requires the
Deno runtime and keeps the native result type. For atomic directory output use `Deno.bundle`.

## Errors

`Deno.CompileError` is `Tool.InputInvalid`, `Tool.Failed`, `Tool.SpawnFailed`,
`Artifact.ArtifactError`, `Executable.InspectError`, `Executable.TargetMismatch`, or
`Commit.CommitError`; `bundle` and `transpile` raise `Deno.BuildError`, the same without the
executable errors.

[Getting started](https://github.com/mannyc2/effect-build/blob/main/docs/getting-started.md) ·
[Recipes](https://github.com/mannyc2/effect-build/blob/main/docs/recipes.md) ·
[Errors and checks](https://github.com/mannyc2/effect-build/blob/main/docs/errors.md)
