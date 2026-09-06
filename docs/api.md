# API reference

Start with [getting started](getting-started.md) for a runnable build. This page explains the types shared by the packages;
[provider drivers](drivers.md) lists operations and provider-specific options.

## Imports

Import a provider lane and then the operation namespace you need:

```ts
import { Api, Command } from "effect-build-bun";
import * as DenoCommand from "effect-build-deno/Command";
import * as EsbuildApi from "effect-build-esbuild/Api";
import * as NodeSeaCommand from "effect-build-node-sea/Command";
```

For example, Bun command compilation is `Command.CompileExecutable.compileExecutable(input)`. Its input type is
`Command.CompileExecutable.Input<"hashed">`. Each provider keeps its own options, results, and errors.

Core exports the same namespaces through its root and these explicit subpaths:

| Subpath                              | Purpose                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| `effect-build/Artifact`              | File, tree, executable, digest, provenance, and adoption types     |
| `effect-build/SystemTarget`          | Normalized OS/architecture/ABI descriptions                        |
| `effect-build/Matrix`                | Bounded compilation with an ordered result per input               |
| `effect-build/Author/Tool`           | Tool selection, observations, admission, and reauthentication      |
| `effect-build/Author/BorrowedOutput` | Temporary output available inside a continuation                   |
| `effect-build/Author/File`           | Finalize one file; verify artifact bytes before consuming them     |
| `effect-build/Author/Tree`           | Finalize one directory; verify a snapshot or project a member file |
| `effect-build/Author/Executable`     | Finalize one executable using a provider-supplied inspector        |

Most applications call provider or producer operations. The `Author` modules are also public for authors implementing an
operation that needs these lifecycle guarantees.

## Choose an output contract

The operation determines who owns its output. Having written a file does not make a return value a core artifact.

| Result                 | Examples                                                                | What the caller receives                                                                |
| ---------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Native memory          | Bun `Api.Build.build`, esbuild `Api.Build.build`                        | Native build output and diagnostics                                                     |
| Captured stdout        | Bun `Command.Build.build`, Deno `Command.Transpile.transpile`           | `Uint8Array` output and bounded command completion                                      |
| Provider-direct output | `buildToDirectory`, Bun `Api.CompileExecutable.compileExecutableDirect` | Native or provider-specific result; output can be partial after failure or interruption |
| Scoped resource        | esbuild `Api.Context.make`, command `Watch.watch`                       | Context or process used inside its scope                                                |
| Finalized artifact     | Bun/Deno command compilation, Node SEA assembly, producer finalizers    | Core file, tree, or executable identity with publication and provenance                 |

Provider-direct operations preserve provider behavior, including output and cache writes. They do not offer atomic tree
replacement or rollback. A finalized operation stages and validates its candidate before committing to an **absent
destination**. It rejects an existing file, directory, or symlink. Use a fresh output name or explicitly manage the previous
output before starting another build.

## Artifacts and observation modes

`Artifact.ObservationMode` is `"hashed" | "unhashed"`. Bun/Deno command compilation and Node SEA assembly require an
explicit mode, and TypeScript carries that choice into the result:

| Type                 | Main fields                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `HashedFile`         | `path`, `bytes`, `digest`, `provenance`, `publication`                                     |
| `UnhashedFile`       | Same identity fields without `digest`                                                      |
| `HashedExecutable`   | File identity plus `nativeFormat`, `runtime`, `target`                                     |
| `UnhashedExecutable` | Executable identity without `digest`                                                       |
| `HashedTree`         | `root`, `rootMode`, `entries`, `totalBytes`, `manifestDigest`, `provenance`, `publication` |

`Artifact.File<Mode>`, `Artifact.Executable<Mode>`, and `Artifact.Tree<Mode>` select the corresponding type. The type model
also includes unhashed trees; the public `File.publish` and `Tree.publish` finalizers require `"hashed"`.

- `bytes` and `totalBytes` are canonical decimal **strings**, avoiding JavaScript integer precision limits.
- A digest is `{ algorithm: "sha256", value }`, with exactly 64 lowercase hexadecimal characters.
- Returned identity paths are normalized absolute paths. Tree entry paths are portable relative paths.
- Tree entries distinguish regular files, directories, and relative symbolic links. The manifest identity records content,
  paths, permissions, and link targets.
- `provenance` is a selected-tool observation or an `IntrinsicProvenance` for a producer without an external tool.
- `publication` records the filesystem commit mechanism, not uploading or publishing a release.

Choose `"hashed"` when another step needs to verify or adopt output. `"unhashed"` only omits the digest from the public
result: finalization still hashes and compares the candidate internally. It is not a streaming or no-hashing mode.

Schemas such as `HashedExecutableSchema` and `HashedTreeSchema` validate a value's shape. They do not reread the
filesystem. Use a verified continuation when the current bytes must still match.

## Consume or hand off an artifact

`Artifact.adoptFile(logicalName, artifact)` accepts a hashed file identity, including a hashed executable.
`Artifact.adoptTree(logicalName, artifact)` accepts a hashed tree. Both return a path-free record with protocol
`effect-build/artifact-adoption@1`, logical name, byte count, and digest identity.

```ts
import { Effect } from "effect";
import * as Artifact from "effect-build/Artifact";
import * as File from "effect-build/Author/File";

const prepareHandoff = (artifact: Artifact.HashedExecutable) =>
  File.withVerifiedBytes(artifact, (contents) =>
    Effect.succeed({
      identity: Artifact.adoptFile("my-cli", artifact),
      contents,
    }));
```

`File.withVerifiedBytes` rereads the path, checks its identity, and supplies a defensive byte copy. Consume that copy instead
of reopening the mutable path. `adoptFile` alone is a pure projection; it performs no filesystem verification or upload.

`Tree.withVerifiedSnapshot(artifact, use)` revalidates a tree and reconstructs a private snapshot for `use`. The snapshot
is removed when the continuation finishes, so consume it there. `Tree.projectFile(artifact, "relative/file")` projects
the recorded identity of one regular file committed with the tree. Projection does not reread its current bytes; use
`File.withVerifiedBytes` for that check.

## Author a finalized file or tree

`File.publish(request, produce, inspect?)` supplies a private same-parent candidate path to `produce`. The optional
inspector receives a `HashedFileObservation` between two observations of that candidate. On success, the finalizer commits
verified bytes and returns a `HashedFile`.

```ts
import { Effect, FileSystem } from "effect";
import * as Artifact from "effect-build/Artifact";
import * as File from "effect-build/Author/File";

const writeManifest = File.publish(
  {
    destination: "./dist/build-manifest.json",
    observation: "hashed",
    provenance: Artifact.intrinsicProvenance("my-app/build-manifest"),
  },
  (candidate) =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(candidate, JSON.stringify({ schemaVersion: 1 }));
    }),
);
```

Provide platform services at the application entry point, as in [getting started](getting-started.md). `File.publish`
requires `Crypto`, `FileSystem`, and `Path`, plus services used by the producer or inspector. Relative destinations resolve
against optional `request.cwd` or the working directory.

`Tree.publish` follows the same pattern with `request.outdir`, a private directory root, and an optional
`HashedTreeObservation` inspector. `Executable.publish` requires an inspector returning `nativeFormat`, `runtime`, and
`target`. See [architecture](architecture.md#durable-finalization) for the commit protocol and concurrency limits.

`BorrowedOutput.withFile` and `withTree` instead acquire temporary output and run a continuation. Handles have `initial`
and `observe` fields; observation after the lifetime ends fails with `BorrowedOutputExpired`. A copied path is only a
locator. These APIs require `CleanupReporter` in addition to filesystem services, so applications explicitly provide a
policy for cleanup diagnostics.

## Compile a matrix

Bun and Deno expose `Command.CompileExecutable.compileExecutableMatrix`. Pass a non-empty `inputs` tuple and a positive
safe-integer `concurrency`. Give each input a distinct, absent destination.

```ts
import { Command } from "effect-build-bun";

const matrix = Command.CompileExecutable.compileExecutableMatrix({
  concurrency: 2,
  inputs: [
    {
      entrypoints: ["./src/cli.ts"],
      outfile: "./dist/cli-default.exe",
      observation: "hashed",
    },
    {
      entrypoints: ["./src/cli.ts"],
      outfile: "./dist/cli-minified.exe",
      observation: "hashed",
      options: { minify: true },
    },
  ],
});
```

Provide the command layer once around the matrix. The report preserves input order and each cell's
`{ provider, operation: "compileExecutable", index }` identity. Cells are `{ _tag: "Success", identity, artifact }` or
`{ _tag: "Failure", identity, error }`.

Typed failures become cells. Defects and interruption fail the overall Effect without returning a report. Successful
artifacts remain committed if another cell fails: the report has `rollback: "none"`. The core `Matrix.run` exposes these
same compilation semantics for authors; it is not a release transaction.

## Targets

`SystemTarget.describe(target)` returns OS, architecture, ABI, executable suffix, and native format for:

```text
macos-x64             macos-aarch64
linux-x64-gnu         linux-x64-musl
linux-aarch64-gnu     linux-aarch64-musl
windows-x64          windows-aarch64
```

These are artifact identities, not provider request strings. Bun takes targets such as `"bun-linux-x64"`; Deno takes
`"x86_64-unknown-linux-gnu"`. Inspectors establish the returned system target. A target's presence in this vocabulary does
not promise that every provider, host, or tool version supports it.

See [errors](errors.md) for failure handling and [artifact producers](drivers.md#artifact-producers) for package-specific
references.
