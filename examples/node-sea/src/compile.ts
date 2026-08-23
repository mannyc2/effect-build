import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as AssembleExecutable from "effect-build-node-sea/AssembleExecutable";

const program = AssembleExecutable.assembleExecutable({
  main: { _tag: "File", path: "src/main.cjs", format: "commonjs" },
  outfile: "dist/app",
  observation: "hashed",
}).pipe(
  Effect.provide(AssembleExecutable.layer({ allowUntestedVersion: true })),
  Effect.provide(NodeServices.layer),
);

await Effect.runPromise(program);
