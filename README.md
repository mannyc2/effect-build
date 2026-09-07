# effect-build

Build executables, bundle JavaScript, and produce distribution artifacts with Effect v4.

effect-build wraps tools such as Bun, Deno, and esbuild in composable Effect programs. It keeps their native options and diagnostics, manages the lifetime of processes and watchers, and offers explicit operations for validating and atomically committing finished artifacts.

## Compile your first executable

This example runs the build script with **Node.js 24.14.1** and uses **Bun 1.3.14** as the compiler. Install [Bun](https://bun.com/docs/installation) separately and check `bun --version`: this example pins `1.3.14` for reproducibility. The [generated compatibility table](docs/compiler-compatibility.md) records accepted command versions.

In a new project, install the provider and matching Effect packages:

```sh
npm init -y
npm install --save-exact effect-build-bun@0.6.3 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108
```

Create `hello.ts`:

```ts
console.log("Hello from a standalone executable!");
```

Create `build.mts`:

```ts
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Command } from "effect-build-bun";

const program = Effect.gen(function*() {
  const artifact = yield* Command.CompileExecutable.compileExecutable({
    entrypoints: ["hello.ts"],
    outfile: "dist/hello.exe",
    observation: "hashed",
  });

  yield* Effect.log(`Built ${artifact.path} (${artifact.bytes} bytes, ${artifact.target})`);
  yield* Effect.log(`SHA-256: ${artifact.digest.value}`);
});

NodeRuntime.runMain(
  program.pipe(
    Effect.provide(Command.layer()),
    Effect.provide(NodeServices.layer),
  ),
);
```

Run from that project directory:

```sh
node build.mts
./dist/hello.exe
```

The executable prints `Hello from a standalone executable!`. In PowerShell, run it as `.\dist\hello.exe`. The filename works on all three OS families; omitting `target` uses the selected compiler's native default. The returned artifact records the target inspected from the finished binary.

**The destination must not already exist.** To build again, choose a new `outfile` or explicitly remove this demo's output. Finalization checks the candidate before committing it and refuses to overwrite an existing file. `NodeRuntime.runMain` reports failures and turns Ctrl+C into Effect interruption so scoped resources can close.

See the [getting started guide](docs/getting-started.md) for compiler selection, build options, artifact fields, and an in-memory esbuild example.

For complete workflows, try the [typed bundle-budget CLI](examples/cli/README.md), the
[bundle-to-archive pipeline](examples/artifact-pipeline/README.md), or [native plugins and scoped rebuilds](examples/esbuild/README.md).

## Choose a package

Install the provider or producer you need. Each depends on the shared `effect-build` core.

| Task                                                   | Package                 | Start here                                                            |
| ------------------------------------------------------ | ----------------------- | --------------------------------------------------------------------- |
| Bun bundling, transpilation, or executable compilation | `effect-build-bun`      | [Bun examples](examples/README.md#bun)                                |
| Deno transpilation or executable compilation           | `effect-build-deno`     | [Deno examples](examples/README.md#deno)                              |
| esbuild bundles, transforms, or watch contexts         | `effect-build-esbuild`  | [esbuild examples](examples/README.md#esbuild)                        |
| Assemble a Node.js single executable                   | `effect-build-node-sea` | [Node SEA example and host requirements](examples/README.md#node-sea) |
| ZIP, tar.gz, or exact Git-tree source archives         | `effect-build-archives` | [Package guide](packages/effect-build-archives/README.md)             |
| Python wheels and source distributions with uv         | `effect-build-python`   | [Package guide](packages/effect-build-python/README.md)               |
| Linux packages and unsigned MSIX with nFPM             | `effect-build-nfpm`     | [Package guide](packages/effect-build-nfpm/README.md)                 |
| Apple bundles, signing, notarization, DMG, and pkg     | `effect-build-apple`    | [Package guide](packages/effect-build-apple/README.md)                |
| MSIX signing and signature verification                | `effect-build-windows`  | [Package guide](packages/effect-build-windows/README.md)              |
| SPDX or CycloneDX documents                            | `effect-build-sbom`     | [Package guide](packages/effect-build-sbom/README.md)                 |
| Artifact identities, finalizers, or bounded matrices   | `effect-build`          | [Core API](docs/api.md#imports)                                       |

## How the API fits together

Providers expose two kinds of modules, where supported:

- **`Api`** calls the provider in process. Use it for native values such as esbuild output files, Bun transpilation results, or scoped build contexts. Bun's `Api` needs the Bun runtime; esbuild's `Api` uses the installed esbuild dependency.
- **`Command`** selects an installed executable through an Effect layer. Use it to invoke a compiler from another runtime, keep a specific tool version, or run an executable finalizer. The selected tool's bytes are checked again before each launch.

These choices are independent: a Node.js build script can invoke Bun to produce a Linux executable. Cross-target support and runtime acquisition depend on the selected provider; see [compiler versions and targets](docs/drivers.md).

Output ownership depends on the operation. An in-memory build returns provider-native data. A direct-directory build follows the provider's filesystem behavior and can leave partial output on failure. An **explicit finalizer**, such as `Command.CompileExecutable.compileExecutable`, returns an artifact only after inspection and atomic commit to an unused destination. See [the API guide](docs/api.md) for the distinction and the [architecture](docs/architecture.md) for filesystem guarantees.

## Documentation

- [Getting started](docs/getting-started.md) — install, run, customize, and inspect a build.
- [Runnable examples](examples/README.md) — included inputs, commands, and expected results.
- [API reference](docs/api.md) — public modules, artifacts, matrices, and adoption.
- [Provider guide](docs/drivers.md) — versions, host requirements, options, and targets.
- [Errors and troubleshooting](docs/errors.md) — typed failures and recovery decisions.
- [Contributing](CONTRIBUTING.md) — workspace setup and verification.

The [combined contract](tooling/effect-build-contract.json) records implementation scope; [the public API projection](tooling/public-api.json) lists the exported modules. Rolldown is a private evidence package and is not a public installation option. Downstream release systems own publishing; effect-build supplies [artifact identities they can adopt](docs/release-security.md).
