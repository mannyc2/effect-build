# effect-build 0.4.0 candidate

`effect-build` is an Effect v4 RC library for compiling or assembling an
executable and for using the portable contracts those operations return. This
repository contains one unpublished, five-package 0.4.0 candidate.

| Package                 | Public entry points                                                       |
| ----------------------- | ------------------------------------------------------------------------- |
| `effect-build`          | root namespaces plus `Artifact`, `SystemTarget`, `Matrix`, and `Author/*` |
| `effect-build-bun`      | `CompileExecutable`                                                       |
| `effect-build-deno`     | `CompileExecutable`                                                       |
| `effect-build-esbuild`  | `Build` and `Context`                                                     |
| `effect-build-node-sea` | `AssembleExecutable`                                                      |

The root entries expose namespaces only. Import operations from their exact
subpath; the frozen map is recorded in
[`research/post-0.3/freeze/SURFACE.json`](research/post-0.3/freeze/SURFACE.json).
No old root operation or removed subpath is retained as an alias.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as CompileExecutable from "effect-build-bun/CompileExecutable";

const artifact = await Effect.runPromise(
  CompileExecutable.compileExecutable({
    entrypoint: "src/main.ts",
    outfile: "dist/app",
    observation: "hashed",
  }).pipe(
    Effect.provide(CompileExecutable.layer({ allowUntestedVersion: true })),
    Effect.provide(NodeServices.layer),
  ),
);
```

Applications choose exactly one compiler layer and provide one official Effect
platform layer. The compiler tool, Effect runtime, and artifact target remain
independent. There is no compiler registry, fallback, automatic installation,
or raw-argument escape hatch.

The candidate is not published, tagged, merged, or released. See
[`docs/`](docs/README.md) for the exact API and candidate-evidence boundary.
