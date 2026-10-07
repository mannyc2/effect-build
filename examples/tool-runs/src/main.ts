import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect } from "effect";
import { Tool } from "effect-build";
import { ChildProcess } from "effect/process";

const program = Effect.gen(function*() {
  const node = yield* Tool.make("node");
  const version = yield* node.run(
    ChildProcess.make(node.executable, ["--version"], { stdin: "ignore" }),
    node.text({ maxBytes: 4096 }),
  );
  yield* Console.log(version.trim());
});

// The application supplies its platform once, at the entry point.
// oxlint-disable-next-line effecttsgo/strict-effect-provide -- This is the application entry point.
NodeRuntime.runMain(program.pipe(Effect.provide(NodeServices.layer)));
