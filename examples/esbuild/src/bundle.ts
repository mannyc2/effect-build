import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Build from "effect-build-esbuild/Build";

const program = Build.build({ entryPoints: ["src/main.ts"], bundle: true, outdir: "dist", write: false }).pipe(
  Effect.provide(Build.layer({ allowUntestedVersion: true })),
  Effect.provide(NodeServices.layer),
);

await Effect.runPromise(program);
