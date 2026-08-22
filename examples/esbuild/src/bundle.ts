import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem } from "effect";
import * as Esbuild from "effect-build-esbuild";

const program = Esbuild.withJavaScriptBundle(
  { entrypoint: "src/main.ts", format: "esm" },
  (bundle) => FileSystem.FileSystem.use((fileSystem) => fileSystem.stat(bundle.path)),
).pipe(
  Effect.provide(Esbuild.layer),
  Effect.provide(NodeServices.layer),
);

await Effect.runPromise(program);
