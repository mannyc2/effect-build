import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Bundle from "effect-build-bun/Bundle";

const artifact = await Effect.runPromise(
  Bundle.directWrite({
    entrypoints: ["src/main.ts", "src/worker.ts"],
    outdir: "dist",
    target: "browser",
    minify: true,
    sourcemap: "linked",
    splitting: true,
  }).pipe(
    Effect.provide(Bundle.layer()),
    Effect.provide(NodeServices.layer),
  ),
);

for (const file of artifact.files) console.log(`${file.path} ${file.bytes} sha256=${file.digest.value}`);
