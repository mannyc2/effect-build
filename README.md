# effect-build

Experimental, community-maintained build support for Effect applications.

`bun build --compile` / `deno compile`, with exactly two public operations:
`compileExecutable` for one caller-named output and
`compileExecutableMatrix` for one provider's non-empty target set. Results are
typed Artifacts, failures are typed, interruption owns every active child, and
a destination is never a half-written executable.

## Install

```sh
pnpm add effect-build effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108
```

The package peer contract is the evidenced Effect 4.0 interval
`>=4.0.0-beta.104 <4.1.0-0`; the exact reference environment is
`4.0.0-rc.108`. Required compatibility CI tests both beta.104 and rc.108 with
fresh Node-host consumers. Those endpoint checks do not promote Bun or Deno as
supported orchestrator hosts.

The support contract uses the official Node platform package to host the Effect
program. Bun and Deno are the supported compilers; running the orchestrator
itself under Bun or Deno remains experimental.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Bun from "effect-build/bun";

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

The application chooses its orchestrator services once. Importing
`effect-build/bun` selects the compiler; it does not select the runtime hosting
the Effect program.

## Three independent axes

| Axis                 | Examples              | Selected by                            |
| -------------------- | --------------------- | -------------------------------------- |
| Orchestrator runtime | Node                  | the official Effect platform layer     |
| Compiler             | Bun or Deno           | the package subpath and compiler Layer |
| Artifact target      | macOS, Linux, Windows | the optional `target` field            |

Changing one axis does not silently change either of the others.

Under the Node orchestrator, pinned real-compiler CI requires these artifact
targets:

- Bun 1.3.9: `macos-x64`, `macos-aarch64`, `linux-x64-gnu`,
  `linux-x64-musl`, `linux-aarch64-gnu`, and `windows-x64`.
- Deno 2.9.3: `macos-x64`, `macos-aarch64`, `linux-x64-gnu`,
  `linux-aarch64-gnu`, `windows-x64`, and `windows-aarch64`.

Every listed pair is compiled and its native format, architecture, and Linux
ABI are checked by external system tools. Current Linux x64 GNU artifacts are
also executed. Foreign outputs are not executed on the Linux CI runner.

These fixture versions define the regularly revalidated support boundary; the
library does not reject another installed compiler version at runtime.

## Target matrix

Use one provider's matrix operation when the entry point, options, and output
name stem are shared across targets:

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

The canonical output names are `dist/app-macos-aarch64`,
`dist/app-linux-x64-gnu`, and `dist/app-windows-x64.exe`. Output order is the
same as target input order. `concurrency` defaults to 1 and accepts only a
positive safe integer.

Matrix preflight validates the whole request, including every output path and
the provider options, before creating an output or staging directory, rendering
compile argv, or spawning a build child. Provider discovery and its one probe
happen when the compiler Layer is acquired. Once execution starts, it is
bounded and collect-all: successful cells commit independently, while
`MatrixFailed` returns the ordered successful Artifacts and every ordered cell
failure. There is no matrix-wide rollback.
Interruption remains an Effect Cause: active children are terminated, queued
cells do not start, staging is cleaned, and already committed Artifacts remain.

The matrix is deliberately provider-homogeneous. Cross-provider work, different
entry points, heterogeneous options, and custom output names remain ordinary
composition of scalar calls.

## Compiler selection

`Bun.layer()` and `Deno.layer()` discover their compiler on `PATH` and probe it
once. To choose a specific executable, pass an absolute path:

```ts
Bun.layer({ executable: "/opt/bun/bin/bun" });
Deno.layer({ executable: "/opt/deno/bin/deno" });
```

There is no registry, automatic installation, fallback compiler, retry, shell
command, or raw argument escape hatch. Project configuration and environment
follow each compiler CLI's normal behavior.

## Documentation

- [API](docs/api.md)
- [Architecture](docs/architecture.md)
- [Compiler modules](docs/drivers.md)
- [Errors](docs/errors.md)
- [Runnable examples](examples/README.md)

Run `pnpm verify` for the deterministic local gate. Tool-backed Bun and Deno
current-host runs are in `pnpm verify:real`. The exhaustive real target gate is
`pnpm verify:targets`; it requires Linux x64 with Ubuntu's `/usr/bin/file` and
`/usr/bin/readelf`, and otherwise directs the caller to the required Ubuntu CI
jobs.
