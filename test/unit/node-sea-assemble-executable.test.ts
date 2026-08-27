import { NodeServices } from "@effect/platform-node";
import { Cause, Crypto, Effect, Exit, Fiber, FileSystem, Layer, Path, PlatformError, Sink, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as Assemble from "../../packages/effect-build-node-sea/src/Command/AssembleExecutable.js";
import * as Command from "../../packages/effect-build-node-sea/src/Command/index.js";
import * as AssembleModes from "../../packages/effect-build-node-sea/src/internal/AssembleModes.js";
import { Runtime } from "../../packages/effect-build-node-sea/src/internal/Runtime.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const makeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "effect-build-node-sea-"));
  roots.push(root);
  return root;
};

const elfX64 = (): Uint8Array => {
  const bytes = new Uint8Array(64);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1], 0);
  bytes[18] = 62;
  bytes[19] = 0;
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
    | "syntax-failure"
    | "build-failure"
    | "spawn-failure"
    | "missing-output"
    | "invalid-output"
    | "delay";
  readonly version?: string;
  readonly baseVersion?: string;
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
      kill: () => Effect.sync(() => void (wasInterrupted = true)),
      getInputFd: () => Sink.drain,
      getOutputFd: () => Stream.empty,
      unref: Effect.succeed(Effect.void),
    });
  const service = ChildProcessSpawner.make((command) => {
    if (
      ChildProcess.isStandardCommand(command)
      && command.args[0] === "--build-sea"
      && options.mode === "spawn-failure"
    ) {
      return Effect.fail(PlatformError.systemError({
        _tag: "Unknown",
        module: "test",
        method: "spawn",
        description: "fake spawn failure",
      }));
    }
    let delayed = false;
    return Effect.sync(() => {
      if (!ChildProcess.isStandardCommand(command)) throw new Error("expected standard command");
      invocations.push({ command: command.command, args: command.args, cwd: command.options.cwd });
      const first = command.args[0];
      if (first === "--version") {
        const isBase = command.command.includes("base-node");
        return handle(
          `v${isBase ? options.baseVersion ?? options.version ?? "26.7.0" : options.version ?? "26.7.0"}\n`,
          "",
          0,
        );
      }
      if (first === "--help") return handle("Usage: node --build-sea CONFIG\n", "", 0);
      if (first === "-p") return handle('{"platform":"linux","arch":"x64","glibc":true}\n', "", 0);
      if (first === "--check") {
        return options.mode === "syntax-failure" ? handle("syntax-out", "syntax-error", 7) : handle("", "", 0);
      }
      if (first !== "--build-sea") throw new Error(`unexpected argv ${command.args.join(" ")}`);
      buildCount += 1;
      if (options.mode === "delay") {
        signalStarted();
        delayed = true;
        return handle("", "", 0, true);
      }
      const config = JSON.parse(readFileSync(command.args[1]!, "utf8")) as Record<string, unknown>;
      configs.push(config);
      if (options.mode === "build-failure") return handle("build-out", "build-error", 19);
      if (options.mode !== "missing-output") {
        writeFileSync(String(config.output), options.mode === "invalid-output" ? "bad" : elfX64());
      }
      return handle("", "", 0);
    }).pipe(
      Effect.flatMap((child) =>
        delayed
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

const makeHarness = (
  options: FakeNodeOptions & { readonly explicitBase?: boolean; readonly allowUntestedVersion?: boolean } = {},
) => {
  const root = makeRoot();
  const node = join(root, "node");
  const base = join(root, "base-node");
  writeFileSync(node, elfX64());
  writeFileSync(base, elfX64());
  chmodSync(node, 0o755);
  chmodSync(base, 0o755);
  const [spawner, control] = makeSpawner(options);
  const provider = Command.layer({
    builderExecutable: node as never,
    ...(options.explicitBase ? { baseExecutable: base as never } : {}),
    ...(options.allowUntestedVersion ? { allowUntestedVersion: true } : {}),
  });
  const platform = Layer.merge(NodeServices.layer, Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner));
  const runtime = Layer.provide(provider, platform);
  const provided = Layer.merge(runtime, platform);
  const run = <A, E>(
    effect: Effect.Effect<A, E, Runtime | Crypto.Crypto | FileSystem.FileSystem | Path.Path>,
  ) => Effect.runPromiseExit(effect.pipe(Effect.provide(provided)));
  return { root, node, base, control, provider, provided, run };
};

const failure = <A, E>(exit: Exit.Exit<A, E>): E => {
  if (!Exit.isFailure(exit)) throw new Error("expected failure");
  const found = Cause.findErrorOption(exit.cause);
  if (found._tag === "None") throw new Error("expected typed error");
  return found.value;
};

const input = (root: string, name: string, observation: "hashed" | "unhashed" = "hashed") => ({
  main: {
    _tag: "Bytes" as const,
    contents: new TextEncoder().encode("console.log('ok')"),
    format: "commonjs" as const,
  },
  outfile: join(root, name),
  observation,
});

describe("Node SEA Command.AssembleExecutable", () => {
  it("preflights, privately snapshots main/assets, and atomically commits hashed or unhashed ELF", async () => {
    const harness = makeHarness({ explicitBase: true });
    const main = join(harness.root, "main.mjs");
    const asset = join(harness.root, "asset.txt");
    writeFileSync(main, "console.log('esm')\n");
    writeFileSync(asset, "asset\n");
    const first = await harness.run(Assemble.assembleDirect({
      main: { _tag: "File", path: main, format: "module" },
      outfile: join(harness.root, "app"),
      observation: "hashed",
      assets: [{ key: "message", path: asset }],
      disableExperimentalSEAWarning: true,
    }));
    expect(Exit.isSuccess(first)).toBe(true);
    if (Exit.isSuccess(first)) {
      expect(first.value).toMatchObject({
        _tag: "HashedExecutable",
        nativeFormat: "elf",
        runtime: { name: "node", version: "26.7.0" },
        target: "linux-x64-gnu",
        publication: { commit: "same-parent-rename", committed: true },
      });
      expect(first.value.digest.value).toHaveLength(64);
    }
    const config = harness.control.configs[0]!;
    expect(config.mainFormat).toBe("module");
    expect(config.executable).toContain("base-node");
    expect(config.useSnapshot).toBe(false);
    expect(config.useCodeCache).toBe(false);
    expect(config.disableExperimentalSEAWarning).toBe(true);
    expect(config.output).not.toBe(join(harness.root, "app"));
    expect(String(config.main)).not.toBe(main);
    expect((config.assets as Record<string, string>).message).not.toBe(asset);
    expect(harness.control.invocations.filter(({ args }) => args[0] === "--check")).toHaveLength(1);

    const second = await harness.run(Assemble.assembleDirect(input(harness.root, "plain", "unhashed")));
    expect(Exit.isSuccess(second)).toBe(true);
    if (Exit.isSuccess(second)) {
      expect(second.value._tag).toBe("UnhashedExecutable");
      expect("digest" in second.value).toBe(false);
    }
  });

  it("enforces exact version and builder/base equality before provider work", async () => {
    const unsupported = makeHarness({ version: "27.1.0" });
    expect(failure(await unsupported.run(Assemble.assembleDirect(input(unsupported.root, "app")))))
      .toMatchObject({ _tag: "NodeSeaUnsupported", version: "27.1.0" });
    expect(unsupported.control.builds()).toBe(0);

    const overridden = makeHarness({ version: "27.1.0", allowUntestedVersion: true });
    expect(Exit.isSuccess(await overridden.run(Assemble.assembleDirect(input(overridden.root, "app"))))).toBe(true);

    const mismatch = makeHarness({ explicitBase: true, baseVersion: "26.6.0" });
    expect(failure(await mismatch.run(Assemble.assembleDirect(input(mismatch.root, "app")))))
      .toMatchObject({ _tag: "NodeSeaRelationRejected", relation: "node-builder-base" });
    expect(mismatch.control.builds()).toBe(0);
  });

  it("materializes the package-private cache, snapshot, and explicit execArgv policies", async () => {
    const harness = makeHarness();
    const cached = await harness.run(AssembleModes.assembleDirect({
      ...input(harness.root, "cached"),
      useCodeCache: true,
      execArgv: ["--no-warnings", "--stack-trace-limit=31"],
      execArgvExtension: "none",
    }));
    expect(Exit.isSuccess(cached)).toBe(true);
    expect(harness.control.configs[0]).toMatchObject({
      mainFormat: "commonjs",
      useSnapshot: false,
      useCodeCache: true,
      execArgv: ["--no-warnings", "--stack-trace-limit=31"],
      execArgvExtension: "none",
    });

    const snapshotted = await harness.run(AssembleModes.assembleDirect({
      ...input(harness.root, "snapshotted"),
      useSnapshot: true,
      execArgvExtension: "env",
    }));
    expect(Exit.isSuccess(snapshotted)).toBe(true);
    expect(harness.control.configs[1]).toMatchObject({
      useSnapshot: true,
      useCodeCache: false,
      execArgvExtension: "env",
    });

    const esmCached = await harness.run(AssembleModes.assembleDirect({
      ...input(harness.root, "esm-cached"),
      main: {
        _tag: "Bytes",
        contents: new TextEncoder().encode("console.log('esm-cache')"),
        format: "module",
      },
      useCodeCache: true,
      execArgvExtension: "cli",
    }));
    expect(Exit.isSuccess(esmCached)).toBe(true);
    expect(harness.control.configs[2]).toMatchObject({
      mainFormat: "module",
      useSnapshot: false,
      useCodeCache: true,
      execArgvExtension: "cli",
    });
  });

  it("rejects invalid private mode relations and argument policy before provider work", async () => {
    const harness = makeHarness();
    const esmSnapshot = AssembleModes.assembleDirect({
      ...input(harness.root, "esm-snapshot"),
      main: {
        _tag: "Bytes" as const,
        contents: new TextEncoder().encode("console.log('no')"),
        format: "module" as const,
      },
      useSnapshot: true,
    });
    expect(failure(await harness.run(esmSnapshot))).toMatchObject({
      _tag: "NodeSeaInputInvalid",
      reason: "ESM main is incompatible with startup snapshots",
    });
    expect(failure(
      await harness.run(AssembleModes.assembleDirect({
        ...input(harness.root, "ambiguous"),
        useSnapshot: true,
        useCodeCache: true,
      })),
    )).toMatchObject({
      _tag: "NodeSeaInputInvalid",
      reason: "startup snapshot and code cache cannot be enabled together",
    });
    expect(failure(
      await harness.run(AssembleModes.assembleDirect({
        ...input(harness.root, "implicit-policy"),
        execArgv: ["--no-warnings"],
      })),
    )).toMatchObject({
      _tag: "NodeSeaInputInvalid",
      reason: "execArgv requires an explicit execArgvExtension policy",
    });
    expect(harness.control.builds()).toBe(0);
  });

  it("rejects forbidden or malformed request modes without running assembly", async () => {
    const harness = makeHarness();
    const forbidden = { ...input(harness.root, "app"), target: "linux-x64-gnu" };
    expect(failure(await harness.run(Assemble.assembleDirect(forbidden as never))))
      .toMatchObject({ _tag: "NodeSeaInputInvalid", reason: "unknown input field target" });
    expect(failure(
      await harness.run(Assemble.assembleDirect({
        ...input(harness.root, "cache"),
        useCodeCache: true,
      } as never)),
    ))
      .toMatchObject({ _tag: "NodeSeaInputInvalid", reason: "unknown input field useCodeCache" });
    const duplicateAssets = {
      ...input(harness.root, "assets"),
      assets: [{ key: "x", path: "a" }, { key: "x", path: "b" }],
    };
    expect(failure(await harness.run(Assemble.assembleDirect(duplicateAssets))))
      .toMatchObject({ _tag: "NodeSeaInputInvalid" });
    expect(harness.control.builds()).toBe(0);
  });

  it("keeps the destination unchanged across syntax, spawn, provider, missing-output, and inspection failures", async () => {
    for (
      const mode of ["syntax-failure", "spawn-failure", "build-failure", "missing-output", "invalid-output"] as const
    ) {
      const harness = makeHarness({ mode });
      const destination = join(harness.root, "app");
      writeFileSync(destination, "old");
      const exit = await harness.run(Assemble.assembleDirect(input(harness.root, "app")));
      expect(Exit.isFailure(exit), mode).toBe(true);
      expect(readFileSync(destination, "utf8"), mode).toBe("old");
      expect(readdirSync(harness.root).some((entry) => entry.startsWith(".effect-build-file-")), mode).toBe(false);
    }
  });

  it("preserves interruption, terminates the child, and removes private staging", async () => {
    const harness = makeHarness({ mode: "delay" });
    const outer = await Effect.runPromiseExit(
      Effect.scoped(Effect.gen(function*() {
        const context = yield* Layer.build(harness.provided);
        const fiber = yield* Effect.forkChild(
          Assemble.assembleDirect(input(harness.root, "app")).pipe(Effect.provide(context)),
        );
        yield* Effect.promise(harness.control.started);
        yield* Fiber.interrupt(fiber);
        return yield* Fiber.await(fiber);
      })),
    );
    expect(Exit.isSuccess(outer)).toBe(true);
    if (Exit.isSuccess(outer)) {
      expect(Exit.isFailure(outer.value)).toBe(true);
      if (Exit.isFailure(outer.value)) expect(Cause.hasInterrupts(outer.value.cause)).toBe(true);
    }
    expect(harness.control.interrupted()).toBe(true);
    expect(existsSync(join(harness.root, "app"))).toBe(false);
    expect(readdirSync(harness.root).some((entry) => entry.startsWith(".effect-build-file-"))).toBe(false);
  });
});
