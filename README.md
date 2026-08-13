# effect-build

Experimental, community-maintained executable compilation for Effect applications.

The project has a portable core plus exactly two compiler providers:

```text
effect-build-bun  ─┐
                   ├─> effect-build
effect-build-deno ─┘
```

Each provider exposes exactly two build operations: `compileExecutable` for one
caller-named output and `compileExecutableMatrix` for one provider's non-empty
target set. Results are typed Artifacts, failures are typed, interruption owns
every active child, and a destination is never a half-written executable.

## Install

Install the core, exactly one provider, Effect, and the official platform for
the runtime hosting your Effect program. For the Bun compiler provider:

```sh
bun add effect-build effect-build-bun effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108
```

Use `effect-build-deno` instead of `effect-build-bun` to select Deno. The
three public packages share the evidenced Effect peer interval
`>=4.0.0-beta.104 <4.1.0-0`; the exact repository reference is
`4.0.0-rc.108`. Required CI runs clean packed consumers at beta.104 and
rc.108.

Node is the supported orchestrator runtime. Bun and Deno are compilers; running
the Effect program itself under Bun or Deno remains experimental.

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

The application chooses its platform services once. Importing
`effect-build-bun` selects the compiler; it does not select the runtime hosting
the Effect program.

## Four independent axes

| Axis                 | Current examples             | Selected by                         |
| -------------------- | ---------------------------- | ----------------------------------- |
| Package manager      | Bun or npm in consumer tests | install command                     |
| Orchestrator runtime | Node                         | official Effect platform Layer      |
| Compiler             | Bun or Deno                  | provider package and compiler Layer |
| Artifact target      | macOS, Linux, or Windows     | optional `target` field             |

Changing one axis does not silently change another. In particular, the
workspace's Bun 1.3.14 package-manager pin is independent from the Bun 1.3.9
compiler fixture.

Under the Node orchestrator, pinned real-compiler CI requires:

- Bun 1.3.9: `macos-x64`, `macos-aarch64`, `linux-x64-gnu`,
  `linux-x64-musl`, `linux-aarch64-gnu`, and `windows-x64`.
- Deno 2.9.3: `macos-x64`, `macos-aarch64`, `linux-x64-gnu`,
  `linux-aarch64-gnu`, `windows-x64`, and `windows-aarch64`.

Every listed pair is compiled and its native format, architecture, and Linux
ABI are checked by external system tools. Current Linux x64 GNU artifacts are
also executed. Foreign outputs are not executed on the Linux CI runner. These
fixture versions define the regularly revalidated support boundary; the
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

Matrix total preflight validates the whole request before any filesystem,
argument-rendering, or child-process work. Execution is bounded and
collect-all: successful cells commit independently, while `MatrixFailed`
returns ordered successful Artifacts and every ordered cell failure. There is
no matrix-wide rollback. Interruption remains an Effect Cause: active children
are terminated, queued cells do not start, staging is cleaned, and already
committed Artifacts remain.

The matrix is provider-homogeneous. Cross-provider work, different entry
points, heterogeneous options, and custom output names remain ordinary
composition of scalar calls.

## Compiler selection

`Bun.layer()` and `Deno.layer()` discover their compiler on `PATH` and probe
it once. To choose a specific executable, pass an absolute path:

```ts
Bun.layer({ executable: "/opt/bun/bin/bun" });
```

There is no registry, automatic installation, fallback compiler, retry, shell
command, or raw argument escape hatch. Project configuration and environment
follow each compiler CLI's normal behavior.

## Provider authors

`effect-build/Provider` exposes the narrow `define` factory used by the two
first-party provider packages. It is a closed authoring SPI for `"bun"` and
`"deno"`, not a compiler registry or an additional build operation. Lifecycle,
process, discovery, staging, validation, hashing, and atomic replacement stay
private to core.

## Documentation

- [API](docs/api.md)
- [Architecture](docs/architecture.md)
- [Compiler providers](docs/drivers.md)
- [Errors](docs/errors.md)
- [Runnable examples](examples/README.md)

Run `bun run verify` for the deterministic local gate. Tool-backed current-host
runs are in `bun run verify:real`. The exhaustive target gate is
`bun run verify:targets`; it requires Linux x64 with Ubuntu's
`/usr/bin/file` and `/usr/bin/readelf`.
