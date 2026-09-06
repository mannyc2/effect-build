import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect } from "effect";
import { Command } from "effect-build-bun";

const program = Command.CompileExecutable.compileExecutable({
  entrypoints: ["src/main.ts"],
  outfile: "dist/hello.exe",
  // Omit target to compile for the selected Bun executable's host.
  observation: "hashed",
  options: { minify: true, sourcemap: "inline" },
}).pipe(
  Effect.tap((artifact) =>
    Console.log(`${artifact.path} ${artifact.target} ${artifact.bytes} bytes sha256=${artifact.digest.value}`)
  ),
  Effect.provide(Command.layer()),
  Effect.provide(NodeServices.layer),
);

NodeRuntime.runMain(program);
