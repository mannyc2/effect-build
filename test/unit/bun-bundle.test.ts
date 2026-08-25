import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber } from "effect";
import type * as Artifact from "effect-build/Artifact";
import { chmod, copyFile, mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as ApiBuild from "../../packages/effect-build-bun/src/Api/Build.js";
import * as ApiTranspiler from "../../packages/effect-build-bun/src/Api/Transpiler.js";
import * as Build from "../../packages/effect-build-bun/src/Command/Build.js";
import * as Watch from "../../packages/effect-build-bun/src/Command/Watch.js";
import * as Runtime from "../../packages/effect-build-bun/src/internal/Runtime.js";

const fixture = resolve(fileURLToPath(new URL("../fixtures/tools/fake-bun.mjs", import.meta.url)));
let root = "";
let executable = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-bun-command-"));
  executable = join(root, "bun");
  await copyFile(fixture, executable);
  await chmod(executable, 0o755);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const run = <A, E>(effect: Effect.Effect<A, E, Runtime.Runtime>) =>
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
const waitForFile = async (path: string): Promise<void> => {
  const deadline = Date.now() + 5_000;
  while (await absent(path)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${path}`);
    await new Promise((resolveTick) => setTimeout(resolveTick, 10));
  }
};

const describeUnix = process.platform === "win32" ? describe.skip : describe.sequential;
describeUnix("Bun command build candidates", () => {
  it("keeps stdout caller-owned and preserves native command/config authority", async () => {
    const log = join(root, "stdout.log");
    process.env.FAKE_BUN_LOG = log;
    try {
      const exit = await run(Build.build({
        entrypoint: "src/main.ts",
        cwd: await realpath(root),
        target: "bun",
        format: "esm",
        minify: { syntax: true, keepNames: true },
        conditions: ["development"],
        define: { __TEST__: "true" },
      }));
      expect(Exit.isSuccess(exit)).toBe(true);
      if (Exit.isSuccess(exit)) {
        expect(new TextDecoder().decode(exit.value.output)).toContain("bundled src/main.ts");
        expect(exit.value.completion.stdout.truncated).toBe(false);
        expect(exit.value.tool.participants[0]).toMatchObject({ name: "bun", version: "1.3.14" });
      }
      const invocations = (await readFile(log, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
      expect(invocations).toHaveLength(1);
      expect(invocations[0]).toMatchObject({
        cwd: await realpath(root),
        argv: expect.arrayContaining([
          "build",
          "--target=bun",
          "--format=esm",
          "--minify-syntax",
          "--keep-names",
          "--conditions=development",
        ]),
      });
      expect(invocations[0].argv).not.toContain("--outfile");
      expect(invocations[0].argv).not.toContain("--outdir");
    } finally {
      delete process.env.FAKE_BUN_LOG;
    }
  });

  it("reports provider-direct directory ownership and partial-write failure semantics", async () => {
    const outdir = join(root, "direct");
    const success = await run(Build.buildToDirectory({ entrypoints: ["src/main.ts"], outdir }));
    expect(Exit.isSuccess(success)).toBe(true);
    if (Exit.isSuccess(success)) {
      expect(success.value).toMatchObject({
        _tag: "BuildToDirectoryResult",
        outdir,
        publication: "provider-direct-durable",
      });
    }

    process.env.FAKE_BUN_MODE = "fail";
    try {
      const failure = errorOf(
        await run(Build.buildToDirectory({
          entrypoints: ["src/main.ts"],
          outdir: join(root, "failed-direct"),
        })),
      ) as Runtime.BunCommandFailed;
      expect(failure).toMatchObject({
        _tag: "BunCommandFailed",
        operation: "buildDirect",
        publication: "provider-direct-durable",
        exitCode: 17,
      });
      expect(new TextDecoder().decode(failure.stderr)).toBe("fake stderr diagnostic");
    } finally {
      delete process.env.FAKE_BUN_MODE;
    }
  });

  it("refuses a non-pinned Bun after observation without fallback or retry", async () => {
    const log = join(root, "refusal.log");
    process.env.FAKE_BUN_LOG = log;
    process.env.FAKE_BUN_VERSION = "1.3.13";
    try {
      const failure = errorOf(await run(Build.build({ entrypoint: "src/main.ts" }))) as Runtime.BunCommandUnsupported;
      expect(failure).toMatchObject({ _tag: "BunCommandUnsupported", version: "1.3.13" });
      await expect(readFile(log, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      delete process.env.FAKE_BUN_LOG;
      delete process.env.FAKE_BUN_VERSION;
    }
  });

  it("keeps watch as an opaque scoped child and preserves interruption Cause", async () => {
    const started = join(root, "watch-started");
    const log = join(root, "watch.log");
    process.env.FAKE_BUN_MODE = "delay";
    process.env.FAKE_BUN_STARTED = started;
    process.env.FAKE_BUN_LOG = log;
    try {
      const outer = await Effect.runPromiseExit(
        Effect.gen(function*() {
          const fiber = yield* Effect.forkChild(
            Effect.scoped(
              Watch.watch({
                entrypoints: ["src/main.ts"],
                outdir: join(root, "watch-dist"),
                noClearScreen: true,
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
      expect(invocation.argv).toEqual(expect.arrayContaining(["build", "--watch", "--no-clear-screen"]));
    } finally {
      delete process.env.FAKE_BUN_MODE;
      delete process.env.FAKE_BUN_STARTED;
      delete process.env.FAKE_BUN_LOG;
    }
  });

  it("truthfully rejects host API layers when global Bun is absent", async () => {
    expect(typeof ApiTranspiler.transform).toBe("function");
    expect(typeof ApiTranspiler.transformSync).toBe("function");
    expect(typeof ApiTranspiler.scan).toBe("function");
    expect(typeof ApiTranspiler.scanImports).toBe("function");
    expect(Reflect.has(globalThis, "Bun")).toBe(false);
    const buildFailure = errorOf(
      await Effect.runPromiseExit(
        ApiBuild.build({ entrypoints: ["src/main.ts"] }).pipe(Effect.provide(ApiBuild.layer)),
      ),
    ) as ApiBuild.BunApiUnavailable;
    expect(buildFailure).toMatchObject({ _tag: "BunApiUnavailable", expectedVersion: "1.3.14" });
    const transpilerFailure = errorOf(
      await Effect.runPromiseExit(
        ApiTranspiler.make().pipe(Effect.provide(ApiTranspiler.layer)),
      ),
    ) as ApiTranspiler.BunApiUnavailable;
    expect(transpilerFailure.capability).toBe("Bun.Transpiler");
  });
});
