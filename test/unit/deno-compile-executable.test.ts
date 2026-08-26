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
let denort = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-deno-compile-"));
  executable = join(root, "deno");
  denort = join(root, "denort");
  await copyFile(fixture, executable);
  await copyFile(fixture, denort);
  await chmod(executable, 0o755);
  await chmod(denort, 0o755);
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

const permissionFields = [
  "allowRead",
  "allowWrite",
  "allowNet",
  "allowEnv",
  "allowRun",
  "allowFfi",
  "allowSys",
  "allowImport",
  "denyRead",
  "denyWrite",
  "denyNet",
  "denyEnv",
  "denyRun",
  "denyFfi",
  "denySys",
  "denyImport",
  "ignoreRead",
  "ignoreEnv",
  "allowScripts",
] as const satisfies readonly (keyof Compile.Options)[];

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
        ...permissionFields.map((field, index) =>
          input(
            `matrix-invalid-${index}`,
            { [field]: [] } as unknown as Partial<Compile.Input<"hashed">>,
          )
        ),
      ],
    }));
    expect(Exit.isSuccess(reportExit)).toBe(true);
    if (Exit.isSuccess(reportExit)) {
      expect(reportExit.value).toMatchObject({ provider: "deno", operation: "compileExecutable", rollback: "none" });
      expect(reportExit.value.cells.map((cell) => [cell.identity.index, cell._tag])).toEqual([
        [0, "Success"],
        ...permissionFields.map((_, index) => [index + 1, "Failure"]),
      ]);
      for (const [index, field] of permissionFields.entries()) {
        expect(reportExit.value.cells[index + 1]).toMatchObject({
          error: {
            _tag: "DenoCommandInputInvalid",
            reason: `${field} must be true or a non-empty list`,
          },
        });
      }
    }
  });

  it("rejects every present empty compile-watch permission list", async () => {
    for (const [index, field] of permissionFields.entries()) {
      const failure = errorOf(
        await run(Effect.scoped(CompileWatch.watch({
          entrypoint: "main.ts",
          outfile: join(root, `invalid-watch-permission-${index}`),
          [field]: [],
        } as never))),
      ) as Runtime.DenoCommandInputInvalid;
      expect(failure).toMatchObject({
        _tag: "DenoCommandInputInvalid",
        operation: "compileWatch",
        reason: `${field} must be true or a non-empty list`,
      });
    }
  });

  it("reserves DENORT_BIN for authenticated layer selection", async () => {
    const inheritedLog = join(root, "inherited-denort.log");
    const previousDenort = process.env.DENORT_BIN;
    process.env.DENORT_BIN = join(root, "unauthenticated-denort");
    process.env.FAKE_DENO_LOG = inheritedLog;
    try {
      const inherited = await run(Compile.compileExecutable(input("inherited-denort")));
      expect(Exit.isSuccess(inherited)).toBe(true);
      const inheritedInvocation = JSON.parse((await readFile(inheritedLog, "utf8")).trim());
      expect(inheritedInvocation).not.toHaveProperty("denort");

      const injected = errorOf(
        await run(Compile.compileExecutable(input("injected-denort", {
          environment: { values: { DENORT_BIN: denort } },
        }))),
      ) as Runtime.DenoCommandInputInvalid;
      expect(injected).toMatchObject({
        _tag: "DenoCommandInputInvalid",
        operation: "compileExecutable",
        reason: "environment.values.DENORT_BIN is reserved for authenticated layer selection",
      });
      expect(await absent(join(root, "injected-denort"))).toBe(true);
    } finally {
      if (previousDenort === undefined) delete process.env.DENORT_BIN;
      else process.env.DENORT_BIN = previousDenort;
      delete process.env.FAKE_DENO_LOG;
    }

    const selectedLog = join(root, "selected-denort.log");
    process.env.FAKE_DENO_LOG = selectedLog;
    try {
      const selected = await Effect.runPromiseExit(
        Effect.gen(function*() {
          const runtime = yield* Runtime.Runtime;
          const compile = yield* runtime.run(
            "compileExecutable",
            "none",
            ["compile", "--output", join(root, "selected-denort-output"), "main.ts"],
          );
          const watchOutput = join(root, "selected-denort-watch-output");
          yield* Effect.scoped(
            runtime.watch(
              "compileWatch",
              ["compile", "--watch", "--output", watchOutput, "main.ts"],
            ).pipe(Effect.andThen(Effect.promise(() => waitForFile(watchOutput)))),
          );
          const bundle = yield* runtime.run(
            "bundleDirect",
            "provider-direct-durable",
            ["bundle", "--output", join(root, "selected-denort-bundle-output.js"), "main.ts"],
          );
          return { compile, bundle };
        }).pipe(
          Effect.provide(Runtime.layer({
            executable: executable as Artifact.AbsolutePath,
            denort: denort as Artifact.AbsolutePath,
          })),
          Effect.provide(NodeServices.layer),
        ),
      );
      expect(Exit.isSuccess(selected)).toBe(true);
      const selectedInvocations = (await readFile(selectedLog, "utf8")).trim().split("\n").map((line) =>
        JSON.parse(line)
      );
      expect(selectedInvocations).toHaveLength(3);
      expect(selectedInvocations[0].denort).toBe(denort);
      expect(selectedInvocations[1].denort).toBe(denort);
      expect(selectedInvocations[2]).not.toHaveProperty("denort");
    } finally {
      delete process.env.FAKE_DENO_LOG;
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
