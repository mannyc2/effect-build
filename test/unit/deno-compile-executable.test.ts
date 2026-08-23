import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber } from "effect";
import { chmod, copyFile, mkdir, mkdtemp, readdir, readFile, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as DenoCompile from "../../packages/effect-build-deno/src/CompileExecutable.js";
import * as Target from "../../packages/effect-build/src/Target.js";

const fixture = resolve(fileURLToPath(new URL("../fixtures/tools/fake-deno.mjs", import.meta.url)));
let root = "";
let executable = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-deno-"));
  executable = join(root, "deno");
  await copyFile(fixture, executable);
  await chmod(executable, 0o755);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const run = <A, E>(effect: Effect.Effect<A, E, DenoCompile.Compiler>) =>
  Effect.runPromiseExit(
    effect.pipe(
      Effect.provide(DenoCompile.layer({ executable })),
      Effect.provide(NodeServices.layer),
    ) as Effect.Effect<A, E>,
  );

const failureOf = <A, E>(exit: Exit.Exit<A, E>): E => {
  expect(Exit.isFailure(exit)).toBe(true);
  const found = Exit.isFailure(exit) ? Cause.findErrorOption(exit.cause) : undefined;
  expect(found?._tag).toBe("Some");
  return (found as { readonly value: E }).value;
};

const input = (name: string, overrides: Partial<DenoCompile.CompileExecutableInput> = {}) =>
  ({
    entrypoint: "main.ts",
    outfile: join(root, name),
    ...overrides,
  }) as DenoCompile.CompileExecutableInput;

const absent = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return false;
  } catch (error) {
    return (error as { readonly code?: string }).code === "ENOENT";
  }
};

const waitForFile = async (path: string): Promise<void> => {
  const deadline = Date.now() + 5_000;
  while (await absent(path)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${path}`);
    await new Promise((resolveTick) => setTimeout(resolveTick, 10));
  }
};

const describeUnix = process.platform === "win32" ? describe.skip : describe.sequential;
describeUnix("Deno CompileExecutable", () => {
  it("parses the deno version banner and records it on the artifact", async () => {
    const exit = await run(DenoCompile.compileExecutable(input("hashed")));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value._tag).toBe("Executable");
      expect(exit.value.tool).toEqual({ name: "deno", version: "2.9.3" });
      expect(exit.value.target).toBe(Target.host());
      expect(exit.value.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("compiles every supported target with rust triples and .exe for windows", async () => {
    const log = join(root, "targets.log");
    process.env.FAKE_DENO_LOG = log;
    try {
      for (const target of DenoCompile.Target.literals) {
        const exit = await run(DenoCompile.compileExecutable(input(`target-${target}`, { target })));
        expect(Exit.isSuccess(exit), target).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.target).toBe(target);
          if (target.startsWith("windows")) expect(exit.value.path.endsWith(".exe")).toBe(true);
        }
      }
      const lines = (await readFile(log, "utf8")).trim().split("\n");
      const triples = lines.map((line) => {
        const { argv } = JSON.parse(line) as { readonly argv: readonly string[] };
        return argv[argv.indexOf("--target") + 1];
      });
      expect(triples).toEqual([
        "x86_64-apple-darwin",
        "aarch64-apple-darwin",
        "x86_64-unknown-linux-gnu",
        "aarch64-unknown-linux-gnu",
        "x86_64-pc-windows-msvc",
        "aarch64-pc-windows-msvc",
      ]);
    } finally {
      delete process.env.FAKE_DENO_LOG;
    }
  });

  it("renders bundle, minify, and permission flags in the closed deno argv", async () => {
    const project = join(root, "project");
    const log = join(root, "argv.log");
    await mkdir(project, { recursive: true });
    process.env.FAKE_DENO_LOG = log;
    try {
      const exit = await run(
        DenoCompile.compileExecutable(input("flags", {
          cwd: project,
          outfile: "dist/app",
          bundle: true,
          minify: true,
          permissions: { read: true, net: ["example.com:443"], env: ["HOME"] },
        })),
      );
      expect(Exit.isSuccess(exit)).toBe(true);
      const invocation = JSON.parse((await readFile(log, "utf8")).trim()) as {
        readonly argv: readonly string[];
        readonly cwd: string;
      };
      expect(invocation.cwd).toBe(await realpath(project));
      expect(invocation.argv[0]).toBe("compile");
      expect(invocation.argv).toContain("--bundle");
      expect(invocation.argv).toContain("--minify");
      expect(invocation.argv).toContain("--allow-read");
      expect(invocation.argv).toContain("--allow-net=example.com:443");
      expect(invocation.argv).toContain("--allow-env=HOME");
      expect(invocation.argv.at(-1)).toBe("main.ts");
      expect(invocation.argv.indexOf("--output")).toBeGreaterThan(-1);
    } finally {
      delete process.env.FAKE_DENO_LOG;
    }
  });

  it("renders --allow-all alone for full permissions", async () => {
    const log = join(root, "allow-all.log");
    process.env.FAKE_DENO_LOG = log;
    try {
      const exit = await run(
        DenoCompile.compileExecutable(input("allow-all", { permissions: { all: true } })),
      );
      expect(Exit.isSuccess(exit)).toBe(true);
      const { argv } = JSON.parse((await readFile(log, "utf8")).trim()) as { readonly argv: readonly string[] };
      expect(argv).toContain("--allow-all");
      expect(argv.some((value) => value.startsWith("--allow-") && value !== "--allow-all")).toBe(false);
    } finally {
      delete process.env.FAKE_DENO_LOG;
    }
  });

  it("proceeds with a warning for untested deno versions", async () => {
    process.env.FAKE_DENO_VERSION = "9.0.0";
    try {
      const exit = await run(DenoCompile.compileExecutable(input("untested")));
      expect(Exit.isSuccess(exit)).toBe(true);
      if (Exit.isSuccess(exit)) expect(exit.value.tool.version).toBe("9.0.0");
    } finally {
      delete process.env.FAKE_DENO_VERSION;
    }
  });

  it("rejects targets deno does not support before spawning", async () => {
    const exit = await run(
      DenoCompile.compileExecutable(input("unsupported", { target: "linux-x64-musl" as DenoCompile.Target })),
    );
    const failure = failureOf(exit) as { readonly _tag: string; readonly requested: string };
    expect(failure._tag).toBe("UnsupportedTarget");
    expect(failure.requested).toBe("linux-x64-musl");
  });

  it("surfaces deno diagnostics on failure and cleans staging", async () => {
    process.env.FAKE_DENO_MODE = "fail";
    try {
      const exit = await run(DenoCompile.compileExecutable(input("failed")));
      const failure = failureOf(exit) as {
        readonly _tag: string;
        readonly exitCode: number;
        readonly stderr: string;
      };
      expect(failure._tag).toBe("ToolFailed");
      expect(failure.exitCode).toBe(17);
      expect(failure.stderr).toBe("fake stderr diagnostic");
      expect(await absent(join(root, "failed"))).toBe(true);
      expect((await readdir(root)).some((name) => name.startsWith(".effect-build-"))).toBe(false);
    } finally {
      delete process.env.FAKE_DENO_MODE;
    }
  });

  it("preserves interruption Cause, terminates the child, and removes private staging", async () => {
    const started = join(root, "started");
    process.env.FAKE_DENO_MODE = "delay";
    process.env.FAKE_DENO_STARTED = started;
    try {
      const program = Effect.gen(function*() {
        const fiber = yield* Effect.forkChild(DenoCompile.compileExecutable(input("interrupted")));
        yield* Effect.promise(() => waitForFile(started));
        yield* Fiber.interrupt(fiber);
        return yield* Fiber.await(fiber);
      }).pipe(
        Effect.provide(DenoCompile.layer({ executable })),
        Effect.provide(NodeServices.layer),
      );
      const outer = await Effect.runPromiseExit(program);
      expect(Exit.isSuccess(outer)).toBe(true);
      if (Exit.isSuccess(outer)) {
        expect(Exit.isFailure(outer.value)).toBe(true);
        if (Exit.isFailure(outer.value)) expect(Cause.hasInterrupts(outer.value.cause)).toBe(true);
      }
      expect(await absent(join(root, "interrupted"))).toBe(true);
      expect((await readdir(root)).some((name) => name.startsWith(".effect-build-"))).toBe(false);
    } finally {
      delete process.env.FAKE_DENO_MODE;
      delete process.env.FAKE_DENO_STARTED;
    }
  });
});
