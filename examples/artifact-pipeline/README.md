# Bundle an application and package its verified bytes

Build a small inventory report, finalize the JavaScript bundle, and put it in a ZIP with usage instructions. This is a
complete composition of **esbuild's native API**, **core file finalization**, and **the archive producer**.

You will learn where native bytes become a durable artifact, how another producer checks that identity, and what a
downstream release system receives. Node runs the build program; esbuild comes from the installed workspace dependency.
No separate compiler or archive CLI is required.

## Run it

First follow the [workspace setup](../README.md#set-up-the-checkout). From the repository root:

```sh
bun run --cwd examples/artifact-pipeline build
node examples/artifact-pipeline/dist/report.mjs
```

The app prints:

```json
{ "products": 3, "units": 19, "outOfStock": ["pen"] }
```

The build prints bundle/archive paths and a JSON adoption record containing a logical name, byte count, and SHA-256
digest. It also creates:

```text
dist/
  report.mjs
  USAGE.txt
  inventory.zip
```

Unzip `inventory.zip` with your normal archive tool. It contains `inventory/report.mjs` and `inventory/USAGE.txt`.
Run `node inventory/report.mjs` from the extracted directory: all application imports have been bundled.

## Read the code

1. [app/report.ts](app/report.ts) imports the small [catalog](app/catalog.ts) and calculates an inventory summary.
2. [src/Pipeline.ts](src/Pipeline.ts) bundles in memory with `write: false`. It writes those bytes through `File.publish`,
   whose result is the `HashedFile` that `ArchiveEntry` accepts.
3. The same module creates the ZIP from verified files, verifies the archive before handoff, and creates a path-free
   adoption record. [src/main.ts](src/main.ts) supplies layers, prints the result, and handles signals.

The file producer uses an intrinsic identity for this example. It does not claim an authenticated compiler executable:
the in-process esbuild API returns native output, not a selected `Command` tool observation.

Each finalizer commits separately. If archiving fails, files finalized earlier remain available. The example does not
claim a transaction over the whole output directory. The build sends no bytes to a registry or release service.

## Try a change and a failure

Change the stock counts in `app/catalog.ts`, clear this example's output, and rebuild:

```sh
bun run --cwd examples/artifact-pipeline clean
bun run --cwd examples/artifact-pipeline build
```

Every finalizer requires an unused destination. A second build without cleaning fails with `FileDestinationLocked` and
preserves the previous output. `clean` deletes this example's entire `dist` directory; production builds can instead
choose a unique destination for each run.

## Check the behavior

```sh
bun run --cwd examples/artifact-pipeline test
```

Tests use temporary directories. They extract the ZIP with the independent `fflate` reader, execute the extracted app,
and verify its output and SHA-256. They also check repeat-build preservation and change a finalized input to prove the
archive step rejects it before committing output. `fflate` is only a test dependency.

For a compiled command-line application, see [the typed CLI example](../cli/README.md). For plugins and incremental
builds, see [the esbuild recipes](../esbuild/README.md).
