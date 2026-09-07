import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, FileSystem } from "effect";
import { Artifact, Checksums, Commit, Executable } from "effect-build";
import * as Bun from "effect-build-bun";

const program = Effect.gen(function*() {
  const bins = yield* Effect.forEach(
    ["linux-x64", "linux-x64-musl", "linux-arm64", "windows-x64"] as const,
    (target) => Bun.compile({ entrypoints: ["src/cli.ts"], outfile: `dist/cli-${target}${target.startsWith("windows") ? ".exe" : ""}`, target }),
    { concurrency: 2 },
  );
  // opt-in check on a cross-compiled artifact, expected to FAIL:
  const wrong = yield* Effect.result(Effect.succeed(bins[2]!).pipe(Executable.expectTarget("linux-x64")));
  yield* Effect.log(`expectTarget(linux-x64) on the arm64 binary: ${wrong._tag === "Failure" ? wrong.failure.message : "unexpectedly passed"}`);
  if (wrong._tag !== "Failure") return yield* Effect.die("target check unexpectedly passed");
  // fail-on-exists
  const dup = yield* Effect.result(Commit.atomic("dist/cli-linux-x64", (s) => Bun.compile({ entrypoints: ["src/cli.ts"], outfile: s, target: "linux-x64", atomic: false }), { onExists: "fail" }));
  yield* Effect.log(`onExists=fail: ${dup._tag === "Failure" ? dup.failure.message : "unexpectedly passed"}`);
  if (dup._tag !== "Failure" || dup.failure._tag !== "CommitError" || dup.failure.reason !== "exists") {
    return yield* Effect.die("onExists did not reject the duplicate");
  }
  const sums = yield* Checksums.write({ artifacts: bins, outfile: "dist/SHA256SUMS" });
  const verified = yield* Artifact.verify(bins[0]!);
  yield* Effect.log(`verify ok: ${verified.sha256.slice(0, 12)}`);
  const manifest = JSON.stringify(Artifact.encode([...bins, sums]), null, 2);
  const fs = yield* FileSystem.FileSystem;
  yield* fs.writeFileString("dist/manifest.json", `${manifest}\n`);
  console.log(manifest);
});

NodeRuntime.runMain(program.pipe(Effect.provide(Bun.layer(process.env.EFFECT_BUILD_BUN === undefined ? {} : { executable: process.env.EFFECT_BUILD_BUN })), Effect.provide(NodeServices.layer)));
