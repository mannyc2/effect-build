import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber } from "effect";
import type * as Artifact from "effect-build/Artifact";
import { chmod, copyFile, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Compile from "../../packages/effect-build-bun/src/Command/CompileExecutable.js";
import * as Runtime from "../../packages/effect-build-bun/src/internal/Runtime.js";

const fixture = resolve(fileURLToPath(new URL("../fixtures/tools/fake-bun.mjs", import.meta.url)));
let root = "";
let executable = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-bun-compile-"));
  executable = join(root, "bun");
  await copyFile(fixture, executable);
  await chmod(executable, 0o755);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const hostTarget = (): Compile.Target => {
  if (process.platform === "darwin") return process.arch === "arm64" ? "bun-darwin-arm64" : "bun-darwin-x64";
  if (process.platform === "win32") return process.arch === "arm64" ? "bun-windows-arm64" : "bun-windows-x64";
  return process.arch === "arm64" ? "bun-linux-arm64" : "bun-linux-x64";
};

const systemTarget = (): string => {
  if (process.platform === "darwin") return process.arch === "arm64" ? "macos-aarch64" : "macos-x64";
  if (process.platform === "win32") return process.arch === "arm64" ? "windows-aarch64" : "windows-x64";
  return process.arch === "arm64" ? "linux-aarch64-gnu" : "linux-x64-gnu";
};

const input = (name: string, overrides: Partial<Compile.Input<"hashed">> = {}): Compile.Input<"hashed"> => ({
  entrypoints: ["main.ts"],
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
describeUnix("Bun compileExecutable", () => {
  it("authenticates the exact tool and atomically publishes a hashed native artifact", async () => {
    const log = join(root, "compile.log");
    process.env.FAKE_BUN_LOG = log;
    try {
      const exit = await run(Compile.compileExecutable(input("hashed", {
        options: {
          minify: { syntax: true, keepNames: true },
          sourcemap: "inline",
          bytecode: true,
          execArgv: ["--smol"],
          autoloadDotenv: false,
        },
      })));
      expect(Exit.isSuccess(exit)).toBe(true);
      if (Exit.isSuccess(exit)) {
        expect(exit.value).toMatchObject({
          _tag: "HashedExecutable",
          provider: "bun",
          target: systemTarget(),
          bunTarget: hostTarget(),
          publication: { commit: "same-parent-rename", committed: true },
          runtime: { name: "bun", version: "1.3.14" },
          runtimeAcquisition: {
            _tag: "ProviderManagedCrossTargetRuntime",
            evidenceGate: "cold-warm-offline-and-runtime-identity-open",
          },
        });
        expect(exit.value.digest.value).toMatch(/^[0-9a-f]{64}$/u);
        expect(exit.value.tool.participants[0].content.digest.value).toMatch(/^[0-9a-f]{64}$/u);
      }
      const invocations = (await readFile(log, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
      expect(invocations).toHaveLength(1);
      expect(invocations[0].argv).toEqual(expect.arrayContaining([
        "build",
        "--compile",
        `--target=${hostTarget()}`,
        "--minify-syntax",
        "--keep-names",
        "--sourcemap=inline",
        "--bytecode",
        "--compile-exec-argv=--smol",
        "--no-compile-autoload-dotenv",
        "main.ts",
      ]));
    } finally {
      delete process.env.FAKE_BUN_LOG;
    }
  });

  it("returns an ordered, independently committed matrix report with typed failure cells", async () => {
    const reportExit = await run(Compile.compileExecutableMatrix({
      concurrency: 2,
      inputs: [
        input("matrix-success"),
        input("matrix-invalid", { outfile: "bad\0path" }),
      ],
    }));
    expect(Exit.isSuccess(reportExit)).toBe(true);
    if (Exit.isSuccess(reportExit)) {
      expect(reportExit.value).toMatchObject({ provider: "bun", operation: "compileExecutable", rollback: "none" });
      expect(reportExit.value.cells.map((cell) => [cell.identity.index, cell._tag])).toEqual([
        [0, "Success"],
        [1, "Failure"],
      ]);
      expect(reportExit.value.cells[1]).toMatchObject({ error: { _tag: "BunCommandInputInvalid" } });
    }
  });

  it("preserves typed diagnostics while removing the private candidate", async () => {
    process.env.FAKE_BUN_MODE = "fail";
    try {
      const failure = errorOf(await run(Compile.compileExecutable(input("failed")))) as Runtime.BunCommandFailed;
      expect(failure).toMatchObject({
        _tag: "BunCommandFailed",
        operation: "compileExecutable",
        publication: "none",
        exitCode: 17,
      });
      expect(new TextDecoder().decode(failure.stdout)).toBe("fake stdout diagnostic");
      expect(await absent(join(root, "failed"))).toBe(true);
      expect(await noStaging()).toBe(true);
    } finally {
      delete process.env.FAKE_BUN_MODE;
    }
  });

  it("preserves interruption Cause, terminates the child, and cleans private staging", async () => {
    const started = join(root, "started");
    process.env.FAKE_BUN_MODE = "delay";
    process.env.FAKE_BUN_STARTED = started;
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
      delete process.env.FAKE_BUN_MODE;
      delete process.env.FAKE_BUN_STARTED;
    }
  });
});
