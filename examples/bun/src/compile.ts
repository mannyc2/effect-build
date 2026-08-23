import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as CompileExecutable from "effect-build-bun/CompileExecutable";

const compiler = CompileExecutable.layer({ allowUntestedVersion: true });

const artifact = await Effect.runPromise(
  CompileExecutable.compileExecutable({
    entrypoint: "src/main.ts",
    outfile: "dist/app",
    observation: "hashed",
    options: { minify: true, sourcemap: "linked" },
  }).pipe(
    Effect.provide(compiler),
    Effect.provide(NodeServices.layer),
  ),
);

console.log(`${artifact.path} ${artifact.target} ${artifact.bytes}`);
