import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Bun from "effect-build-bun";

const executable = process.env.EFFECT_BUILD_BUN_BIN;
const compiler = executable === undefined ? Bun.layer() : Bun.layer({ executable });

const artifact = await Effect.runPromise(
  Bun.compileExecutable({
    entrypoint: "src/main.ts",
    outfile: "dist/app",
    digest: true,
    options: { minify: true, sourcemap: "linked" },
  }).pipe(
    Effect.provide(compiler),
    Effect.provide(NodeServices.layer),
  ),
);

console.log(`${artifact.path} ${artifact.target} ${artifact.bytes}`);
