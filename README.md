# effect-build

effect-build models build tools as Effect v4 programs while keeping provider semantics, resource lifetimes, tool identity, and durable artifact ownership explicit. It is a hard-cut API: there are no legacy provider subpaths, generic process kernel, automatic installers, fallback candidates, raw public argv, or release/publication state.

The authoritative scope is the generated [`effect-build/combined-contract@1`](tooling/effect-build-contract.json). It accounts for 67 provider operations, 46 non-operation findings, and 19 capabilities across six producer families. [`tooling/public-api.json`](tooling/public-api.json) is its tested projection: 11 public packages and 42 public root/subpath modules. The private Rolldown evidence package is still built and tested, but is neither projected nor packed for publication.

## Provider lanes

| Package                 | Public lanes                             | Durable finalizer                          |
| ----------------------- | ---------------------------------------- | ------------------------------------------ |
| `effect-build-bun`      | `Api`, `Command`                         | `Command.CompileExecutable`                |
| `effect-build-deno`     | `Command`                                | `Command.CompileExecutable`                |
| `effect-build-esbuild`  | `Api`, `Command`                         | none; directory writes are provider-direct |
| `effect-build-node-sea` | `Command`                                | `Command.AssembleExecutable`               |
| `effect-build-rolldown` | none; package-private evidence candidate | none                                       |

`Api` is an in-process provider host. `Command` selects and observes one executable, applies provider-owned admission, and reauthenticates its content immediately before every launch. In-memory results remain native values and provider-direct directory writes explicitly do not claim atomic finalization.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Command } from "effect-build-bun";

const executable = await Effect.runPromise(
  Command.CompileExecutable.compileExecutable({
    entrypoints: ["src/main.ts"],
    outfile: "dist/app",
    target: "bun-linux-x64",
    observation: "hashed",
    options: { minify: true },
  }).pipe(
    Effect.provide(Command.layer()),
    Effect.provide(NodeServices.layer),
  ),
);
```

## Producers and adoption

Archives, Python wheel/sdist builds, nFPM packages, Apple distribution artifacts, Windows MSIX signing, and SBOM documents all use the same core hashed file/tree/executable identities. Explicit finalizers stage privately beside the destination, observe, inspect, re-observe, reconstruct from held verified content, and commit direct files with an atomic no-replace link or trees with one same-parent rename. A file projected from an atomic tree generation retains that tree root, relative path, and manifest digest in its publication identity.

```ts
import * as Artifact from "effect-build/Artifact";

const adoption = Artifact.adoptFile("app-linux-x64", executable);
// { protocol, kind: "file", logicalName, bytes, digest } — deliberately no path
```

effect-build produces and finalizes artifacts. A downstream release owner such as ts-release adopts immutable identities by logical name and digest, and separately owns release plans, mutation journals, continuation, publication, and registry state. Apple notarization is an effect-build operation; its durable workflow journal is not.

See [`docs/`](docs/README.md) and the runnable [`examples/`](examples/README.md). Local verification, hosted CI, certification, merge, tag, and publication are separate authorities.
