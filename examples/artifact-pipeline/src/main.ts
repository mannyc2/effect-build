import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path } from "effect";
import { Artifact, Checksums, Commit } from "effect-build";
import * as Archive from "effect-build-archives";

const program = Effect.scoped(Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped();
  const file = yield* Commit.atomic(path.join(root, "hello.txt"), (staged) =>
    fs.writeFileString(staged, "hello from effect-build\n").pipe(
      Effect.andThen(Artifact.file(staged, { name: "example", version: "0.7.0" })),
    ));
  yield* Artifact.verify(file);
  const entries = [{ artifact: file, path: "hello/README.txt" }];
  const zip = yield* Archive.zip({ entries, outfile: path.join(root, "hello.zip") });
  const tarGz = yield* Archive.tarGz({ entries, outfile: path.join(root, "hello.tar.gz") });
  const checksums = yield* Checksums.write({ artifacts: [file, zip, tarGz], outfile: path.join(root, "SHA256SUMS") });
  const manifest = Artifact.decode(Artifact.encode([file, zip, tarGz, checksums]));
  yield* Effect.log(JSON.stringify(manifest));
}));

NodeRuntime.runMain(program.pipe(Effect.provide(NodeServices.layer)));
