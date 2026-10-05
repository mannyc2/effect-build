import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, FileSystem, Layer, Path } from "effect";
import { Bun } from "effect-build-bun";

const program = Effect.gen(function*() {
  const bun = yield* Bun;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-example-" });
  const main = path.join(directory, "main.ts");
  yield* fs.writeFileString(main, 'console.log("built with Effect");\n');
  const output = yield* bun.build({
    entrypoints: [main],
    outdir: path.join(directory, "output"),
    target: "bun",
    atomic: true,
  });
  yield* Console.log(output);
});

const services = Bun.layer().pipe(Layer.provideMerge(NodeServices.layer));
// oxlint-disable-next-line effecttsgo/strict-effect-provide -- This is the application entry point.
NodeRuntime.runMain(program.pipe(Effect.scoped, Effect.provide(services)));
