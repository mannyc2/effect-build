import { NodeServices } from "@effect/platform-node";
import { Cause, ConfigProvider, Effect, Exit, FileSystem, Layer, Path, PlatformError, Result } from "effect";
import { ChildProcessSpawner as EffectChildProcessSpawner } from "effect/unstable/process";
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { definition, targetEntries } from "../../packages/effect-build-bun/src/Adapter.js";
import * as Bun from "../../packages/effect-build-bun/src/index.js";
import { discoverTool } from "../../packages/effect-build/src/standalone/internal/ToolDiscovery.js";
import { describeStandaloneDriverContract } from "../testkit/standaloneDriverContract.js";

describeStandaloneDriverContract<Bun.Compiler, Bun.Options, Bun.Target, Bun.Artifact>({
  tool: "bun",
  layer: Bun.layer,
  compileExecutable: Bun.compileExecutable,
  compileExecutableMatrix: Bun.compileExecutableMatrix,
  matrixTarget: "macos-aarch64",
  probeFirstArg: "-e",
  compileFirstArg: "build",
  invalidOptions: { rawArgs: ["--x"] } as never,
});

const roots: string[] = [];
const fixture = fileURLToPath(new URL("../fixtures/driver/fake-tool.mjs", import.meta.url));
const bunAdapter = {
  validateOptions: definition.validateOptions,
  renderArgv: (input: {
    readonly entrypoint: string;
    readonly target?: Bun.Target;
    readonly options: Parameters<typeof definition.renderArgv>[0]["input"]["options"];
    readonly stagedOutfile: string;
  }) =>
    definition.renderArgv({
      input: {
        entrypoint: input.entrypoint,
        ...(input.target === undefined ? {} : { target: input.target }),
        options: input.options,
      },
      ...(input.target === undefined
        ? {}
        : { nativeTarget: targetEntries.find(([target]) => target === input.target)![1] }),
      stagedOutfile: input.stagedOutfile,
    }),
};
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const fakeTool = (reportedPath: "self" | "other" = "self"): string => {
  const root = mkdtempSync(join(tmpdir(), "effect-build-tool-"));
  roots.push(root);
  const executable = join(root, "bun");
  const reportedExecutable = reportedPath === "self" ? executable : join(root, "different-bun");
  if (reportedPath === "other") {
    writeFileSync(reportedExecutable, "different executable\n");
    chmodSync(reportedExecutable, 0o755);
  }
  writeFileSync(
    executable,
    `#!/bin/sh\nprintf '{"path":"${reportedExecutable}","version":"9.9.9"}'\n`,
  );
  chmodSync(executable, 0o755);
  return executable;
};

const fakeCompileTool = (): { readonly executable: string; readonly log: string } => {
  const root = mkdtempSync(join(tmpdir(), "effect-build-tool-"));
  roots.push(root);
  const executable = join(root, "bun");
  const log = join(root, "spawns.log");
  writeFileSync(log, "");
  writeFileSync(
    executable,
    `#!/bin/sh\nprintf 'cwd:%s\\n' "$PWD" >> "${log}"\nEFFECT_BUILD_FAKE_TOOL_PATH="$0" exec "${process.execPath}" "${fixture}" bun "${log}" "$@"\n`,
  );
  chmodSync(executable, 0o755);
  return { executable, log };
};

const fakeSharedTool = (): { readonly executable: string; readonly log: string; readonly root: string } => {
  const root = mkdtempSync(join(tmpdir(), "effect-build-tool-"));
  roots.push(root);
  const executable = join(root, "bun");
  const log = join(root, "spawns.log");
  writeFileSync(log, "");
  writeFileSync(
    executable,
    `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const argv = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(argv) + "\\n");
if (argv[0] === "-e") {
  process.stdout.write(JSON.stringify({ path: process.argv[1], version: "1.3.9" }));
  process.exit(0);
}
const outfile = argv.find((value) => value.startsWith("--outfile="))?.slice(10);
if (!outfile) process.exit(2);
fs.mkdirSync(path.dirname(outfile), { recursive: true });
if (argv.includes("--compile")) {
  fs.writeFileSync(outfile, "not-a-native-executable");
  process.exit(0);
}
const metafile = argv.find((value) => value.startsWith("--metafile="))?.slice(11);
const entrypoint = argv.at(-1);
fs.writeFileSync(outfile, "console.log('bundle')\\n");
fs.writeFileSync(metafile, JSON.stringify({
  inputs: { [entrypoint]: { imports: [] } },
  outputs: { [outfile.endsWith(".mjs") ? "./main.mjs" : "./main.cjs"]: { entryPoint: entrypoint } }
}));
`,
  );
  chmodSync(executable, 0o755);
  return { executable, log, root };
};

describe("standalone Bun driver", () => {
  it("publishes the exact evidence-backed target literals", () => {
    expect(Bun.Target.literals).toEqual([
      "macos-x64",
      "macos-aarch64",
      "linux-x64-gnu",
      "linux-x64-musl",
      "linux-aarch64-gnu",
      "windows-x64",
    ]);
  });

  it("renders only requested native flags and exact target mapping", () => {
    const options = bunAdapter.validateOptions({ minify: true, sourcemap: "inline", bytecode: true });
    expect(Result.isSuccess(options)).toBe(true);
    if (Result.isFailure(options)) throw new Error(options.failure);
    expect(bunAdapter.renderArgv({
      entrypoint: "src/main.ts",
      target: "linux-aarch64-gnu",
      options: options.success,
      stagedOutfile: "/tmp/.effect-build/app",
    })).toEqual([
      "build",
      "--compile",
      "--target=bun-linux-arm64",
      "--minify",
      "--sourcemap=inline",
      "--bytecode",
      "--outfile=/tmp/.effect-build/app",
      "src/main.ts",
    ]);
  });

  it("rejects unknown runtime options", () => {
    expect(bunAdapter.validateOptions({ rawArgs: ["--x"] })).toMatchObject({
      _tag: "Failure",
      failure: "unknown Bun option",
    });
  });

  it("copies validated options so rendering cannot observe later caller mutation", () => {
    let minifyReads = 0;
    let sourcemapReads = 0;
    const source: { minify?: boolean; sourcemap?: string } = {
      get minify() {
        minifyReads += 1;
        return true;
      },
      get sourcemap() {
        sourcemapReads += 1;
        return "inline";
      },
    };
    const validated = bunAdapter.validateOptions(source);
    expect(Result.isSuccess(validated)).toBe(true);
    if (Result.isFailure(validated)) throw new Error(validated.failure);
    expect(bunAdapter.renderArgv({
      entrypoint: "a.ts",
      target: "macos-x64",
      options: validated.success,
      stagedOutfile: "/tmp/app",
    })).toEqual([
      "build",
      "--compile",
      "--target=bun-darwin-x64",
      "--minify",
      "--sourcemap=inline",
      "--outfile=/tmp/app",
      "a.ts",
    ]);
    expect({ minifyReads, sourcemapReads }).toEqual({ minifyReads: 1, sourcemapReads: 1 });
  });

  it("retains scalar typed-field trust and provider CLI pass-through", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "effect-build-bun-cwd-"));
    roots.push(cwd);
    writeFileSync(join(cwd, "bunfig.toml"), "# compiler-owned project configuration\n");
    const { executable, log } = fakeCompileTool();
    const previous = process.env.EFFECT_BUILD_CONTRACT_ENV;
    process.env.EFFECT_BUILD_CONTRACT_ENV = "provider-local-bun";
    try {
      const artifact = await Effect.runPromise(
        Bun.compileExecutable({
          entrypoint: "src/provider-entry.ts",
          outfile: "dist/app",
          cwd,
          // Scalar retains the typed-only boundary: only literal true hashes.
          digest: "yes" as never,
        }).pipe(
          Effect.provide(Bun.layer({ executable })),
          Effect.provide(NodeServices.layer),
        ),
      );
      const lines = readFileSync(log, "utf8").trim().split("\n");
      const compileArgv = JSON.parse(lines.find((line) => line.startsWith('["build"')) ?? "[]") as string[];
      expect(artifact.path).toBe(join(cwd, "dist", "app"));
      expect(artifact.digest).toBeUndefined();
      expect(lines).toContain(`cwd:${realpathSync(cwd)}`);
      expect(lines).toContain("env:provider-local-bun");
      expect(compileArgv.at(-1)).toBe("src/provider-entry.ts");
      expect(compileArgv.some((arg) => arg.includes("bunfig") || arg === "--config")).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.EFFECT_BUILD_CONTRACT_ENV;
      else process.env.EFFECT_BUILD_CONTRACT_ENV = previous;
    }
  });

  it("probes an explicit absolute executable while constructing the Layer", async () => {
    const executable = fakeTool();
    const service = await Effect.runPromise(
      Bun.Compiler.pipe(
        Effect.provide(Bun.layer({ executable })),
        Effect.provide(NodeServices.layer),
      ),
    );
    expect(service.compileExecutable).toBeTypeOf("function");
    expect(service.compileExecutableMatrix).toBeTypeOf("function");
    await expect(Effect.runPromise(
      Bun.Compiler.pipe(
        Effect.provide(Bun.layer({ executable: "relative/bun" })),
        Effect.provide(NodeServices.layer),
      ),
    )).rejects.toMatchObject({ _tag: "ToolProbeFailed" });
  });

  it("rejects an explicit executable whose probe reports a different canonical file", async () => {
    const executable = fakeTool("other");
    await expect(Effect.runPromise(
      Bun.Compiler.pipe(
        Effect.provide(Bun.layer({ executable })),
        Effect.provide(NodeServices.layer),
      ),
    )).rejects.toMatchObject({ _tag: "ToolProbeFailed" });
  });

  it("preserves interruption combined with a PATH filesystem failure", async () => {
    const services = await Effect.runPromise(
      Effect.gen(function*() {
        return {
          fileSystem: yield* FileSystem.FileSystem,
          path: yield* Path.Path,
          spawner: yield* EffectChildProcessSpawner.ChildProcessSpawner,
        };
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    const platformError = PlatformError.systemError({
      _tag: "PermissionDenied",
      module: "FileSystem",
      method: "realPath",
    });
    const interruptor = 28_028;
    const cause = Cause.combine(Cause.fail(platformError), Cause.interrupt(interruptor));
    const fileSystem: FileSystem.FileSystem = {
      ...services.fileSystem,
      realPath: () => Effect.failCause(cause),
    };
    const exit = await Effect.runPromise(
      Effect.exit(
        discoverTool({ toolName: "bun", probeArgv: ["--version"] }, undefined).pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(Path.Path, services.path),
          Effect.provideService(EffectChildProcessSpawner.ChildProcessSpawner, services.spawner),
          Effect.provideService(
            ConfigProvider.ConfigProvider,
            ConfigProvider.fromUnknown({ PATH: services.path.resolve("effect-build-path") }),
          ),
        ),
      ),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isSuccess(exit)) throw new Error("expected PATH inspection to fail");
    expect([...Cause.interruptors(exit.cause)]).toContain(interruptor);
    expect(exit.cause.reasons.find(Cause.isFailReason)?.error).toMatchObject({
      _tag: "ToolProbeFailed",
    });
  });

  it("uses semicolon PATH entries and a bounded .exe candidate under an injected Windows Path", async () => {
    const root = mkdtempSync(join(tmpdir(), "effect-build-windows-path-"));
    roots.push(root);
    const executable = join(root, "bun.exe");
    writeFileSync(
      executable,
      `#!${process.execPath}\nprocess.stdout.write(${
        JSON.stringify(JSON.stringify({ path: executable, version: "9.9.9" }))
      });\n`,
    );
    chmodSync(executable, 0o755);
    const services = await Effect.runPromise(
      Effect.gen(function*() {
        return {
          fileSystem: yield* FileSystem.FileSystem,
          path: yield* Path.Path,
          spawner: yield* EffectChildProcessSpawner.ChildProcessSpawner,
        };
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    const windowsPath: Path.Path = { ...services.path, sep: "\\" };
    const discovered = await Effect.runPromise(
      discoverTool({ toolName: "bun", probeArgv: ["--version"] }, undefined).pipe(
        Effect.provideService(FileSystem.FileSystem, services.fileSystem),
        Effect.provideService(Path.Path, windowsPath),
        Effect.provideService(EffectChildProcessSpawner.ChildProcessSpawner, services.spawner),
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown({ PATH: `relative;${root}` }),
        ),
      ),
    );

    expect(discovered.artifactTool.path).toBe(realpathSync(executable));
  });

  it("shares one selected command across direct compilation and scoped bundling", async () => {
    const { executable, log, root } = fakeSharedTool();
    const entrypoint = join(root, "entry.ts");
    writeFileSync(entrypoint, "console.log('entry')\n");
    const compiler = Bun.layer({ executable });
    const bundle = await Effect.runPromise(
      Effect.gen(function*() {
        const compileExit = yield* Effect.exit(Bun.compileExecutable({
          entrypoint,
          outfile: join(root, "app"),
        }));
        expect(compileExit).toMatchObject({ _tag: "Failure" });
        return yield* Bun.withJavaScriptBundle(
          { entrypoint, format: "esm", cwd: root },
          (main) => Effect.succeed({ tool: main.stages[0].tool, path: main.path }),
        );
      }).pipe(
        Effect.provide(compiler),
        Effect.provide(NodeServices.layer),
      ),
    );
    expect(bundle.tool).toEqual({ name: "bun", version: "1.3.9", path: realpathSync(executable) });
    expect(readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line)[0])).toEqual([
      "-e",
      "build",
      "build",
    ]);

    const capturedPlatformLayer = Bun.layer({ executable }).pipe(Layer.provide(NodeServices.layer));
    const second = await Effect.runPromise(
      Bun.withJavaScriptBundle(
        { entrypoint, format: "cjs", cwd: root },
        (main) => Effect.succeed(main.format),
      ).pipe(Effect.provide(capturedPlatformLayer)),
    );
    expect(second).toBe("cjs");
  });
});
