import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path } from "effect";
import { Artifact, Checksums, Commit, Target } from "effect-build";
import * as Archive from "effect-build-archives";
import * as Bun from "effect-build-bun";

// A release the way release tools lay one out: one archive per target and a checksum file,
// committed to dist/ as a whole. Run `node index.ts`, then `(cd dist && sha256sum -c SHA256SUMS)`.
const name = "hello";
const version = "0.7.0";
const targets = ["linux-x64", "linux-x64-musl", "linux-arm64", "darwin-arm64", "windows-x64"] as const;

const release = Commit.atomic("dist", (staged) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    // Executables are compiled into a scratch directory; only their archives enter the release.
    const build = yield* fs.makeTempDirectoryScoped();
    const archives = yield* Effect.forEach(targets, (target) =>
      Effect.gen(function*() {
        const { os, executableSuffix } = Target.parts(target);
        const executable = yield* Bun.compile({
          entrypoints: ["src/cli.ts"],
          outfile: path.join(build, target, `${name}${executableSuffix}`),
          target,
        });
        const entries = [{ artifact: executable, path: `${name}${executableSuffix}` }];
        const outfile = path.join(staged, `${name}_${version}_${target}`);
        return yield* os === "windows"
          ? Archive.zip({ entries, outfile: `${outfile}.zip` })
          : Archive.tarGz({ entries, outfile: `${outfile}.tar.gz` });
      }), { concurrency: 2 });
    yield* Checksums.write({ artifacts: archives, outfile: path.join(staged, "SHA256SUMS") });
    return yield* Artifact.directory(staged, { name, version });
    // Sibling staging builds the tree at its final depth; a failed target never replaces any part of dist/.
  }), { staging: "sibling" });

NodeRuntime.runMain(release.pipe(
  Effect.tap((directory) => Effect.log(JSON.stringify(Artifact.encode([directory]), null, 2))),
  Effect.scoped,
  Effect.provide(Bun.layer({ executable: process.env.EFFECT_BUILD_BUN })),
  Effect.provide(NodeServices.layer),
));
