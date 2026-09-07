import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Layer, PlatformError, Sink, Stream } from "effect";
import type * as Tool from "effect-build/Author/Tool";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as BunBuild from "../../packages/effect-build-bun/src/Command/Build.js";
import * as BunCommand from "../../packages/effect-build-bun/src/Command/index.js";
import * as DenoBundle from "../../packages/effect-build-deno/src/Command/Bundle.js";
import * as DenoCommand from "../../packages/effect-build-deno/src/Command/index.js";
import * as DenoTranspile from "../../packages/effect-build-deno/src/Command/Transpile.js";
import { Runtime as DenoRuntime } from "../../packages/effect-build-deno/src/internal/Runtime.js";
import * as EsbuildBuild from "../../packages/effect-build-esbuild/src/Command/Build.js";
import * as EsbuildBuildToDirectory from "../../packages/effect-build-esbuild/src/Command/BuildToDirectory.js";
import * as EsbuildCommand from "../../packages/effect-build-esbuild/src/Command/index.js";
import * as EsbuildServe from "../../packages/effect-build-esbuild/src/Command/Serve.js";
import * as EsbuildWatch from "../../packages/effect-build-esbuild/src/Command/Watch.js";
import * as RolldownBundle from "../../packages/effect-build-rolldown/src/Command/Bundle.js";
import * as RolldownBundleToDirectory from "../../packages/effect-build-rolldown/src/Command/BundleToDirectory.js";
import { layer as rolldownLayer } from "../../packages/effect-build-rolldown/src/Command/Runtime.js";
import * as RolldownWatch from "../../packages/effect-build-rolldown/src/Command/Watch.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

interface Invocation {
  readonly tool: string;
  readonly argv: readonly string[];
}

interface Control {
  readonly invocations: readonly Invocation[];
}

const makeSpawner = (
  banners: Readonly<Record<string, string>> = {},
  probeStderr = "",
): readonly [ChildProcessSpawner.ChildProcessSpawner["Service"], Control] => {
  const invocations: Invocation[] = [];
  const runtimeProbes = new Set<string>();
  const handle = (stdout: string, stderr = "", code = 0) =>
    ChildProcessSpawner.makeHandle({
      pid: ChildProcessSpawner.ProcessId(45001),
      stdin: Sink.drain,
      stdout: Stream.fromIterable([new TextEncoder().encode(stdout)]),
      stderr: Stream.fromIterable([new TextEncoder().encode(stderr)]),
      all: Stream.fromIterable([new TextEncoder().encode(`${stdout}${stderr}`)]),
      exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(code)),
      isRunning: Effect.succeed(false),
      kill: () => Effect.void,
      getInputFd: () => Sink.drain,
      getOutputFd: () => Stream.empty,
      unref: Effect.succeed(Effect.void),
    });
  const service = ChildProcessSpawner.make((command) => {
    if (!ChildProcess.isStandardCommand(command)) {
      return Effect.fail(PlatformError.systemError({
        _tag: "InvalidData",
        module: "test",
        method: "spawn",
        description: "standard only",
      }));
    }
    return Effect.sync(() => {
      const tool = basename(command.command);
      invocations.push({ tool, argv: command.args });
      if (runtimeProbes.has(command.command)) {
        return handle((banners.denort ?? "deno 2.9.5\n").replace(/^deno /u, ""));
      }
      if (command.args[0] === "--version") {
        const version = tool === "bun"
          ? "1.3.14\n"
          : tool === "deno"
          ? "deno 2.9.5\n"
          : tool === "esbuild"
          ? "0.28.2\n"
          : "rolldown v1.2.5\n";
        return handle(banners[tool] ?? version, probeStderr);
      }
      if (tool === "deno" && command.args[0] === "compile" && command.args.at(-1)?.endsWith("identity.ts")) {
        runtimeProbes.add(command.args[command.args.indexOf("--output") + 1]!);
        return handle("");
      }
      const writesDirectly = command.args.some((arg) =>
        arg.startsWith("--outdir=") || arg === "--outdir" || arg === "--output" || arg === "--dir"
      );
      return handle(writesDirectly ? "" : `${"x".repeat(96)}\n`);
    });
  });
  return [service, { invocations }];
};

const executable = (root: string, name: string): string => {
  const path = join(root, name);
  writeFileSync(path, name);
  chmodSync(path, 0o755);
  return path;
};

const makeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "effect-build-command-"));
  roots.push(root);
  return root;
};

const failure = <A, E>(exit: Exit.Exit<A, E>): E => {
  if (!Exit.isFailure(exit)) throw new Error("expected failure");
  const found = Cause.findErrorOption(exit.cause);
  if (found._tag === "None") throw new Error("expected typed failure");
  return found.value;
};

const publicBuild = async (provider: "bun" | "deno" | "esbuild", banner: string, probeStderr = "") => {
  const binary = executable(makeRoot(), provider);
  const [spawner, control] = makeSpawner({ [provider]: banner }, probeStderr);
  const platform = Layer.merge(NodeServices.layer, Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner));
  const options = { executable: binary as never };
  const exit: Exit.Exit<{ readonly tool: Tool.Observation<string> }, unknown> = provider === "bun"
    ? await Effect.runPromiseExit(
      BunBuild.build({ entrypoint: "src/main.ts" }).pipe(
        Effect.provide(Layer.provide(BunCommand.layer(options), platform)),
      ),
    )
    : provider === "deno"
    ? await Effect.runPromiseExit(
      DenoTranspile.transpile({ file: "src/main.ts" }).pipe(
        Effect.provide(Layer.provide(DenoCommand.layer(options), platform)),
      ),
    )
    : await Effect.runPromiseExit(
      EsbuildBuild.build({ entrypoint: "src/main.ts" }).pipe(
        Effect.provide(Layer.provide(EsbuildCommand.layer(options), platform)),
      ),
    );
  return { exit, control };
};

describe("provider command compatibility", () => {
  it.each(
    [
      ["esbuild", "0.28.2", "0.28.2"],
      ["esbuild", "0.28.99", "0.28.99"],
      ["bun", "1.3.14", "1.3.14"],
      ["bun", "1.3.99", "1.3.99"],
      ["bun", "1.4.2", "1.4.2"],
      ["bun", "1.4.99", "1.4.99"],
      ["deno", "deno 2.9.5", "2.9.5"],
    ] as const,
  )("admits %s public builds at %s with truthful observations", async (provider, banner, version) => {
    const { exit, control } = await publicBuild(provider, `${banner}\n`);
    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value.tool.participants[0]).toMatchObject({ version, channel: "unreported" });
    expect(exit.value.tool.capabilities).toHaveLength(3);
    expect(exit.value.tool.capabilities.every((capability) => capability._tag === "Indeterminate")).toBe(true);
    expect(control.invocations).toHaveLength(2);
  });

  it.each(
    [
      ["esbuild", "0.28.1"],
      ["esbuild", "0.29.0"],
      ["esbuild", "0.28.2-canary"],
      ["esbuild", "0.28.2+metadata"],
      ["esbuild", "00.28.2"],
      ["esbuild", "0.28"],
      ["esbuild", "0.28.2\n0.29.0"],
      ["bun", "1.3.13"],
      ["bun", "1.4.0"],
      ["bun", "1.4.1"],
      ["bun", "1.5.0"],
      ["bun", "1.3.14-canary"],
      ["bun", "1.3.14 canary"],
      ["bun", "1.3.14\n1.4.2"],
      ["bun", "1.3.14+metadata"],
      ["bun", "1.3"],
      ["bun", "1.03.14"],
      ["deno", "deno 2.9.4"],
      ["deno", "deno 2.9.6"],
      ["deno", "deno 2.9.99"],
      ["deno", "deno 2.10.0"],
      ["deno", "deno 2.9.5-canary"],
      ["deno", "deno 2.9.5+metadata"],
      ["deno", "deno 2.9"],
      ["deno", "deno 2.09.5"],
      ["deno", "deno 2.9.5 (canary, release, aarch64-apple-darwin)"],
    ] as const,
  )("refuses %s identity %s before operation spawn", async (provider, banner) => {
    const { exit, control } = await publicBuild(provider, `${banner}\n`);
    expect(failure(exit)).toMatchObject({
      _tag: `${provider === "bun" ? "Bun" : provider === "deno" ? "Deno" : "Esbuild"}CommandUnsupported`,
      reason: expect.stringContaining(provider === "bun" ? "1.3.14" : provider === "deno" ? "2.9.5" : "0.28.2"),
    });
    expect(control.invocations).toEqual([{ tool: provider, argv: ["--version"] }]);
  });

  it.each([
    "deno 2.9.5 (stable, canary, aarch64-apple-darwin)",
    "deno 2.9.5 (stable, release, aarch64-apple-darwin) canary",
    "deno 2.9.5\ndeno 2.10.0",
    "deno 2.9.5\nv8 14.0",
    "deno 2.9.5\nv8 14.0\ntypescript 6.0\ncanary",
  ])("refuses malformed or conflicting Deno banner %s", async (banner) => {
    const { exit, control } = await publicBuild("deno", banner);
    expect(failure(exit)).toMatchObject({ _tag: "DenoCommandFailed", operation: "probe" });
    expect(control.invocations).toHaveLength(1);
  });

  it.each(["bun", "deno", "esbuild"] as const)("rejects a truncated %s identity probe", async (provider) => {
    const version = provider === "bun" ? "1.3.14" : provider === "deno" ? "deno 2.9.5" : "0.28.2";
    for (const stream of ["stdout", "stderr"] as const) {
      const { exit, control } = await publicBuild(
        provider,
        `${version}\n${stream === "stdout" ? " ".repeat(65536) : ""}`,
        stream === "stderr" ? " ".repeat(65537) : "",
      );
      expect(failure(exit)).toMatchObject({ operation: "probe", [`${stream}Truncated`]: true });
      expect(control.invocations).toHaveLength(1);
    }
  });

  it("records the reported Deno channel and retains private bundle admission at its exact version", async () => {
    const banner = "deno 2.9.6 (stable, release, aarch64-apple-darwin)\nv8 14.0\ntypescript 6.0\n";
    const { exit } = await publicBuild("deno", banner.replace("2.9.6", "2.9.5"));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) expect(exit.value.tool.participants[0].channel).toBe("stable");
    const binary = executable(makeRoot(), "deno");
    const [spawner, control] = makeSpawner({ deno: banner });
    const platform = Layer.merge(NodeServices.layer, Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner));
    const refused = await Effect.runPromiseExit(
      DenoBundle.stdout({ entrypoint: "src/main.ts" }).pipe(
        Effect.provide(Layer.provide(DenoCommand.layer({ executable: binary as never }), platform)),
      ),
    );
    expect(failure(refused)).toMatchObject({
      _tag: "DenoCommandUnsupported",
      operation: "bundleStdout",
      version: "2.9.6",
    });
    expect(control.invocations).toHaveLength(1);
  });

  it("retains private esbuild serve admission at its exact version", async () => {
    const binary = executable(makeRoot(), "esbuild");
    const [spawner, control] = makeSpawner({ esbuild: "0.28.3\n" });
    const platform = Layer.merge(NodeServices.layer, Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner));
    const refused = await Effect.runPromiseExit(
      Effect.scoped(EsbuildServe.serve({
        entrypoints: ["src/main.ts"],
        output: { _tag: "Outdir", path: "dist" },
        port: 4173,
      })).pipe(Effect.provide(Layer.provide(EsbuildCommand.layer({ executable: binary as never }), platform))),
    );
    expect(failure(refused)).toMatchObject({
      _tag: "EsbuildCommandUnsupported",
      operation: "serve",
      version: "0.28.3",
    });
    expect(control.invocations).toHaveLength(1);
  });

  it.each(
    [
      ["2.9.5", "deno 2.9.5", "compileExecutable", true],
      ["2.9.5", "deno 2.9.6", "compileExecutable", false],
      ["2.9.5", "deno 2.9.4", "compileExecutable", false],
      ["2.9.5", "deno 2.9.5-canary", "compileExecutable", false],
      ["2.9.5", "deno 2.9.5+abcdef0", "compileExecutable", false],
      ["2.9.5", "deno 2.9.5", "compileWatch", true],
      ["2.9.5", "deno 2.9.6", "compileWatch", false],
      ["2.9.5", "deno 2.9.5+abcdef0", "compileWatch", false],
    ] as const,
  )("checks Deno %s against denort %s for %s", async (version, runtimeBanner, operation, admitted) => {
    const root = makeRoot();
    const binary = executable(root, "deno");
    const denort = executable(root, "denort");
    const [spawner, control] = makeSpawner({ deno: `deno ${version}\n`, denort: `${runtimeBanner}\n` });
    const platform = Layer.merge(NodeServices.layer, Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner));
    const exit = await Effect.runPromiseExit(
      Effect.gen(function*() {
        const runtime = yield* DenoRuntime;
        expect(runtime.denort?.observation.capabilities[0]?._tag).toBe("Indeterminate");
        // This operation has no runtime relation even when an override was selected.
        yield* runtime.run("transpileStdout", "none", ["transpile", "main.ts"]);
        return operation === "compileWatch"
          ? yield* Effect.scoped(runtime.watch(operation, ["compile", "--watch", "main.ts"]))
          : yield* runtime.run(operation, "none", ["compile", "main.ts"]);
      }).pipe(Effect.provide(Layer.provide(
        DenoCommand.layer({
          executable: binary as never,
          denort: denort as never,
        }),
        platform,
      ))),
    );
    expect(Exit.isSuccess(exit)).toBe(admitted);
    expect(
      control.invocations.filter((invocation) =>
        invocation.argv[0] === "compile" && invocation.argv.at(-1) === "main.ts"
      ),
    ).toHaveLength(admitted ? 1 : 0);
    expect(control.invocations.some((invocation) => invocation.tool === "denort")).toBe(false);
    const identitySource = control.invocations.find((invocation) => invocation.argv.at(-1)?.endsWith("identity.ts"))
      ?.argv.at(-1);
    expect(identitySource).toBeDefined();
    expect(existsSync(dirname(identitySource!))).toBe(false);
    if (!admitted) {
      expect(failure(exit)).toMatchObject({
        _tag: "DenoCommandUnsupported",
        operation,
        reason: expect.stringContaining(`Deno ${version}`),
      });
    }
  });

  it.each(["", " ".repeat(65537)])("fails closed and cleans up incomplete denort identity output", async (banner) => {
    const root = makeRoot();
    const binary = executable(root, "deno");
    const denort = executable(root, "denort");
    const [spawner, control] = makeSpawner({ denort: banner });
    const platform = Layer.merge(NodeServices.layer, Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner));
    const exit = await Effect.runPromiseExit(
      DenoTranspile.transpile({ file: "main.ts" }).pipe(
        Effect.provide(Layer.provide(
          DenoCommand.layer({
            executable: binary as never,
            denort: denort as never,
          }),
          platform,
        )),
      ),
    );
    expect(failure(exit)).toMatchObject({ _tag: "DenoCommandFailed", operation: "probe" });
    const identitySource = control.invocations.find((invocation) => invocation.argv.at(-1)?.endsWith("identity.ts"))
      ?.argv.at(-1);
    expect(identitySource).toBeDefined();
    expect(existsSync(dirname(identitySource!))).toBe(false);
    expect(control.invocations).toHaveLength(3);
  });

  it("reauthenticates the matched denort before compile launch", async () => {
    const root = makeRoot();
    const binary = executable(root, "deno");
    const denort = executable(root, "denort");
    const [spawner, control] = makeSpawner({ deno: "deno 2.9.5\n", denort: "deno 2.9.5\n" });
    const platform = Layer.merge(NodeServices.layer, Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner));
    const exit = await Effect.runPromiseExit(
      Effect.gen(function*() {
        const runtime = yield* DenoRuntime;
        writeFileSync(denort, "replaced-runtime");
        return yield* runtime.run("compileExecutable", "none", ["compile", "main.ts"]);
      }).pipe(Effect.provide(Layer.provide(
        DenoCommand.layer({
          executable: binary as never,
          denort: denort as never,
        }),
        platform,
      ))),
    );
    expect(failure(exit)).toMatchObject({ _tag: "SelectedToolChanged", tool: "denort" });
    expect(control.invocations).toHaveLength(3);
  });
});

describe("provider command lanes", () => {
  it("fails closed when Bun or Deno primary stdout exceeds its capture bound", async () => {
    const root = makeRoot();
    const bunBinary = executable(root, "bun");
    const denoBinary = executable(root, "deno");
    const [spawner] = makeSpawner();
    const platform = Layer.merge(NodeServices.layer, Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner));
    const bunRuntime = Layer.provide(
      BunCommand.layer({ executable: bunBinary as never, outputLimitBytes: 32 }),
      platform,
    );
    const denoRuntime = Layer.provide(
      DenoCommand.layer({ executable: denoBinary as never, outputLimitBytes: 32 }),
      platform,
    );

    const bunExit = await Effect.runPromiseExit(
      BunBuild.build({ entrypoint: "src/main.ts", bundle: true }).pipe(
        Effect.provide(Layer.merge(bunRuntime, platform)),
      ),
    );
    expect(failure(bunExit)).toMatchObject({
      _tag: "BunCommandOutputTruncated",
      operation: "buildStdout",
      publication: "none",
      exitCode: 0,
      stdoutTruncated: true,
      outputLimitBytes: 32,
    });

    const denoProvided = Layer.merge(denoRuntime, platform);
    const bundleExit = await Effect.runPromiseExit(
      DenoBundle.stdout({ entrypoint: "src/main.ts" }).pipe(Effect.provide(denoProvided)),
    );
    expect(failure(bundleExit)).toMatchObject({
      _tag: "DenoCommandOutputTruncated",
      operation: "bundleStdout",
      publication: "none",
      exitCode: 0,
      stdoutTruncated: true,
      outputLimitBytes: 32,
    });

    const transpileExit = await Effect.runPromiseExit(
      DenoTranspile.transpile({ file: "src/main.ts" }).pipe(Effect.provide(denoProvided)),
    );
    expect(failure(transpileExit)).toMatchObject({
      _tag: "DenoCommandOutputTruncated",
      operation: "transpileStdout",
      publication: "none",
      exitCode: 0,
      stdoutTruncated: true,
      outputLimitBytes: 32,
    });
  });

  it("runs bounded exact esbuild stdout and provider-direct directory operations", async () => {
    const root = makeRoot();
    const binary = executable(root, "esbuild");
    const [spawner, control] = makeSpawner();
    const platform = Layer.merge(NodeServices.layer, Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner));
    const runtime = Layer.provide(
      EsbuildCommand.layer({ executable: binary as never, outputLimitBytes: 32 }),
      platform,
    );
    const provided = Layer.merge(runtime, platform);
    const built = await Effect.runPromiseExit(
      EsbuildBuild.build({ entrypoint: "src/main.ts", bundle: true, format: "esm" }).pipe(Effect.provide(provided)),
    );
    expect(failure(built)).toMatchObject({
      _tag: "EsbuildCommandOutputTruncated",
      operation: "buildStdout",
      publication: "none",
      exitCode: 0,
      stdoutTruncated: true,
      outputLimitBytes: 32,
    });
    expect(control.invocations.at(-1)?.argv).toEqual(["--bundle", "--format=esm", "src/main.ts"]);

    const direct = await Effect.runPromise(
      EsbuildBuildToDirectory.buildToDirectory({
        entrypoints: ["src/a.ts", "src/b.ts"],
        directory: "dist",
        bundle: true,
        splitting: true,
      }).pipe(Effect.provide(provided)),
    );
    expect(direct).toMatchObject({
      _tag: "BuildToDirectoryResult",
      directory: "dist",
      publication: "provider-direct-durable",
    });
    expect(control.invocations.at(-1)?.argv).toEqual([
      "--bundle",
      "--splitting",
      "--outdir=dist",
      "src/a.ts",
      "src/b.ts",
    ]);

    const watched = await Effect.runPromise(
      Effect.scoped(
        EsbuildWatch.watch({
          entrypoints: ["src/main.ts"],
          output: { _tag: "Outfile", path: "dist/app.js" },
          bundle: true,
        }).pipe(Effect.provide(provided)),
      ),
    );
    expect(watched.publication).toBe("provider-direct-durable");
    expect(control.invocations.at(-1)?.argv).toEqual([
      "--watch=forever",
      "--bundle",
      "--outfile=dist/app.js",
      "src/main.ts",
    ]);

    const served = await Effect.runPromise(
      Effect.scoped(
        EsbuildServe.serve({
          entrypoints: ["src/main.ts"],
          output: { _tag: "Outdir", path: "dist" },
          bundle: true,
          host: "127.0.0.1",
          port: 4173,
          servedir: "public",
          corsOrigins: ["https://example.test"],
        }).pipe(Effect.provide(provided)),
      ),
    );
    expect(served.publication).toBe("provider-direct-durable");
    expect(control.invocations.at(-1)?.argv).toEqual([
      "--serve=127.0.0.1:4173",
      "--servedir=public",
      "--cors-origin=https://example.test",
      "--bundle",
      "--outdir=dist",
      "src/main.ts",
    ]);
  });

  it("rejects erased provider-direct tags before acquiring esbuild or Deno", async () => {
    const unknownOutput = { _tag: "Unknown", path: "dist" };

    const watchExit = await Effect.runPromiseExit(
      Effect.scoped(
        EsbuildWatch.watch({
          entrypoints: ["src/main.ts"],
          output: unknownOutput,
        } as never),
      ) as Effect.Effect<unknown, unknown>,
    );
    expect(failure(watchExit)).toMatchObject({
      _tag: "EsbuildCommandInputInvalid",
      operation: "watch",
      reason: "output._tag must be Outfile or Outdir",
    });

    const serveExit = await Effect.runPromiseExit(
      Effect.scoped(
        EsbuildServe.serve({
          entrypoints: ["src/main.ts"],
          output: unknownOutput,
        } as never),
      ) as Effect.Effect<unknown, unknown>,
    );
    expect(failure(serveExit)).toMatchObject({
      _tag: "EsbuildCommandInputInvalid",
      operation: "serve",
      reason: "output._tag must be Outfile or Outdir",
    });

    for (const operation of ["direct", "watch", "declarations"] as const) {
      const input = {
        entrypoints: ["src/main.ts"],
        destination: { _tag: "Unknown", path: "dist" },
      } as never;
      const candidate = operation === "direct"
        ? DenoBundle.direct(input)
        : operation === "watch"
        ? Effect.scoped(DenoBundle.watch(input))
        : DenoBundle.declarations(input);
      const exit = await Effect.runPromiseExit(
        candidate as Effect.Effect<unknown, unknown>,
      );
      expect(failure(exit)).toMatchObject({
        _tag: "DenoCommandInputInvalid",
        operation: "bundle",
        reason: "destination._tag must be Output or Outdir",
      });
    }

    const declarationOutput = await Effect.runPromiseExit(
      DenoBundle.declarations({
        entrypoints: ["src/main.ts"],
        destination: { _tag: "Output", path: "dist/index.d.ts" },
      } as never) as Effect.Effect<unknown, unknown>,
    );
    expect(failure(declarationOutput)).toMatchObject({
      _tag: "DenoCommandInputInvalid",
      operation: "bundle",
      reason: "destination._tag must be Outdir for declarations",
    });
  });

  it("runs bounded exact Rolldown stdout and provider-direct directory candidates", async () => {
    const root = makeRoot();
    const binary = executable(root, "rolldown");
    const [spawner, control] = makeSpawner();
    const platform = Layer.merge(NodeServices.layer, Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner));
    const runtime = Layer.provide(rolldownLayer({ executable: binary as never, outputLimitBytes: 40 }), platform);
    const provided = Layer.merge(runtime, platform);
    const bundled = await Effect.runPromiseExit(
      RolldownBundle.bundle({ input: "src/main.ts", format: "esm", minify: true }).pipe(Effect.provide(provided)),
    );
    expect(failure(bundled)).toMatchObject({
      _tag: "RolldownCommandOutputTruncated",
      operation: "bundleStdout",
      publication: "none",
      exitCode: 0,
      stdoutTruncated: true,
      outputLimitBytes: 40,
    });
    expect(control.invocations.at(-1)?.argv).toEqual(["src/main.ts", "--format", "esm", "--minify"]);

    const direct = await Effect.runPromise(
      RolldownBundleToDirectory.bundleToDirectory({
        inputs: ["src/a.ts", "src/b.ts"],
        directory: "dist",
        format: "esm",
      }).pipe(Effect.provide(provided)),
    );
    expect(direct).toMatchObject({
      _tag: "BundleToDirectoryResult",
      directory: "dist",
      publication: "provider-direct-durable",
    });
    expect(control.invocations.at(-1)?.argv).toEqual([
      "src/a.ts",
      "src/b.ts",
      "--dir",
      "dist",
      "--format",
      "esm",
    ]);

    const watched = await Effect.runPromise(
      Effect.scoped(
        RolldownWatch.watch({
          inputs: ["src/main.ts"],
          directory: "dist",
          format: "esm",
        }).pipe(Effect.provide(provided)),
      ),
    );
    expect(watched.publication).toBe("provider-direct-durable");
    expect(control.invocations.at(-1)?.argv).toEqual([
      "src/main.ts",
      "--dir",
      "dist",
      "--watch",
      "--format",
      "esm",
    ]);
  });

  it("reauthenticates the selected executable immediately before every operation", async () => {
    const root = makeRoot();
    const binary = executable(root, "esbuild");
    const [spawner] = makeSpawner();
    const platform = Layer.merge(NodeServices.layer, Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner));
    const runtime = Layer.provide(EsbuildCommand.layer({ executable: binary as never }), platform);
    const provided = Layer.merge(runtime, platform);
    const exit = await Effect.runPromiseExit(
      Effect.scoped(Effect.gen(function*() {
        const context = yield* Layer.build(provided);
        writeFileSync(binary, "mutated-selected-tool");
        return yield* EsbuildBuild.build({ entrypoint: "src/main.ts" }).pipe(Effect.provide(context));
      })),
    );
    expect(failure(exit)).toMatchObject({ _tag: "SelectedToolChanged", tool: "esbuild" });
  });
});
