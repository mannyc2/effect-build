import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber, Layer, PlatformError, Sink, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import {
  appendFileSync,
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
import type { AbsolutePath } from "../../packages/effect-build/src/Artifact.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const makeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "effect-build-v04-node-sea-"));
  roots.push(root);
  return root;
};

const elfX64Gnu = (): Uint8Array => {
  const interpreter = new TextEncoder().encode("/lib64/ld-linux-x86-64.so.2\0");
  const bytes = new Uint8Array(120 + interpreter.byteLength);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1], 0);
  const view = new DataView(bytes.buffer);
  view.setUint16(18, 62, true);
  view.setBigUint64(32, 64n, true);
  view.setUint16(54, 56, true);
  view.setUint16(56, 1, true);
  view.setUint32(64, 3, true);
  view.setBigUint64(72, 120n, true);
  view.setBigUint64(96, BigInt(interpreter.byteLength), true);
  bytes.set(interpreter, 120);
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
  readonly os?: "linux" | "macos" | "windows";
  readonly architecture?: "x64" | "aarch64";
  readonly distribution?: "ubuntu-24.04" | "not-applicable" | "unknown";
  readonly capability?: "present" | "missing" | "indeterminate";
  readonly buildSea?: "present" | "missing" | "indeterminate";
  readonly lief?: "present" | "missing" | "indeterminate";
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
      if (!ChildProcess.isStandardCommand(command)) throw new Error("expected a standard selected-node command");
      const invocation: Invocation = {
        command: command.command,
        args: command.args,
        cwd: command.options.cwd,
      };
      invocations.push(invocation);
      const [first] = command.args;
      if (first === "--input-type=module") {
        return handle(
          JSON.stringify({
            path: command.command,
            version: options.version ?? "26.7.0",
            revision: "fake-node-v8",
            os: options.os ?? "linux",
            architecture: options.architecture ?? "x64",
            distribution: options.distribution ?? "ubuntu-24.04",
            buildSea: options.buildSea ?? "present",
            lief: options.lief ?? "present",
            builtinSpecifiers: ["fs", "node:fs", "node:path", "path"],
          }),
          "",
          0,
        );
      }
      if (first === "--help") {
        if (options.capability === "missing") return handle("  --version\n", "", 0);
        if (options.capability === "indeterminate") return handle("", "help failed", 1);
        return handle("  --build-sea config\n", "", 0);
      }
      if (first === "--check") {
        return options.mode === "syntax-failure"
          ? handle("syntax stdout", "syntax stderr", 7)
          : handle("", "", 0);
      }
      if (first !== "--build-sea") throw new Error(`unexpected selected-node argv ${command.args.join(" ")}`);
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
        writeFileSync(output, options.mode === "invalid-output" ? "not-an-executable" : elfX64Gnu());
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

const makeHarness = (options: {
  readonly allowUntestedVersion?: boolean;
  readonly baseDifferent?: boolean;
  readonly fake?: FakeNodeOptions;
} = {}): Harness => {
  const root = makeRoot();
  const node = join(root, "node");
  writeFileSync(node, elfX64Gnu());
  chmodSync(node, 0o755);
  const base = join(root, "base-node");
  if (options.baseDifferent === true) {
    writeFileSync(base, new Uint8Array([...elfX64Gnu(), 1]));
    chmodSync(base, 0o755);
  }
  const [spawner, control] = makeSpawner(options.fake);
  const provider = AssembleExecutable.layer({
    builderExecutable: node as AbsolutePath,
    ...(options.baseDifferent === true ? { baseExecutable: base as AbsolutePath } : {}),
    ...(options.allowUntestedVersion === true ? { allowUntestedVersion: true } : {}),
  });
  const provided = Layer.provide(
    provider,
    Layer.merge(NodeServices.layer, Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner)),
  );
  const run = <A, E>(effect: Effect.Effect<A, E, AssembleExecutable.Assembler>) =>
    Effect.runPromiseExit(
      effect.pipe(Effect.provide(provided)),
    );
  return { root, node, control, run };
};

const failure = <A, E>(exit: Exit.Exit<A, E>): E => {
  if (!Exit.isFailure(exit)) throw new Error("expected a typed failure");
  const found = Cause.findErrorOption(exit.cause);
  if (found._tag === "None") throw new Error("expected a typed failure in the Cause");
  return found.value;
};

describe("staged 0.4 Node SEA AssembleExecutable", () => {
  it("defaults to fail-closed and assembles authenticated file/bytes CJS/ESM inputs with private assets", async () => {
    const rejected = makeHarness();
    const source = join(rejected.root, "main.cjs");
    const asset = join(rejected.root, "message.txt");
    writeFileSync(source, "require('node:fs'); console.log('cjs');\n");
    writeFileSync(asset, "asset\n");
    const defaultExit = await rejected.run(AssembleExecutable.assembleExecutable({
      main: { _tag: "File", path: source, format: "commonjs" },
      outfile: join(rejected.root, "default-app"),
      observation: "unhashed",
    }));
    expect((failure(defaultExit) as AssembleExecutable.AssembleExecutableError)._tag).toBe("SupportUnknown");
    expect(rejected.control.builds()).toBe(0);

    const harness = makeHarness({ allowUntestedVersion: true });
    const fileMain = join(harness.root, "main.cjs");
    const assetPath = join(harness.root, "message.txt");
    writeFileSync(fileMain, "require('node:fs'); console.log('cjs');\n");
    writeFileSync(assetPath, "asset\n");
    const fileExit = await harness.run(AssembleExecutable.assembleExecutable({
      main: { _tag: "File", path: fileMain, format: "commonjs" },
      outfile: join(harness.root, "file-app"),
      observation: "hashed",
      assets: [{ key: "message", path: assetPath }],
      disableExperimentalSEAWarning: true,
    }));
    expect(Exit.isSuccess(fileExit)).toBe(true);
    if (Exit.isSuccess(fileExit)) {
      expect(fileExit.value).toMatchObject({
        _tag: "HashedExecutable",
        provider: "node-sea",
        runtime: { name: "node", version: "26.7.0" },
        target: "linux-x64-gnu",
        nativeFormat: "elf",
        publication: { commit: "same-parent-rename", committed: true },
      });
      expect(fileExit.value.digest.value).toHaveLength(64);
    }
    const config = harness.control.configs[0]!;
    expect(config.executable).toBe(realpathSync(harness.node));
    expect(config.main).not.toBe(fileMain);
    expect((config.assets as Record<string, string>).message).not.toBe(assetPath);
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
    expect(dirname(String(config.output))).not.toBe(dirname(join(harness.root, "file-app")));
    expect(String(config.output)).toContain(`${join(harness.root, ".effect-build-")}`);

    const bytesExit = await harness.run(AssembleExecutable.assembleExecutable({
      main: {
        _tag: "Bytes",
        contents: new TextEncoder().encode("import 'node:fs'; console.log('esm');\n"),
        format: "module",
        sourceName: "main.mjs",
      },
      outfile: join(harness.root, "bytes-app"),
      observation: "unhashed",
    }));
    expect(Exit.isSuccess(bytesExit)).toBe(true);
    expect(harness.control.builds()).toBe(2);
  });

  it("rejects non-builtin and native-addon imports before candidate production and enforces builder/base equality", async () => {
    const harness = makeHarness({ allowUntestedVersion: true });
    const external = await harness.run(AssembleExecutable.assembleExecutable({
      main: { _tag: "Bytes", contents: new TextEncoder().encode("import 'left-pad';"), format: "module" },
      outfile: join(harness.root, "external-app"),
      observation: "unhashed",
    }));
    expect(failure(external)).toMatchObject({
      _tag: "InvalidNodeSeaInput",
      reason: "external-import-not-builtin:left-pad",
    });
    const addon = await harness.run(AssembleExecutable.assembleExecutable({
      main: { _tag: "Bytes", contents: new TextEncoder().encode("require('./native.node');"), format: "commonjs" },
      outfile: join(harness.root, "addon-app"),
      observation: "unhashed",
    }));
    expect(failure(addon)).toMatchObject({
      _tag: "InvalidNodeSeaInput",
      reason: "native-addon-not-admissible:./native.node",
    });
    expect(harness.control.builds()).toBe(0);

    const mismatch = makeHarness({ allowUntestedVersion: true, baseDifferent: true });
    const relation = await mismatch.run(AssembleExecutable.assembleExecutable({
      main: { _tag: "Bytes", contents: new TextEncoder().encode("console.log('x')"), format: "commonjs" },
      outfile: join(mismatch.root, "relation-app"),
      observation: "unhashed",
    }));
    expect(failure(relation)).toMatchObject({ _tag: "RelationUnsatisfied", relation: "node-builder-base" });
    expect(mismatch.control.builds()).toBe(0);
  });

  it("refuses missing capabilities and every non-admitted host or Node coordinate before output mutation", async () => {
    const input = (root: string) => ({
      main: {
        _tag: "Bytes" as const,
        contents: new TextEncoder().encode("console.log('x')"),
        format: "commonjs" as const,
      },
      outfile: join(root, "unsupported", "app"),
      observation: "unhashed" as const,
    });

    const missingCapability = makeHarness({ allowUntestedVersion: true, fake: { capability: "missing" } });
    expect(failure(await missingCapability.run(AssembleExecutable.assembleExecutable(input(missingCapability.root)))))
      .toMatchObject({
        _tag: "CapabilityMissing",
        capability: "build-sea",
      });
    expect(existsSync(join(missingCapability.root, "unsupported"))).toBe(false);
    expect(missingCapability.control.builds()).toBe(0);

    const disabledSea = makeHarness({ allowUntestedVersion: true, fake: { buildSea: "missing" } });
    expect(failure(await disabledSea.run(AssembleExecutable.assembleExecutable(input(disabledSea.root)))))
      .toMatchObject({
        _tag: "CapabilityMissing",
        capability: "build-sea",
      });
    expect(existsSync(join(disabledSea.root, "unsupported"))).toBe(false);
    expect(disabledSea.control.builds()).toBe(0);

    const missingLief = makeHarness({ allowUntestedVersion: true, fake: { lief: "missing" } });
    expect(failure(await missingLief.run(AssembleExecutable.assembleExecutable(input(missingLief.root)))))
      .toMatchObject({
        _tag: "CapabilityMissing",
        capability: "lief",
      });
    expect(existsSync(join(missingLief.root, "unsupported"))).toBe(false);
    expect(missingLief.control.builds()).toBe(0);

    const indeterminateLief = makeHarness({ allowUntestedVersion: true, fake: { lief: "indeterminate" } });
    expect(failure(await indeterminateLief.run(AssembleExecutable.assembleExecutable(input(indeterminateLief.root)))))
      .toMatchObject({
        _tag: "CapabilityIndeterminate",
        capability: "lief",
      });
    expect(existsSync(join(indeterminateLief.root, "unsupported"))).toBe(false);
    expect(indeterminateLief.control.builds()).toBe(0);

    const deniedHost = makeHarness({
      allowUntestedVersion: true,
      fake: { os: "macos", architecture: "x64", distribution: "not-applicable" },
    });
    expect(failure(await deniedHost.run(AssembleExecutable.assembleExecutable(input(deniedHost.root))))).toMatchObject({
      _tag: "KnownDenyHole",
      holeId: "provider-host:not-linux-x64-gnu-on-ubuntu-24.04",
    });
    expect(existsSync(join(deniedHost.root, "unsupported"))).toBe(false);
    expect(deniedHost.control.builds()).toBe(0);

    const deniedVersion = makeHarness({ allowUntestedVersion: true, fake: { version: "26.8.0" } });
    expect(failure(await deniedVersion.run(AssembleExecutable.assembleExecutable(input(deniedVersion.root)))))
      .toMatchObject({
        _tag: "KnownDenyHole",
        holeId: "node-version:not-26.7.0",
      });
    expect(existsSync(join(deniedVersion.root, "unsupported"))).toBe(false);
    expect(deniedVersion.control.builds()).toBe(0);
  });

  it("maps syntax, spawn, build, and candidate failures while preserving atomic replacement", async () => {
    const input = (root: string, name: string) => ({
      main: {
        _tag: "Bytes" as const,
        contents: new TextEncoder().encode("console.log('x')"),
        format: "commonjs" as const,
      },
      outfile: join(root, name),
      observation: "unhashed" as const,
    });

    const syntax = makeHarness({ allowUntestedVersion: true, fake: { mode: "syntax-failure" } });
    expect(failure(await syntax.run(AssembleExecutable.assembleExecutable(input(syntax.root, "syntax")))))
      .toMatchObject({
        _tag: "NodeSeaSyntaxCheckFailed",
        exitCode: 7,
        diagnostics: [
          { channel: "stdout", text: "syntax stdout", truncated: false },
          { channel: "stderr", text: "syntax stderr", truncated: false },
        ],
      });
    expect(syntax.control.builds()).toBe(0);

    const spawn = makeHarness({ allowUntestedVersion: true, fake: { mode: "build-spawn-failure" } });
    expect(failure(await spawn.run(AssembleExecutable.assembleExecutable(input(spawn.root, "spawn"))))).toMatchObject({
      _tag: "NodeSeaSpawnFailed",
      reason: "selected-command-launch-failed-after-reauthentication",
    });

    const build = makeHarness({ allowUntestedVersion: true, fake: { mode: "build-failure" } });
    expect(failure(await build.run(AssembleExecutable.assembleExecutable(input(build.root, "build"))))).toMatchObject({
      _tag: "NodeSeaFailed",
      exitCode: 19,
    });

    const missing = makeHarness({ allowUntestedVersion: true, fake: { mode: "missing-output" } });
    expect(failure(await missing.run(AssembleExecutable.assembleExecutable(input(missing.root, "missing")))))
      .toMatchObject({
        _tag: "ExecutableCandidateMissing",
      });

    const invalid = makeHarness({ allowUntestedVersion: true, fake: { mode: "invalid-output" } });
    expect(failure(await invalid.run(AssembleExecutable.assembleExecutable(input(invalid.root, "invalid")))))
      .toMatchObject({
        _tag: "ExecutableInspectionFailed",
      });

    const preserved = makeHarness({ allowUntestedVersion: true, fake: { mode: "invalid-output" } });
    const preservedDestination = join(preserved.root, "preserved");
    writeFileSync(preservedDestination, "old-public-artifact");
    expect(failure(
      await preserved.run(AssembleExecutable.assembleExecutable({
        ...input(preserved.root, "preserved"),
        observation: "hashed",
      })),
    )).toMatchObject({ _tag: "ExecutableInspectionFailed" });
    expect(readFileSync(preservedDestination, "utf8")).toBe("old-public-artifact");
    expect(preserved.control.configs[0]!.output).not.toBe(preservedDestination);

    const replacement = makeHarness({ allowUntestedVersion: true });
    const destination = join(replacement.root, "replacement");
    writeFileSync(destination, "old-public-artifact");
    const replaced = await replacement.run(AssembleExecutable.assembleExecutable({
      ...input(replacement.root, "replacement"),
      observation: "hashed",
    }));
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
    writeFileSync(node, elfX64Gnu());
    chmodSync(node, 0o755);
    const [spawner, control] = makeSpawner({ mode: "delay" });
    const provider = AssembleExecutable.layer({ builderExecutable: node as AbsolutePath, allowUntestedVersion: true });
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
            observation: "unhashed",
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

  it("preserves selected-command identity and typed provider diagnostics", async () => {
    const failed = makeHarness({ allowUntestedVersion: true, fake: { mode: "build-failure" } });
    const failedExit = await failed.run(AssembleExecutable.assembleExecutable({
      main: { _tag: "Bytes", contents: new TextEncoder().encode("console.log('x')"), format: "commonjs" },
      outfile: join(failed.root, "failed-app"),
      observation: "unhashed",
    }));
    expect(failure(failedExit)).toMatchObject({
      _tag: "NodeSeaFailed",
      exitCode: 19,
      diagnostics: [
        { channel: "stdout", text: "build stdout", truncated: false },
        { channel: "stderr", text: "build stderr", truncated: false },
      ],
    });

    const root = makeRoot();
    const node = join(root, "node");
    writeFileSync(node, elfX64Gnu());
    chmodSync(node, 0o755);
    const [spawner] = makeSpawner();
    const provider = AssembleExecutable.layer({ builderExecutable: node as AbsolutePath, allowUntestedVersion: true });
    const provided = Layer.provide(
      provider,
      Layer.merge(NodeServices.layer, Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner)),
    );
    const existing = join(root, "existing-public-artifact");
    writeFileSync(existing, "old-public-artifact");
    const identityExit = await Effect.runPromiseExit(
      Effect.scoped(Effect.gen(function*() {
        const context = yield* Layer.build(provided);
        yield* Effect.sync(() => appendFileSync(node, "changed"));
        return yield* AssembleExecutable.assembleExecutable({
          main: { _tag: "Bytes", contents: new TextEncoder().encode("console.log('x')"), format: "commonjs" },
          outfile: existing,
          observation: "unhashed",
        }).pipe(Effect.provide(context));
      })),
    );
    expect(failure(identityExit)).toMatchObject({ _tag: "SelectedCommandChanged", selectedRole: "builder" });
    expect(readFileSync(existing, "utf8")).toBe("old-public-artifact");
    expect(readdirSync(root).some((entry) => entry.startsWith(".effect-build-"))).toBe(false);
  });
});
