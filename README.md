# effect-build

Typed native tool bindings as composable Effect programs.

A binding is an Effect service: resolve an executable once, then call its methods to build,
package, sign, or inspect files. Methods return paths or native reports. Applications supply
the platform, choose publication boundaries, and compose the release workflow.

This checkout contains **0.9.0, unreleased**, with Effect 4.0.0. The 0.9 API replaces the earlier
artifact and provider model without compatibility aliases. See the [changelog](CHANGELOG.md)
for the breaking changes.

## A build is an Effect

This complete program is the [typechecked Bun example](examples/bun-build/src/main.ts).
It creates a source file, bundles it with the native Bun command, and logs the final output
directory. The surrounding scope removes the example's temporary files when it ends.

```ts
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, FileSystem, Layer, Path } from "effect";
import { Bun } from "effect-build-bun";

const program = Effect.gen(function*() {
  const bun = yield* Bun;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-example-" });
  const main = path.join(directory, "main.ts");
  yield* fs.writeFileString(main, 'console.log("built with Effect");\n');
  const output = yield* bun.build({
    entrypoints: [main],
    outdir: path.join(directory, "output"),
    target: "bun",
    atomic: true,
  });
  yield* Console.log(output);
});

const services = Bun.layer().pipe(Layer.provideMerge(NodeServices.layer));
NodeRuntime.runMain(program.pipe(Effect.scoped, Effect.provide(services)));
```

The Bun layer captures its native process spawner and the filesystem services it needs.
An explicit executable wins; otherwise it chooses the first runnable PATH match. It never
installs a compiler or changes the selected executable after construction. Its version probe
warns outside the tested range and allows the operation to run.

Producing bindings write directly by default. `atomic: true` stages beside the destination:
one rename for a file, or one rename per produced bundle file. Bundle publication preserves
unrelated destination files and can partially commit. See [publication and errors](docs/errors.md).

## Bindings

Core and all eight bindings share the 0.9.0 version. Each binding depends on core, with no provider sibling
dependencies. The service owns its native flags, inputs, and results.

| Package                                                           | Services and operations                              |
| ----------------------------------------------------------------- | ---------------------------------------------------- |
| [effect-build-bun](packages/effect-build-bun/README.md)           | `Bun.build`, `Bun.compile`                           |
| [effect-build-deno](packages/effect-build-deno/README.md)         | `Deno.compile`, `Deno.bundle`                        |
| [effect-build-node-sea](packages/effect-build-node-sea/README.md) | `NodeSea.assemble` through native `node --build-sea` |
| [effect-build-python](packages/effect-build-python/README.md)     | `Python.build` through uv                            |
| [effect-build-nfpm](packages/effect-build-nfpm/README.md)         | `Nfpm.package`                                       |
| [effect-build-sbom](packages/effect-build-sbom/README.md)         | `Sbom.generate`, `Sbom.report` through Syft          |
| [effect-build-apple](packages/effect-build-apple/README.md)       | `Codesign`, `Notarytool`, `Stapler`                  |
| [effect-build-windows](packages/effect-build-windows/README.md)   | `SignTool.sign`, `SignTool.verify`                   |

Here `Bun.build` names the method on the service obtained with `yield* Bun`; operations are
called on that service instance. JavaScript bundler APIs and archive or wheel format writers
belong in the application.

## Core

[effect-build](packages/effect-build/README.md) exposes six modules. Third-party bindings use
the same kernel as the packages above.

| Module        | Purpose                                                                               |
| ------------- | ------------------------------------------------------------------------------------- |
| `Tool`        | Resolve once; run a command, consume an event stream, or open a scoped native session |
| `Atomic`      | Stage and publish files or bundle leaves                                              |
| `Executable`  | Check four bytes for recognizable native executable magic                             |
| `Digest`      | Stream SHA-256 reads and verify current file bytes                                    |
| `Environment` | Replace command environments with caller-supplied values                              |
| `Layout`      | Validate portable relative leaf paths                                                 |

`Tool.run` waits for consumed output and the accepted exit code. `Tool.stream` starts when
consumed, emits decoded events, and checks completion before ending. `Tool.session` returns
the platform's process handle in the caller's scope for applications that own pipe writers
and lifecycle policy.

`effect-build/testing` supplies `ToolTest.handle` and `ToolTest.layer`, thin defaults over
Effect's native process test seam. Application tests can replace a binding directly with
`Layer.succeed`. See [recipes](docs/recipes.md).

## Run the source examples

Use Node 22.19 or newer, Bun 1.3.14 for workspace tooling, and an ESM project. The checked-in
examples run with Node 24.14.1. The Bun build also needs the native Bun executable on PATH.

```sh
bun install --frozen-lockfile
bun run build
bun run --cwd examples/tool-runs test
bun run --cwd examples/bun-build test
```

The [ffmpeg session example](examples/ffmpeg-session) contains finite ffprobe bindings and a
live encoder with two input pipes, bounded queues, progress events, and an Effect-clock
watchdog. It stays an example until another caller needs a shared package.

The [signing applications](examples/signing) compose Developer ID notarization and Windows
Trusted Signing. They are typechecked normally and run only in the manual credentialed workflow.

Read [getting started](docs/getting-started.md), [tools and bindings](docs/providers.md),
[compatibility](docs/compatibility.md), [digests](docs/digests.md), and the
[documentation guide](docs/README.md). `bun run docs` builds the API reference from exported
classes and JSDoc into `dist/api`.

For repository development, [CONTRIBUTING.md](CONTRIBUTING.md) describes the checks.
`bun run verify` is the merge bar; the operating-system and real-tool CI matrix is the release bar.
