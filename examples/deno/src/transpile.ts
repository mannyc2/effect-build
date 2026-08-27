import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Command } from "effect-build-deno";

const result = await Effect.runPromise(
  Command.Transpile.transpileToDirectory({
    files: ["src/main.ts"],
    outdir: "dist",
    sourceMap: "separate",
    noRemote: true,
  }).pipe(
    Effect.provide(Command.layer()),
    Effect.provide(NodeServices.layer),
  ),
);

console.log(`${result.outdir} publication=${result.publication}`);
