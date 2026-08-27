# effect-build

Turn an Effect application into finalized release artifacts. effect-build
wraps compilers, archivers, package builders, signing tools, notarization,
and SBOM generation as Effect programs: typed errors, scoped child processes
and native handles, interruption that kills the owned tool, and artifacts
that carry their final byte length and digest.

| Package                 | Operations                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `effect-build`          | `Target`, finalized `Artifact` values, `BuildError`, and the `Toolchain` process/publish kernel |
| `effect-build-apple`    | `.app`, UDZO DMG, flat pkg, Developer ID signing, notary submit/observe, staple, assess         |
| `effect-build-archives` | Deterministic ZIP/tar.gz plus source archives projected from one exact Git tree                 |
| `effect-build-bun`      | Native executables and browser/bun/node bundles                                                 |
| `effect-build-deno`     | Native executables, typed permissions, and browser/deno bundles                                 |
| `effect-build-esbuild`  | Build/transform/analyze, scoped contexts, and watch streams                                     |
| `effect-build-nfpm`     | deb, rpm, apk, Arch Linux, and unsigned MSIX packages through nFPM 2.47.x                       |
| `effect-build-node-sea` | Direct Node `--build-sea` single executables                                                    |
| `effect-build-python`   | Wheel and sdist production through one uv 0.12.x PEP 517 frontend                               |
| `effect-build-rolldown` | Scoped in-process bundles and watcher-event streams                                             |
| `effect-build-sbom`     | SPDX JSON 2.3 and CycloneDX JSON 1.6 generation through Syft 1.50.x                             |
| `effect-build-windows`  | SHA-256/RFC 3161 Authenticode signing and verification for MSIX                                 |

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

Layers resolve each tool once (explicit path or one PATH walk — never an
install, retry, or fallback), probe its version, and warn once if it is
outside the CI-tested range; operations then run with the tool's native
options and surface its native diagnostics as typed errors. Outputs are
staged privately and committed with one atomic rename under a single
release-machine writer. A pending interruption is reasserted after an
indivisible commit, so callers must observe/adopt or deliberately rebuild a
complete destination rather than infer non-commit.

Bundles and ordinary release files work the same way. `bun build` and `deno bundle` publish an
`Artifact.Bundle` describing every committed file, and esbuild's watch mode
is an Effect `Stream` whose end stops the watcher:

```ts
import * as Bundle from "effect-build-bun/Bundle";
import * as Watch from "effect-build-esbuild/Watch";

Bundle.bundle({ entrypoints: ["src/main.ts"], outdir: "dist", target: "browser", splitting: true });
// { _tag: "Bundle", outdir, entries: [
//   { _tag: "File", path, bytes, mode, sha256 },
//   { _tag: "Directory", path, mode },
//   { _tag: "SymbolicLink", path, target },
// ], tool }

Watch.changes({ entryPoints: ["src/main.ts"], bundle: true, write: false }).pipe(
  Stream.runForEach((result) => serveFromMemory(result.outputFiles)),
);
```

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
all twelve packages are packed, installed, typechecked, imported, and run by
the clean-consumer gate. Docs are in [`docs/`](docs/README.md).
