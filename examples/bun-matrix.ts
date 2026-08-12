import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Bun from "effect-build/bun";

const executable = process.env.EFFECT_BUILD_BUN_BIN;
const compiler = executable === undefined ? Bun.layer() : Bun.layer({ executable });

const artifacts = await Effect.runPromise(
  Bun.compileExecutableMatrix({
    entrypoint: "src/main.ts",
    outdir: "dist",
    name: "app",
    targets: ["macos-aarch64", "linux-x64-gnu", "windows-x64"],
    concurrency: 2,
    digest: true,
    options: { minify: true },
  }).pipe(
    Effect.provide(compiler),
    Effect.provide(NodeServices.layer),
  ),
);

// dist/app-macos-aarch64, dist/app-linux-x64-gnu, dist/app-windows-x64.exe
for (const artifact of artifacts) {
  console.log(`${artifact.path} ${artifact.digest}`);
}
