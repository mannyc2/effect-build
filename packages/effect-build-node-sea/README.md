# effect-build-node-sea

Granular Node SEA assembly for a live core JavaScript bundle. The package has
no Esbuild dependency and no source compile or matrix facade.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Esbuild from "effect-build-esbuild";
import * as NodeSea from "effect-build-node-sea";

const program = Esbuild.withJavaScriptBundle(
  { entrypoint: "src/main.ts", format: "esm" },
  (main) => NodeSea.createExecutable({ main, outfile: "dist/app", digest: true }),
).pipe(
  Effect.provide(Esbuild.layer),
  Effect.provide(NodeSea.layer()),
  Effect.provide(NodeServices.layer),
);
```

`NodeSea.layer({ executable? })` selects one already-installed exact Node
26.7.0 Linux x64 GNU producer. Before candidate acquisition, the operation
authenticates the live main, privately copies it, verifies the copy, and runs
selected Node `--check`. Both Node reads use only that private copy. The package
never uses postject and never downloads or installs Node.

Applications may supply an Esbuild bundle, a borrowed core bundle, or another
future compatible producer. Composition belongs to application Effect code;
integration packages never depend on siblings.
