# effect-build

Experimental, community-maintained build support for Effect applications.

`bun build --compile` / `deno compile`, except the result is a typed Artifact,
failures are typed, interruption owns the child, and the destination is never
a half-written executable.

## Install

```sh
pnpm add effect-build effect@4.0.0-beta.107 @effect/platform-node@4.0.0-beta.107
```

The v0.1.0 support contract uses the official Node platform package to host the
Effect program. Bun and Deno are the supported compilers; running the
orchestrator itself under Bun or Deno remains experimental.

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

| Axis                 | Examples      | Selected by                            |
| -------------------- | ------------- | -------------------------------------- |
| Orchestrator runtime | Node          | the official Effect platform layer     |
| Compiler             | Bun or Deno   | the package subpath and compiler Layer |
| Artifact target      | Linux x64 GNU | the optional `target` field            |

Changing one axis does not silently change either of the others.

The supported v0.1.0 cell is Node on Linux x64 GNU with either compiler.
Other orchestrator hosts and artifact targets remain experimental.

## Concurrent targets (experimental)

Normal Effect composition can compile different targets concurrently. This
example uses foreign targets, which remain outside the v0.1.0 support contract:

```ts
const mac = Bun.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app-macos",
  target: "macos-aarch64",
}).pipe(Effect.provide(Bun.layer()));

const linux = Deno.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app-linux",
  target: "linux-x64-gnu",
}).pipe(Effect.provide(Deno.layer()));

const artifacts = await Effect.runPromise(
  Effect.all([mac, linux], { concurrency: 2 }).pipe(Effect.provide(NodeServices.layer)),
);
```

This composition is fail-fast: the first failure interrupts the remaining
work. Use an explicit validation strategy when every failure must be collected.

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
integration runs are in `pnpm verify:real`.
