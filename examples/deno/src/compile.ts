import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as CompileExecutable from "effect-build-deno/CompileExecutable";

const compiler = CompileExecutable.layer({ allowUntestedVersion: true });

const artifact = await Effect.runPromise(
  CompileExecutable.compileExecutable({
    entrypoint: "src/main.ts",
    outfile: "dist/app",
    target: "linux-x64-gnu",
    observation: "unhashed",
    options: {
      bundle: true,
      minify: true,
      permissions: { read: true, net: ["example.com"] },
    },
  }).pipe(
    Effect.provide(compiler),
    Effect.provide(NodeServices.layer),
  ),
);

console.log(`${artifact.path} ${artifact.runtime.name}@${artifact.runtime.version}`);
