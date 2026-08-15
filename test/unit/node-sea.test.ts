import { NodeServices } from "@effect/platform-node";
import { Cause, Crypto, Effect, Exit, Fiber, FileSystem, HashSet, Path, PlatformError, Schema } from "effect";
import * as Core from "effect-build";
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  InvalidNodeSeaInput,
  makeNodeSeaService,
  NodeSeaFailed,
  nodeSeaMetadataProbeSource,
  NodeSeaPreparationFailed,
  NodeSeaProbeFailed,
  type NodeSeaRuntime,
  type NodeSeaService,
  NodeSeaSpawnFailed,
  NodeSeaSyntaxCheckFailed,
  nodeSeaTarget,
  nodeSeaVersion,
} from "../../packages/effect-build-node-sea/src/internal/NodeSea.js";
import type { CommandCompletion } from "../../packages/effect-build/src/Integration.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const makeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "effect-build-node-sea-unit-"));
  roots.push(root);
  return root;
};

const elfX64 = (interpreterPath: string): Uint8Array => {
  const interpreter = new TextEncoder().encode(`${interpreterPath}\0`);
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

const elfX64Gnu = (): Uint8Array => elfX64("/lib64/ld-linux-x86-64.so.2");

const completion = (
  exitCode = 0,
  stdout = "",
  stderr = "",
  truncated = false,
): CommandCompletion => ({
  exitCode,
  stdout: { text: stdout, truncated },
  stderr: { text: stderr, truncated },
});

const platformFailure = () =>
  PlatformError.systemError({
    _tag: "Unknown",
    module: "test",
    method: "run",
    cause: new Error("controlled platform failure"),
  });

interface RunEvent {
  readonly executable: string;
  readonly argv: readonly string[];
  readonly cwd?: string;
}

interface RuntimeControl {
  readonly events: RunEvent[];
  readonly configs: Record<string, unknown>[];
  readonly configPaths: string[];
  readonly privateMainPaths: string[];
  readonly checkCount: () => number;
  readonly buildCount: () => number;
  readonly interrupted: () => boolean;
}

interface RuntimeOptions {
  readonly nodePath: string;
  readonly version?: string;
  readonly metadataPath?: string;
  readonly builtinSpecifiers?: readonly string[];
  readonly malformedMetadata?: string;
  readonly help?: string;
  readonly syntaxCompletion?: CommandCompletion;
  readonly buildCompletion?: CommandCompletion;
  readonly syntaxSpawnFailure?: boolean;
  readonly buildSpawnFailure?: boolean;
  readonly hangBuild?: boolean;
  readonly output?: "valid" | "missing" | "invalid";
}

const controlledRuntime = (options: RuntimeOptions): NodeSeaRuntime & RuntimeControl => {
  const events: RunEvent[] = [];
  const configs: Record<string, unknown>[] = [];
  const configPaths: string[] = [];
  const privateMainPaths: string[] = [];
  let checks = 0;
  let builds = 0;
  let wasInterrupted = false;
  const run: NodeSeaRuntime["run"] = (executable, argv, cwd) => {
    events.push({ executable, argv, ...(cwd === undefined ? {} : { cwd }) });
    if (argv[0] === "--input-type=module") {
      return Effect.succeed(completion(
        0,
        options.malformedMetadata ?? JSON.stringify({
          version: options.version ?? nodeSeaVersion,
          path: options.metadataPath ?? options.nodePath,
          platform: "linux",
          architecture: "x64",
          glibc: "2.39",
          builtinSpecifiers: options.builtinSpecifiers ?? ["fs", "node:fs", "node:path", "path"],
        }),
      ));
    }
    if (argv[0] === "--help") {
      return Effect.succeed(completion(0, options.help ?? "Usage: node --build-sea config"));
    }
    if (argv[0] === "--check") {
      checks += 1;
      privateMainPaths.push(argv[1]!);
      if (options.syntaxSpawnFailure === true) return Effect.fail(platformFailure());
      return Effect.succeed(options.syntaxCompletion ?? completion());
    }
    if (argv[0] !== "--build-sea") return Effect.die(new Error(`unexpected argv: ${argv.join(" ")}`));
    builds += 1;
    if (options.buildSpawnFailure === true) return Effect.fail(platformFailure());
    if (options.hangBuild === true) {
      return Effect.never.pipe(Effect.onInterrupt(() => Effect.sync(() => wasInterrupted = true)));
    }
    const configPath = argv[1]!;
    configPaths.push(configPath);
    const config = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    configs.push(config);
    privateMainPaths.push(String(config.main));
    if (options.output !== "missing") {
      const output = String(config.output);
      writeFileSync(output, options.output === "invalid" ? "not executable" : elfX64Gnu());
      chmodSync(output, 0o755);
    }
    return Effect.succeed(options.buildCompletion ?? completion());
  };
  return {
    run,
    events,
    configs,
    configPaths,
    privateMainPaths,
    checkCount: () => checks,
    buildCount: () => builds,
    interrupted: () => wasInterrupted,
  };
};

interface Harness {
  readonly root: string;
  readonly nodePath: string;
  readonly runtime: NodeSeaRuntime & RuntimeControl;
  readonly service: NodeSeaService;
}

const makeHarness = (
  root: string,
  options: Omit<RuntimeOptions, "nodePath"> = {},
): Effect.Effect<Harness, unknown, never> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;
    const nodePath = join(root, "node-26.7.0");
    writeFileSync(nodePath, elfX64Gnu());
    chmodSync(nodePath, 0o755);
    const runtime = controlledRuntime({ nodePath, ...options });
    const service = yield* makeNodeSeaService(fileSystem, path, crypto, { executable: nodePath }, runtime);
    return { root, nodePath, runtime, service };
  }).pipe(Effect.provide(NodeServices.layer));

interface BuildOptions {
  readonly format?: "esm" | "cjs";
  readonly stages?: readonly Core.Artifact.StageObservation[];
  readonly observedExternalImports?: readonly string[];
  readonly assets?: readonly { readonly key: string; readonly path: string }[];
  readonly digest?: boolean;
}

const buildWithMain = (
  harness: Harness,
  outfile: string,
  options: BuildOptions = {},
) => {
  const main = join(harness.root, options.format === "cjs" ? "main.cjs" : "main.mjs");
  if (!existsSync(main)) writeFileSync(main, "console.log('bundle')\n");
  return Core.JavaScriptBundle.withFile(
    {
      path: main,
      format: options.format ?? "esm",
      resolutionTarget: "node",
      observedExternalImports: options.observedExternalImports ?? [],
      stages: options.stages ?? [],
    },
    (artifact) =>
      harness.service.createExecutable({
        main: artifact,
        outfile,
        ...(options.assets === undefined ? {} : { assets: options.assets }),
        ...(options.digest === undefined ? {} : { digest: options.digest }),
      }),
  ).pipe(Effect.provide(NodeServices.layer));
};

const failureOf = (exit: Exit.Exit<unknown, unknown>): unknown =>
  Exit.isFailure(exit) ? exit.cause.reasons.find(Cause.isFailReason)?.error : undefined;

describe("granular Node SEA service", () => {
  it("pins the selected producer and validates one explicit tool once", async () => {
    const harness = await Effect.runPromise(makeHarness(makeRoot()));
    expect(nodeSeaVersion).toBe("26.7.0");
    expect(nodeSeaTarget).toBe("linux-x64-gnu");
    expect(nodeSeaMetadataProbeSource).toContain("isBuiltin");
    expect(harness.runtime.events).toEqual([
      {
        executable: realpathSync(harness.nodePath),
        argv: ["--input-type=module", "--eval", nodeSeaMetadataProbeSource],
      },
      { executable: realpathSync(harness.nodePath), argv: ["--help"] },
    ]);
    expect(HashSet.has(harness.service.selectedTool.builtinSpecifiers, "node:fs")).toBe(true);
  });

  it("rejects malformed, wrong-version, and incapable selected tools", async () => {
    for (
      const options of [
        { malformedMetadata: "not-json" },
        { version: "26.6.0" },
        { help: "Usage: node" },
      ] as const
    ) {
      const exit = await Effect.runPromise(Effect.exit(makeHarness(makeRoot(), options)));
      expect(failureOf(exit)).toBeInstanceOf(NodeSeaProbeFailed);
    }
  });

  it.each(
    [
      ["esm", "module"],
      ["cjs", "commonjs"],
    ] as const,
  )("authenticates, privately copies, checks, and publishes a %s main", async (format, mainFormat) => {
    const harness = await Effect.runPromise(makeHarness(makeRoot()));
    const outfile = join(harness.root, `${format}-app`);
    const asset = join(harness.root, "message.txt");
    writeFileSync(asset, "asset");
    const producerStage = {
      operation: "bundle",
      tool: { name: "producer", version: "1.0.0" },
    } as const;
    const artifact = await Effect.runPromise(buildWithMain(harness, outfile, {
      format,
      stages: [producerStage],
      assets: [{ key: "message", path: asset }],
      digest: true,
    }));

    expect(artifact).toMatchObject({
      path: outfile,
      provider: "node-sea",
      target: "linux-x64-gnu",
    });
    expect(artifact.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(artifact.stages).toEqual([
      producerStage,
      {
        operation: "assemble-node-sea",
        tool: { name: "node", version: "26.7.0", path: realpathSync(harness.nodePath) },
      },
    ]);
    expect(harness.runtime.checkCount()).toBe(1);
    expect(harness.runtime.buildCount()).toBe(1);
    const config = harness.runtime.configs[0]!;
    const privateMain = String(config.main);
    expect(config).toMatchObject({
      main: privateMain,
      mainFormat,
      executable: realpathSync(harness.nodePath),
      useSnapshot: false,
      useCodeCache: false,
      assets: { message: asset },
    });
    expect(privateMain).not.toBe(join(harness.root, `main.${format === "esm" ? "mjs" : "cjs"}`));
    expect(harness.runtime.events.find((event) => event.argv[0] === "--check")?.argv[1]).toBe(privateMain);
    expect(harness.runtime.events.findIndex((event) => event.argv[0] === "--check"))
      .toBeLessThan(harness.runtime.events.findIndex((event) => event.argv[0] === "--build-sea"));
    expect(harness.runtime.privateMainPaths.every((path) => !existsSync(path))).toBe(true);
    expect(harness.runtime.configPaths.every((path) => !existsSync(path))).toBe(true);
    expect(existsSync(outfile)).toBe(true);
  });

  it("accepts a borrowed zero-stage bundle without Esbuild", async () => {
    const harness = await Effect.runPromise(makeHarness(makeRoot()));
    const artifact = await Effect.runPromise(buildWithMain(harness, join(harness.root, "borrowed")));
    expect(artifact.stages).toEqual([{
      operation: "assemble-node-sea",
      tool: { name: "node", version: "26.7.0", path: realpathSync(harness.nodePath) },
    }]);
  });

  it("maps total input fields to finite reasons before invoking Node", async () => {
    const harness = await Effect.runPromise(makeHarness(makeRoot()));
    const cases: readonly [unknown, string][] = [
      [null, "expected-object"],
      [{}, "missing-field"],
      [{ main: {}, outfile: "app", extra: true }, "unknown-field"],
      [{ main: {}, outfile: "" }, "invalid-outfile"],
      [{ main: {}, outfile: "app", cwd: 1 }, "invalid-cwd"],
      [{ main: {}, outfile: "app", digest: "yes" }, "invalid-digest"],
      [{ main: {}, outfile: "app", assets: {} }, "invalid-assets"],
      [{ main: {}, outfile: "app", assets: [{}] }, "invalid-asset"],
      [{ main: {}, outfile: "app", assets: [{ key: "", path: "x" }] }, "invalid-asset-key"],
      [{ main: {}, outfile: "app", assets: [{ key: "x", path: "" }] }, "invalid-asset-path"],
      [{ main: {}, outfile: "app", assets: [{ key: "x", path: "a" }, { key: "x", path: "b" }] }, "duplicate-asset-key"],
    ];
    for (const [input, reason] of cases) {
      const exit = await Effect.runPromise(Effect.exit(harness.service.createExecutable(input as never)));
      expect(failureOf(exit)).toMatchObject({ _tag: "InvalidNodeSeaInput", reason });
    }
    expect(harness.runtime.checkCount()).toBe(0);
    expect(harness.runtime.buildCount()).toBe(0);
  });

  it("rejects arbitrary reason values while accepting the builtin template", () => {
    expect(() => new InvalidNodeSeaInput({ reason: "arbitrary" as never })).toThrow();
    expect(new InvalidNodeSeaInput({ reason: "external-import-not-builtin:pkg" }).reason)
      .toBe("external-import-not-builtin:pkg");
    expect(() =>
      Schema.decodeUnknownSync(InvalidNodeSeaInput)({
        _tag: "InvalidNodeSeaInput",
        reason: "external-import-not-builtin:",
      })
    ).toThrow();
  });

  it("rejects non-builtin externals before syntax checking or candidate acquisition", async () => {
    const harness = await Effect.runPromise(makeHarness(makeRoot()));
    const exit = await Effect.runPromise(Effect.exit(buildWithMain(harness, join(harness.root, "app"), {
      observedExternalImports: ["left-pad"],
    })));
    expect(failureOf(exit)).toMatchObject({
      _tag: "InvalidNodeSeaInput",
      reason: "external-import-not-builtin:left-pad",
    });
    expect(harness.runtime.checkCount()).toBe(0);
    expect(harness.runtime.buildCount()).toBe(0);
  });

  it("detects a same-size main rewrite through the core live handle", async () => {
    const harness = await Effect.runPromise(makeHarness(makeRoot()));
    const mainPath = join(harness.root, "main.mjs");
    writeFileSync(mainPath, "export const a = 1;\n");
    const exit = await Effect.runPromise(Effect.exit(
      Core.JavaScriptBundle.withFile(
        {
          path: mainPath,
          format: "esm",
          resolutionTarget: "node",
          observedExternalImports: [],
          stages: [],
        },
        (main) =>
          Effect.sync(() => writeFileSync(mainPath, "export const b = 2;\n")).pipe(
            Effect.andThen(harness.service.createExecutable({ main, outfile: join(harness.root, "app") })),
          ),
      ).pipe(Effect.provide(NodeServices.layer)),
    ));
    expect(failureOf(exit)).toMatchObject({ _tag: "InvalidNodeSeaInput", reason: "main-artifact-changed" });
    expect(harness.runtime.checkCount()).toBe(0);
  });

  it("preserves syntax, spawn, assembly, and output failures without replacing a destination", async () => {
    const cases = [
      [{ syntaxCompletion: completion(1, "", "syntax bad") }, NodeSeaSyntaxCheckFailed],
      [{ syntaxSpawnFailure: true }, NodeSeaSpawnFailed],
      [{ buildCompletion: completion(2, "", "assembly bad") }, NodeSeaFailed],
      [{ buildSpawnFailure: true }, NodeSeaSpawnFailed],
      [{ output: "missing" as const }, Core.BuildError.OutputMissing],
      [{ output: "invalid" as const }, Core.BuildError.OutputInvalid],
    ] as const;
    for (const [options, ErrorClass] of cases) {
      const harness = await Effect.runPromise(makeHarness(makeRoot(), options));
      const outfile = join(harness.root, "app");
      writeFileSync(outfile, "old");
      const exit = await Effect.runPromise(Effect.exit(buildWithMain(harness, outfile)));
      expect(failureOf(exit)).toBeInstanceOf(ErrorClass);
      expect(readFileSync(outfile, "utf8")).toBe("old");
      expect(harness.runtime.privateMainPaths.every((path) => !existsSync(path))).toBe(true);
      expect(harness.runtime.configPaths.every((path) => !existsSync(path))).toBe(true);
    }
  });

  it("keeps interruption as interruption and removes operation-private files", async () => {
    const harness = await Effect.runPromise(makeHarness(makeRoot(), { hangBuild: true }));
    const outfile = join(harness.root, "app");
    const fiber = Effect.runFork(buildWithMain(harness, outfile));
    while (harness.runtime.buildCount() === 0) await new Promise((resolve) => setTimeout(resolve, 1));
    await Effect.runPromise(Fiber.interrupt(fiber));
    const exit = await Effect.runPromise(Fiber.await(fiber));
    expect(Exit.hasInterrupts(exit)).toBe(true);
    expect(harness.runtime.interrupted()).toBe(true);
    expect(harness.runtime.privateMainPaths.every((path) => !existsSync(path))).toBe(true);
    expect(harness.runtime.configPaths.every((path) => !existsSync(path))).toBe(true);
    expect(existsSync(outfile)).toBe(false);
  });

  it("maps copy failures to the named preparation operation", async () => {
    const root = makeRoot();
    const exit = await Effect.runPromise(Effect.exit(
      Effect.gen(function*() {
        const platformFileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const crypto = yield* Crypto.Crypto;
        const nodePath = join(root, "node-26.7.0");
        writeFileSync(nodePath, elfX64Gnu());
        chmodSync(nodePath, 0o755);
        const runtime = controlledRuntime({ nodePath });
        const service = yield* makeNodeSeaService(
          { ...platformFileSystem, copyFile: () => Effect.fail(platformFailure()) },
          path,
          crypto,
          { executable: nodePath },
          runtime,
        );
        const mainPath = join(root, "main.mjs");
        writeFileSync(mainPath, "export {};\n");
        return yield* Core.JavaScriptBundle.withFile(
          { path: mainPath, format: "esm", resolutionTarget: "node", observedExternalImports: [], stages: [] },
          (main) => service.createExecutable({ main, outfile: join(root, "app") }),
        );
      }).pipe(Effect.provide(NodeServices.layer)),
    ));
    expect(failureOf(exit)).toMatchObject({ _tag: "NodeSeaPreparationFailed", operation: "copy-main" });
    expect(failureOf(exit)).toBeInstanceOf(NodeSeaPreparationFailed);
  });
});
