import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as CompileExecutable from "effect-build-bun/CompileExecutable";

const compiler = CompileExecutable.layer({ allowUntestedVersion: true });

const artifacts = await Effect.runPromise(
  CompileExecutable.compileExecutableMatrix({
    inputs: [{
      entrypoint: "src/main.ts",
      outfile: "dist/app-linux",
      target: "linux-x64-gnu",
      observation: "hashed",
      options: { minify: true },
    }],
    concurrency: 2,
  }).pipe(
    Effect.provide(compiler),
    Effect.provide(NodeServices.layer),
  ),
);

for (const cell of artifacts.cells) {
  console.log(cell.identity.index, cell._tag);
}
