# effect-build

Turn an Effect application into deployable artifacts. effect-build wraps the
native toolchains — Bun, Deno, esbuild, and Node SEA — as Effect programs:
typed errors, scoped child processes, interruption that actually kills the
compiler, and artifacts that carry their own digest.

| Package                 | Operations                                                       |
| ----------------------- | ---------------------------------------------------------------- |
| `effect-build`          | `Target`, `Artifact`, `BuildError`, and the `Toolchain` kernel   |
| `effect-build-bun`      | `CompileExecutable` — `bun build --compile` native executables   |
| `effect-build-deno`     | `CompileExecutable` — `deno compile` with typed permissions      |
| `effect-build-esbuild`  | `Build` (in-memory) and scoped `Context` (rebuild/watch/serve)   |
| `effect-build-node-sea` | `AssembleExecutable` — direct Node `--build-sea` single binaries |

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as CompileExecutable from "effect-build-bun/CompileExecutable";

const artifact = await Effect.runPromise(
  CompileExecutable.compileExecutable({
    entrypoint: "src/main.ts",
    outfile: "dist/app",
    minify: true,
  }).pipe(
    Effect.provide(CompileExecutable.layer()),
    Effect.provide(NodeServices.layer),
  ),
);
// { _tag: "Executable", path, bytes, target, tool: { name: "bun", version }, sha256 }
```

Layers resolve the tool once (explicit path or one PATH walk — never an
install, retry, or fallback), probe its version, and warn once if it is
outside the CI-tested range; operations then run with the tool's native
options and surface its native diagnostics as typed errors. Outputs are
staged privately and committed with one atomic rename.

Cross-compile by passing `target`; fan out with plain Effect combinators:

```ts
Effect.forEach(
  targets,
  (target) => Effect.exit(CompileExecutable.compileExecutable({ entrypoint, outfile: `dist/app-${target}`, target })),
  {
    concurrency: 2,
  },
);
```

Runnable programs live in [`examples/`](examples). The exact public surface
is asserted against [`tooling/public-api.json`](tooling/public-api.json);
docs are in [`docs/`](docs/README.md).
