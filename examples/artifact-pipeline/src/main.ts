import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path } from "effect";
import { Artifact, Checksums, Commit } from "effect-build";
import * as Archive from "effect-build-archives";
import * as Deno from "effect-build-deno";
import * as Esbuild from "effect-build-esbuild";
import * as Rolldown from "effect-build-rolldown";
import * as NodeSea from "effect-build-node-sea";

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
  const artifacts: Artifact.Artifact[] = [file, zip, tarGz];
  const entrypoint = path.join(root, "hello.ts");
  yield* fs.writeFileString(entrypoint, 'console.log("hello from effect-build");\n');
  const bundled = yield* Esbuild.buildToDirectory({
    entryPoints: [entrypoint], bundle: true, platform: "node", format: "cjs", outdir: path.join(root, "esbuild"),
  });
  artifacts.push(bundled);
  artifacts.push(yield* Rolldown.buildToDirectory({
    input: entrypoint, outdir: path.join(root, "rolldown"), output: { format: "es" },
  }));
  if (process.env.EFFECT_BUILD_NODE !== undefined) {
    const main = yield* Artifact.file(path.join(bundled.path, "hello.js"), bundled.producedBy);
    artifacts.push(yield* NodeSea.assemble({
      main, outfile: path.join(root, process.platform === "win32" ? "node-hello.exe" : "node-hello"),
    }).pipe(Effect.provide(NodeSea.layer({ executable: process.env.EFFECT_BUILD_NODE }))));
  }
  if (process.env.EFFECT_BUILD_DENO !== undefined) {
    const executable = yield* Deno.compile({
      entrypoint, outfile: path.join(root, process.platform === "win32" ? "deno-hello.exe" : "deno-hello"),
    }).pipe(Effect.provide(Deno.layer({ executable: process.env.EFFECT_BUILD_DENO })));
    artifacts.push(executable);
  }
  const checksums = yield* Checksums.write({ artifacts: artifacts.filter(Artifact.isRegular), outfile: path.join(root, "SHA256SUMS") });
  const manifest = Artifact.decode(Artifact.encode([...artifacts, checksums]));
  yield* Effect.log(JSON.stringify(manifest));
}));

NodeRuntime.runMain(program.pipe(Effect.provide(NodeServices.layer)));
