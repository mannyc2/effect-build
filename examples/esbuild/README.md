# esbuild: native plugins, bundles, and scoped rebuilds

Use these examples when you want JavaScript output or esbuild's native plugin API. For a complete application, see the
[Effect CLI](../cli/README.md). To turn an in-memory bundle into a verified file and ZIP archive, see the
[artifact pipeline](../artifact-pipeline/README.md).

## Run

From the repository root, with Node **24.14.1** and Bun **1.3.14** installed:

```sh
bun install --frozen-lockfile
bun run build
bun run --cwd examples/esbuild plugin
```

The workspace installs esbuild **0.28.2**. These examples use the `Api` lane, so they use that library without selecting an
`esbuild` executable or providing a command layer.

| Command after `bun run --cwd examples/esbuild` | Demonstrates                                               | Expected result                                                         |
| ---------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| `bundle`                                       | `Api.Build.build` with `write: false`                      | Prints JavaScript for the greeting application                          |
| `bundle:directory`                             | `Api.BuildToDirectory.buildToDirectory` with `write: true` | Writes `dist/main.js`; run it with `node examples/esbuild/dist/main.js` |
| `plugin`                                       | Native virtual-module plugin and `AnalyzeMetafile`         | Prints the generated banner module and a size report                    |
| `watch`                                        | `Api.Context.make` inside `Effect.scoped`                  | Rebuilds in memory when `src/main.ts` changes; Ctrl+C closes the scope  |
| `test`                                         | Real esbuild context and generated-module execution        | Checks edits, native failure, recovery, and disposal                    |
| `clean`                                        | Example output cleanup                                     | Removes this example's `dist/` directory                                |

## A native plugin and its metafile

[`src/plugin.ts`](src/plugin.ts) builds a banner from a virtual `virtual:build-info` import. The
[`virtualBuildInfo` plugin](src/virtual-build-info.ts) uses esbuild's own `onResolve` and `onLoad` callbacks to supply a
module containing a version and channel. Native plugin objects pass directly to the build options.

The resulting ESM exports a `banner` with value `1.0.0 (preview)`. `metafile: true` preserves esbuild's structured metadata;
`AnalyzeMetafile.analyzeMetafile` formats it into a size and dependency report. `outfile` names the returned output while
`write: false` keeps it in memory. This recipe does not create `dist/banner.mjs`.

Change the version or channel in the build script and run it again. Output bytes and the report come from the native
result, not a synthetic artifact wrapper. For atomic finalization and a SHA-256 identity, continue with the
[artifact pipeline](../artifact-pipeline/README.md).

## Rebuild, fail, recover, dispose

[`test/context.test.ts`](test/context.test.ts) is a finite, executable lifecycle example. It uses the same plugin with a
changing input:

1. Acquire a context inside an Effect scope and build the initial module.
2. Import the generated ESM and check its exported data.
3. Change the plugin input, rebuild, and execute the new output.
4. Make the plugin fail; inspect `EsbuildFailed.errors`, including the native plugin name and message.
5. Repair the input and explicitly rebuild using the same context.
6. Close the scope and await the native disposal notification.

Run it independently:

```sh
bun run --cwd examples/esbuild test
```

The test uses real esbuild and explicit rebuilds, with a ten-second timeout. It does not depend on filesystem watch timing.
`context.rebuild` is an Effect value; `context.watch()` starts native watching. Both must remain inside the context's scope.
The interactive [`watch.ts`](src/watch.ts) keeps that scope open until interruption, then cancels pending work and disposes
the context.

Directory output remains provider-owned. esbuild can replace existing files or leave partial output after failure. A
native build result does not promise the absent-destination commit protocol provided by core finalizers.
