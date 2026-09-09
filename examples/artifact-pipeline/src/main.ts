import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path } from "effect";
import { Artifact, Checksums } from "effect-build";
import * as Archive from "effect-build-archives";
import * as Bun from "effect-build-bun";
import * as Deno from "effect-build-deno";
import * as Esbuild from "effect-build-esbuild";
import * as Rolldown from "effect-build-rolldown";
import * as NodeSea from "effect-build-node-sea";
import * as Nfpm from "effect-build-nfpm";
import * as Python from "effect-build-python";
import * as Sbom from "effect-build-sbom";

const program = Effect.scoped(Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped();
  const entrypoint = path.join(root, "hello.ts");
  yield* fs.writeFileString(entrypoint, 'console.log("hello from effect-build");\n');
  const executable = yield* Bun.compile({
    entrypoints: [entrypoint], outfile: path.join(root, process.platform === "win32" ? "hello.exe" : "hello"),
  }).pipe(Effect.provide(Bun.layer({ executable: process.env.EFFECT_BUILD_BUN })));
  yield* Artifact.verify(executable);
  const entries = [{ artifact: executable, path: `bin/${path.basename(executable.path)}` }];
  const zip = yield* Archive.zip({ entries, outfile: path.join(root, "hello.zip") });
  const tarGz = yield* Archive.tarGz({ entries, outfile: path.join(root, "hello.tar.gz") });
  const wheel = yield* Python.wheel({
    metadata: { name: "effect-build-hello", version: "0.7.0" },
    tags: { python: "py3", abi: "none", platform: process.platform === "win32" ? `win_${process.arch === "arm64" ? "arm64" : "amd64"}` : process.platform === "darwin" ? `macosx_13_0_${process.arch === "arm64" ? "arm64" : "x86_64"}` : `linux_${process.arch === "arm64" ? "aarch64" : "x86_64"}` },
    // Wheel installers put .data/scripts entries on the environment's command path.
    entries: [{ artifact: executable, path: `effect_build_hello-0.7.0.data/scripts/${path.basename(executable.path)}` }],
    outdir: path.join(root, "wheels"),
  });
  const artifacts: Artifact.Artifact[] = [executable, zip, tarGz, wheel];
  const syft = process.env.EFFECT_BUILD_SYFT_BIN;
  if (syft !== undefined) {
    artifacts.push(yield* Sbom.generate({
      subject: wheel, format: "spdx-json", outfile: path.join(root, "hello.spdx.json"),
    }).pipe(Effect.provide(Sbom.layer({ executable: syft }))));
  }
  if (process.env.EFFECT_BUILD_NFPM_BIN !== undefined) {
    artifacts.push(yield* Nfpm.package({
      format: "deb",
      config: {
        name: "effect-build-hello", version: "0.7.0", release: "1",
        arch: process.arch === "arm64" ? "arm64" : "amd64", maintainer: "effect-build",
        description: "A compiled TypeScript CLI", mtime: "2026-01-01T00:00:00Z",
      },
      contents: [{ artifact: executable, dst: "/usr/bin/effect-build-hello" }],
      outfile: path.join(root, "hello.deb"),
    }).pipe(Effect.provide(Nfpm.layer({ executable: process.env.EFFECT_BUILD_NFPM_BIN }))));
  }
  const uv = process.env.EFFECT_BUILD_UV_BIN;
  if (uv !== undefined) {
    const project = path.join(root, "python-project");
    yield* fs.makeDirectory(path.join(project, "src", "effect_build_example"), { recursive: true });
    yield* fs.writeFileString(path.join(project, "src", "effect_build_example", "__init__.py"), 'message = "hello from effect-build"\n');
    yield* fs.writeFileString(path.join(project, "pyproject.toml"), '[project]\nname = "effect-build-example"\nversion = "0.7.0"\n[build-system]\nrequires = ["hatchling==1.27.0"]\nbuild-backend = "hatchling.build"\n');
    const built = yield* Python.build({ project, outdir: path.join(root, "python-dist") }).pipe(
      Effect.provide(Python.layer({ executable: uv })),
    );
    artifacts.push(built.wheel, built.sdist);
  }
  const bundled = yield* Esbuild.buildToDirectory({
    entryPoints: [entrypoint], bundle: true, platform: "node", format: "cjs", outdir: path.join(root, "esbuild"),
  });
  artifacts.push(bundled);
  artifacts.push(yield* Archive.tarGz({
    entries: [{ artifact: bundled, path: "hello" }], outfile: path.join(root, "hello-bundle.tar.gz"),
  }));
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
