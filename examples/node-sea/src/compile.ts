import { NodeServices } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import * as Esbuild from "effect-build-esbuild";
import * as NodeSea from "effect-build-node-sea";

const buildToolsLayer = Layer.mergeAll(Esbuild.layer, NodeSea.layer()).pipe(
  Layer.provide(NodeServices.layer),
);

const program = Esbuild.withJavaScriptBundle(
  { entrypoint: "src/main.ts", format: "esm" },
  (main) => NodeSea.createExecutable({ main, outfile: "dist/app" }),
).pipe(Effect.provide(buildToolsLayer));

await Effect.runPromise(program);
