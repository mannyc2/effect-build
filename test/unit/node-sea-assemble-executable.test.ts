import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber, Layer, PlatformError, Sink, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as AssembleExecutable from "../../packages/effect-build-node-sea/src/AssembleExecutable.js";
import * as Target from "../../packages/effect-build/src/Target.js";
import { hostTarget } from "../host-target.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const makeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "effect-build-node-sea-"));
  roots.push(root);
  return root;
};

const hostBinary = (): Uint8Array => {
  const format = Target.info(hostTarget()).nativeFormat;
  const bytes = new Uint8Array(8);
  if (format === "elf") bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1], 0);
  else if (format === "pe") bytes.set([0x4d, 0x5a], 0);
  else bytes.set([0xcf, 0xfa, 0xed, 0xfe], 0);
  return bytes;
};

interface Invocation {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string | undefined;
}

interface Control {
  readonly invocations: readonly Invocation[];
  readonly configs: readonly Record<string, unknown>[];
  readonly builds: () => number;
  readonly interrupted: () => boolean;
  readonly started: () => Promise<void>;
}

interface FakeNodeOptions {
  readonly mode?:
    | "success"
    | "build-failure"
    | "build-spawn-failure"
    | "syntax-failure"
    | "missing-output"
    | "invalid-output"
    | "delay";
  readonly version?: string;
}

const makeSpawner = (
  options: FakeNodeOptions = {},
): readonly [ChildProcessSpawner.ChildProcessSpawner["Service"], Control] => {
  const invocations: Invocation[] = [];
  const configs: Record<string, unknown>[] = [];
  let buildCount = 0;
  let wasInterrupted = false;
  let signalStarted: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  const handle = (stdout: string, stderr: string, exitCode: number, delayed = false) =>
    ChildProcessSpawner.makeHandle({
      pid: ChildProcessSpawner.ProcessId(43043),
      stdin: Sink.drain,
      stdout: Stream.fromIterable([new TextEncoder().encode(stdout)]),
      stderr: Stream.fromIterable([new TextEncoder().encode(stderr)]),
      all: Stream.fromIterable([new TextEncoder().encode(`${stdout}${stderr}`)]),
      exitCode: delayed ? Effect.never : Effect.succeed(ChildProcessSpawner.ExitCode(exitCode)),
      isRunning: Effect.succeed(delayed),
      kill: () =>
        Effect.sync(() => {
          wasInterrupted = true;
        }),
      getInputFd: () => Sink.drain,
      getOutputFd: () => Stream.empty,
      unref: Effect.succeed(Effect.void),
    });
  const service = ChildProcessSpawner.make((command) => {
    if (
      ChildProcess.isStandardCommand(command)
      && command.args[0] === "--build-sea"
      && options.mode === "build-spawn-failure"
    ) {
      return Effect.fail(PlatformError.systemError({
        _tag: "Unknown",
        module: "test",
        method: "spawn",
        description: "fake-build-spawn-failure",
      }));
    }
    let delayedHandle = false;
    return Effect.sync(() => {
      if (!ChildProcess.isStandardCommand(command)) throw new Error("expected a standard node command");
      invocations.push({ command: command.command, args: command.args, cwd: command.options.cwd });
      const [first] = command.args;
      if (first === "--version") {
        return handle(`v${options.version ?? "26.7.0"}\n`, "", 0);
      }
      if (first === "--check") {
        return options.mode === "syntax-failure"
          ? handle("syntax stdout", "syntax stderr", 7)
          : handle("", "", 0);
      }
      if (first !== "--build-sea") throw new Error(`unexpected node argv ${command.args.join(" ")}`);
      buildCount += 1;
      if (options.mode === "delay") {
        signalStarted();
        delayedHandle = true;
        return handle("", "", 0, true);
      }
      const config = JSON.parse(readFileSync(command.args[1]!, "utf8")) as Record<string, unknown>;
      configs.push(config);
      if (options.mode === "build-failure") return handle("build stdout", "build stderr", 19);
      if (options.mode !== "missing-output") {
        const output = String(config.output);
        writeFileSync(output, options.mode === "invalid-output" ? "not-an-executable" : hostBinary());
        chmodSync(output, options.mode === "invalid-output" ? 0o644 : 0o755);
      }
      return handle("", "", 0);
    }).pipe(
      Effect.flatMap((child) =>
        delayedHandle
          ? Effect.acquireRelease(Effect.succeed(child), () => Effect.ignore(child.kill()))
          : Effect.succeed(child)
      ),
    );
  });
  return [service, {
    invocations,
    configs,
    builds: () => buildCount,
    interrupted: () => wasInterrupted,
    started: () => started,
  }];
};

interface Harness {
  readonly root: string;
  readonly node: string;
  readonly control: Control;
  readonly run: <A, E>(
    effect: Effect.Effect<A, E, AssembleExecutable.Assembler>,
  ) => Promise<Exit.Exit<A, E | { readonly _tag: string }>>;
}

const makeHarness = (options: { readonly fake?: FakeNodeOptions } = {}): Harness => {
  const root = makeRoot();
  const node = join(root, "node");
  writeFileSync(node, hostBinary());
  chmodSync(node, 0o755);
  const [spawner, control] = makeSpawner(options.fake);
  const provider = AssembleExecutable.layer({ builderExecutable: node });
  const provided = Layer.provide(
    provider,
    Layer.merge(NodeServices.layer, Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner)),
  );
  const run = <A, E>(effect: Effect.Effect<A, E, AssembleExecutable.Assembler>) =>
    Effect.runPromiseExit(effect.pipe(Effect.provide(provided)));
  return { root, node, control, run };
};

const failure = <A, E>(exit: Exit.Exit<A, E>): E => {
  if (!Exit.isFailure(exit)) throw new Error("expected a typed failure");
  const found = Cause.findErrorOption(exit.cause);
  if (found._tag === "None") throw new Error("expected a typed failure in the Cause");
  return found.value;
};

describe("Node SEA AssembleExecutable", () => {
  it("assembles file and bytes mains with assets through --check and --build-sea", async () => {
    const harness = makeHarness();
    const fileMain = join(harness.root, "main.cjs");
    const assetPath = join(harness.root, "message.txt");
    writeFileSync(fileMain, "require('node:fs'); console.log('cjs');\n");
    writeFileSync(assetPath, "asset\n");
    const fileExit = await harness.run(AssembleExecutable.assembleExecutable({
      main: { _tag: "File", path: fileMain, format: "commonjs" },
      outfile: join(harness.root, "file-app"),
      target: hostTarget(),
      assets: { message: assetPath },
      disableExperimentalSEAWarning: true,
    }));
    expect(Exit.isSuccess(fileExit)).toBe(true);
    if (Exit.isSuccess(fileExit)) {
      expect(fileExit.value._tag).toBe("Executable");
      expect(fileExit.value.tool).toMatchObject({ name: "node", version: "26.7.0" });
      expect(fileExit.value.target).toBe(hostTarget());
      expect(fileExit.value.sha256).toHaveLength(64);
    }
    const config = harness.control.configs[0]!;
    expect(config.executable).toBe(realpathSync(harness.node));
    expect(config.main).toBe(fileMain);
    expect((config.assets as Record<string, string>).message).toBe(assetPath);
    expect(config.mainFormat).toBe("commonjs");
    expect(config.useSnapshot).toBe(false);
    expect(config.useCodeCache).toBe(false);
    expect(config.disableExperimentalSEAWarning).toBe(true);
    const build = harness.control.invocations.find(({ args }) => args[0] === "--build-sea");
    expect(build).toBeDefined();
    expect(build!.args).toHaveLength(2);
    expect(isAbsolute(build!.args[1]!)).toBe(true);
    expect(config.output).not.toBe(join(harness.root, "file-app"));
    expect(isAbsolute(String(config.output))).toBe(true);
    expect(dirname(String(config.output))).not.toBe(harness.root);

    const bytesExit = await harness.run(AssembleExecutable.assembleExecutable({
      main: {
        _tag: "Bytes",
        contents: new TextEncoder().encode("import 'node:fs'; console.log('esm');\n"),
        format: "module",
      },
      outfile: join(harness.root, "bytes-app"),
      target: hostTarget(),
    }));
    expect(Exit.isSuccess(bytesExit)).toBe(true);
    if (Exit.isSuccess(bytesExit)) expect(bytesExit.value.sha256).toHaveLength(64);
    const bytesConfig = harness.control.configs[1]!;
    expect(String(bytesConfig.main).endsWith("main.mjs")).toBe(true);
    expect(bytesConfig.mainFormat).toBe("module");
    expect(harness.control.builds()).toBe(2);
  });

  it("proceeds with a warning for untested node versions", async () => {
    const harness = makeHarness({ fake: { version: "27.1.0" } });
    const exit = await harness.run(AssembleExecutable.assembleExecutable({
      main: { _tag: "Bytes", contents: new TextEncoder().encode("console.log('x')"), format: "commonjs" },
      outfile: join(harness.root, "untested-app"),
      target: hostTarget(),
    }));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) expect(exit.value.tool.version).toBe("27.1.0");
  });

  it("maps syntax, spawn, build, and candidate failures while preserving atomic replacement", async () => {
    const input = (root: string, name: string) =>
      ({
        main: {
          _tag: "Bytes" as const,
          contents: new TextEncoder().encode("console.log('x')"),
          format: "commonjs" as const,
        },
        outfile: join(root, name),
        target: hostTarget(),
      }) satisfies AssembleExecutable.AssembleExecutableInput;

    const syntax = makeHarness({ fake: { mode: "syntax-failure" } });
    expect(failure(await syntax.run(AssembleExecutable.assembleExecutable(input(syntax.root, "syntax")))))
      .toMatchObject({ _tag: "ToolFailed", exitCode: 7, stdout: "syntax stdout", stderr: "syntax stderr" });
    expect(syntax.control.builds()).toBe(0);

    const spawn = makeHarness({ fake: { mode: "build-spawn-failure" } });
    expect(failure(await spawn.run(AssembleExecutable.assembleExecutable(input(spawn.root, "spawn")))))
      .toMatchObject({ _tag: "ToolFailed", exitCode: -1 });

    const build = makeHarness({ fake: { mode: "build-failure" } });
    expect(failure(await build.run(AssembleExecutable.assembleExecutable(input(build.root, "build")))))
      .toMatchObject({ _tag: "ToolFailed", exitCode: 19, stdout: "build stdout", stderr: "build stderr" });

    const missing = makeHarness({ fake: { mode: "missing-output" } });
    const missingFailure = failure(
      await missing.run(AssembleExecutable.assembleExecutable(input(missing.root, "missing"))),
    ) as { readonly _tag: string; readonly reason: string };
    expect(missingFailure._tag).toBe("PublishFailed");
    expect(missingFailure.reason).toContain("did not produce");

    const invalid = makeHarness({ fake: { mode: "invalid-output" } });
    expect(failure(await invalid.run(AssembleExecutable.assembleExecutable(input(invalid.root, "invalid")))))
      .toMatchObject({ _tag: "PublishFailed" });

    // The committed path gains the host's executable suffix on windows.
    const suffix = process.platform === "win32" ? ".exe" : "";
    const preserved = makeHarness({ fake: { mode: "invalid-output" } });
    const preservedDestination = join(preserved.root, "preserved") + suffix;
    writeFileSync(preservedDestination, "old-public-artifact");
    expect(failure(await preserved.run(AssembleExecutable.assembleExecutable(input(preserved.root, "preserved")))))
      .toMatchObject({ _tag: "PublishFailed" });
    expect(readFileSync(preservedDestination, "utf8")).toBe("old-public-artifact");

    const replacement = makeHarness();
    const destination = join(replacement.root, "replacement") + suffix;
    writeFileSync(destination, "old-public-artifact");
    const replaced = await replacement.run(
      AssembleExecutable.assembleExecutable(input(replacement.root, "replacement")),
    );
    expect(Exit.isSuccess(replaced)).toBe(true);
    expect(readFileSync(destination, "utf8")).not.toBe("old-public-artifact");
    for (
      const root of [syntax.root, spawn.root, build.root, missing.root, invalid.root, preserved.root, replacement.root]
    ) {
      expect(readdirSync(root).some((entry) => entry.startsWith(".effect-build-"))).toBe(false);
    }
  });

  it("preserves interruption Cause, kills the child, and removes the private candidate", async () => {
    const root = makeRoot();
    const node = join(root, "node");
    writeFileSync(node, hostBinary());
    chmodSync(node, 0o755);
    const [spawner, control] = makeSpawner({ mode: "delay" });
    const provider = AssembleExecutable.layer({ builderExecutable: node });
    const provided = Layer.provide(
      provider,
      Layer.merge(NodeServices.layer, Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner)),
    );
    const outfile = join(root, "interrupted", "app");
    const outer = await Effect.runPromiseExit(
      Effect.scoped(Effect.gen(function*() {
        const context = yield* Layer.build(provided);
        const fiber = yield* Effect.forkChild(
          AssembleExecutable.assembleExecutable({
            main: { _tag: "Bytes", contents: new TextEncoder().encode("console.log('x')"), format: "commonjs" },
            outfile,
            target: hostTarget(),
          }).pipe(Effect.provide(context)),
        );
        yield* Effect.promise(control.started);
        yield* Fiber.interrupt(fiber);
        return yield* Fiber.await(fiber);
      })),
    );
    expect(Exit.isSuccess(outer)).toBe(true);
    if (Exit.isSuccess(outer)) {
      expect(Exit.isFailure(outer.value)).toBe(true);
      if (Exit.isFailure(outer.value)) expect(Cause.hasInterrupts(outer.value.cause)).toBe(true);
    }
    expect(control.interrupted()).toBe(true);
    expect(existsSync(outfile)).toBe(false);
    expect(readdirSync(join(root, "interrupted")).some((entry) => entry.startsWith(".effect-build-"))).toBe(false);
  });
});
