import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect } from "effect";
import { Command } from "effect-build-deno";

const program = Command.Transpile.transpile({
  file: "src/main.ts",
  sourceMap: "inline",
}).pipe(
  Effect.tap((result) => Console.log(new TextDecoder().decode(result.output))),
  Effect.provide(Command.layer()),
  Effect.provide(NodeServices.layer),
);

NodeRuntime.runMain(program);
