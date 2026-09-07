import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber, Layer } from "effect";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as EsbuildBuild from "../../packages/effect-build-esbuild/src/Command/Build.js";
import * as EsbuildBuildToDirectory from "../../packages/effect-build-esbuild/src/Command/BuildToDirectory.js";
import * as EsbuildCommand from "../../packages/effect-build-esbuild/src/Command/index.js";
import * as EsbuildServe from "../../packages/effect-build-esbuild/src/Command/Serve.js";
import * as EsbuildWatch from "../../packages/effect-build-esbuild/src/Command/Watch.js";
import { observeProviderNativeEvidence } from "../evidence/provider-native.js";
import { selectToolFixture } from "./helpers/exact-tool.js";

const fixture = selectToolFixture("esbuild");
const execute = promisify(execFile);
let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-provider-command-real-"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const provideRuntime = <R, E>(
  provider: Layer.Layer<R, E, never>,
): Layer.Layer<
  | R
  | import("effect").FileSystem.FileSystem
  | import("effect").Path.Path
  | import("effect").Crypto.Crypto
  | import("effect/unstable/process").ChildProcessSpawner.ChildProcessSpawner,
  E
> => Layer.merge(provider, NodeServices.layer);

const waitForText = async (path: string, expected: string): Promise<void> => {
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      if ((await readFile(path, "utf8")).includes(expected)) return;
    } catch {
      // The provider may not have emitted its initial output yet.
    }
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${path} to contain ${expected}`);
    await new Promise((resolveTick) => setTimeout(resolveTick, 25));
  }
};

const reservePort = (): Promise<number> =>
  new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("failed to reserve an IPv4 port"));
        return;
      }
      server.close((error) => error === undefined ? resolvePort(address.port) : reject(error));
    });
  });

const waitForResponse = async (url: string): Promise<Response> => {
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      return await fetch(url);
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolveTick) => setTimeout(resolveTick, 25));
    }
  }
};

describe(`real esbuild ${fixture.version} command`, () => {
  it("executes exact esbuild 0.28.2 stdout and direct-directory forms", async () => {
    const entry = join(root, "esbuild-entry.ts");
    const outdir = join(root, "esbuild-dist");
    await writeFile(entry, "export const commandEsbuild: number = 42; console.log(commandEsbuild);\n");
    const binary = fixture.executable;
    const provider = Layer.provide(
      EsbuildCommand.layer({ executable: binary as never }),
      NodeServices.layer,
    );
    const layer = provideRuntime(provider);
    const memory = await Effect.runPromise(
      EsbuildBuild.build({
        entrypoint: entry,
        bundle: true,
        format: "esm",
        sourcemap: "inline",
        target: "es2022",
        logLevel: "silent",
      }).pipe(
        Effect.provide(layer),
      ),
    );
    expect(new TextDecoder().decode(memory.output)).toContain("commandEsbuild");
    const stdoutFile = join(root, "esbuild-stdout.mjs");
    await writeFile(stdoutFile, memory.output);
    expect((await execute(process.execPath, [stdoutFile])).stdout).toBe("42\n");
    await fixture.observe("build-stdout", memory.tool, {
      operation: "buildStdout",
      runner: `node-${process.versions.node}`,
    });
    const direct = await Effect.runPromise(
      EsbuildBuildToDirectory.buildToDirectory({
        entrypoints: [entry],
        directory: outdir,
        bundle: true,
        format: "esm",
        minify: true,
        sourcemap: "external",
        logLevel: "silent",
      }).pipe(Effect.provide(layer)),
    );
    expect(direct.publication).toBe("provider-direct-durable");
    expect((await execute(process.execPath, [join(outdir, "esbuild-entry.js")])).stdout).toBe("42\n");
    await access(join(outdir, "esbuild-entry.js.map"));
    await fixture.observe("build-directory", direct.tool, {
      operation: "buildDirect",
      runner: `node-${process.versions.node}`,
    });
    await observeProviderNativeEvidence("CAN-ESB-015", "CAN-ESB-016");
  });

  it("executes exact esbuild 0.28.2 watch and interrupts its scoped child", async () => {
    const entry = join(root, "esbuild-watch-entry.ts");
    const outfile = join(root, "esbuild-watch.js");
    await writeFile(entry, 'console.log("watch-initial");\n');
    const binary = fixture.executable;
    const provider = Layer.provide(EsbuildCommand.layer({ executable: binary as never }), NodeServices.layer);
    const layer = provideRuntime(provider);
    const watchExit = await Effect.runPromise(
      Effect.gen(function*() {
        let child: import("effect/unstable/process").ChildProcessSpawner.ChildProcessHandle | undefined;
        let observation: EsbuildWatch.Watch["tool"] | undefined;
        const fiber = yield* Effect.forkChild(
          Effect.scoped(
            Effect.gen(function*() {
              const watch = yield* EsbuildWatch.watch({
                entrypoints: [entry],
                output: { _tag: "Outfile", path: outfile },
                bundle: true,
                format: "esm",
                logLevel: "silent",
              });
              child = watch.process;
              observation = watch.tool;
              expect(yield* watch.process.isRunning).toBe(true);
              return yield* Effect.never;
            }).pipe(Effect.provide(layer)),
          ),
        );
        yield* Effect.promise(async () => {
          await waitForText(outfile, "watch-initial");
          expect((await execute(process.execPath, [outfile])).stdout).toBe("watch-initial\n");
          await writeFile(entry, 'console.log("watch-edited");\n');
          await waitForText(outfile, "watch-edited");
          expect((await execute(process.execPath, [outfile])).stdout).toBe("watch-edited\n");
        }).pipe(Effect.ensuring(Fiber.interrupt(fiber)));
        const exit = yield* Fiber.await(fiber);
        expect(child).toBeDefined();
        expect(yield* child!.isRunning).toBe(false);
        yield* Effect.promise(() =>
          fixture.observe("watch-rebuild-cleanup", observation!, {
            operation: "buildWatch",
            runner: `node-${process.versions.node}`,
          })
        );
        return exit;
      }),
    );
    expect(Exit.isFailure(watchExit)).toBe(true);
    if (Exit.isFailure(watchExit)) expect(Cause.hasInterrupts(watchExit.cause)).toBe(true);
    expect(await readFile(outfile, "utf8")).toContain("watch-edited");
    await observeProviderNativeEvidence("CAN-ESB-017");
  }, 30_000);

  it.skipIf(fixture.version !== "0.28.2")(
    "executes private exact esbuild 0.28.2 serve, answers a request, and closes with Scope",
    async () => {
      const entry = join(root, "esbuild-serve-entry.ts");
      const outdir = join(root, "esbuild-serve-dist");
      await writeFile(entry, 'export const servedEsbuild = "request-ok";\n');
      const binary = fixture.executable;
      const provider = Layer.provide(EsbuildCommand.layer({ executable: binary as never }), NodeServices.layer);
      const layer = provideRuntime(provider);
      const port = await reservePort();
      const url = `http://127.0.0.1:${port}/esbuild-serve-entry.js`;
      const exit = await Effect.runPromiseExit(
        Effect.scoped(
          Effect.gen(function*() {
            const server = yield* EsbuildServe.serve({
              entrypoints: [entry],
              output: { _tag: "Outdir", path: outdir },
              bundle: true,
              format: "esm",
              host: "127.0.0.1",
              port,
              servedir: outdir,
              logLevel: "silent",
            });
            expect(yield* server.process.isRunning).toBe(true);
            const response = yield* Effect.promise(() => waitForResponse(url));
            expect(response.status).toBe(200);
            expect(yield* Effect.promise(() => response.text())).toContain("request-ok");
          }).pipe(Effect.provide(layer)),
        ),
      );
      expect(Exit.isSuccess(exit)).toBe(true);
      await expect(fetch(url)).rejects.toThrow();
      await observeProviderNativeEvidence("CAN-ESB-018");
    },
    30_000,
  );
});
