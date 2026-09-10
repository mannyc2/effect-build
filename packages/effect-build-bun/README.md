# effect-build-bun

Compile native executables and bundle TypeScript with [Bun](https://bun.sh), as Effect programs.
The executable comes back as an `Artifact.Executable` whose target was read from its header, ready
for an archive, an installer, a signer, or an SBOM scan.

```sh
npm install --save-dev --save-exact effect-build-bun@0.7.0 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108 @effect/platform-node-shared@4.0.0-rc.108
```

Bun 1.3.14 or newer must be installed; it does not have to run the build. The provider drives the
`bun` CLI from Node or Bun.

## Usage

```ts
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Bun from "effect-build-bun";

const program = Effect.gen(function*() {
  const cli = yield* Bun.compile({
    entrypoints: ["src/cli.ts"],
    outfile: "dist/cli-linux-arm64",
    target: "linux-arm64",
    options: { minify: true },
  });
  const site = yield* Bun.bundle({
    entrypoints: ["src/app.ts"],
    outdir: "dist/app",
    options: { target: "browser", format: "esm", sourcemap: "linked" },
  });
  return [cli, site];
});

NodeRuntime.runMain(program.pipe(Effect.provide(Bun.layer()), Effect.provide(NodeServices.layer)));
```

## Operations

| Operation                                                               | Returns                     | Runs                                                                                              |
| ----------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------- |
| `compile({ entrypoints, outfile, target?, cwd?, options?, onOutput? })` | `Artifact.Executable`       | `bun build --compile`. The output's header is checked against `target` before the commit.         |
| `bundle({ entrypoints, outdir, cwd?, options?, onOutput? })`            | `Artifact.Directory`        | `bun build` into a directory, staged as a sibling so relative imports and source maps stay valid. |
| `build({ entrypoints, cwd?, options?, onOutput? })`                     | `Uint8Array`                | `bun build` to stdout: the bundle as bytes, for callers that write it themselves.                 |
| `watch({ entrypoints, outdir, options?, stdio?, noClearScreen? })`      | `{ tool, process, outdir }` | `bun build --watch` for as long as the scope is open. Output is inherited unless `stdio: "pipe"`. |

Every producing operation also takes `atomic`, `onExists`, and `prefix`
([atomic output](https://github.com/mannyc2/effect-build/blob/main/docs/errors.md#atomic-output)).
Paths resolve against `cwd` when given.

## Targets and options

`target` accepts the eight core targets and Bun's own names (`Bun.BunTarget`: `bun-linux-x64-baseline`,
`bun-windows-x64-modern`, and the rest). Without a target, Bun builds for its host and the
provider inspects the result. Cross-compiling downloads that target's Bun runtime on first use.
Windows outputs must end in lowercase `.exe`; Bun names them that way and the provider rejects an
`outfile` that does not match instead of renaming.

`Bun.CompileOptions` covers `minify` (boolean or `{ syntax, whitespace, identifiers, keepNames }`),
`sourcemap`, `bytecode`, `packages`, `external`, `conditions`, `define`, `environmentInline`,
`execArgv`, the `autoload*` switches, and `windows` metadata (`icon`, `title`, `publisher`,
`version`, `description`, `copyright`, `hideConsole`). `Bun.BundleOptions` adds the bundler's
`target` (`browser`, `bun`, `node`), `format`, `splitting`, `naming`, `loader`, `banner`,
`footer`, `drop`, `features`, `tsconfig`, and more.

## Versions

`Bun.supported` is `>=1.3.14 <2.0.0` and `Bun.tested` records the CI fixtures, 1.3.14 and 1.4.2.
`compile` and `bundle` reject 1.4.1, which reproduces a variable-collision defect in emitted
builds; the native API does not depend on it. `Bun.layer({ executable, version })` selects a
binary and an npm semver range or predicate; see
[tools and providers](https://github.com/mannyc2/effect-build/blob/main/docs/providers.md).

## Native API

`effect-build-bun/api` wraps `Bun.build` (`Build.build`, `Build.buildToDirectory`) and
`Bun.Transpiler` (`Transpiler.make`, `transform`, `transformSync`, `scan`, `scanImports`), with a
combined `layer`. It requires the Bun runtime and keeps Bun's own result types. Its declarations
reference `bun-types`, an optional peer (`>=1.3.14 <2.0.0`); the package root needs neither Bun
nor `bun-types`, so Node consumers install no Bun declarations.

## Signing on macOS

`Bun.entitlements` lists the hardened-runtime entitlements Bun's compiled executables need to
start once signed. Pass it to `Apple.sign({ artifact, certificateSha1, entitlements: Bun.entitlements })`.

## Errors

`Bun.CompileError` is `InputInvalid` (tag `BunInputInvalid`), `Tool.Failed`, `Tool.SpawnFailed`,
`Artifact.ArtifactError`, `Executable.InspectError`, `Executable.TargetMismatch`, or
`Commit.CommitError`. The layer can fail with `Tool.NotFound`, `Tool.ProbeFailed`, or
`Tool.VersionUnsupported`.

[Getting started](https://github.com/mannyc2/effect-build/blob/main/docs/getting-started.md) ·
[Recipes](https://github.com/mannyc2/effect-build/blob/main/docs/recipes.md) ·
[CLI example](https://github.com/mannyc2/effect-build/tree/main/examples/cli)
