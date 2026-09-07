import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber, Layer } from "effect";
import { access, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as RolldownBundle from "../../packages/effect-build-rolldown/src/Command/Bundle.js";
import * as RolldownBundleToDirectory from "../../packages/effect-build-rolldown/src/Command/BundleToDirectory.js";
import { layer as rolldownLayer } from "../../packages/effect-build-rolldown/src/Command/Runtime.js";
import * as RolldownWatch from "../../packages/effect-build-rolldown/src/Command/Watch.js";
import { observeProviderNativeEvidence } from "../evidence/provider-native.js";

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

const waitForFile = async (path: string): Promise<void> => {
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      await access(path);
      return;
    } catch {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${path}`);
      await new Promise((resolveTick) => setTimeout(resolveTick, 25));
    }
  }
};

const packageBinary = async (name: "rolldown"): Promise<string> => {
  const suffixes = process.platform === "win32" ? [".exe", ".cmd", ""] as const : [""] as const;
  for (const suffix of suffixes) {
    try {
      return await realpath(resolve(`node_modules/.bin/${name}${suffix}`));
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
    }
  }
  throw new Error(`installed ${name} package has no executable shim for ${process.platform}`);
};

describe("real private Rolldown command binaries", () => {
  it("executes exact Rolldown 1.2.5 stdout and direct-directory candidates", async () => {
    const entry = join(root, "rolldown-entry.js");
    const outdir = join(root, "rolldown-dist");
    await writeFile(entry, "export const commandRolldown = 43;\n");
    const binary = await packageBinary("rolldown");
    const provider = Layer.provide(rolldownLayer({ executable: binary as never }), NodeServices.layer);
    const layer = provideRuntime(provider);
    const memory = await Effect.runPromise(
      RolldownBundle.bundle({ input: entry, format: "esm", logLevel: "silent" }).pipe(Effect.provide(layer)),
    );
    expect(new TextDecoder().decode(memory.output)).toContain("commandRolldown");
    const direct = await Effect.runPromise(
      RolldownBundleToDirectory.bundleToDirectory({
        inputs: [entry],
        directory: outdir,
        format: "esm",
        logLevel: "silent",
      }).pipe(Effect.provide(layer)),
    );
    expect(direct.publication).toBe("provider-direct-durable");
    expect(await readFile(join(outdir, "rolldown-entry.js"), "utf8")).toContain("commandRolldown");
    await observeProviderNativeEvidence("CAN-ROL-010", "CAN-ROL-011");
  });

  it("executes exact Rolldown 1.2.5 watch and interrupts its scoped child", async () => {
    const entry = join(root, "rolldown-watch-entry.js");
    const outdir = join(root, "rolldown-watch-dist");
    await writeFile(entry, "export const watchedRolldown = 45;\n");
    const binary = await packageBinary("rolldown");
    const provider = Layer.provide(rolldownLayer({ executable: binary as never }), NodeServices.layer);
    const layer = provideRuntime(provider);
    const watchExit = await Effect.runPromise(
      Effect.gen(function*() {
        let process: import("effect/unstable/process").ChildProcessSpawner.ChildProcessHandle | undefined;
        const fiber = yield* Effect.forkChild(
          Effect.scoped(
            Effect.gen(function*() {
              const watch = yield* RolldownWatch.watch({
                inputs: [entry],
                directory: outdir,
                format: "esm",
                logLevel: "silent",
              });
              process = watch.process;
              expect(yield* watch.process.isRunning).toBe(true);
              return yield* Effect.never;
            }).pipe(Effect.provide(layer)),
          ),
        );
        const output = join(outdir, "rolldown-watch-entry.js");
        yield* Effect.promise(() => waitForFile(output)).pipe(Effect.ensuring(Fiber.interrupt(fiber)));
        const exit = yield* Fiber.await(fiber);
        expect(process).toBeDefined();
        expect(yield* process!.isRunning).toBe(false);
        return exit;
      }),
    );
    expect(Exit.isFailure(watchExit)).toBe(true);
    if (Exit.isFailure(watchExit)) expect(Cause.hasInterrupts(watchExit.cause)).toBe(true);
    expect(await readFile(join(outdir, "rolldown-watch-entry.js"), "utf8")).toContain("watchedRolldown");
    await observeProviderNativeEvidence("CAN-ROL-012");
  }, 30_000);
});
