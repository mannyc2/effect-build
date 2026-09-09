# Getting started

Use Node 24 and install Bun 1.3.14 or 1.4.2 as the compiler. In your project:

```sh
npm install --save-dev --save-exact effect-build-bun@0.7.0 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108 @effect/platform-node-shared@4.0.0-rc.108
```

Create `src/cli.ts` containing `console.log("Hello!")`. Save this complete runner as
`build.mjs`; it needs no TypeScript runner or additional wrapper:

```js
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

Run `node build.mjs`, then `./dist/cli`; it prints `Hello!`. On Windows, change
`outfile` to `dist/cli.exe` and run `.\dist\cli.exe`. Existing output is replaced.
The same program can be saved as `build.ts` and run with `node build.ts` on Node 24.

`Bun.compile` constructs an Effect; `NodeRuntime.runMain` executes it and reports
failures with a failing exit status. `Bun.layer()` selects the compiler and
`NodeServices.layer` supplies filesystem, path, crypto, and process services.
A missing compiler fails with `ToolNotFound`; install Bun or pass
`Bun.layer({ executable: "/absolute/path/to/bun" })`. An `undefined` executable, such
as an unset environment variable, means PATH. Compilation errors retain
stdout/stderr. See [errors](errors.md) for recovery and diagnostics.

Provide the compiler layer around an `Effect.gen` program to share it across
operations. Use `Effect.forEach` for a target matrix. Add `target: "linux-arm64"`
to cross-compile, or `options: { minify: true }` to minify. Paths resolve against
`cwd` when provided. Cross-compilation can download compiler runtimes; run the
resulting binary only on a matching target.

Every artifact has `kind`, `path`, `bytes`, `sha256`, and `producedBy`. Executables
add `target` and `format`; directories include a sorted entry manifest with symlinks
recorded without traversal. Install `effect-build@0.7.0` directly for
`Artifact.encode`, `Artifact.verify`, and other [combinators](../README.md).
The [pipeline](../examples/artifact-pipeline) demonstrates composition. Read the
[compatibility contract](compatibility.md) before choosing another runtime or Effect
version, and [providers](providers.md) for runtime-specific APIs. The repository
executes the first-build program from installed tarballs and typechecks its examples.
