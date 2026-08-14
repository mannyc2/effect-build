import { NodeServices } from "@effect/platform-node";
import { Effect, Exit, Fiber, FileSystem, HashSet, Latch, Path } from "effect";
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  Esbuild,
  type EsbuildService,
  layer as esbuildLayer,
  withJavaScriptBundle,
} from "../../packages/effect-build-node-sea/src/internal/Esbuild.js";
import {
  InvalidNodeSeaInput,
  makeNodeSeaService,
  NodeSea,
  type NodeSeaCandidateInput,
  type NodeSeaRuntime,
  type NodeSeaService,
  type NodeSeaStages,
  type ProcessCompletion,
} from "../../packages/effect-build-node-sea/src/internal/NodeSea.js";

const fixtureRoot = fileURLToPath(new URL("../fixtures/esbuild/", import.meta.url));
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const makeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "effect-build-pipeline-"));
  roots.push(root);
  return root;
};

const completion = (exitCode = 0, stdout = "", stderr = ""): ProcessCompletion => ({
  exitCode,
  stdout: { text: stdout, truncated: false },
  stderr: { text: stderr, truncated: false },
});

const linuxX64GnuExecutable = (): Uint8Array => {
  const interpreter = new TextEncoder().encode("/lib64/ld-linux-x86-64.so.2\0");
  const bytes = new Uint8Array(120 + interpreter.byteLength);
  const view = new DataView(bytes.buffer);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1], 0);
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

interface RealNodeHarness {
  readonly service: NodeSeaService;
  readonly buildCalls: () => number;
  readonly bundlePaths: string[];
  readonly configPaths: string[];
  readonly outputPaths: string[];
  readonly buildStarted: Latch.Latch;
  readonly interrupted: () => boolean;
}

const makeRealNodeHarness = (
  root: string,
  behavior: "success" | "failed" | "invalid" | "wrong-target" | "hang" = "success",
  mapFileSystem: (fileSystem: FileSystem.FileSystem) => FileSystem.FileSystem = (fileSystem) => fileSystem,
): Effect.Effect<RealNodeHarness, unknown, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const hostFileSystem = yield* FileSystem.FileSystem;
    const fileSystem = mapFileSystem(hostFileSystem);
    const path = yield* Path.Path;
    const executable = join(root, "node-26.7.0");
    writeFileSync(executable, linuxX64GnuExecutable());
    chmodSync(executable, 0o755);
    let builds = 0;
    let wasInterrupted = false;
    const buildStarted = Latch.makeUnsafe();
    const bundlePaths: string[] = [];
    const configPaths: string[] = [];
    const outputPaths: string[] = [];
    const runtime: NodeSeaRuntime = {
      run: (_selected, argv) => {
        if (argv.includes("--eval")) {
          return Effect.succeed(completion(
            0,
            JSON.stringify({
              version: "26.7.0",
              path: executable,
              platform: "linux",
              architecture: "x64",
              glibc: "2.39",
              builtinSpecifiers: ["fs", "node:fs", "node:path", "path"],
            }),
          ));
        }
        if (argv[0] === "--help") return Effect.succeed(completion(0, "--build-sea\n"));
        const configPath = argv[1]!;
        return Effect.suspend(() => {
          builds += 1;
          buildStarted.openUnsafe();
          configPaths.push(configPath);
          const config = JSON.parse(readFileSync(configPath, "utf8")) as { main: string; output: string };
          bundlePaths.push(config.main);
          outputPaths.push(config.output);
          if (behavior === "failed") return Effect.succeed(completion(7, "", "node sea failed"));
          if (behavior === "hang") {
            return Effect.never.pipe(Effect.onInterrupt(() => Effect.sync(() => wasInterrupted = true)));
          }
          writeFileSync(
            config.output,
            behavior === "invalid"
              ? "not-native"
              : behavior === "wrong-target"
              ? new Uint8Array([0xcf, 0xfa, 0xed, 0xfe, 0x0c, 0, 0, 1])
              : linuxX64GnuExecutable(),
          );
          chmodSync(config.output, 0o755);
          return Effect.succeed(completion());
        });
      },
    };
    const service = yield* makeNodeSeaService(fileSystem, path, { executable }, runtime);
    return {
      service,
      buildCalls: () => builds,
      bundlePaths,
      configPaths,
      outputPaths,
      buildStarted,
      interrupted: () => wasInterrupted,
    };
  });

const pipeline = (input: {
  readonly entrypoint: string;
  readonly format: "esm" | "cjs";
  readonly outfile: string;
  readonly assets?: NodeSeaCandidateInput["assets"];
}) =>
  withJavaScriptBundle(
    { entrypoint: input.entrypoint, format: input.format, cwd: fixtureRoot },
    (main) =>
      NodeSea.use((service) =>
        service.produceCandidate({
          main,
          stagedOutfile: `${input.outfile}.candidate`,
          resolvedDestination: input.outfile,
          ...(input.assets === undefined ? {} : { assets: input.assets }),
        })
      ),
  );

const providePipeline = <A, E>(effect: Effect.Effect<A, E, Esbuild | NodeSea>, nodeSea: NodeSeaService) =>
  effect.pipe(
    Effect.provideService(NodeSea, nodeSea),
    Effect.provide(esbuildLayer),
    Effect.provide(NodeServices.layer),
  );

const runRealPipeline = (
  harness: RealNodeHarness,
  input: {
    readonly entrypoint: string;
    readonly format: "esm" | "cjs";
    readonly outfile: string;
  },
) => providePipeline(pipeline(input), harness.service);

const successfulNodeSea = (observe: (input: NodeSeaCandidateInput) => void): NodeSeaService => ({
  selectedTool: {
    path: "/tools/node-26.7.0",
    version: "26.7.0",
    target: "linux-x64-gnu",
    builtinSpecifiers: HashSet.empty(),
  },
  produceCandidate: (input) =>
    Effect.sync(() => {
      observe(input);
      if (!existsSync(input.main.path)) throw new Error("bundle must remain live during Node SEA");
      writeFileSync(input.stagedOutfile, "candidate-pipeline-executable");
      return [
        input.main.stage,
        {
          operation: "assemble-node-sea",
          tool: { name: "node", version: "26.7.0", path: "/tools/node-26.7.0" },
        },
      ] satisfies NodeSeaStages;
    }),
});

describe("internal esbuild to Node SEA pipeline", () => {
  it.each(
    [
      ["esm", "valid.ts"],
      ["cjs", "valid.cjs"],
    ] as const,
  )("composes a live %s bundle into one exact-stage candidate", async (format, entrypoint) => {
    const root = makeRoot();
    const outfile = join(root, `${format}-app`);
    const asset = join(root, "message.txt");
    writeFileSync(asset, "explicit asset");
    let bundlePath = "";
    let calls = 0;
    const nodeSea = successfulNodeSea((input) => {
      calls += 1;
      bundlePath = input.main.path;
      expect(input.main.format).toBe(format);
      expect(input.main.nodeSyntaxTarget).toBe("node26.7");
      expect(input.assets).toEqual([{ key: "message", path: asset }]);
    });

    const stages = await Effect.runPromise(
      providePipeline(
        pipeline({
          entrypoint,
          format,
          outfile,
          assets: [{ key: "message", path: asset }],
        }),
        nodeSea,
      ),
    );

    expect(calls).toBe(1);
    expect(existsSync(bundlePath)).toBe(false);
    expect(existsSync(outfile)).toBe(false);
    expect(existsSync(`${outfile}.candidate`)).toBe(true);
    expect(stages).toEqual([
      { operation: "bundle", tool: { name: "esbuild", version: "0.28.2" } },
      {
        operation: "assemble-node-sea",
        tool: { name: "node", version: "26.7.0", path: "/tools/node-26.7.0" },
      },
    ]);
  });

  it("does not start Node when bundle preparation fails", async () => {
    const root = makeRoot();
    const result = await Effect.runPromise(
      Effect.gen(function*() {
        const harness = yield* makeRealNodeHarness(root);
        const exit = yield* Effect.exit(runRealPipeline(harness, {
          entrypoint: "missing.js",
          format: "esm",
          outfile: join(root, "app"),
        }));
        return { exit, calls: harness.buildCalls() };
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    expect(Exit.isFailure(result.exit)).toBe(true);
    expect(Exit.hasFails(result.exit)).toBe(true);
    expect(result.calls).toBe(0);
    expect(existsSync(join(root, "app"))).toBe(false);
  });

  it("rejects a non-builtin observed external before Node build", async () => {
    const root = makeRoot();
    const exit = await Effect.runPromise(
      Effect.gen(function*() {
        const harness = yield* makeRealNodeHarness(root);
        const exit = yield* Effect.exit(runRealPipeline(harness, {
          entrypoint: "external-custom.mjs",
          format: "esm",
          outfile: join(root, "app"),
        }));
        return { exit, builds: harness.buildCalls() };
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    expect(Exit.isFailure(exit.exit) && Exit.hasFails(exit.exit)).toBe(true);
    expect(exit.builds).toBe(0);
    expect(existsSync(join(root, "app"))).toBe(false);
  });

  it.each(["failed"] as const)(
    "closes bundle, config, and candidate scopes for %s Node output",
    async (behavior) => {
      const root = makeRoot();
      const outfile = join(root, "app");
      writeFileSync(outfile, "old");
      const result = await Effect.runPromise(
        Effect.gen(function*() {
          const harness = yield* makeRealNodeHarness(root, behavior);
          const exit = yield* Effect.exit(runRealPipeline(harness, {
            entrypoint: "valid.ts",
            format: "esm",
            outfile,
          }));
          return { exit, harness };
        }).pipe(Effect.provide(NodeServices.layer)),
      );

      expect(Exit.isFailure(result.exit) && Exit.hasFails(result.exit)).toBe(true);
      expect(result.harness.buildCalls()).toBe(1);
      expect(result.harness.bundlePaths.every((path) => !existsSync(path))).toBe(true);
      expect(result.harness.configPaths.every((path) => !existsSync(path))).toBe(true);
      expect(result.harness.outputPaths.every((path) => !existsSync(path))).toBe(true);
      expect(readFileSync(outfile, "utf8")).toBe("old");
      expect(readdirSync(root).filter((name) => name.startsWith(".effect-build-"))).toEqual([]);
    },
  );

  it("returns exact stages while leaving the candidate for core publication", async () => {
    const root = makeRoot();
    const outfile = join(root, "app");
    const result = await Effect.runPromise(
      Effect.gen(function*() {
        const harness = yield* makeRealNodeHarness(root);
        const stages = yield* runRealPipeline(harness, {
          entrypoint: "valid.ts",
          format: "esm",
          outfile,
        });
        return { stages, harness };
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    expect(existsSync(outfile)).toBe(false);
    expect(result.harness.bundlePaths.every((path) => !existsSync(path))).toBe(true);
    expect(result.harness.configPaths.every((path) => !existsSync(path))).toBe(true);
    expect(result.harness.outputPaths.every((path) => existsSync(path))).toBe(true);
    expect(result.stages.map((stage) => stage.operation)).toEqual(["bundle", "assemble-node-sea"]);
  });

  it("interrupts the Node child and closes every nested temporary scope", async () => {
    const root = makeRoot();
    const outfile = join(root, "app");
    const ready = await Effect.runPromise(
      Effect.gen(function*() {
        const harness = yield* makeRealNodeHarness(root, "hang");
        return { harness };
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    const fiber = Effect.runFork(
      runRealPipeline(ready.harness, {
        entrypoint: "valid.ts",
        format: "esm",
        outfile,
      }).pipe(
        Effect.provide(esbuildLayer),
        Effect.provide(NodeServices.layer),
      ),
    );
    await Effect.runPromise(ready.harness.buildStarted.await);
    await Effect.runPromise(Fiber.interrupt(fiber));
    const exit = await Effect.runPromise(Fiber.await(fiber));

    expect(Exit.hasInterrupts(exit)).toBe(true);
    expect(ready.harness.interrupted()).toBe(true);
    expect(ready.harness.bundlePaths.every((path) => !existsSync(path))).toBe(true);
    expect(ready.harness.configPaths.every((path) => !existsSync(path))).toBe(true);
    expect(ready.harness.outputPaths.every((path) => !existsSync(path))).toBe(true);
    expect(existsSync(outfile)).toBe(false);
  });

  it("does not invoke rename or replace the destination", async () => {
    const root = makeRoot();
    const outfile = join(root, "app");
    writeFileSync(outfile, "old");
    let renames = 0;
    const ready = await Effect.runPromise(
      Effect.gen(function*() {
        const harness = yield* makeRealNodeHarness(root, "success", (fileSystem) => ({
          ...fileSystem,
          rename: () => {
            renames += 1;
            return Effect.die(new Error("provider must not publish"));
          },
        }));
        return { harness };
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    await Effect.runPromise(runRealPipeline(ready.harness, {
      entrypoint: "valid.ts",
      format: "esm",
      outfile,
    }));

    expect(renames).toBe(0);
    expect(readFileSync(outfile, "utf8")).toBe("old");
    expect(ready.harness.bundlePaths.every((path) => !existsSync(path))).toBe(true);
    expect(ready.harness.configPaths.every((path) => !existsSync(path))).toBe(true);
  });

  it("closes the bundle scope and preserves the destination on a Node typed failure", async () => {
    const root = makeRoot();
    const outfile = join(root, "app");
    writeFileSync(outfile, "old");
    let bundlePath = "";
    const nodeSea: NodeSeaService = {
      ...successfulNodeSea(() => {}),
      produceCandidate: (input) => {
        bundlePath = input.main.path;
        return Effect.fail(new InvalidNodeSeaInput({ reason: "external-not-builtin" }));
      },
    };
    const exit = await Effect.runPromise(Effect.exit(providePipeline(
      pipeline({ entrypoint: "valid.ts", format: "esm", outfile }),
      nodeSea,
    )));

    expect(Exit.isFailure(exit) && Exit.hasFails(exit)).toBe(true);
    expect(existsSync(bundlePath)).toBe(false);
    expect(readFileSync(outfile, "utf8")).toBe("old");
  });

  it("interrupts during Node without letting the temporary bundle escape", async () => {
    const root = makeRoot();
    const outfile = join(root, "app");
    const nodeStarted = Latch.makeUnsafe();
    let bundlePath = "";
    const nodeSea: NodeSeaService = {
      ...successfulNodeSea(() => {}),
      produceCandidate: (input) =>
        Effect.gen(function*() {
          bundlePath = input.main.path;
          yield* nodeStarted.open;
          return yield* Effect.never;
        }),
    };
    const fiber = Effect.runFork(providePipeline(
      pipeline({ entrypoint: "valid.ts", format: "esm", outfile }),
      nodeSea,
    ));
    await Effect.runPromise(nodeStarted.await);
    expect(existsSync(bundlePath)).toBe(true);
    await Effect.runPromise(Fiber.interrupt(fiber));
    const exit = await Effect.runPromise(Fiber.await(fiber));

    expect(Exit.hasInterrupts(exit)).toBe(true);
    expect(existsSync(bundlePath)).toBe(false);
    expect(existsSync(outfile)).toBe(false);
  });

  it("does not start Node when interrupted during the esbuild stage", async () => {
    const esbuildStarted = Latch.makeUnsafe();
    let esbuildDisposed = false;
    let nodeCalls = 0;
    const blockedEsbuild: EsbuildService = {
      withJavaScriptBundle: () =>
        Effect.gen(function*() {
          yield* esbuildStarted.open;
          return yield* Effect.never;
        }).pipe(Effect.onInterrupt(() => Effect.sync(() => esbuildDisposed = true))),
    };
    const nodeSea = successfulNodeSea(() => nodeCalls += 1);
    const effect = pipeline({
      entrypoint: "valid.ts",
      format: "esm",
      outfile: join(makeRoot(), "app"),
    }).pipe(
      Effect.provideService(Esbuild, blockedEsbuild),
      Effect.provideService(NodeSea, nodeSea),
    );
    const fiber = Effect.runFork(effect);
    await Effect.runPromise(esbuildStarted.await);
    await Effect.runPromise(Fiber.interrupt(fiber));

    expect(nodeCalls).toBe(0);
    expect(esbuildDisposed).toBe(true);
    expect(Exit.hasInterrupts(await Effect.runPromise(Fiber.await(fiber)))).toBe(true);
  });
});
