import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Command } from "effect-build-deno";

const result = await Effect.runPromise(
  Command.Transpile.transpile({
    file: "src/main.ts",
    sourceMap: "inline",
  }).pipe(
    Effect.provide(Command.layer()),
    Effect.provide(NodeServices.layer),
  ),
);

console.log(new TextDecoder().decode(result.output));
