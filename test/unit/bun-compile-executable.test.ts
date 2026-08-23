import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber } from "effect";
import { chmod, copyFile, mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as BunCompile from "../../packages/effect-build-bun/src/CompileExecutable.js";
import * as Target from "../../packages/effect-build/src/Target.js";

const fixture = resolve(new URL("../fixtures/tools/fake-bun.mjs", import.meta.url).pathname);
let root = "";
let executable = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-bun-"));
  executable = join(root, "bun");
  await copyFile(fixture, executable);
  await chmod(executable, 0o755);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const run = <A, E>(effect: Effect.Effect<A, E, BunCompile.Compiler>, layerOptions?: BunCompile.LayerOptions) =>
  Effect.runPromiseExit(
    effect.pipe(
      Effect.provide(BunCompile.layer(layerOptions ?? { executable })),
      Effect.provide(NodeServices.layer),
    ) as Effect.Effect<A, E>,
  );

const failureOf = <A, E>(exit: Exit.Exit<A, E>): E => {
  expect(Exit.isFailure(exit)).toBe(true);
  const found = Exit.isFailure(exit) ? Cause.findErrorOption(exit.cause) : undefined;
  expect(found?._tag).toBe("Some");
  return (found as { readonly value: E }).value;
};

const input = (name: string, overrides: Partial<BunCompile.CompileExecutableInput> = {}) => ({
  entrypoint: "main.ts",
  outfile: join(root, name),
  ...overrides,
});

const absent = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return false;
  } catch (error) {
    return (error as { readonly code?: string }).code === "ENOENT";
  }
};

const noStagingLeftovers = async (): Promise<boolean> =>
  !(await readdir(root)).some((name) => name.startsWith(".effect-build-"));

const waitForFile = async (path: string): Promise<void> => {
  const deadline = Date.now() + 5_000;
  while (await absent(path)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${path}`);
    await new Promise((resolveTick) => setTimeout(resolveTick, 10));
  }
};

const describeUnix = process.platform === "win32" ? describe.skip : describe.sequential;
describeUnix("Bun CompileExecutable", () => {
  it("fails layer construction with ToolNotFound for a missing explicit executable", async () => {
    const exit = await run(
      BunCompile.compileExecutable(input("missing-tool")),
      { executable: join(root, "not-a-bun") },
    );
    const failure = failureOf(exit) as { readonly _tag: string; readonly tool: string };
    expect(failure._tag).toBe("ToolNotFound");
    expect(failure.tool).toBe("bun");
    expect(await absent(join(root, "missing-tool"))).toBe(true);
  });

  it("compiles for the host by default and records a hashed artifact", async () => {
    const exit = await run(BunCompile.compileExecutable(input("hashed")));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value._tag).toBe("Executable");
      expect(exit.value.target).toBe(Target.host());
      expect(exit.value.tool).toEqual({ name: "bun", version: "1.3.14" });
      expect(exit.value.path).toBe(join(root, "hashed"));
      expect(exit.value.bytes).toBeGreaterThan(0);
      expect(exit.value.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("omits the digest when hashing is disabled", async () => {
    const exit = await run(BunCompile.compileExecutable(input("unhashed", { hash: false })));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect("sha256" in exit.value).toBe(false);
      expect(exit.value.bytes).toBeGreaterThan(0);
    }
  });

  it("compiles every supported target and appends .exe for windows outputs", async () => {
    for (const target of BunCompile.Target.literals) {
      const exit = await run(BunCompile.compileExecutable(input(`target-${target}`, { target })));
      expect(Exit.isSuccess(exit), target).toBe(true);
      if (Exit.isSuccess(exit)) {
        expect(exit.value.target).toBe(target);
        if (target === "windows-x64") expect(exit.value.path.endsWith(".exe")).toBe(true);
        else expect(exit.value.path).toBe(join(root, `target-${target}`));
      }
    }
  });

  it("proceeds with a warning instead of refusing untested bun versions", async () => {
    process.env.FAKE_BUN_VERSION = "9.9.9";
    try {
      const exit = await run(BunCompile.compileExecutable(input("untested-version")));
      expect(Exit.isSuccess(exit)).toBe(true);
      if (Exit.isSuccess(exit)) expect(exit.value.tool.version).toBe("9.9.9");
    } finally {
      delete process.env.FAKE_BUN_VERSION;
    }
  });

  it("preserves cwd, environment, and the closed bun argv", async () => {
    const project = join(root, "project");
    const log = join(root, "project.log");
    await mkdir(project);
    await writeFile(join(project, "bunfig.toml"), "[build]\nminify = false\n");
    process.env.FAKE_BUN_LOG = log;
    process.env.FAKE_PROJECT_MARKER = "preserved";
    try {
      const exit = await run(
        BunCompile.compileExecutable(input("ignored", {
          cwd: project,
          outfile: "dist/app",
          minify: true,
          sourcemap: "linked",
          bytecode: true,
        })),
      );
      expect(Exit.isSuccess(exit)).toBe(true);
      if (Exit.isSuccess(exit)) expect(exit.value.path).toBe(join(project, "dist/app"));
      const invocation = JSON.parse((await readFile(log, "utf8")).trim()) as {
        readonly argv: readonly string[];
        readonly cwd: string;
        readonly marker: string;
      };
      expect(invocation.cwd).toBe(await realpath(project));
      expect(invocation.marker).toBe("preserved");
      expect(invocation.argv.slice(0, 2)).toEqual(["build", "--compile"]);
      expect(invocation.argv).toContain("--minify");
      expect(invocation.argv).toContain("--sourcemap=linked");
      expect(invocation.argv).toContain("--bytecode");
      expect(invocation.argv.some((value) => value.startsWith("--target="))).toBe(false);
      expect(invocation.argv.at(-1)).toBe("main.ts");
    } finally {
      delete process.env.FAKE_BUN_LOG;
      delete process.env.FAKE_PROJECT_MARKER;
    }
  });

  it("rejects targets bun does not support before spawning", async () => {
    const log = join(root, "unsupported.log");
    process.env.FAKE_BUN_LOG = log;
    try {
      const exit = await run(
        BunCompile.compileExecutable(
          input("unsupported", { target: "linux-aarch64-musl" as unknown as BunCompile.Target }),
        ),
      );
      const failure = failureOf(exit) as { readonly _tag: string; readonly requested: string };
      expect(failure._tag).toBe("UnsupportedTarget");
      expect(failure.requested).toBe("linux-aarch64-musl");
      expect(await absent(log)).toBe(true);
    } finally {
      delete process.env.FAKE_BUN_LOG;
    }
  });

  it("surfaces bounded stdout and stderr when bun fails", async () => {
    process.env.FAKE_BUN_MODE = "fail";
    try {
      const exit = await run(BunCompile.compileExecutable(input("failed")));
      const failure = failureOf(exit) as {
        readonly _tag: string;
        readonly exitCode: number;
        readonly stdout: string;
        readonly stderr: string;
      };
      expect(failure._tag).toBe("ToolFailed");
      expect(failure.exitCode).toBe(17);
      expect(failure.stdout).toBe("fake stdout diagnostic");
      expect(failure.stderr).toBe("fake stderr diagnostic");
      expect(await absent(join(root, "failed"))).toBe(true);
    } finally {
      delete process.env.FAKE_BUN_MODE;
    }
  });

  it("fails publication when bun produces no output or a non-executable", async () => {
    process.env.FAKE_BUN_MODE = "missing";
    const missing = await run(BunCompile.compileExecutable(input("missing")));
    const missingFailure = failureOf(missing) as { readonly _tag: string; readonly reason: string };
    expect(missingFailure._tag).toBe("PublishFailed");
    expect(missingFailure.reason).toContain("did not produce");
    process.env.FAKE_BUN_MODE = "invalid";
    const invalid = await run(BunCompile.compileExecutable(input("malformed")));
    const invalidFailure = failureOf(invalid) as { readonly _tag: string; readonly reason: string };
    expect(invalidFailure._tag).toBe("PublishFailed");
    delete process.env.FAKE_BUN_MODE;
    expect(await absent(join(root, "malformed"))).toBe(true);
    expect(await noStagingLeftovers()).toBe(true);
  });

  it("preserves interruption Cause, terminates the child, and removes private staging", async () => {
    const started = join(root, "started");
    process.env.FAKE_BUN_MODE = "delay";
    process.env.FAKE_BUN_STARTED = started;
    try {
      const program = Effect.gen(function*() {
        const fiber = yield* Effect.forkChild(BunCompile.compileExecutable(input("interrupted")));
        yield* Effect.promise(() => waitForFile(started));
        yield* Fiber.interrupt(fiber);
        return yield* Fiber.await(fiber);
      }).pipe(
        Effect.provide(BunCompile.layer({ executable })),
        Effect.provide(NodeServices.layer),
      );
      const outer = await Effect.runPromiseExit(program);
      expect(Exit.isSuccess(outer)).toBe(true);
      if (Exit.isSuccess(outer)) {
        expect(Exit.isFailure(outer.value)).toBe(true);
        if (Exit.isFailure(outer.value)) expect(Cause.hasInterrupts(outer.value.cause)).toBe(true);
      }
      expect(await absent(join(root, "interrupted"))).toBe(true);
      expect(await noStagingLeftovers()).toBe(true);
    } finally {
      delete process.env.FAKE_BUN_MODE;
      delete process.env.FAKE_BUN_STARTED;
    }
  });
});
