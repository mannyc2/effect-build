# Getting started

Install Bun 1.3.14 or 1.4.2 as the compiler and use Node 24 to run this build script.
From your project directory, install the library and matching Effect packages:

```sh
bun add effect-build-bun@0.7.0 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108
```

Create `src/cli.ts` containing `console.log("Hello!")`, then save this as `build.ts`:

```ts
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Bun from "effect-build-bun";

NodeRuntime.runMain(
  Bun.compile({ entrypoints: ["src/cli.ts"], outfile: "dist/cli" }).pipe(
    Effect.tap((artifact) => Effect.log(artifact)),
    Effect.provide(Bun.layer()),
    Effect.provide(NodeServices.layer),
  ),
);
```

Run `node build.ts`, then `./dist/cli`; it prints `Hello!`. On Windows, change
`outfile` to `dist/cli.exe` and run `.\dist\cli.exe`. Existing output is replaced.
`Bun.layer()` selects the compiler; `NodeServices.layer` supplies filesystem, path,
crypto, and process services. Provide the compiler layer around an `Effect.gen`
program to share it across operations. Use `Effect.forEach` for a target matrix.

Add `target: "linux-arm64"` to cross-compile, or `options: { minify: true }` to
minify. Paths resolve against `cwd` when provided. Cross-compilation can download
compiler runtimes; run the resulting binary only on a matching target.

Every artifact has `kind`, `path`, `bytes`, `sha256`, and `producedBy`. Executables
add `target` and `format`; directories include a sorted entry manifest with symlinks
recorded without traversal. Import core directly with `bun add effect-build@0.7.0`
for `Artifact.encode`, `Artifact.verify`, and other [combinators](../README.md).
See the [pipeline](../examples/artifact-pipeline) for composition and [providers](providers.md)
for runtime-specific APIs. The repository typechecks every checked-in example.
