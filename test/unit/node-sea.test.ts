import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber, FileSystem, HashSet, Path, PlatformError } from "effect";
import type * as esbuild from "esbuild";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { definition, executionFailed } from "../../packages/effect-build-node-sea/src/Adapter.js";
import type { Options } from "../../packages/effect-build-node-sea/src/index.js";
import {
  type BundleContext,
  type EsbuildApi,
  EsbuildFailed,
  type JavaScriptBundleArtifact,
  makeEsbuildService,
} from "../../packages/effect-build-node-sea/src/internal/Esbuild.js";
import {
  makeNodeSeaService,
  type NodeSeaCandidateInput,
  NodeSeaFailed,
  nodeSeaMetadataProbeSource,
  NodeSeaPreparationFailed,
  type NodeSeaRuntime,
  type NodeSeaService,
  type NodeSeaStages,
  nodeSeaSyntaxTarget,
  nodeSeaTarget,
  nodeSeaVersion,
  type ProcessCompletion,
} from "../../packages/effect-build-node-sea/src/internal/NodeSea.js";

const roots: string[] = [];
const fixtureRoot = resolve(new URL("../fixtures/node-sea", import.meta.url).pathname);
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
const elfX64Musl = (): Uint8Array => elfX64("/lib/ld-musl-x86_64.so.1");

const machoX64 = (): Uint8Array => {
  const bytes = new Uint8Array(64);
  bytes.set([0xcf, 0xfa, 0xed, 0xfe, 0x07, 0x00, 0x00, 0x01]);
  return bytes;
};

const completion = (
  exitCode = 0,
  stdout = "",
  stderr = "",
  truncated = false,
): ProcessCompletion => ({
  exitCode,
  stdout: { text: stdout, truncated },
  stderr: { text: stderr, truncated },
});

const platformFailure = (tag: PlatformError.SystemErrorTag = "Unknown") =>
  PlatformError.systemError({
    _tag: tag,
    module: "test",
    method: "run",
    cause: new Error("controlled platform failure"),
  });

interface RunEvent {
  readonly executable: string;
  readonly argv: readonly string[];
  readonly cwd?: string;
}

interface ControlledRuntime extends NodeSeaRuntime {
  readonly events: RunEvent[];
  readonly configs: Record<string, unknown>[];
  readonly configPaths: string[];
  readonly buildCount: () => number;
}

interface RuntimeOptions {
  readonly nodePath: string;
  readonly selectedBytes?: Uint8Array;
  readonly version?: string;
  readonly metadataPath?: string;
  readonly builtinSpecifiers?: readonly string[];
  readonly malformedMetadata?: string;
  readonly metadataExit?: number;
  readonly metadataTruncated?: boolean;
  readonly help?: string;
  readonly helpExit?: number;
  readonly helpTruncated?: boolean;
  readonly platform?: string;
  readonly architecture?: string;
  readonly glibc?: string | undefined;
  readonly spawnFailure?: boolean;
  readonly buildCompletion?: ProcessCompletion;
  readonly output?: "valid" | "missing" | "invalid" | "wrong-target";
  readonly buildEffect?: Effect.Effect<ProcessCompletion, PlatformError.PlatformError>;
}

const controlledRuntime = (options: RuntimeOptions): ControlledRuntime => {
  const events: RunEvent[] = [];
  const configs: Record<string, unknown>[] = [];
  const configPaths: string[] = [];
  let builds = 0;
  const run: NodeSeaRuntime["run"] = (executable, argv, cwd) => {
    events.push({ executable, argv, ...(cwd === undefined ? {} : { cwd }) });
    if (argv[0] === "--input-type=module") {
      const metadata = options.malformedMetadata ?? JSON.stringify({
        version: options.version ?? nodeSeaVersion,
        path: options.metadataPath ?? options.nodePath,
        platform: options.platform ?? "linux",
        architecture: options.architecture ?? "x64",
        glibc: Object.hasOwn(options, "glibc") ? options.glibc : "2.39",
        builtinSpecifiers: options.builtinSpecifiers ?? ["fs", "node:fs", "node:path", "path"],
      });
      return Effect.succeed(completion(
        options.metadataExit ?? 0,
        metadata,
        "metadata-error",
        options.metadataTruncated ?? false,
      ));
    }
    if (argv[0] === "--help") {
      return Effect.succeed(completion(
        options.helpExit ?? 0,
        options.help ?? "Usage: node --build-sea config",
        "",
        options.helpTruncated ?? false,
      ));
    }
    builds += 1;
    if (options.spawnFailure === true) return Effect.fail(platformFailure());
    if (options.buildEffect !== undefined) return options.buildEffect;
    const configPath = argv[1]!;
    configPaths.push(configPath);
    const config = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    configs.push(config);
    if (options.output !== "missing") {
      const output = String(config.output);
      const bytes = options.output === "wrong-target"
        ? machoX64()
        : options.output === "invalid"
        ? new TextEncoder().encode("not an executable")
        : elfX64Gnu();
      writeFileSync(output, bytes);
      chmodSync(output, 0o755);
    }
    return Effect.succeed(options.buildCompletion ?? completion());
  };
  return {
    run,
    events,
    configs,
    configPaths,
    buildCount: () => builds,
  };
};

type BundleOptions = esbuild.BuildOptions & { readonly write: false; readonly metafile: true };

const bundleApi = (externalImports: readonly string[] = ["node:fs"]): EsbuildApi => ({
  version: "0.28.2",
  context: async (options: BundleOptions): Promise<BundleContext> => ({
    rebuild: async () => {
      const outfile = options.outfile!;
      const entrypoint = (options.entryPoints as readonly string[])[0]!;
      const kind = options.format === "cjs" ? "require-call" : "import-statement";
      const text = "console.log('bundle')\n";
      return {
        errors: [],
        warnings: [],
        outputFiles: [{ path: outfile, contents: new TextEncoder().encode(text), hash: "fixture", text }],
        metafile: {
          inputs: { [entrypoint]: { bytes: 1, imports: [], format: options.format! as "esm" | "cjs" } },
          outputs: {
            [outfile]: {
              bytes: text.length,
              inputs: { [entrypoint]: { bytesInOutput: 1 } },
              imports: externalImports.map((path) => ({ path, kind, external: true })),
              exports: [],
              entryPoint: entrypoint,
            },
          },
        },
        mangleCache: {},
      } as esbuild.BuildResult<BundleOptions>;
    },
    cancel: async () => undefined,
    dispose: async () => undefined,
  }),
});

interface Harness {
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly root: string;
  readonly nodePath: string;
  readonly runtime: ControlledRuntime;
  readonly service: NodeSeaService;
}

const harness = (
  root: string,
  runtimeOptions: Omit<RuntimeOptions, "nodePath"> = {},
  configureFileSystem?: (fileSystem: FileSystem.FileSystem) => FileSystem.FileSystem,
  discovery: "explicit" | "path" = "explicit",
): Effect.Effect<Harness, unknown, never> =>
  Effect.gen(function*() {
    const platformFileSystem = yield* FileSystem.FileSystem;
    const fileSystem = configureFileSystem?.(platformFileSystem) ?? platformFileSystem;
    const path = yield* Path.Path;
    const nodePath = join(root, "node-26.7.0");
    writeFileSync(nodePath, runtimeOptions.selectedBytes ?? elfX64Gnu());
    chmodSync(nodePath, 0o755);
    const runtime = controlledRuntime({ nodePath, ...runtimeOptions });
    const service = yield* makeNodeSeaService(
      fileSystem,
      path,
      discovery === "explicit" ? { executable: nodePath } : {},
      runtime,
    );
    return { fileSystem, path, root, nodePath, runtime, service };
  }).pipe(Effect.provide(NodeServices.layer));

const withMain = <A, E, R>(
  context: Harness,
  options: {
    readonly format?: "esm" | "cjs";
    readonly externalImports?: readonly string[];
  },
  use: (main: JavaScriptBundleArtifact) => Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  | E
  | import("../../packages/effect-build-node-sea/src/internal/Esbuild.js").EsbuildBundleError
  | import("../../packages/effect-build-node-sea/src/internal/Esbuild.js").EsbuildVersionMismatch,
  Exclude<R, import("effect").Scope.Scope>
> =>
  Effect.gen(function*() {
    const esbuildService = yield* makeEsbuildService(
      context.fileSystem,
      context.path,
      bundleApi(options.externalImports),
    );
    return yield* esbuildService.withJavaScriptBundle(
      {
        entrypoint: options.format === "cjs" ? "main.cjs" : "main.mjs",
        format: options.format ?? "esm",
        cwd: fixtureRoot,
      },
      use,
    );
  });

const candidateInput = (
  main: JavaScriptBundleArtifact,
  resolvedDestination: string,
  options: Pick<NodeSeaCandidateInput, "cwd" | "assets"> = {},
): NodeSeaCandidateInput => {
  const stagedOutfile = `${resolvedDestination}.candidate`;
  mkdirSync(dirname(stagedOutfile), { recursive: true });
  return { main, stagedOutfile, resolvedDestination, ...options };
};

const failureOf = (exit: Exit.Exit<unknown, unknown>): unknown =>
  Exit.isFailure(exit) ? exit.cause.reasons.find(Cause.isFailReason)?.error : undefined;

describe("exact selected Node SEA service", () => {
  it("pins the producer, syntax, target, and metadata probe contract", () => {
    expect(nodeSeaVersion).toBe("26.7.0");
    expect(nodeSeaSyntaxTarget).toBe("node26.7");
    expect(nodeSeaTarget).toBe("linux-x64-gnu");
    expect(nodeSeaMetadataProbeSource).toContain("node:module");
    expect(nodeSeaMetadataProbeSource).toContain("builtinModules");
    expect(nodeSeaMetadataProbeSource).toContain("isBuiltin");
    expect(nodeSeaMetadataProbeSource).toContain("process.execPath");
  });

  it("selects explicit and PATH tools with one metadata and one canonical help probe", async () => {
    for (const discovery of ["explicit", "path"] as const) {
      const root = makeRoot();
      const context = await Effect.runPromise(harness(root, {}, undefined, discovery));
      const canonicalNodePath = realpathSync(context.nodePath);
      expect(context.runtime.events).toHaveLength(2);
      expect(context.runtime.events[0]).toEqual({
        executable: discovery === "explicit" ? canonicalNodePath : "node",
        argv: ["--input-type=module", "--eval", nodeSeaMetadataProbeSource],
      });
      expect(context.runtime.events[1]).toEqual({ executable: canonicalNodePath, argv: ["--help"] });
      expect(context.service.selectedTool).toMatchObject({
        path: canonicalNodePath,
        version: "26.7.0",
        target: "linux-x64-gnu",
      });
      expect(Object.isFrozen(context.service.selectedTool)).toBe(true);
      expect([...context.service.selectedTool.builtinSpecifiers].sort()).toEqual([
        "fs",
        "node:fs",
        "node:path",
        "path",
      ]);
      expect(HashSet.has(context.service.selectedTool.builtinSpecifiers, "node:fs")).toBe(true);
    }
  });

  it("rejects relative, malformed, wrong-version, incapable, non-executable, and wrong-target tools", async () => {
    const cases: readonly [string, (root: string) => Effect.Effect<unknown, unknown, never>][] = [
      ["relative explicit", (root) =>
        Effect.gen(function*() {
          const fileSystem = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          return yield* makeNodeSeaService(
            fileSystem,
            path,
            { executable: "node" },
            controlledRuntime({
              nodePath: join(root, "node"),
            }),
          );
        }).pipe(Effect.provide(NodeServices.layer))],
      ["malformed metadata", (root) => harness(root, { malformedMetadata: "{" })],
      ["wrong version", (root) => harness(root, { version: "26.7.1" })],
      ["missing capability", (root) => harness(root, { help: "ordinary help" })],
      ["near-match capability", (root) => harness(root, { help: "Usage: node --build-seafood config" })],
      ["truncated metadata", (root) => harness(root, { metadataTruncated: true })],
      ["truncated help", (root) => harness(root, { helpTruncated: true })],
      [
        "wrong target",
        (root) => harness(root, { glibc: undefined }),
      ],
      ["wrong architecture", (root) => harness(root, { architecture: "arm64" })],
      ["Mach-O selected bytes", (root) => harness(root, { selectedBytes: machoX64() })],
      ["musl selected bytes", (root) => harness(root, { selectedBytes: elfX64Musl() })],
    ];
    for (const [name, run] of cases) {
      const exit = await Effect.runPromise(Effect.exit(run(makeRoot())));
      expect(failureOf(exit), name).toMatchObject({ _tag: "NodeSeaProbeFailed" });
    }

    const root = makeRoot();
    const nodePath = join(root, "node-26.7.0");
    writeFileSync(nodePath, elfX64Gnu());
    chmodSync(nodePath, 0o644);
    const exit = await Effect.runPromise(Effect.exit(
      Effect.gen(function*() {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        return yield* makeNodeSeaService(
          fileSystem,
          path,
          { executable: nodePath },
          controlledRuntime({ nodePath }),
        );
      }).pipe(Effect.provide(NodeServices.layer)),
    ));
    expect(failureOf(exit)).toMatchObject({ _tag: "NodeSeaProbeFailed" });
  });

  it("characterizes selected bytes before trusting executable-reported host metadata", async () => {
    for (
      const [selectedBytes, reason] of [
        [machoX64(), "selected executable is not ELF"],
        [elfX64Musl(), "selected executable does not use the GNU ELF interpreter"],
      ] as const
    ) {
      const root = makeRoot();
      const nodePath = join(root, "node-26.7.0");
      writeFileSync(nodePath, selectedBytes);
      chmodSync(nodePath, 0o755);
      const runtime = controlledRuntime({ nodePath });
      const exit = await Effect.runPromise(Effect.exit(
        Effect.gen(function*() {
          const fileSystem = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          return yield* makeNodeSeaService(fileSystem, path, { executable: nodePath }, runtime);
        }).pipe(Effect.provide(NodeServices.layer)),
      ));
      expect(failureOf(exit)).toMatchObject({ _tag: "NodeSeaProbeFailed", reason });
      expect(runtime.events).toEqual([]);
    }
  });

  it("maps PATH command absence to NodeSeaToolNotFound without fallback or installation", async () => {
    const root = makeRoot();
    const exit = await Effect.runPromise(Effect.exit(
      Effect.gen(function*() {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const runtime: NodeSeaRuntime = {
          run: () => Effect.fail(platformFailure("NotFound")),
        };
        return yield* makeNodeSeaService(fileSystem, path, {}, runtime);
      }).pipe(Effect.provide(NodeServices.layer)),
    ));
    expect(failureOf(exit)).toMatchObject({ _tag: "NodeSeaToolNotFound", command: "node" });
    expect(readdirSync(root)).toEqual([]);
  });
});

describe("Node SEA public option and diagnostic mapping", () => {
  it("validates the exact public option shape at the adapter boundary", () => {
    const options: Options = { format: "esm", assets: [{ key: "message", path: "message.txt" }] };
    expect(definition.validateOptions(options)).toEqual({
      _tag: "Valid",
      value: { format: "esm", assets: [{ key: "message", path: "message.txt" }] },
    });

    const longKey = "😀".repeat(257);
    const tooManyAssets = Array.from({ length: 257 }, (_, index) => ({ key: `key-${index}`, path: "x" }));
    for (
      const [input, reason] of [
        [undefined, "options must be an object"],
        [{}, "format must be esm or cjs"],
        [{ format: "iife" }, "format must be esm or cjs"],
        [{ format: "esm", unknown: true }, "unknown Node SEA option"],
        [{ format: "esm", assets: {} }, "assets must be an array of at most 256 items"],
        [{ format: "esm", assets: tooManyAssets }, "assets must be an array of at most 256 items"],
        [{ format: "esm", assets: [{}] }, "each asset must contain exactly key and path"],
        [{ format: "esm", assets: [{ key: "", path: "x" }] }, "asset key must be a non-empty string without NUL"],
        [{ format: "esm", assets: [{ key: "a", path: "" }] }, "asset path must be a non-empty string without NUL"],
        [{ format: "esm", assets: [{ key: "a", path: "x" }, { key: "a", path: "y" }] }, "asset keys must be unique"],
        [{ format: "esm", assets: [{ key: longKey, path: "x" }] }, "asset key is too long"],
      ] as const
    ) {
      expect(definition.validateOptions(input)).toEqual({ _tag: "Invalid", reason });
    }
  });

  it("preserves Node stdout/stderr diagnostics, exit code, and independent truncation flags", () => {
    const mapped = executionFailed(
      new NodeSeaFailed({
        exitCode: 17,
        diagnostics: [
          { channel: "stdout", text: "partial output", truncated: true },
          { channel: "stderr", text: "node failure", truncated: false },
        ],
      }),
    );
    expect(mapped).toMatchObject({
      _tag: "ToolFailed",
      tool: "node-sea",
      exitCode: 17,
      diagnostics: [
        { channel: "stdout", text: "partial output", truncated: true },
        { channel: "stderr", text: "node failure", truncated: false },
      ],
    });
  });

  it("keeps esbuild truncation and preparation path/operation evidence truthful", () => {
    const esbuild = executionFailed(
      new EsbuildFailed({
        diagnostics: [{ id: "build", text: "bounded diagnostic" }],
        truncated: true,
      }),
    );
    expect(esbuild.diagnostics).toEqual([{
      channel: "stderr",
      text: 'EsbuildFailed: [{"id":"build","text":"bounded diagnostic"}]',
      truncated: true,
    }]);

    const preparation = executionFailed(
      new NodeSeaPreparationFailed({
        path: "/tmp/sea-config.json",
        operation: "write-config",
        reason: "controlled failure",
      }),
    );
    expect(preparation.diagnostics).toEqual([{
      channel: "stderr",
      text: "NodeSeaPreparationFailed (write-config /tmp/sea-config.json): controlled failure",
      truncated: false,
    }]);
  });
});

describe("internal Node SEA candidate producer", () => {
  it("writes the core-owned candidate with exact ESM config, assets, and frozen stages", async () => {
    const root = makeRoot();
    const context = await Effect.runPromise(harness(root));
    const canonicalNodePath = realpathSync(context.nodePath);
    const asset = join(root, "asset.txt");
    writeFileSync(asset, "asset-value");
    const outfile = join(root, "dist", "app");
    let bundlePath = "";
    const stagedOutfile = `${outfile}.candidate`;
    mkdirSync(dirname(stagedOutfile), { recursive: true });
    const stages: NodeSeaStages = await Effect.runPromise(
      withMain(context, {}, (main) => {
        bundlePath = main.path;
        return context.service.produceCandidate({
          main,
          stagedOutfile,
          resolvedDestination: outfile,
          cwd: root,
          assets: [{ key: "message", path: "asset.txt" }],
        });
      }),
    );
    expect(context.runtime.buildCount()).toBe(1);
    expect(context.runtime.events[2]).toMatchObject({
      executable: canonicalNodePath,
      argv: ["--build-sea", context.runtime.configPaths[0]],
      cwd: root,
    });
    expect(context.runtime.configs[0]).toEqual({
      main: bundlePath,
      mainFormat: "module",
      executable: canonicalNodePath,
      output: stagedOutfile,
      useSnapshot: false,
      useCodeCache: false,
      assets: { message: asset },
    });
    expect(stages).toEqual([
      { operation: "bundle", tool: { name: "esbuild", version: "0.28.2" } },
      { operation: "assemble-node-sea", tool: { name: "node", version: "26.7.0", path: canonicalNodePath } },
    ]);
    expect(Object.isFrozen(stages)).toBe(true);
    expect(existsSync(stagedOutfile)).toBe(true);
    expect(existsSync(outfile)).toBe(false);
    expect(existsSync(bundlePath)).toBe(false);
    expect(existsSync(context.runtime.configPaths[0]!)).toBe(false);
  });

  it("derives CommonJS and omits empty assets", async () => {
    const root = makeRoot();
    const context = await Effect.runPromise(harness(root));
    const stages: NodeSeaStages = await Effect.runPromise(
      withMain(
        context,
        { format: "cjs", externalImports: ["fs", "path"] },
        (main) => context.service.produceCandidate(candidateInput(main, join(root, "app"))),
      ),
    );
    expect(context.runtime.configs[0]).toMatchObject({ mainFormat: "commonjs" });
    expect(context.runtime.configs[0]).not.toHaveProperty("assets");
    expect(stages.map((stage) => stage.operation)).toEqual(["bundle", "assemble-node-sea"]);
  });

  it("rejects malformed exact inputs and asset shapes before candidate/config/spawn", async () => {
    const root = makeRoot();
    const context = await Effect.runPromise(harness(root));
    const longKey = "😀".repeat(257);
    const tooManyAssets = Array.from({ length: 257 }, (_, index) => ({ key: `key-${index}`, path: "missing" }));
    const validShape = (main: JavaScriptBundleArtifact) => ({
      main,
      stagedOutfile: join(root, "candidate"),
      resolvedDestination: join(root, "app"),
    });
    const cases = [
      (main: JavaScriptBundleArtifact) => ({ ...validShape(main), unknown: true }),
      (main: JavaScriptBundleArtifact) => ({ main }),
      (main: JavaScriptBundleArtifact) => ({ ...validShape(main), stagedOutfile: "" }),
      (main: JavaScriptBundleArtifact) => ({ ...validShape(main), resolvedDestination: "bad\0path" }),
      (main: JavaScriptBundleArtifact) => ({ ...validShape(main), cwd: "" }),
      (main: JavaScriptBundleArtifact) => ({ ...validShape(main), digest: "yes" }),
      (main: JavaScriptBundleArtifact) => ({ ...validShape(main), assets: {} }),
      (main: JavaScriptBundleArtifact) => ({ ...validShape(main), assets: tooManyAssets }),
      (main: JavaScriptBundleArtifact) => ({ ...validShape(main), assets: [{ key: "", path: "x" }] }),
      (main: JavaScriptBundleArtifact) => ({
        ...validShape(main),
        assets: [{ key: "a", path: "x", extra: true }],
      }),
      (main: JavaScriptBundleArtifact) => ({
        ...validShape(main),
        assets: [{ key: "a", path: "x" }, { key: "a", path: "y" }],
      }),
      (main: JavaScriptBundleArtifact) => ({ ...validShape(main), assets: [{ key: longKey, path: "x" }] }),
    ];
    for (const makeInput of cases) {
      const exit = await Effect.runPromise(Effect.exit(
        withMain(
          context,
          {},
          (main) => context.service.produceCandidate(makeInput(main) as unknown as NodeSeaCandidateInput),
        ),
      ));
      expect(failureOf(exit)).toMatchObject({ _tag: "InvalidNodeSeaInput" });
    }
    expect(context.runtime.buildCount()).toBe(0);
    expect(readdirSync(root).filter((name) => name.startsWith(".effect-build-"))).toEqual([]);
  });

  it("requires a live artifact and rejects non-builtin external imports before spawn", async () => {
    const root = makeRoot();
    const context = await Effect.runPromise(harness(root));
    let stale: JavaScriptBundleArtifact | undefined;
    await Effect.runPromise(withMain(context, {}, (main) => Effect.sync(() => void (stale = main))));
    const staleExit = await Effect.runPromise(Effect.exit(
      context.service.produceCandidate(candidateInput(stale!, join(root, "stale"))),
    ));
    expect(failureOf(staleExit)).toMatchObject({ _tag: "InvalidNodeSeaInput", reason: "main-artifact-not-live" });
    const forgedExit = await Effect.runPromise(Effect.exit(
      context.service.produceCandidate(candidateInput(
        { ...stale!, path: join(root, "forged") },
        join(root, "forged-out"),
      )),
    ));
    expect(failureOf(forgedExit)).toMatchObject({ _tag: "InvalidNodeSeaInput", reason: "main-artifact-not-live" });
    const externalExit = await Effect.runPromise(Effect.exit(
      withMain(
        context,
        { externalImports: ["node:not-real"] },
        (main) => context.service.produceCandidate(candidateInput(main, join(root, "external"))),
      ),
    ));
    expect(failureOf(externalExit)).toMatchObject({
      _tag: "InvalidNodeSeaInput",
      reason: "external-import-not-builtin:node:not-real",
    });
    expect(context.runtime.buildCount()).toBe(0);
  });

  it("rejects missing/non-file assets, invalid cwd, aliases, and bundle-scope destinations before spawn", async () => {
    const root = makeRoot();
    const context = await Effect.runPromise(harness(root));
    const asset = join(root, "asset.txt");
    writeFileSync(asset, "asset");
    const assetDirectory = join(root, "asset-dir");
    mkdirSync(assetDirectory);
    const notDirectory = join(root, "not-directory");
    writeFileSync(notDirectory, "x");
    const cases: Array<(main: JavaScriptBundleArtifact) => NodeSeaCandidateInput> = [
      (main) =>
        candidateInput(main, join(root, "missing-asset"), { assets: [{ key: "x", path: join(root, "missing") }] }),
      (main) => candidateInput(main, join(root, "directory-asset"), { assets: [{ key: "x", path: assetDirectory }] }),
      (main) => candidateInput(main, join(root, "bad-cwd"), { cwd: notDirectory }),
      (main) => candidateInput(main, main.path),
      (main) => candidateInput(main, context.nodePath),
      (main) => candidateInput(main, asset, { assets: [{ key: "x", path: asset }] }),
      (main) => candidateInput(main, join(dirname(main.path), "published-inside-scope")),
    ];
    for (const makeInput of cases) {
      const exit = await Effect.runPromise(Effect.exit(
        withMain(context, {}, (main) => context.service.produceCandidate(makeInput(main))),
      ));
      expect(failureOf(exit)).toMatchObject({
        _tag: expect.stringMatching(/InvalidNodeSeaInput|NodeSeaPreparationFailed/),
      });
    }
    expect(context.runtime.buildCount()).toBe(0);
  });

  it("rejects a destination reached through a symlinked parent into the bundle scope", async () => {
    const root = makeRoot();
    const context = await Effect.runPromise(harness(root));
    const exit = await Effect.runPromise(Effect.exit(
      withMain(context, {}, (main) =>
        Effect.gen(function*() {
          const link = join(root, "bundle-link");
          symlinkSync(dirname(main.path), link, "dir");
          return yield* context.service.produceCandidate(candidateInput(main, join(link, "app")));
        })),
    ));
    expect(failureOf(exit)).toMatchObject({
      _tag: "InvalidNodeSeaInput",
      reason: "destination-inside-bundle-scope",
    });
    expect(context.runtime.buildCount()).toBe(0);
  });

  it("maps spawn and nonzero process failures while leaving candidate validation to core", async () => {
    const cases = [
      [{ spawnFailure: true }, "NodeSeaSpawnFailed"],
      [{ buildCompletion: completion(17, "partial out", "node failure", true) }, "NodeSeaFailed"],
    ] as const;
    for (const [runtimeOptions, tag] of cases) {
      const root = makeRoot();
      const destination = join(root, "app");
      writeFileSync(destination, "old");
      const context = await Effect.runPromise(harness(root, runtimeOptions));
      const exit = await Effect.runPromise(Effect.exit(
        withMain(context, {}, (main) => context.service.produceCandidate(candidateInput(main, destination))),
      ));
      expect(failureOf(exit)).toMatchObject({ _tag: tag });
      if (tag === "NodeSeaFailed") {
        expect(failureOf(exit)).toMatchObject({
          exitCode: 17,
          diagnostics: [
            { channel: "stdout", text: "partial out", truncated: true },
            { channel: "stderr", text: "node failure", truncated: true },
          ],
        });
      }
      expect(readFileSync(destination, "utf8")).toBe("old");
    }

    const root = makeRoot();
    const context = await Effect.runPromise(harness(root, { output: "missing" }));
    const stages = await Effect.runPromise(
      withMain(context, {}, (main) => context.service.produceCandidate(candidateInput(main, join(root, "app")))),
    );
    expect(stages.map((stage) => stage.operation)).toEqual(["bundle", "assemble-node-sea"]);
  });

  it("maps config allocation/write failures and never invokes publication rename", async () => {
    const configCases = ["make-config", "write-config"] as const;
    for (const operation of configCases) {
      const root = makeRoot();
      const destination = join(root, "app");
      writeFileSync(destination, "old");
      const context = await Effect.runPromise(harness(root, {}, (fileSystem) => ({
        ...fileSystem,
        makeTempDirectoryScoped: (options) =>
          operation === "make-config" && options?.prefix === "effect-build-node-sea-"
            ? Effect.fail(platformFailure())
            : fileSystem.makeTempDirectoryScoped(options),
        writeFileString: (file, contents, options) =>
          operation === "write-config" && file.endsWith("sea-config.json")
            ? Effect.fail(platformFailure())
            : fileSystem.writeFileString(file, contents, options),
      })));
      const exit = await Effect.runPromise(Effect.exit(
        withMain(context, {}, (main) => context.service.produceCandidate(candidateInput(main, destination))),
      ));
      expect(failureOf(exit)).toMatchObject({ _tag: "NodeSeaPreparationFailed", operation });
      expect(readFileSync(destination, "utf8")).toBe("old");
      expect(context.runtime.buildCount()).toBe(0);
    }

    const root = makeRoot();
    const destination = join(root, "app");
    writeFileSync(destination, "old");
    let renames = 0;
    const context = await Effect.runPromise(harness(root, {}, (fileSystem) => ({
      ...fileSystem,
      rename: () => {
        renames += 1;
        return Effect.fail(platformFailure());
      },
    })));
    await Effect.runPromise(
      withMain(context, {}, (main) => context.service.produceCandidate(candidateInput(main, destination))),
    );
    expect(renames).toBe(0);
    expect(readFileSync(destination, "utf8")).toBe("old");
  });

  it("keeps interruption as interruption and removes config/candidate/bundle state", async () => {
    const root = makeRoot();
    const destination = join(root, "app");
    writeFileSync(destination, "old");
    let started = false;
    let retainedBundlePath = "";
    const context = await Effect.runPromise(harness(root, {
      buildEffect: Effect.sync(() => void (started = true)).pipe(Effect.andThen(Effect.never)),
    }));
    const program = withMain(context, {}, (main) => {
      retainedBundlePath = main.path;
      return context.service.produceCandidate(candidateInput(main, destination));
    });
    const fiber = Effect.runFork(program);
    for (let index = 0; index < 200 && !started; index++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(started).toBe(true);
    await Effect.runPromise(Fiber.interrupt(fiber));
    const exit = await Effect.runPromise(Fiber.await(fiber));
    expect(Exit.isFailure(exit) && Cause.interruptors(exit.cause).size > 0).toBe(true);
    expect(readFileSync(destination, "utf8")).toBe("old");
    expect(existsSync(retainedBundlePath)).toBe(false);
    expect(readdirSync(root).filter((name) => name.startsWith(".effect-build-"))).toEqual([]);
  });

  it("exposes only the package-private candidate accessor", async () => {
    const typeOnly = (
      _stages: NodeSeaStages,
      _effect: Effect.Effect<NodeSeaStages, unknown>,
    ): void => undefined;
    void typeOnly;
    const root = makeRoot();
    const context = await Effect.runPromise(harness(root));
    const result = await Effect.runPromise(
      withMain(context, {}, (main) => context.service.produceCandidate(candidateInput(main, join(root, "app")))),
    );
    expect(result.map((stage) => stage.operation)).toEqual(["bundle", "assemble-node-sea"]);
  });
});
