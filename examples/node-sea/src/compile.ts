import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Command from "effect-build-node-sea/Command";

const program = Command.AssembleExecutable.assembleDirect({
  main: { _tag: "File", path: "src/main.cjs", format: "commonjs" },
  outfile: "dist/app",
  observation: "hashed",
}).pipe(
  Effect.provide(Command.layer()),
  Effect.provide(NodeServices.layer),
);

await Effect.runPromise(program);
