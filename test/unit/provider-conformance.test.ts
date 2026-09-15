import { NodeServices } from "@effect/platform-node";
import { Context, Effect, FileSystem, Path, PlatformError, Scope } from "effect";
import { Artifact, Commit, Tool } from "effect-build";
import * as Apple from "effect-build-apple";
import * as Archive from "effect-build-archives";
import * as Bun from "effect-build-bun";
import * as Deno from "effect-build-deno";
import * as Esbuild from "effect-build-esbuild";
import * as Nfpm from "effect-build-nfpm";
import * as NodeSea from "effect-build-node-sea";
import * as Python from "effect-build-python";
import * as Rolldown from "effect-build-rolldown";
import * as Sbom from "effect-build-sbom";
import * as Windows from "effect-build-windows";
import { TestArtifact, TestProvider, TestSpawner, TestTool } from "effect-build/testing";
import { describe, expect, it, vi } from "vitest";

const injection = vi.hoisted(() => ({ run: async (_output: string): Promise<void> => {} }));
vi.mock(
  "../../packages/effect-build-node-sea/node_modules/postject",
  () => ({ inject: (output: string) => injection.run(output) }),
);

type Fs = TestProvider.Fs;
const register = <A extends Artifact.Artifact, E>(
  subject: TestProvider.Subject<A, Fs | Scope.Scope, E, Fs | Scope.Scope>,
) => {
  describe(subject.operation, () => {
    for (const test of TestProvider.conformance(subject)) {
      it(test.name, () => Effect.runPromise(test.run.pipe(Effect.provide(NodeServices.layer))), 10_000);
    }
  });
};

const scripted = (script: TestSpawner.Script<Fs>) => {
  let count = 0;
  return {
    calls: Effect.sync(() => count),
    layer: TestSpawner.layer((call) =>
      Effect.suspend(() => {
        count++;
        return script(call);
      })
    ),
  };
};
const arg = (call: TestSpawner.Call, flag: string) => {
  const assigned = call.args.find((value) => value.startsWith(`${flag}=`));
  if (assigned !== undefined) return assigned.slice(flag.length + 1);
  const position = call.args.indexOf(flag);
  if (position < 0 || call.args[position + 1] === undefined) throw new Error(`missing ${flag}: ${call.args.join(" ")}`);
  return call.args[position + 1]!;
};
const written = (control: TestProvider.Control, output: string, contents: string | Uint8Array = "produced bytes") =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    yield* fs.makeDirectory(p.dirname(output), { recursive: true });
    yield* fs.writeFile(output, typeof contents === "string" ? new TextEncoder().encode(contents) : contents);
    yield* fs.chmod(output, 0o755);
    return { exitCode: (yield* control.enter(output)) ? 1 : 0 };
  });
const directoryWritten = (control: TestProvider.Control, output: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    yield* fs.makeDirectory(output, { recursive: true });
    yield* fs.writeFileString(p.join(output, "main.js"), "console.log('fixture');\n");
    return { exitCode: (yield* control.enter(output)) ? 1 : 0 };
  });

register({
  operation: "Bun.compile",
  kind: "executable",
  make: (control) =>
    Effect.sync(() => {
      const tool = TestTool.resolved("bun", "1.3.14");
      const fake = scripted((call) => written(control, arg(call, "--outfile"), TestArtifact.bytes("linux-x64")));
      const run = (output: string, options: Commit.ProducerOptions, version = tool.version) =>
        Bun.compile({ entrypoints: ["input.ts"], outfile: output, target: "linux-x64", ...options }).pipe(
          Effect.provide(Bun.testLayer({ tool: { ...tool, version } })),
          Effect.provide(fake.layer),
        );
      return {
        calls: fake.calls,
        run,
        provider: { tool, constraints: Bun.constraints },
        constraints: Bun.constraints["Bun.compile"]!.map((constraint) => ({
          constraint,
          version: "1.4.1",
          run: (output: string, options: Commit.ProducerOptions) => run(output, options, "1.4.1"),
        })),
      };
    }),
});

register({
  operation: "Bun.bundle",
  kind: "directory",
  make: (control) =>
    Effect.sync(() => {
      const tool = TestTool.resolved("bun", "1.3.14");
      const fake = scripted((call) => directoryWritten(control, arg(call, "--outdir")));
      const run = (output: string, options: Commit.ProducerOptions, version = tool.version) =>
        Bun.bundle({ entrypoints: ["input.ts"], outdir: output, ...options }).pipe(
          Effect.provide(Bun.testLayer({ tool: { ...tool, version } })),
          Effect.provide(fake.layer),
        );
      return {
        calls: fake.calls,
        run,
        provider: { tool, constraints: Bun.constraints },
        constraints: Bun.constraints["Bun.bundle"]!.map((constraint) => ({
          constraint,
          version: "1.4.1",
          run: (output: string, options: Commit.ProducerOptions) => run(output, options, "1.4.1"),
        })),
      };
    }),
});

register({
  operation: "Deno.compile",
  kind: "executable",
  make: (control) =>
    Effect.sync(() => {
      const tool = TestTool.resolved("deno", "2.9.5");
      const fake = scripted((call) => written(control, arg(call, "--output"), TestArtifact.bytes("linux-x64")));
      const run = (output: string, options: Commit.ProducerOptions, version = tool.version, constrained = false) =>
        Deno.compile({
          entrypoint: "input.ts",
          outfile: output,
          target: "linux-x64",
          options: constrained ? { allowScripts: true } : {},
          ...options,
        }).pipe(
          Effect.provide(Deno.testLayer({ tool: { ...tool, version } })),
          Effect.provide(fake.layer),
        );
      return {
        calls: fake.calls,
        run,
        provider: { tool, constraints: Deno.constraints },
        constraints: Deno.constraints["Deno.compile"]!.map((constraint) => ({
          constraint,
          version: "2.9.6",
          run: (output: string, options: Commit.ProducerOptions) => run(output, options, "2.9.6", true),
        })),
      };
    }),
});

register({
  operation: "Nfpm.package",
  kind: "file",
  outputName: "output.deb",
  make: (control) =>
    Effect.gen(function*() {
      const source = yield* TestArtifact.file("source");
      const tool = TestTool.resolved("nfpm", "2.47.0");
      const fake = scripted((call) => written(control, arg(call, "--target")));
      return {
        calls: fake.calls,
        provider: { tool, constraints: Nfpm.constraints },
        run: (output: string, options: Commit.ProducerOptions) =>
          Nfpm.package({
            outfile: output,
            format: "deb",
            config: { name: "fixture", arch: "amd64", version: "1.0.0" },
            contents: [{ artifact: source, dst: "/usr/share/fixture" }],
            ...options,
          }).pipe(Effect.provide(Nfpm.testLayer({ tool })), Effect.provide(fake.layer)),
      };
    }),
});

register({
  operation: "Sbom.generate",
  kind: "file",
  outputName: "output.json",
  make: (control) =>
    Effect.gen(function*() {
      const source = yield* TestArtifact.file("source");
      const tool = TestTool.resolved("syft", "1.50.0");
      const fake = scripted((call) =>
        written(control, arg(call, "--output").split("=").slice(1).join("="), '{"spdxVersion":"SPDX-2.3"}')
      );
      return {
        calls: fake.calls,
        provider: { tool, constraints: Sbom.constraints },
        run: (output: string, options: Commit.ProducerOptions) =>
          Sbom.generate({ subject: source, outfile: output, format: "spdx-json", ...options }).pipe(
            Effect.provide(Sbom.testLayer({ tool })),
            Effect.provide(fake.layer),
          ),
      };
    }),
});

register({
  operation: "Windows.sign",
  kind: "executable",
  outputName: "output.exe",
  make: (control) =>
    Effect.gen(function*() {
      const source = yield* TestArtifact.executable("windows-x64");
      const tool = TestTool.resolved("signtool", "10.0.26100");
      const fake = scripted((call) =>
        call.args[0] === "sign"
          ? Effect.map(control.enter(call.args.at(-1)!), (fail) => ({ exitCode: fail ? 1 : 0 }))
          : Effect.succeed({})
      );
      return {
        calls: fake.calls,
        provider: { tool, constraints: Windows.constraints },
        run: (output: string, options: Commit.ProducerOptions) =>
          Windows.sign({
            artifact: source,
            outfile: output,
            kind: "store",
            thumbprint: "a".repeat(40),
            timestampUrl: "https://timestamp.example",
            ...options,
          }).pipe(Effect.provide(Windows.testLayer({ tool })), Effect.provide(fake.layer)),
      };
    }),
});

register({
  operation: "Apple.sign",
  kind: "executable",
  make: (control) =>
    Effect.gen(function*() {
      const source = yield* TestArtifact.executable("darwin-arm64");
      const tool = TestTool.resolved("xcrun", "70.0.0");
      const fake = scripted((call) =>
        call.args.includes("--force")
          ? Effect.map(control.enter(call.args.at(-1)!), (fail) => ({ exitCode: fail ? 1 : 0 }))
          : Effect.succeed({})
      );
      return {
        calls: fake.calls,
        provider: { tool, constraints: Apple.constraints },
        run: (output: string, options: Commit.ProducerOptions) =>
          Apple.sign({ artifact: source, outfile: output, certificateSha1: "a".repeat(40), ...options }).pipe(
            Effect.provide(Apple.testLayer({ tool })),
            Effect.provide(fake.layer),
          ),
      };
    }),
});

register({
  operation: "Python.build",
  kind: "directory",
  make: (control) =>
    Effect.sync(() => {
      const tool = TestTool.resolved("uv", "0.12.0");
      const fake = scripted((call) =>
        Effect.gen(function*() {
          const fs = yield* FileSystem.FileSystem;
          const p = yield* Path.Path;
          const output = arg(call, "--out-dir");
          yield* fs.makeDirectory(output, { recursive: true });
          yield* fs.writeFileString(p.join(output, "fixture-1.whl"), "wheel bytes");
          yield* fs.writeFileString(p.join(output, "fixture-1.tar.gz"), "sdist bytes");
          return { exitCode: (yield* control.enter(output)) ? 1 : 0 };
        })
      );
      return {
        calls: fake.calls,
        provider: { tool, constraints: Python.constraints },
        run: (output: string, options: Commit.ProducerOptions) =>
          Python.build({ project: control.directory, outdir: output, ...options }).pipe(
            Effect.andThen(Artifact.directory(output, Tool.producedBy(tool))),
            Effect.provide(Python.testLayer({ tool })),
            Effect.provide(fake.layer),
          ),
      };
    }),
});

// Archive encoders run in-process. Observe their real write handle, after provisional bytes exist.
const observedEncoder = (control: TestProvider.Control) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const context = yield* Effect.context<Fs>();
    let count = 0;
    const observed = {
      ...fs,
      open: (path: string, options?: Parameters<FileSystem.FileSystem["open"]>[1]) =>
        fs.open(path, options).pipe(Effect.map((file) => {
          if (options?.flag !== "w") return file;
          count++;
          let entered = false;
          return {
            ...file,
            writeAll: (bytes: Uint8Array) =>
              file.writeAll(bytes).pipe(Effect.andThen(Effect.gen(function*() {
                if (entered) return;
                entered = true;
                if (yield* control.enter(path).pipe(Effect.provideContext(context))) {
                  return yield* PlatformError.badArgument({
                    module: "FileSystem",
                    method: "writeAll",
                    description: "scripted encoder failure",
                  });
                }
              }))),
          };
        })),
    } satisfies FileSystem.FileSystem;
    return { calls: Effect.sync(() => count), fileSystem: observed };
  });
register({
  operation: "Archive.zip",
  kind: "file",
  outputName: "output.zip",
  make: (control) =>
    Effect.gen(function*() {
      const source = yield* TestArtifact.file("archive source");
      const observed = yield* observedEncoder(control);
      return {
        calls: observed.calls,
        run: (output: string, options: Commit.ProducerOptions) =>
          Archive.zip({ entries: [{ artifact: source, path: "source.txt" }], outfile: output, ...options }).pipe(
            Effect.provideService(FileSystem.FileSystem, observed.fileSystem),
          ),
      };
    }),
});
register({
  operation: "Archive.source",
  kind: "file",
  outputName: "output.tar.gz",
  make: (control) =>
    Effect.gen(function*() {
      const tool = TestTool.resolved("git", "2.40.0");
      const observed = yield* observedEncoder(control);
      // The empty Git tree exports a valid tar containing only its end markers.
      const fake = scripted((call) =>
        Effect.gen(function*() {
          if (call.args[0] === "cat-file") return { stdout: "tree\n" };
          if (call.args.includes("archive")) {
            const fs = yield* FileSystem.FileSystem;
            yield* fs.writeFile(arg(call, "--output"), new Uint8Array(1024));
          }
          return {};
        })
      );
      return {
        calls: fake.calls,
        provider: { tool, constraints: Archive.constraints },
        run: (output: string, options: Commit.ProducerOptions) =>
          Archive.source({
            repository: control.directory,
            tree: "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
            project: "fixture",
            version: "1.0.0",
            format: "tar.gz",
            outfile: output,
            ...options,
          }).pipe(
            Effect.provide(Archive.testLayer({ tool })),
            Effect.provide(fake.layer),
            Effect.provideService(FileSystem.FileSystem, observed.fileSystem),
          ),
      };
    }),
});

register({
  operation: "NodeSea.assemble",
  kind: "executable",
  make: (control) =>
    Effect.gen(function*() {
      const main = yield* TestArtifact.file("console.log('sea')", "main.cjs");
      const base = yield* TestArtifact.executable("linux-x64");
      const tool = { ...TestTool.resolved("node", "22.0.0"), path: base.path };
      const context = yield* Effect.context<Fs>();
      injection.run = (output) =>
        Effect.runPromise(control.enter(output).pipe(Effect.provideContext(context))).then((fail) => {
          if (fail) throw new Error("scripted injection failure");
        });
      const fake = scripted((call) =>
        Effect.gen(function*() {
          if (call.args[0] === "--experimental-sea-config") {
            const fs = yield* FileSystem.FileSystem;
            const config = JSON.parse(yield* fs.readFileString(call.args[1]!)) as { output: string };
            yield* fs.writeFileString(config.output, "sea blob");
          }
          return {};
        })
      );
      return {
        calls: fake.calls,
        provider: { tool, constraints: NodeSea.constraints },
        run: (output: string, options: Commit.ProducerOptions) =>
          NodeSea.assemble({ main, outfile: output, ...options }).pipe(
            Effect.provide(NodeSea.testLayer({ tool, base: tool })),
            Effect.provide(fake.layer),
          ),
      };
    }),
});

register({
  operation: "Esbuild.buildToDirectory",
  kind: "directory",
  make: (control) =>
    Effect.gen(function*() {
      const source = yield* TestArtifact.file("console.log('esbuild')", "main.ts");
      const context = yield* Effect.context<Fs>();
      let count = 0;
      return {
        calls: Effect.sync(() => count),
        run: (output: string, options: Commit.ProducerOptions) =>
          Esbuild.buildToDirectory({
            entryPoints: [source.path],
            outdir: output,
            bundle: true,
            logLevel: "silent",
            plugins: [{
              name: "conformance",
              setup(build) {
                count++;
                build.onEnd(async () =>
                  (await Effect.runPromise(
                      control.enter(build.initialOptions.outdir!).pipe(Effect.provideContext(context)),
                    ))
                    ? { errors: [{ text: "scripted build failure" }] }
                    : undefined
                );
              },
            }],
            ...options,
          }),
      };
    }),
});

register({
  operation: "Rolldown.buildToDirectory",
  kind: "directory",
  make: (control) =>
    Effect.gen(function*() {
      const source = yield* TestArtifact.file("console.log('rolldown')", "main.ts");
      const context = yield* Effect.context<Fs>();
      let count = 0;
      return {
        calls: Effect.sync(() => count),
        run: (output: string, options: Commit.ProducerOptions) =>
          Rolldown.buildToDirectory({
            input: source.path,
            outdir: output,
            logLevel: "silent",
            plugins: [{
              name: "conformance",
              buildStart() {
                count++;
              },
              async writeBundle(options) {
                if (await Effect.runPromise(control.enter(options.dir!).pipe(Effect.provideContext(context)))) {
                  throw new Error("scripted build failure");
                }
              },
            }],
            ...options,
          }),
      };
    }),
});

// A third-party service proves the kit is independent of first-party package names and signatures.
class Upx extends Context.Service<Upx, Tool.Service>()("test/Upx") {}
const upx = Tool.provider(Upx, { name: "upx", version: { supported: "^4.2.0", tested: ["4.2.0"] } });
const compress = (input: { executable: Artifact.Executable; outfile: string } & Commit.ProducerOptions) =>
  Effect.gen(function*() {
    const issue = Tool.argumentIssue(input.outfile);
    if (issue !== undefined) {
      return yield* new Tool.InputInvalid({ operation: "Upx.compress", reason: `outfile ${issue}` });
    }
    const tool = yield* upx.resolved;
    return yield* Commit.output(
      input.outfile,
      (out) =>
        Tool.run(tool, ["--best", "-o", out, input.executable.path]).pipe(
          Effect.andThen(Artifact.executable(out, Tool.producedBy(tool), input.executable.target)),
        ),
      input,
    );
  });
register({
  operation: "Upx.compress",
  kind: "executable",
  make: (control) =>
    Effect.gen(function*() {
      const executable = yield* TestArtifact.executable("linux-x64");
      const tool = TestTool.resolved("upx", "4.2.0");
      const fake = scripted((call) => written(control, arg(call, "-o"), TestArtifact.bytes("linux-x64")));
      return {
        calls: fake.calls,
        provider: { tool, constraints: upx.constraints },
        run: (outfile: string, options: Commit.ProducerOptions) =>
          compress({ executable, outfile, ...options }).pipe(
            Effect.provide(upx.testLayer({ tool })),
            Effect.provide(fake.layer),
          ),
      };
    }),
});

it("the conformance suite rejects an unobserved production boundary", async () => {
  const cases = TestProvider.conformance({
    operation: "Broken.produce",
    kind: "file",
    make: () =>
      Effect.succeed({
        calls: Effect.succeed(0),
        run: (outfile: string) =>
          Commit.output(outfile, (path) =>
            Effect.gen(function*() {
              const fs = yield* FileSystem.FileSystem;
              yield* fs.writeFileString(path, "unobserved");
              return yield* Artifact.file(path, { name: "broken", version: "1" });
            })),
      }),
  });
  const result = await Effect.runPromise(cases[0]!.run.pipe(Effect.flip, Effect.provide(NodeServices.layer)));
  expect(result).toBeInstanceOf(TestProvider.ConformanceFailure);
  expect(result.detail).toContain("production boundary was never observed");
});
