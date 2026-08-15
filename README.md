# effect-build

Experimental, community-maintained executable construction for Effect applications.

The workspace contains exactly five lockstep public packages:

```text
effect-build-bun --------> effect-build
effect-build-deno -------> effect-build
effect-build-esbuild ----> effect-build
effect-build-node-sea ---> effect-build
```

Only `effect-build-esbuild` also depends on raw `esbuild@0.28.2`. No integration
depends on another integration. Applications compose integrations explicitly
with Effect.

## Install

For Bun executable compilation under the Node Effect platform:

```sh
bun add effect-build effect-build-bun effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108
```

For an Esbuild-to-Node-SEA application, install the three public packages it
uses directly:

```sh
bun add effect-build effect-build-esbuild effect-build-node-sea effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108
```

All five packages accept Effect `>=4.0.0-beta.104 <4.1.0-0`; the repository
reference is exactly `4.0.0-rc.108`.

## Bun and Deno executables

`effect-build-bun` and `effect-build-deno` retain the scalar
`compileExecutable` and homogeneous-provider `compileExecutableMatrix`
operations.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Bun from "effect-build-bun";

const artifact = await Effect.runPromise(
  Bun.compileExecutable({
    entrypoint: "src/main.ts",
    outfile: "dist/app",
  }).pipe(
    Effect.provide(Bun.layer()),
    Effect.provide(NodeServices.layer),
  ),
);
```

Use the matrix operation when an entrypoint, options, and name stem are shared:

```ts
const artifacts = await Effect.runPromise(
  Bun.compileExecutableMatrix({
    entrypoint: "src/main.ts",
    outdir: "dist",
    name: "app",
    targets: ["macos-aarch64", "linux-x64-gnu", "windows-x64"],
    concurrency: 2,
    digest: true,
    options: { minify: true },
  }).pipe(
    Effect.provide(Bun.layer()),
    Effect.provide(NodeServices.layer),
  ),
);
```

Matrix total preflight checks the complete request before any filesystem or
child-process work. Concurrency must be a positive safe integer. Execution is
bounded and collect-all: results and failures stay in target input order,
successful cells retain their already committed Artifacts, and there is no
matrix-wide rollback. Interruption terminates active children, skips queued
cells, and propagates the exact interruption Cause.

## Esbuild and Node SEA composition

`effect-build-esbuild` produces a continuation-scoped JavaScript bundle.
`effect-build-node-sea` consumes that neutral core capability and creates one
Linux x64 GNU executable with an already-installed exact Node 26.7.0 tool.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Esbuild from "effect-build-esbuild";
import * as NodeSea from "effect-build-node-sea";

const program = Esbuild.withJavaScriptBundle(
  { entrypoint: "src/main.ts", format: "esm" },
  (main) => NodeSea.createExecutable({ main, outfile: "dist/app", digest: true }),
).pipe(
  Effect.provide(Esbuild.layer),
  Effect.provide(NodeSea.layer()),
  Effect.provide(NodeServices.layer),
);
```

Bundle handles are live only inside their continuation. Node SEA authenticates
and privately copies the main, then runs selected Node `--check` against that
copy before both Node reads. It never uses postject and never downloads or
installs Node.

## Independent axes and hard migration

Package manager, Effect orchestrator runtime, build tool, and Artifact target
are four separate choices. Bun 1.3.14 manages this workspace; the pinned Bun
compiler fixture is 1.3.9. Importing an integration does not choose the runtime
that hosts the Effect program.

The v0.3 package cut deliberately replaces the v0.2 import paths:

```text
effect-build/bun  -> effect-build-bun
effect-build/deno -> effect-build-deno
```

The operation/type behavior is preserved with no legacy subpath fallback.
The earlier combined Node SEA candidate was unreleased and is superseded by
explicit application composition.

There is no registry, fallback compiler, retry, automatic installation, raw
argv escape hatch, or generic build executor. Stage values are observations,
not manifests, receipts, provenance, hermeticity, or reproducibility claims.

## Documentation

- [API](docs/api.md)
- [Architecture](docs/architecture.md)
- [Integrations](docs/drivers.md)
- [Errors](docs/errors.md)
- [Runnable examples](examples/README.md)

Run `bun run verify` for the deterministic local gate.
