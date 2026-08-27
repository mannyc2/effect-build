import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Layer, PlatformError, Sink, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as BunBuild from "../../packages/effect-build-bun/src/Command/Build.js";
import * as BunCommand from "../../packages/effect-build-bun/src/Command/index.js";
import * as DenoBundle from "../../packages/effect-build-deno/src/Command/Bundle.js";
import * as DenoCommand from "../../packages/effect-build-deno/src/Command/index.js";
import * as DenoTranspile from "../../packages/effect-build-deno/src/Command/Transpile.js";
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

const makeSpawner = (): readonly [ChildProcessSpawner.ChildProcessSpawner["Service"], Control] => {
  const invocations: Invocation[] = [];
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
      if (command.args[0] === "--version") {
        const version = tool === "bun"
          ? "1.3.14\n"
          : tool === "deno"
          ? "deno 2.9.5\n"
          : tool === "esbuild"
          ? "0.28.2\n"
          : "rolldown v1.2.5\n";
        return handle(version);
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
