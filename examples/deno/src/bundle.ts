import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Bundle from "effect-build-deno/Bundle";

const artifact = await Effect.runPromise(
  Bundle.bundle({
    entrypoints: ["src/main.ts"],
    outdir: "dist",
    platform: "browser",
    minify: true,
    codeSplitting: true,
  }).pipe(
    Effect.provide(Bundle.layer()),
    Effect.provide(NodeServices.layer),
  ),
);

for (const file of artifact.files) console.log(`${file.path} ${file.bytes} sha256=${file.sha256}`);
