import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber } from "effect";
import {
  appendFile,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as BunCompile from "../../packages/effect-build-bun/src/CompileExecutable.js";
import type { AbsolutePath } from "../../packages/effect-build/src/Artifact.js";

const fixture = resolve(new URL("../fixtures/v04/fake-bun.mjs", import.meta.url).pathname);
let root = "";
let executable = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-v04-bun-"));
  executable = join(root, "bun");
  await copyFile(fixture, executable);
  await chmod(executable, 0o755);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const layer = (allowUntestedVersion = false) =>
  BunCompile.layer({ executable: executable as AbsolutePath, allowUntestedVersion });

const run = <A, E>(effect: Effect.Effect<A, E, BunCompile.Compiler>, allowUntestedVersion = false) =>
  Effect.runPromiseExit(
    effect.pipe(
      Effect.provide(layer(allowUntestedVersion)),
      Effect.provide(NodeServices.layer),
    ) as Effect.Effect<A, E>,
  );

const failureOf = <A, E>(exit: Exit.Exit<A, E>): E => {
  expect(Exit.isFailure(exit)).toBe(true);
  const found = Exit.isFailure(exit) ? Cause.findErrorOption(exit.cause) : undefined;
  expect(found?._tag).toBe("Some");
  return (found as { readonly value: E }).value;
};

const input = (name: string, overrides: Partial<BunCompile.CompileExecutableInput<"hashed">> = {}) => ({
  entrypoint: "main.ts",
  outfile: join(root, name),
  observation: "hashed" as const,
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

const waitForFile = async (path: string): Promise<void> => {
  const deadline = Date.now() + 5_000;
  while (await absent(path)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${path}`);
    await new Promise((resolveTick) => setTimeout(resolveTick, 10));
  }
};

describe.sequential("staged 0.4 Bun CompileExecutable", () => {
  it("turns invalid runtime Layer options into an acquisition failure", async () => {
    const exit = await Effect.runPromiseExit(
      BunCompile.compileExecutable(input("invalid-layer-options")).pipe(
        Effect.provide(BunCompile.layer({ executable: 42 } as unknown as BunCompile.LayerOptions)),
        Effect.provide(NodeServices.layer),
      ),
    );
    expect((failureOf(exit) as { readonly _tag: string })._tag).toBe("ToolProbeFailed");
    expect(await absent(join(root, "invalid-layer-options"))).toBe(true);
  });

  it("refuses the exact observed coordinate with SupportUnknown before output mutation", async () => {
    const outfile = join(root, "support-unknown");
    const exit = await run(BunCompile.compileExecutable(input("support-unknown")));
    const failure = failureOf(exit) as BunCompile.CompileExecutableError;
    expect(failure._tag).toBe("SupportUnknown");
    if (failure._tag === "SupportUnknown") {
      expect(failure.overrideAvailable).toBe(true);
      expect(failure.admissionKey).toContain('"builder"');
      expect(failure.admissionKey).toContain('"target-runtime"');
      expect(failure.operation.operation).toBe("compile-executable");
    }
    expect(await absent(outfile)).toBe(true);
  });

  it("blocks denied hosts and missing capabilities even when the untested-version override is enabled", async () => {
    process.env.FAKE_BUN_DISTRIBUTION = "unknown";
    try {
      const denied = await run(BunCompile.compileExecutable(input("denied-host")), true);
      expect((failureOf(denied) as BunCompile.CompileExecutableError)._tag).toBe("KnownDenyHole");
      expect(await absent(join(root, "denied-host"))).toBe(true);
    } finally {
      delete process.env.FAKE_BUN_DISTRIBUTION;
    }
    process.env.FAKE_BUN_CAPABILITY = "missing";
    try {
      const missing = await run(BunCompile.compileExecutable(input("missing-capability")), true);
      expect((failureOf(missing) as BunCompile.CompileExecutableError)._tag).toBe("CapabilityMissing");
      expect(await absent(join(root, "missing-capability"))).toBe(true);
    } finally {
      delete process.env.FAKE_BUN_CAPABILITY;
    }
  });

  it("keeps unreviewed versions at SupportUnknown without the explicit override", async () => {
    process.env.FAKE_BUN_VERSION = "9.9.9";
    try {
      const exit = await run(BunCompile.compileExecutable(input("unreviewed-version")));
      expect((failureOf(exit) as BunCompile.CompileExecutableError)._tag).toBe("SupportUnknown");
      expect(await absent(join(root, "unreviewed-version"))).toBe(true);
    } finally {
      delete process.env.FAKE_BUN_VERSION;
    }
  });

  it("publishes hashed and unhashed artifacts through same-parent rename", async () => {
    const hashed = await run(BunCompile.compileExecutable(input("hashed")), true);
    expect(Exit.isSuccess(hashed)).toBe(true);
    if (Exit.isSuccess(hashed)) {
      expect(hashed.value).toMatchObject({
        _tag: "HashedExecutable",
        provider: "bun",
        nativeFormat: "elf",
        target: "linux-x64-gnu",
        runtime: { name: "bun", version: "1.3.9" },
        publication: { commit: "same-parent-rename", committed: true },
      });
      expect(hashed.value.digest.value).toMatch(/^[0-9a-f]{64}$/);
      expect(BigInt(hashed.value.bytes)).toBeGreaterThan(0n);
    }
    const unhashed = await run(
      BunCompile.compileExecutable({ ...input("unhashed"), observation: "unhashed" }),
      true,
    );
    expect(Exit.isSuccess(unhashed)).toBe(true);
    if (Exit.isSuccess(unhashed)) {
      expect(unhashed.value._tag).toBe("UnhashedExecutable");
      expect("digest" in unhashed.value).toBe(false);
    }
  });

  it("maps and independently inspects the exact six-target table", async () => {
    const targets = BunCompile.Target.literals;
    for (const target of targets) {
      const exit = await run(BunCompile.compileExecutable(input(`target-${target}`, { target })), true);
      expect(Exit.isSuccess(exit), target).toBe(true);
      if (Exit.isSuccess(exit)) {
        expect(exit.value.target).toBe(target);
        expect(exit.value.nativeFormat).toBe(
          target.startsWith("macos") ? "mach-o" : target.startsWith("windows") ? "pe" : "elf",
        );
      }
    }
  });

  it("preserves cwd, environment, project defaults, and the closed Bun argv", async () => {
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
          options: { minify: true, sourcemap: "linked", bytecode: true },
        })),
        true,
      );
      expect(Exit.isSuccess(exit)).toBe(true);
      const invocation = JSON.parse((await readFile(log, "utf8")).trim()) as {
        readonly argv: readonly string[];
        readonly cwd: string;
        readonly marker: string;
      };
      expect(invocation.cwd).toBe(await realpath(project));
      expect(invocation.marker).toBe("preserved");
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

  it("rejects closed-input violations and unsupported targets before spawning Bun", async () => {
    const log = join(root, "invalid.log");
    process.env.FAKE_BUN_LOG = log;
    try {
      const invalid = await run(
        BunCompile.compileExecutable({
          ...input("invalid-input"),
          options: { splitting: true },
        } as unknown as BunCompile.CompileExecutableInput<"hashed">),
        true,
      );
      expect((failureOf(invalid) as BunCompile.CompileExecutableError)._tag).toBe("InvalidDriverOptions");
      const unsupported = await run(
        BunCompile.compileExecutable({
          ...input("unsupported"),
          target: "linux-aarch64-musl",
        } as unknown as BunCompile.CompileExecutableInput<"hashed">),
        true,
      );
      const targetFailure = failureOf(unsupported) as BunCompile.CompileExecutableError;
      expect(targetFailure._tag).toBe("TargetUnsupported");
      expect(await absent(log)).toBe(true);
    } finally {
      delete process.env.FAKE_BUN_LOG;
    }
  });

  it("preserves bounded stdout and stderr diagnostics on provider failure", async () => {
    process.env.FAKE_BUN_MODE = "fail";
    try {
      const exit = await run(BunCompile.compileExecutable(input("failed")), true);
      const failure = failureOf(exit) as BunCompile.CompileExecutableError;
      expect(failure._tag).toBe("ToolFailed");
      if (failure._tag === "ToolFailed") {
        expect(failure.exitCode).toBe(17);
        expect(failure.diagnostics).toEqual([
          { channel: "stdout", text: "fake stdout diagnostic", truncated: false },
          { channel: "stderr", text: "fake stderr diagnostic", truncated: false },
        ]);
      }
      expect(await absent(join(root, "failed"))).toBe(true);
    } finally {
      delete process.env.FAKE_BUN_MODE;
    }
  });

  it("classifies missing and malformed candidates at the authoring boundary", async () => {
    process.env.FAKE_BUN_MODE = "missing";
    const missing = await run(BunCompile.compileExecutable(input("missing")), true);
    expect((failureOf(missing) as BunCompile.CompileExecutableError)._tag).toBe("ExecutableCandidateMissing");
    process.env.FAKE_BUN_MODE = "invalid";
    const invalid = await run(BunCompile.compileExecutable(input("malformed")), true);
    const failure = failureOf(invalid) as BunCompile.CompileExecutableError;
    expect(failure._tag).toBe("ExecutableInspectionFailed");
    delete process.env.FAKE_BUN_MODE;
    expect((await readdir(root)).some((name) => name.startsWith(".effect-build-"))).toBe(false);
  });

  it("reauthenticates all selected-command content at launch", async () => {
    const program = Effect.gen(function*() {
      yield* Effect.promise(() => appendFile(executable, "\n// same selected path, changed content\n"));
      return yield* BunCompile.compileExecutable(input("replacement"));
    }).pipe(
      Effect.provide(layer(true)),
      Effect.provide(NodeServices.layer),
    );
    const exit = await Effect.runPromiseExit(program);
    expect((failureOf(exit) as BunCompile.CompileExecutableError)._tag).toBe("SelectedCommandChanged");
    await copyFile(fixture, executable);
    await chmod(executable, 0o755);
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
        Effect.provide(layer(true)),
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
      delete process.env.FAKE_BUN_MODE;
      delete process.env.FAKE_BUN_STARTED;
    }
  });
});
