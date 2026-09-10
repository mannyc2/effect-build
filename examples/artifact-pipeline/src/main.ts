import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path } from "effect";
import { Artifact, Checksums } from "effect-build";
import * as Archive from "effect-build-archives";
import * as Bun from "effect-build-bun";
import * as Deno from "effect-build-deno";
import * as Esbuild from "effect-build-esbuild";
import * as Nfpm from "effect-build-nfpm";
import * as NodeSea from "effect-build-node-sea";
import * as Python from "effect-build-python";
import * as Rolldown from "effect-build-rolldown";
import * as Sbom from "effect-build-sbom";

// Every producer in one program. Bun, esbuild, Rolldown, the archive writers and the wheel writer
// always run; a step that needs another tool runs when its EFFECT_BUILD_* variable names one.
// Output goes to a temporary directory that is removed when the program finishes.
const tool = (variable: string): string | undefined => process.env[variable];
const executableName = (base: string): string => process.platform === "win32" ? `${base}.exe` : base;
// A wheel's platform tag promises where its native command runs. This one describes the build host;
// a real release chooses the minimum macOS version and the manylinux/musllinux floor it supports.
const wheelPlatform = (): string => {
  const arm = process.arch === "arm64";
  if (process.platform === "win32") return arm ? "win_arm64" : "win_amd64";
  if (process.platform === "darwin") return arm ? "macosx_13_0_arm64" : "macosx_13_0_x86_64";
  return arm ? "linux_aarch64" : "linux_x86_64";
};

const program = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped();
  const out = (...parts: string[]) => path.join(root, ...parts);
  const entrypoint = out("hello.ts");
  yield* fs.writeFileString(entrypoint, 'console.log("hello from effect-build");\n');
  const artifacts: Artifact.Artifact[] = [];

  // 1. Compile a native executable for the host and prove the record matches the file.
  const executable = yield* Bun.compile({ entrypoints: [entrypoint], outfile: out(executableName("hello")) }).pipe(
    Effect.provide(Bun.layer({ executable: tool("EFFECT_BUILD_BUN") })),
  );
  yield* Artifact.verify(executable);
  artifacts.push(executable);

  // 2. The same executable feeds a ZIP, a tar.gz and a Python wheel; none of these needs an external tool.
  const entries = [{ artifact: executable, path: `bin/${path.basename(executable.path)}` }];
  artifacts.push(yield* Archive.zip({ entries, outfile: out("hello.zip") }));
  artifacts.push(yield* Archive.tarGz({ entries, outfile: out("hello.tar.gz") }));
  artifacts.push(
    yield* Python.wheel({
      metadata: { name: "effect-build-hello", version: "0.7.0" },
      tags: { python: "py3", abi: "none", platform: wheelPlatform() },
      // Installers put `.data/scripts` entries on the environment's command path, so `hello` needs no Python wrapper.
      entries: [{
        artifact: executable,
        path: `effect_build_hello-0.7.0.data/scripts/${path.basename(executable.path)}`,
      }],
      outdir: out("wheels"),
    }),
  );

  // 3. Bundles are directory artifacts. A whole bundle directory archives like a single file does.
  const bundled = yield* Esbuild.buildToDirectory({
    entryPoints: [entrypoint],
    bundle: true,
    platform: "node",
    format: "cjs",
    outdir: out("esbuild"),
  });
  artifacts.push(bundled);
  artifacts.push(
    yield* Archive.tarGz({ entries: [{ artifact: bundled, path: "hello" }], outfile: out("hello-bundle.tar.gz") }),
  );
  artifacts.push(
    yield* Rolldown.buildToDirectory({ input: entrypoint, outdir: out("rolldown"), output: { format: "es" } }),
  );

  // 4. Steps that need another tool installed.
  const node = tool("EFFECT_BUILD_NODE");
  if (node !== undefined) {
    // Node SEA takes a bundled CommonJS script; this is the esbuild output from step 3.
    const main = yield* Artifact.file(path.join(bundled.path, "hello.js"), bundled.producedBy);
    artifacts.push(
      yield* NodeSea.assemble({ main, outfile: out(executableName("node-hello")) }).pipe(
        Effect.provide(NodeSea.layer({ executable: node })),
      ),
    );
  }
  const deno = tool("EFFECT_BUILD_DENO");
  if (deno !== undefined) {
    artifacts.push(
      yield* Deno.compile({ entrypoint, outfile: out(executableName("deno-hello")) }).pipe(
        Effect.provide(Deno.layer({ executable: deno })),
      ),
    );
  }
  const nfpm = tool("EFFECT_BUILD_NFPM_BIN");
  if (nfpm !== undefined) {
    artifacts.push(
      yield* Nfpm.package({
        format: "deb",
        config: {
          name: "effect-build-hello",
          version: "0.7.0",
          release: "1",
          arch: process.arch === "arm64" ? "arm64" : "amd64",
          maintainer: "effect-build",
          description: "A compiled TypeScript CLI",
          mtime: "2026-01-01T00:00:00Z",
        },
        contents: [{ artifact: executable, dst: "/usr/bin/effect-build-hello" }],
        outfile: out("hello.deb"),
      }).pipe(Effect.provide(Nfpm.layer({ executable: nfpm }))),
    );
  }
  const uv = tool("EFFECT_BUILD_UV_BIN");
  if (uv !== undefined) {
    // uv builds an ordinary Python project into an sdist and a wheel.
    const project = out("python-project");
    yield* fs.makeDirectory(path.join(project, "src", "effect_build_example"), { recursive: true });
    yield* fs.writeFileString(
      path.join(project, "src", "effect_build_example", "__init__.py"),
      'message = "hello from effect-build"\n',
    );
    yield* fs.writeFileString(
      path.join(project, "pyproject.toml"),
      '[project]\nname = "effect-build-example"\nversion = "0.7.0"\n[build-system]\nrequires = ["hatchling==1.27.0"]\nbuild-backend = "hatchling.build"\n',
    );
    const built = yield* Python.build({ project, outdir: out("python-dist") }).pipe(
      Effect.provide(Python.layer({ executable: uv })),
    );
    artifacts.push(built.wheel, built.sdist);
  }
  const syft = tool("EFFECT_BUILD_SYFT_BIN");
  if (syft !== undefined) {
    artifacts.push(
      yield* Sbom.generate({ subject: executable, format: "spdx-json", outfile: out("hello.spdx.json") }).pipe(
        Effect.provide(Sbom.layer({ executable: syft })),
      ),
    );
  }

  // 5. Checksums cover every regular file; the manifest is the JSON handoff to a release system.
  const checksums = yield* Checksums.write({
    artifacts: artifacts.filter(Artifact.isRegular),
    outfile: out("SHA256SUMS"),
  });
  const manifest = Artifact.decode(Artifact.encode([...artifacts, checksums]));
  yield* Effect.log(JSON.stringify(manifest));
});

NodeRuntime.runMain(program.pipe(Effect.scoped, Effect.provide(NodeServices.layer)));
