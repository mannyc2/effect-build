import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Deno from "effect-build-deno";

const executable = process.env.EFFECT_BUILD_DENO_BIN;
const compiler = executable === undefined ? Deno.layer() : Deno.layer({ executable });

const artifact = await Effect.runPromise(
  Deno.compileExecutable({
    entrypoint: "src/main.ts",
    outfile: "dist/app",
    target: "linux-x64-gnu",
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

console.log(`${artifact.path} ${artifact.tool.name}@${artifact.tool.version}`);
