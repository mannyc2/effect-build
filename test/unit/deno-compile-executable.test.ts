import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber } from "effect";
import type * as Artifact from "effect-build/Artifact";
import { chmod, copyFile, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Compile from "../../packages/effect-build-deno/src/Command/CompileExecutable.js";
import * as CompileWatch from "../../packages/effect-build-deno/src/Command/CompileWatch.js";
import * as Runtime from "../../packages/effect-build-deno/src/internal/Runtime.js";

const fixture = resolve(fileURLToPath(new URL("../fixtures/tools/fake-deno.mjs", import.meta.url)));
let root = "";
let executable = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-deno-compile-"));
  executable = join(root, "deno");
  await copyFile(fixture, executable);
  await chmod(executable, 0o755);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const hostTarget = (): Compile.Target => {
  if (process.platform === "darwin") return process.arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  if (process.platform === "win32") {
    return process.arch === "arm64"
      ? "aarch64-pc-windows-msvc"
      : "x86_64-pc-windows-msvc";
  }
  return process.arch === "arm64" ? "aarch64-unknown-linux-gnu" : "x86_64-unknown-linux-gnu";
};

const systemTarget = (): string => {
  if (process.platform === "darwin") return process.arch === "arm64" ? "macos-aarch64" : "macos-x64";
  if (process.platform === "win32") return process.arch === "arm64" ? "windows-aarch64" : "windows-x64";
  return process.arch === "arm64" ? "linux-aarch64-gnu" : "linux-x64-gnu";
};

const input = (name: string, overrides: Partial<Compile.Input<"hashed">> = {}): Compile.Input<"hashed"> => ({
  entrypoint: "main.ts",
  outfile: join(root, name),
  target: hostTarget(),
  observation: "hashed",
  ...overrides,
});

const run = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    | Runtime.Runtime
    | import("effect").FileSystem.FileSystem
    | import("effect").Path.Path
    | import("effect").Crypto.Crypto
  >,
) =>
  Effect.runPromiseExit(
    effect.pipe(
      Effect.provide(Runtime.layer({ executable: executable as Artifact.AbsolutePath })),
      Effect.provide(NodeServices.layer),
    ) as Effect.Effect<A, E>,
  );

const errorOf = <A, E>(exit: Exit.Exit<A, E>): E => {
  expect(Exit.isFailure(exit)).toBe(true);
  const found = Exit.isFailure(exit) ? Cause.findErrorOption(exit.cause) : undefined;
  expect(found?._tag).toBe("Some");
  return (found as { readonly value: E }).value;
};

const absent = (path: string): Promise<boolean> => stat(path).then(() => false, () => true);
const noStaging = async (): Promise<boolean> =>
  !(await readdir(root)).some((name) => name.startsWith(".effect-build-"));
const waitForFile = async (path: string): Promise<void> => {
  const deadline = Date.now() + 5_000;
  while (await absent(path)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${path}`);
    await new Promise((resolveTick) => setTimeout(resolveTick, 10));
  }
};

const describeUnix = process.platform === "win32" ? describe.skip : describe.sequential;
describeUnix("Deno compileExecutable", () => {
  it("preserves config/cache/permission authority and atomically publishes an authenticated executable", async () => {
    const log = join(root, "compile.log");
    const denoDir = join(root, "deno-cache-authority");
    process.env.FAKE_DENO_LOG = log;
    try {
      const exit = await Effect.runPromiseExit(
        Compile.compileExecutable(input("hashed", {
          config: "deno.json",
          importMap: "imports.json",
          lock: "deno.lock",
          frozen: true,
          cachedOnly: true,
          noRemote: true,
          allowRead: true,
          allowNet: ["example.com:443"],
          denyEnv: ["SECRET"],
          include: ["assets"],
          bundle: true,
          minify: true,
        })).pipe(
          Effect.provide(Runtime.layer({
            executable: executable as Artifact.AbsolutePath,
            denoDir: denoDir as Artifact.AbsolutePath,
          })),
          Effect.provide(NodeServices.layer),
        ),
      );
      expect(Exit.isSuccess(exit)).toBe(true);
      if (Exit.isSuccess(exit)) {
        expect(exit.value).toMatchObject({
          _tag: "HashedExecutable",
          provider: "deno",
          target: systemTarget(),
          denoTarget: hostTarget(),
          publication: { commit: "same-parent-rename", committed: true },
          runtime: { name: "deno", version: "2.9.5" },
          runtimeAcquisition: {
            _tag: "ProviderManagedDenort",
            denoDir,
            evidenceGate: "cold-warm-corrupt-offline-target-relation-open",
          },
        });
        expect(exit.value.digest.value).toMatch(/^[0-9a-f]{64}$/u);
      }
      const invocations = (await readFile(log, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
      expect(invocations).toHaveLength(1);
      expect(invocations[0].denoDir).toBe(denoDir);
      expect(invocations[0].argv).toEqual(expect.arrayContaining([
        "compile",
        "--config",
        "deno.json",
        "--import-map",
        "imports.json",
        "--lock",
        "deno.lock",
        "--frozen",
        "--cached-only",
        "--no-remote",
        "--allow-read",
        "--allow-net=example.com:443",
        "--deny-env=SECRET",
        "--include",
        "assets",
        "--bundle",
        "--minify",
        "--target",
        hostTarget(),
      ]));
    } finally {
      delete process.env.FAKE_DENO_LOG;
    }
  });

  it("returns ordered matrix cells while preserving independently committed siblings", async () => {
    const reportExit = await run(Compile.compileExecutableMatrix({
      concurrency: 2,
      inputs: [
        input("matrix-success"),
        input("matrix-invalid", { allowRead: [] as never }),
      ],
    }));
    expect(Exit.isSuccess(reportExit)).toBe(true);
    if (Exit.isSuccess(reportExit)) {
      expect(reportExit.value).toMatchObject({ provider: "deno", operation: "compileExecutable", rollback: "none" });
      expect(reportExit.value.cells.map((cell) => [cell.identity.index, cell._tag])).toEqual([
        [0, "Success"],
        [1, "Failure"],
      ]);
      expect(reportExit.value.cells[1]).toMatchObject({ error: { _tag: "DenoCommandInputInvalid" } });
    }
  });

  it("refuses a non-pinned selected Deno rather than warning or falling back", async () => {
    process.env.FAKE_DENO_VERSION = "2.9.4";
    try {
      const failure = errorOf(await run(Compile.compileExecutable(input("refused")))) as Runtime.DenoCommandUnsupported;
      expect(failure).toMatchObject({ _tag: "DenoCommandUnsupported", version: "2.9.4" });
      expect(await absent(join(root, "refused"))).toBe(true);
    } finally {
      delete process.env.FAKE_DENO_VERSION;
    }
  });

  it("preserves bounded provider diagnostics and removes unpublished staging", async () => {
    process.env.FAKE_DENO_MODE = "fail";
    try {
      const failure = errorOf(await run(Compile.compileExecutable(input("failed")))) as Runtime.DenoCommandFailed;
      expect(failure).toMatchObject({
        _tag: "DenoCommandFailed",
        operation: "compileExecutable",
        publication: "none",
        exitCode: 17,
      });
      expect(new TextDecoder().decode(failure.stderr)).toBe("fake stderr diagnostic");
      expect(await absent(join(root, "failed"))).toBe(true);
      expect(await noStaging()).toBe(true);
    } finally {
      delete process.env.FAKE_DENO_MODE;
    }
  });

  it("preserves interruption Cause, kills the scoped child, and removes private staging", async () => {
    const started = join(root, "started");
    process.env.FAKE_DENO_MODE = "delay";
    process.env.FAKE_DENO_STARTED = started;
    try {
      const outer = await Effect.runPromiseExit(
        Effect.gen(function*() {
          const fiber = yield* Effect.forkChild(Compile.compileExecutable(input("interrupted")));
          yield* Effect.promise(() => waitForFile(started));
          yield* Fiber.interrupt(fiber);
          return yield* Fiber.await(fiber);
        }).pipe(
          Effect.provide(Runtime.layer({ executable: executable as Artifact.AbsolutePath })),
          Effect.provide(NodeServices.layer),
        ),
      );
      expect(Exit.isSuccess(outer)).toBe(true);
      if (Exit.isSuccess(outer) && Exit.isFailure(outer.value)) {
        expect(Cause.hasInterrupts(outer.value.cause)).toBe(true);
      }
      expect(await absent(join(root, "interrupted"))).toBe(true);
      expect(await noStaging()).toBe(true);
    } finally {
      delete process.env.FAKE_DENO_MODE;
      delete process.env.FAKE_DENO_STARTED;
    }
  });

  it("keeps compile watch provider-direct/scoped and preserves interruption Cause", async () => {
    const started = join(root, "compile-watch-started");
    const log = join(root, "compile-watch.log");
    process.env.FAKE_DENO_MODE = "delay";
    process.env.FAKE_DENO_STARTED = started;
    process.env.FAKE_DENO_LOG = log;
    try {
      const outer = await Effect.runPromiseExit(
        Effect.gen(function*() {
          const fiber = yield* Effect.forkChild(
            Effect.scoped(
              CompileWatch.watch({
                entrypoint: "main.ts",
                outfile: join(root, "watched-app"),
                target: hostTarget(),
                noClearScreen: true,
                watchExclude: ["generated/**"],
              }).pipe(Effect.andThen(Effect.never)),
            ),
          );
          yield* Effect.promise(() => waitForFile(started));
          yield* Fiber.interrupt(fiber);
          return yield* Fiber.await(fiber);
        }).pipe(
          Effect.provide(Runtime.layer({ executable: executable as Artifact.AbsolutePath })),
          Effect.provide(NodeServices.layer),
        ),
      );
      expect(Exit.isSuccess(outer)).toBe(true);
      if (Exit.isSuccess(outer) && Exit.isFailure(outer.value)) {
        expect(Cause.hasInterrupts(outer.value.cause)).toBe(true);
      }
      const invocation = JSON.parse((await readFile(log, "utf8")).trim());
      expect(invocation.argv).toEqual(expect.arrayContaining([
        "compile",
        "--watch",
        "--no-clear-screen",
        "--watch-exclude=generated/**",
      ]));
    } finally {
      delete process.env.FAKE_DENO_MODE;
      delete process.env.FAKE_DENO_STARTED;
      delete process.env.FAKE_DENO_LOG;
    }
  });
});
