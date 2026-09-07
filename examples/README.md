# Examples

Start with the workflow you want to build. Each example includes source inputs, commands, expected results, and checks
you can run. The complete scenarios show how operations compose; the smaller provider recipes isolate individual APIs.

## Start with a complete workflow

| Goal                                  | Example                                           | What you learn                                                                                                            |
| ------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Ship a useful command-line tool       | [Bundle-budget CLI](cli/README.md)                | Effect CLI flags/help, JSON schema validation, readable and machine-readable output, budget failures, and Bun compilation |
| Package JavaScript for another system | [Artifact pipeline](artifact-pipeline/README.md)  | In-memory bundle → finalized files → verified ZIP → adoption identity; existing-output and tamper failures                |
| Extend a bundler and keep it alive    | [esbuild plugins and rebuilds](esbuild/README.md) | Native virtual modules, metafiles, scoped rebuilds, diagnostics, recovery, and disposal                                   |

The CLI runs from source before you install a compiler. The pipeline and esbuild recipes need only the Node runtime
and dependencies installed by the workspace. Use the [focused compiler examples](#focused-provider-recipes) below for
the smallest Bun, Deno, or Node SEA call.

## Set up the checkout

Run these commands from the repository root with Bun **1.3.14** and Node **24.14.1** on `PATH`:

```sh
bun install --frozen-lockfile
bun run build
```

The examples use `workspace:^` dependencies, so build the packages first. Run the commands below from the repository root;
`--cwd` sets the working directory so entrypoint and output paths resolve correctly. Node runs the TypeScript build
programs directly. The Bun API example runs inside Bun because it calls `Bun.build` in that process.

Try the complete examples:

```sh
bun run --cwd examples/cli report fixtures/bundles.json
bun run --cwd examples/artifact-pipeline build
bun run --cwd examples/esbuild plugin
```

The CLI prints an asset budget table, the pipeline creates `examples/artifact-pipeline/dist/inventory.zip`, and the
plugin recipe prints a generated module with a size report. Read each local README for variations and expected failures.

## Focused provider recipes

| Example                                                 | Additional prerequisite                                       | Result                                               |
| ------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------- |
| [Bun compile](bun/src/compile.ts)                       | Bun 1.3.14 on `PATH`                                          | Local standalone executable and SHA-256              |
| [Bun matrix](bun/src/compile-many.ts)                   | Bun 1.3.14; provider may download target runtimes             | Three executable targets, at most two builds at once |
| [Bun bundle](bun/src/bundle.ts)                         | Bun 1.3.14 as the host runtime                                | In-memory bundles and source maps                    |
| [Deno compile](deno/src/compile.ts)                     | Deno 2.9.5 on `PATH`; provider may download its runtime       | Local standalone executable and SHA-256              |
| [Deno transpile](deno/src/transpile.ts)                 | Deno 2.9.5 on `PATH`                                          | JavaScript and inline source map printed to stdout   |
| [esbuild bundle](esbuild/src/bundle.ts)                 | esbuild 0.28.2 is installed with the workspace                | In-memory JavaScript printed to stdout               |
| [esbuild directory](esbuild/src/bundle-to-directory.ts) | Same as above                                                 | Provider-written `dist/main.js`                      |
| [esbuild watch](esbuild/src/watch.ts)                   | Same as above                                                 | Scoped rebuilds held in memory                       |
| [Node SEA](node-sea/src/compile.ts)                     | Node 26.7.0 on Linux x64 with glibc and `--build-sea` support | Local standalone executable and SHA-256              |

The command layers select installed tools and check the admitted versions. Install the tools yourself before running an
example; effect-build does not install them or try another executable after a selected tool fails. See
[tool selection](../docs/providers.md#select-a-command) for explicit executable paths. If multiple distinct installations
match a tool name on `PATH`, selection fails with an ambiguity error.

## Bun

Compile and run a local executable:

```sh
bun run --cwd examples/bun compile
./examples/bun/dist/hello.exe
```

The build prints the absolute artifact path, inspected target, size, and SHA-256. Running the artifact prints
`Hello from Bun!`. The build program runs on Node and launches the selected Bun compiler; omitting `target` produces a
binary for that compiler's host. The `.exe` suffix also works on macOS and Linux and keeps this example usable on Windows.

Finalized executables require an unused destination. To repeat the example, remove its generated output first:

```sh
bun run --cwd examples/bun clean
bun run --cwd examples/bun compile
```

Every example's `clean` script deletes that example's entire `dist/` directory. In an application, a new output path per
build is another way to preserve earlier artifacts.

To compile the same application for Linux x64, macOS arm64, and Windows x64:

```sh
bun run --cwd examples/bun compile:many
```

The matrix uses a non-empty input tuple and `concurrency: 2`. Its report contains one success or typed failure per cell in
input order. The script reports every cell and exits unsuccessfully if any cell fails. Successful artifacts stay in
`examples/bun/dist/`; the matrix has no rollback. Run each artifact on a matching machine to test it. Creating a
cross-target binary does not prove it runs there.

To use Bun's in-process bundler:

```sh
bun run --cwd examples/bun bundle
```

This builds [main.ts](bun/src/main.ts) and [worker.ts](bun/src/worker.ts), which share
[greeting.ts](bun/src/greeting.ts), with splitting, minification, and source maps. It prints each native output's path and
size. No `outdir` is supplied, so the returned outputs remain in memory.

## Deno

With Deno 2.9.5 installed:

```sh
bun run --cwd examples/deno compile
./examples/deno/dist/hello.exe
```

The executable prints `Hello from Deno!`. The app needs no filesystem or network permissions. Add permissions to the
compile request only when your app uses them. Deno may still download a runtime while building; that is separate from the
compiled application's runtime permissions.

To print JavaScript without producing an executable:

```sh
bun run --cwd examples/deno transpile
```

This uses `Command.Transpile.transpile`, which removes TypeScript syntax and returns stdout bytes. It is not a bundling
operation. Use `bun run --cwd examples/deno clean` before compiling again to the same output path.

## esbuild

Print an in-memory bundle:

```sh
bun run --cwd examples/esbuild bundle
```

Write and run a bundle:

```sh
bun run --cwd examples/esbuild bundle:directory
node examples/esbuild/dist/main.js
```

The program prints `Hello from esbuild!`. `Api.Build` requires `write: false` and returns native `outputFiles`.
`Api.BuildToDirectory` requires `write: true`; esbuild owns these filesystem writes, including replacement of existing
files and any partial output left by failure. That result is not an effect-build finalized artifact.

Watch for edits:

```sh
bun run --cwd examples/esbuild watch
```

Edit [src/main.ts](esbuild/src/main.ts) to trigger another build. esbuild logs rebuilds, and the output stays in memory.
Press Ctrl+C to interrupt the Effect program. `NodeRuntime.runMain` handles the signal, and `Effect.scoped` closes the
context, cancelling pending work before disposing the native resource.

## Node SEA

Run this example on **Linux x64 with glibc**, with **Node 26.7.0** on `PATH` and `node --help` reporting `--build-sea`:

```sh
bun run --cwd examples/node-sea compile
./examples/node-sea/dist/hello.exe
```

The executable prints `Hello from Node SEA!`. The input is a complete [CommonJS program](node-sea/src/main.cjs), with no
package imports to bundle. `Command.AssembleExecutable.assembleDirect` assembles that JavaScript using the selected Node
builder and base executable. It does not compile TypeScript or bundle dependencies for you.

macOS, Windows, other architectures, and Node versions outside this exact admitted cell are rejected by the default
layer. See the [Node SEA package guide](../packages/effect-build-node-sea/README.md) for its supported input and tool
selection rules. Use `bun run --cwd examples/node-sea clean` before repeating the same build.

## Check the examples

From the repository root:

```sh
bun run check
bun run test:examples
```

`check` includes example application, build, and test source. `test:examples` exercises CLI output and failures, executes
generated esbuild modules across rebuilds, and independently extracts and runs a packaged application. Tests use
temporary output directories and do not erase your demo outputs. These checks also run in `bun run verify`.

The CLI's separate [compiled parity check](cli/README.md#checks) requires an explicitly selected Bun 1.3.14. It compares
source and executable output, diagnostics, and exit statuses. The existing real-Bun CI job runs it on each configured
host; local test success does not assert that hosted job has run for these changes. Other native compiler and producer
requirements remain explicit. There is no public Rolldown example while that package remains private.

## How these examples are organized

The structure draws on three useful repository patterns:

- [Effect's CLI examples](https://github.com/Effect-TS/effect/blob/e7eebf4685c294b423da3f7618629c0e0efc34cc/ai-docs/src/70_cli/10_basics.ts): typed inputs and a visible application/runtime boundary.
- [unbuild's example index](https://github.com/unjs/unbuild/blob/cf1c30333df2d6b19e6208f67157024975bdba82/examples/README.md): small, named learning goals with local configuration.
- [Vite's library playground](https://github.com/vitejs/vite/blob/8492422b8f110625a90c702f42f30784e8cf19dc/playground/lib/__tests__/lib.spec.ts) and [esbuild's plugin checks](https://github.com/evanw/esbuild/blob/f6058f8364fe7ab91ca57a83e02577ed74c9cae4/scripts/plugin-tests.js): examples checked through generated output and resource behavior.

These are structural references. Our examples use this workspace's pinned Effect v4 API and public package exports.
See [the contributor guidance](../CONTRIBUTING.md#keep-examples-useful) before adding another example.
