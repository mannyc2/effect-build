import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as NodeSea from "effect-build-node-sea";

const program = NodeSea.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  options: { format: "esm" },
}).pipe(
  Effect.provide(NodeSea.layer()),
  Effect.provide(NodeServices.layer),
);

await Effect.runPromise(program);
