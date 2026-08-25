import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Command } from "effect-build-deno";

const artifact = await Effect.runPromise(
  Command.CompileExecutable.compileExecutable({
    entrypoint: "src/main.ts",
    outfile: "dist/app",
    target: "x86_64-unknown-linux-gnu",
    observation: "hashed",
    bundle: true,
    minify: true,
    allowRead: true,
    allowNet: ["example.com"],
  }).pipe(
    Effect.provide(Command.layer()),
    Effect.provide(NodeServices.layer),
  ),
);

console.log(`${artifact.path} ${artifact.tool.name}@${artifact.tool.participants[0].version}`);
