import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Command } from "effect-build-bun";

const result = await Effect.runPromise(
  Command.Build.buildToDirectory({
    entrypoints: ["src/main.ts", "src/worker.ts"],
    outdir: "dist",
    target: "browser",
    minify: true,
    sourcemap: "linked",
    splitting: true,
  }).pipe(
    Effect.provide(Command.layer()),
    Effect.provide(NodeServices.layer),
  ),
);

console.log(`${result.outdir} publication=${result.publication}`);
