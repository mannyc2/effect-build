# effect-build

Build scripts with explicit tool selection and durable artifact identities, composed as Effect v4 programs.
This is the shared core of the effect-build packages. Choose a provider package to compile or bundle an application;
use core directly when writing a producer or consuming a finalized artifact.

## Install

```sh
npm install --save-exact effect-build@0.7.0 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108
```

These examples use Effect v4 and its matching Node platform package.

## Finalize a file

Save this as `build.ts` and run it with your TypeScript-capable Node runtime. The producer writes only to the private
candidate path supplied by `File.publish`. Core observes and hashes the result, then commits the verified bytes.
Choose a destination that does not already exist; finalization does not overwrite existing output.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem } from "effect";
import * as Artifact from "effect-build/Artifact";
import * as File from "effect-build/Author/File";

const program = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  const artifact = yield* File.publish(
    {
      destination: "dist/greeting.txt",
      observation: "hashed",
      provenance: Artifact.intrinsicProvenance("greeting-example"),
    },
    (candidate) => fs.writeFileString(candidate, "Hello from effect-build!\n"),
  );
  yield* Effect.log(Artifact.adoptFile("greeting.txt", artifact));
});

await Effect.runPromise(program.pipe(Effect.provide(NodeServices.layer)));
```

`adoptFile` projects the logical name, digest, and byte count for a downstream consumer without exposing the build
machine's path. It creates a value; it does not upload or publish to a registry.

## Modules

| Import                                 | Use it for                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| `effect-build/Artifact`                | Hashed file, tree, and executable identities; schemas and path-free adoption |
| `effect-build/Author/File`             | Atomic file finalization and verified input bytes                            |
| `effect-build/Author/Tree`             | Atomic tree finalization, verified snapshots, and file projections           |
| `effect-build/Author/Executable`       | Executable inspection and atomic finalization                                |
| `effect-build/Author/NativeExecutable` | Parse native header facts or observe an executable file                      |
| `effect-build/Author/Tool`             | Resolve one executable, observe it, and reauthenticate it before launch      |
| `effect-build/Author/BorrowedOutput`   | Scope-bound ownership for native output                                      |
| `effect-build/Matrix`                  | Bounded compilation matrices with ordered success/failure cells              |
| `effect-build/SystemTarget`            | System target identities shared by providers and artifacts                   |

Pure producers use `Artifact.intrinsicProvenance`; selected-tool producers preserve the exact `Tool.Observation`.
Core injects platform services and provides no compiler registry, installer, fallback runner, release journal, or
publication workflow. Provider options and native results stay in their provider package.

`NativeExecutable.parse(bytes)` observes supported ELF, Mach-O, and PE header facts without filesystem services.
`NativeExecutable.observe(path)` additionally checks that the path is a regular file with execute permission on POSIX
hosts. These operations report format, operating system, architecture, and an ELF ABI only when observed. They do not
prove that a complete file can run, select a requested target, identify its runtime, or create a durable artifact.
Use file observation inside `Executable.publish` inspection; the finalizer verifies the candidate bytes around it.

## More

[Getting started](https://github.com/mannyc2/effect-build/blob/main/docs/getting-started.md) · [Error handling](https://github.com/mannyc2/effect-build/blob/main/docs/errors.md) · [Package selection](https://github.com/mannyc2/effect-build/blob/main/README.md)
