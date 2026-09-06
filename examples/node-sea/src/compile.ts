import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect } from "effect";
import * as Command from "effect-build-node-sea/Command";

const program = Command.AssembleExecutable.assembleDirect({
  main: { _tag: "File", path: "src/main.cjs", format: "commonjs" },
  outfile: "dist/hello.exe",
  observation: "hashed",
}).pipe(
  Effect.tap((artifact) =>
    Console.log(`${artifact.path} ${artifact.target} ${artifact.bytes} bytes sha256=${artifact.digest.value}`)
  ),
  Effect.provide(Command.layer()),
  Effect.provide(NodeServices.layer),
);

NodeRuntime.runMain(program);
