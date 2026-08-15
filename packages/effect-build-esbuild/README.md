# effect-build-esbuild

One scoped Effect integration for producing a Node-resolving JavaScript bundle
with exact raw Esbuild 0.28.2.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Esbuild from "effect-build-esbuild";

const program = Esbuild.withJavaScriptBundle(
  { entrypoint: "src/main.ts", format: "esm" },
  (bundle) => Effect.logInfo(bundle.path),
).pipe(
  Effect.provide(Esbuild.layer),
  Effect.provide(NodeServices.layer),
);
```

The bundle handle, native Esbuild context, and temporary bytes remain live only
inside the callback and are cleaned on success, typed failure, defect, or
interruption. Fixed policy uses one JavaScript output, Node resolution, and
`node26.7` lowering. The package exposes no raw BuildOptions, plugins, watch,
rebuild, global stop, or durable output operation.
