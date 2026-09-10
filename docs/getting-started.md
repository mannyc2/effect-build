# Getting started

This guide compiles one TypeScript file into a native executable, explains every line of the
program that did it, and points at what to do next. It takes about five minutes.

## Prerequisites

- **Node 22.19 or newer** runs the build program. Node 24 can also run a `build.ts` directly,
  using its built-in type stripping.
- **Bun 1.3.14 or newer** is the compiler in this guide. Install it from [bun.sh](https://bun.sh).
  It has to be on `PATH`, or at a path you pass to the provider layer.
- **An ESM project**: a `.mjs` file, `"type": "module"` in `package.json`, or a TypeScript
  project with `NodeNext` or `Bundler` module resolution. The packages are ESM-only.

## Install

```sh
npm install --save-dev --save-exact effect-build-bun@0.7.0 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108 @effect/platform-node-shared@4.0.0-rc.108
```

`effect-build-bun` depends on the core `effect-build` package, so that comes along. Effect 4 is
a release candidate: pin `effect`, `@effect/platform-node`, and `@effect/platform-node-shared` to
the same version, because the platform packages use caret ranges and can otherwise select a
newer shared candidate with a newer Effect peer. 4.0.0-rc.108 is the tested version; see
[compatibility](compatibility.md) for the accepted range.

## The first build

Create `src/cli.ts`:

```ts
console.log("Hello!");
```

Save this as `build.mjs`. It is complete: no TypeScript runner, no wrapper script.

```js
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Bun from "effect-build-bun";

NodeRuntime.runMain(
  Bun.compile({ entrypoints: ["src/cli.ts"], outfile: "dist/cli" }).pipe(
    Effect.tap((artifact) => Effect.log(artifact)),
    Effect.provide(Bun.layer()),
    Effect.provide(NodeServices.layer),
  ),
);
```

Run it, then run what it built:

```sh
node build.mjs
./dist/cli
```

On Windows, use `outfile: "dist/cli.exe"` and run `.\dist\cli.exe`: Bun always names Windows
executables `.exe`, and the provider refuses an `outfile` that does not. Running the build again
replaces `dist/cli`.

The build logs the artifact record:

```
[08:07:05.920] INFO (#2): {
  kind: 'executable',
  path: '/home/you/app/dist/cli',
  bytes: 63446114,
  sha256: 'd6f24411b71792aa84488e109dccc74ba6816b03af0647b1f065f0117ff7a73c',
  producedBy: { name: 'bun', version: '1.3.14', path: '/usr/local/bin/bun', sha256: 'e0c90ec1…' },
  target: 'darwin-arm64',
  format: 'mach-o'
}
```

## What each line does

- `Bun.compile({ entrypoints, outfile })` describes a `bun build --compile` run and returns an
  Effect. Nothing happens until the Effect runs. The operation stages the executable next to
  `outfile`, reads its header to confirm the target, records the file, and renames it into place.
- `Effect.tap((artifact) => Effect.log(artifact))` logs the record and passes it through.
- `Effect.provide(Bun.layer())` supplies the compiler. The layer finds `bun` on `PATH`, resolves
  symlinks, hashes the binary, probes its version once, and checks the version against
  `Bun.supported` (`>=1.3.14 <2.0.0`). Every later operation uses that resolved tool; nothing
  re-checks it. `Bun.layer({ executable: "/opt/bun/bin/bun" })` selects a specific binary, and
  `Bun.layer({ version: "^1.4.2" })` changes the accepted range. An `undefined` executable, such
  as an unset environment variable, means `PATH`, so `Bun.layer({ executable: process.env.MY_BUN })`
  needs no branch.
- `Effect.provide(NodeServices.layer)` supplies the filesystem, path, crypto, and child-process
  services from Node. On Bun, `BunServices.layer` from `@effect/platform-bun` does the same.
- `NodeRuntime.runMain` runs the program, and on failure prints the error and exits with a
  failing status.

## The record

Every artifact has the same core fields. Executables and directories add a few more.

| Field        | Meaning                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| `kind`       | `file`, `executable`, or `directory`.                                                                   |
| `path`       | Absolute path of the output.                                                                            |
| `bytes`      | Size as a number. A directory's `bytes` is the total of its files.                                      |
| `sha256`     | Hex digest of the file. A directory's digest hashes its sorted entry manifest.                          |
| `producedBy` | The tool or package that made it: `name`, `version`, and for external tools their `path` and `sha256`.  |
| `target`     | Executables only: one of the eight [targets](../packages/effect-build#target), read from the header.    |
| `format`     | Executables only: `elf`, `mach-o`, or `pe`.                                                             |
| `entries`    | Directories only: every file, directory, and symlink with its `path`, `mode`, and for files its digest. |

The record is data. `Artifact.encode([artifact])` turns a list of them into plain JSON for a
manifest, `Artifact.decode` validates one back, and `Artifact.verify(artifact)` re-reads the
file and fails if a byte changed. Those live in the core package:

```sh
npm install --save-dev --save-exact effect-build@0.7.0
```

## Next steps

**Cross-compile.** Add `target: "linux-arm64"` (or any other [target](../packages/effect-build#target))
to `Bun.compile`. Bun downloads the runtime for that target on first use. The provider checks the
header of what came out against what you asked for.

**Pass compiler options.** `options: { minify: true, sourcemap: "inline", bytecode: true }` and the
rest of `Bun.CompileOptions` map to `bun build --compile` flags.

**Build a matrix.** Share the layer across operations by providing it once around an
`Effect.gen` program, and fan out with `Effect.forEach(targets, compile, { concurrency: 2 })`. The
[recipes](recipes.md) show this, along with archives, checksums, packages, wheels, signing, and
SBOMs, and the [CLI example](../examples/cli) is a complete release.

**Keep the records.** Write `Artifact.encode(artifacts)` to a manifest file at the end of a build
and hand it to whatever publishes. Verify with `Artifact.verify` before trusting a file that was
written in an earlier step or an earlier process.

## When something goes wrong

Failures are typed errors with a `_tag` and useful fields, and an unhandled one prints as
`Tag: message`. The [errors reference](errors.md) lists all of them. The ones you meet first:

- `ToolNotFound: bun not found (searched: PATH)`: install Bun, or pass
  `Bun.layer({ executable: "/absolute/path/to/bun" })`.
- `ToolVersionUnsupported: bun 1.2.0 is not supported (>=1.3.14 <2.0.0)`: upgrade, or pass a
  `version` range you accept.
- `BunInputInvalid: outfile for windows-x64 must end with .exe`: name Windows outputs `.exe`.
- `ToolFailed`: the compiler exited unsuccessfully. The error carries `exitCode`, `stdout`, and
  `stderr`; `onOutput` on the operation streams both while the tool runs.
