# Getting started

The [README quick start](../README.md#compile-your-first-executable) creates a complete Bun executable from a Node.js build script. This guide explains how to adapt it and when to choose another operation.

## Install and run

The examples use `effect-build` packages at `0.6.3` and matching Effect/platform packages at `4.0.0-rc.108`. Pin the Effect release explicitly: an unqualified `effect` install can select a different major or prerelease. The supported peer range is recorded in each package's `package.json`; the examples use the workspace's exact development pins.

```sh
npm install --save-exact effect-build-bun@0.6.3 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108
```

There is no `effect-build` CLI. Write a build program and execute it with your chosen runtime. The quick start uses `build.mts`, which [Node runs as a TypeScript ES module](https://nodejs.org/dist/latest-v24.x/docs/api/typescript.html); Node 24.14.1 is the workspace's Node host pin. Running TypeScript this way does not typecheck it.

The compiler is a separate installation. Bun's command adapter admits **Bun 1.3.14**, Deno's admits **Deno 2.9.5**, and esbuild's command adapter admits **esbuild 0.28.2**. A newer executable is not automatically admitted. See the [provider guide](drivers.md) for the full requirements, including Node SEA's Linux host restriction.

For a TypeScript editor or CI check of a standalone `build.mts`, add the toolchain and check without emitting JavaScript:

```sh
npm install --save-dev --save-exact typescript@6.0.3 @types/node@24.3.0
npx tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext build.mts
```

`skipLibCheck` applies to dependency declaration files; the build program is still checked. The repository's [verification gate](../CONTRIBUTING.md) also checks all example source against the built workspace packages.

## Compose the build once

In the quick start, three lines have distinct jobs:

| Expression                                           | Responsibility                                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| `Command.CompileExecutable.compileExecutable(input)` | Describes one build; it does not run until the Effect is executed.               |
| `Effect.provide(Command.layer())`                    | Selects and observes Bun, then provides it to the program.                       |
| `Effect.provide(NodeServices.layer)`                 | Supplies filesystem, path, crypto, and child-process services for the Node host. |

`NodeRuntime.runMain` starts the program, reports failures, and handles process signals. Use it at a script's entry point. Inside an existing Effect application, compose the build into the application's Effect instead of starting a nested runtime.

For several operations with the same compiler, provide the compiler layer around the whole program. They then share that selected tool. The provider reauthenticates its bytes before every launch; replacing the compiler halfway through a build causes a typed failure.

## Choose an exact compiler path

By default, `Command.layer()` searches `PATH`. If distinct canonical executables make selection ambiguous, choose one explicitly. Add these imports and replace the quick start's layer provision with a stored layer:

```ts
import { Schema } from "effect";
import { Command } from "effect-build-bun";
import * as Artifact from "effect-build/Artifact";

const compiler = Command.layer({
  executable: Schema.decodeUnknownSync(Artifact.AbsolutePath)("/opt/bun-1.3.14/bin/bun"),
});
```

Use `Effect.provide(compiler)` where the quick start uses `Effect.provide(Command.layer())`. Replace the example path with your installation's normalized absolute path. On Windows, use a normalized absolute Windows path with escaped backslashes. Decoding `Artifact.AbsolutePath` validates the path's form; selection checks whether a usable executable exists there.

Install `effect-build@0.6.3` directly when importing its modules in your application. Provider packages depend on core, but a direct dependency makes your own imports explicit.

## Customize a Bun executable

Replace the compile call's input with:

```ts
import { Command } from "effect-build-bun";

const input = {
  entrypoints: ["hello.ts"],
  outfile: "dist/hello-minified.exe",
  observation: "hashed",
  options: {
    minify: true,
    sourcemap: "inline",
  },
} satisfies Command.CompileExecutable.Input<"hashed">;
```

Then call `Command.CompileExecutable.compileExecutable(input)`. Paths are relative to the process's working directory, or to `cwd` when you provide one. Inline source maps stay inside the one executable; this finalizer does not publish sidecar map files.

Omit `target` for the compiler's native default. Set a provider target such as `"bun-linux-x64"` only when you intend to target that platform. The accepted target vocabulary, compiler runtime downloads, and the ability to run the result are separate concerns. Cross-target compilation may require provider-managed downloads; it does not make the result runnable on your build host.

## Understand the result

With `observation: "hashed"`, the Bun compiler returns a durable executable with these useful fields:

| Field              | Meaning                                                               |
| ------------------ | --------------------------------------------------------------------- |
| `path`             | Absolute location of the committed executable.                        |
| `bytes`            | Exact byte count as a decimal string.                                 |
| `digest.value`     | SHA-256 digest as 64 lowercase hexadecimal characters.                |
| `digest.algorithm` | `"sha256"`.                                                           |
| `target`           | Core system target established by executable inspection.              |
| `nativeFormat`     | Inspected `"elf"`, `"mach-o"`, or `"pe"` format.                      |
| `tool`             | Observation of the selected compiler, including its content identity. |

Use `observation: "unhashed"` if your returned value does not need a digest. This changes the result type; it does not bypass validation or the finalizer's internal content checks. Adoption and verified-byte continuations require the hashed form.

The destination must be unused. Finalizers create parent directories as needed, work in private staging beside the destination, and commit only after validating the candidate. An existing output yields a destination error. For repeated production builds, give each build a unique destination; for the demo, remove only the previous demo output deliberately before rerunning.

## Bundle in memory with esbuild

If you want JavaScript bytes to consume in your application, start with the in-process API:

```sh
npm install --save-exact effect-build-esbuild@0.6.3 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108
```

Save as `bundle.mts` and run `node bundle.mts`:

```ts
import { NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
import { Api } from "effect-build-esbuild";

const program = Effect.gen(function*() {
  const result = yield* Api.Build.build({
    stdin: {
      contents: "export const greeting: string = 'Hello from esbuild';",
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    write: false,
  });

  for (const file of result.outputFiles) {
    yield* Effect.log(file.text);
  }
});

NodeRuntime.runMain(program);
```

This prints bundled JavaScript. The package supplies esbuild as a dependency, so this example needs neither compiler discovery nor a platform services layer. `outputFiles` is the native esbuild result; nothing has been committed to a destination. For a long-running rebuild/watch loop, use the [scoped context example](../examples/README.md#esbuild).

## Next steps

- Run [Bun, Deno, esbuild, and Node SEA examples](../examples/README.md), including a bounded matrix.
- Use [typed errors](errors.md) to handle expected failures without parsing compiler messages.
- Read [output ownership and artifact adoption](api.md) before handing results to another system.
- Consult [provider options and support](drivers.md) before changing compiler versions or targets.
