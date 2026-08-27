import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Bundle from "effect-build-bun/Bundle";

const artifact = await Effect.runPromise(
  Bundle.bundle({
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

for (const entry of artifact.entries) {
  if (entry._tag === "File") console.log(`${entry.path} ${entry.bytes} sha256=${entry.sha256}`);
}
