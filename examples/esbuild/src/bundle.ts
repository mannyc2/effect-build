import { NodeRuntime } from "@effect/platform-node";
import { Console, Effect } from "effect";
import { Build } from "effect-build-esbuild/Api";

const program = Build.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "esm",
  write: false,
}).pipe(
  Effect.flatMap((result) => Effect.forEach(result.outputFiles, (output) => Console.log(output.text))),
);

NodeRuntime.runMain(program);
