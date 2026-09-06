import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect } from "effect";
import { Command } from "effect-build-deno";

const program = Command.CompileExecutable.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/hello.exe",
  // Omit target for a local executable. This app needs no runtime permissions.
  observation: "hashed",
  bundle: true,
  minify: true,
}).pipe(
  Effect.tap((artifact) =>
    Console.log(`${artifact.path} ${artifact.target} ${artifact.bytes} bytes sha256=${artifact.digest.value}`)
  ),
  Effect.provide(Command.layer()),
  Effect.provide(NodeServices.layer),
);

NodeRuntime.runMain(program);
