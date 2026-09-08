import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path } from "effect";
import { Artifact, Checksums, Commit } from "effect-build";
import * as Bun from "effect-build-bun";

const program = Commit.atomic("dist", (staged) => Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.makeDirectory(staged);
  // One staging directory keeps a failed target from replacing any part of the release.
  const bins = yield* Effect.forEach(
    ["linux-x64", "linux-x64-musl", "linux-arm64", "windows-x64"] as const,
    (target) => Bun.compile({
      entrypoints: ["src/cli.ts"], outfile: path.join(staged, `cli-${target}${target.startsWith("windows") ? ".exe" : ""}`),
      target, atomic: false,
    }),
    { concurrency: 2 },
  );
  yield* Checksums.write({ artifacts: bins, outfile: path.join(staged, "SHA256SUMS") });
  return yield* Artifact.directory(staged, { name: "example-cli", version: "0.7.0" });
})).pipe(
  Effect.flatMap(Artifact.verify),
  Effect.tap((release) => Effect.log(JSON.stringify(Artifact.encode([release]), null, 2))),
);

NodeRuntime.runMain(program.pipe(Effect.provide(Bun.layer(process.env.EFFECT_BUILD_BUN === undefined ? {} : { executable: process.env.EFFECT_BUILD_BUN })), Effect.provide(NodeServices.layer)));
