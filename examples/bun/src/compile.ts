import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Command } from "effect-build-bun";

const artifact = await Effect.runPromise(
  Command.CompileExecutable.compileExecutable({
    entrypoints: ["src/main.ts"],
    outfile: "dist/app",
    target: "bun-linux-x64",
    observation: "hashed",
    options: { minify: true, sourcemap: "inline" },
  }).pipe(
    Effect.provide(Command.layer()),
    Effect.provide(NodeServices.layer),
  ),
);

console.log(`${artifact.path} ${artifact.target} ${artifact.bytes} sha256=${artifact.digest.value}`);
