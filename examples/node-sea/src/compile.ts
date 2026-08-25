import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Raw from "effect-build-node-sea/Raw";

const program = Raw.assembleExecutable({
  main: { _tag: "File", path: "src/main.cjs", format: "commonjs" },
  outfile: "dist/app",
  target: "linux-x64-gnu",
}).pipe(
  Effect.provide(Raw.layer()),
  Effect.provide(NodeServices.layer),
);

await Effect.runPromise(program);
