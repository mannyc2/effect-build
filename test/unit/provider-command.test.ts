import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Layer, PlatformError, Sink, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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
        return handle(tool === "esbuild" ? "0.28.2\n" : "rolldown v1.2.5\n");
      }
      const writesDirectly = command.args.some((arg) => arg.startsWith("--outdir=") || arg === "--dir");
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
    const built = await Effect.runPromise(
      EsbuildBuild.build({ entrypoint: "src/main.ts", bundle: true, format: "esm" }).pipe(Effect.provide(provided)),
    );
    expect(built.output.byteLength).toBe(32);
    expect(built.completion.stdout.truncated).toBe(true);
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

  it("runs bounded exact Rolldown stdout and provider-direct directory candidates", async () => {
    const root = makeRoot();
    const binary = executable(root, "rolldown");
    const [spawner, control] = makeSpawner();
    const platform = Layer.merge(NodeServices.layer, Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner));
    const runtime = Layer.provide(rolldownLayer({ executable: binary as never, outputLimitBytes: 40 }), platform);
    const provided = Layer.merge(runtime, platform);
    const bundled = await Effect.runPromise(
      RolldownBundle.bundle({ input: "src/main.ts", format: "esm", minify: true }).pipe(Effect.provide(provided)),
    );
    expect(bundled.output.byteLength).toBe(40);
    expect(bundled.completion.stdout.truncated).toBe(true);
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
