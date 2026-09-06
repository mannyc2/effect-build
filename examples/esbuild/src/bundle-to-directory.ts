import { NodeRuntime } from "@effect/platform-node";
import { Console, Effect } from "effect";
import { BuildToDirectory } from "effect-build-esbuild/Api";

// esbuild owns these writes and may replace existing files or leave partial output.
const program = BuildToDirectory.buildToDirectory({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "esm",
  outdir: "dist",
  write: true,
}).pipe(
  Effect.tap(() => Console.log("Wrote dist/main.js")),
);

NodeRuntime.runMain(program);
