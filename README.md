# effect-build

Experimental, community-maintained build support for Effect applications.

`bun build --compile` / `deno compile`, except the result is a typed Artifact,
failures are typed, interruption owns the child, and the destination is never
a half-written executable.

## Install

```sh
pnpm add effect-build effect@4.0.0-beta.107 @effect/platform-node@4.0.0-beta.107
```

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
  `linux-x64-musl`, `linux-aarch64-gnu`, `linux-aarch64-musl`, `windows-x64`,
  and `windows-aarch64`.
- Deno 2.9.3: `macos-x64`, `macos-aarch64`, `linux-x64-gnu`,
  `linux-aarch64-gnu`, `windows-x64`, and `windows-aarch64`.

Every listed pair is compiled and its native format, architecture, and Linux
ABI are checked by external system tools. Current Linux x64 GNU artifacts are
also executed. Foreign outputs are not executed on the Linux CI runner.

These fixture versions define the regularly revalidated support boundary; the
library does not reject another installed compiler version at runtime.

## Concurrent targets

Normal Effect composition can compile different targets concurrently:

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
current-host runs are in `pnpm verify:real`. The exhaustive real target gate is
`pnpm verify:targets`; it requires Linux x64 with Ubuntu's `/usr/bin/file` and
`/usr/bin/readelf`, and otherwise directs the caller to the required Ubuntu CI
jobs.
