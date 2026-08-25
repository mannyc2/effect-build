import { NodeServices } from "@effect/platform-node";
import { Cause, Deferred, Effect, Exit, Fiber } from "effect";
import type * as Artifact from "effect-build/Artifact";
import { execFile, execFileSync } from "node:child_process";
import { access, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Build from "../../packages/effect-build-bun/src/Command/Build.js";
import * as Watch from "../../packages/effect-build-bun/src/Command/Watch.js";
import * as Runtime from "../../packages/effect-build-bun/src/internal/Runtime.js";
import { observeProviderNativeEvidence } from "../evidence/provider-native.js";

const execute = promisify(execFile);
const bundledBun = "/Users/cjpher/.codex/toolchains/bun-1.3.14-arm64/bun-darwin-aarch64/bun";
const selectedBun = process.env.EFFECT_BUILD_BUN ?? bundledBun;
const entrypoint = fileURLToPath(new URL("../fixtures/app/hello.ts", import.meta.url));
const findings = fileURLToPath(new URL("../fixtures/bun-positive-findings/", import.meta.url));

const exactBunAvailable = (): boolean => {
  try {
    return execFileSync(selectedBun, ["--version"], { encoding: "utf8" }).trim() === "1.3.14";
  } catch {
    return false;
  }
};

const waitForText = async (path: string, expected: string): Promise<string> => {
  const deadline = Date.now() + 10_000;
  while (true) {
    const text = await readFile(path, "utf8").catch(() => undefined);
    if (text?.includes(expected) === true) return text;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${path}`);
    await new Promise((resolveTick) => setTimeout(resolveTick, 10));
  }
};

let root = "";
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-bun-api-real-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const run = <A, E>(effect: Effect.Effect<A, E, Runtime.Runtime>) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(Runtime.layer({ executable: selectedBun as Artifact.AbsolutePath })),
      Effect.provide(NodeServices.layer),
    ) as Effect.Effect<A, E>,
  );

describe.skipIf(!exactBunAvailable())("real Bun 1.3.14 provider breadth", () => {
  it("executes command stdout and provider-direct directory build without synthetic output", async () => {
    const stdout = await run(Build.build({ entrypoint, target: "bun" }));
    expect(new TextDecoder().decode(stdout.output)).toContain("effect-build-ok");
    expect(stdout.tool.participants[0]).toMatchObject({ name: "bun", version: "1.3.14" });

    const outdir = join(root, "command-direct");
    const direct = await run(Build.buildToDirectory({ entrypoints: [entrypoint], outdir, target: "bun" }));
    expect(direct.publication).toBe("provider-direct-durable");
    await access(join(outdir, "hello.js"));
    await observeProviderNativeEvidence("CAN-BUN-008", "CAN-BUN-009");
  }, 120_000);

  it("starts a real command watch, publishes its initial build, and terminates it on scope interruption", async () => {
    const outdir = join(root, "command-watch");
    const output = join(outdir, "hello.js");
    const result = await run(
      Effect.gen(function*() {
        const acquired = yield* Deferred.make<Watch.Watch>();
        const watchFiber = yield* Effect.gen(function*() {
          const watch = yield* Watch.watch({
            entrypoints: [entrypoint],
            outdir,
            target: "bun",
            noClearScreen: true,
          });
          yield* Deferred.succeed(acquired, watch);
          return yield* Effect.never;
        }).pipe(Effect.scoped, Effect.forkChild);
        const watch = yield* Deferred.await(acquired).pipe(Effect.timeout("10 seconds"));
        const outputText = yield* Effect.promise(() => waitForText(output, "effect-build-ok"));
        const runningBeforeInterruption = yield* watch.process.isRunning;
        yield* Fiber.interrupt(watchFiber).pipe(Effect.timeout("10 seconds"));
        const watchExit = yield* Fiber.await(watchFiber);
        const runningAfterInterruption = yield* watch.process.isRunning;
        return { watch, watchExit, outputText, runningBeforeInterruption, runningAfterInterruption };
      }),
    );

    expect(result.watch).toMatchObject({
      _tag: "BuildWatch",
      outdir,
      publication: "provider-direct-durable",
      tool: { participants: [{ name: "bun", version: "1.3.14" }] },
    });
    expect(result.outputText).toContain("effect-build-ok");
    expect(result.runningBeforeInterruption).toBe(true);
    expect(result.runningAfterInterruption).toBe(false);
    expect(Exit.isFailure(result.watchExit)).toBe(true);
    if (Exit.isFailure(result.watchExit)) {
      expect(Cause.hasInterrupts(result.watchExit.cause)).toBe(true);
    }
    await observeProviderNativeEvidence("CAN-BUN-010");
  }, 120_000);

  it("executes native Transpiler, Build memory/direct, and host compile APIs in the exact Bun host", async () => {
    const apiOutdir = join(root, "api-direct");
    const apiExecutable = join(root, "api-executable");
    const script = String.raw`
      import { Effect } from "effect";
      import * as Transpiler from "./packages/effect-build-bun/src/Api/Transpiler.ts";
      import * as Build from "./packages/effect-build-bun/src/Api/Build.ts";
      import * as Compile from "./packages/effect-build-bun/src/Api/CompileExecutable.ts";
      const transpiler = await Effect.runPromise(Transpiler.make({ loader: "ts" }).pipe(Effect.provide(Transpiler.layer)));
      const transformed = await Effect.runPromise(Transpiler.transform(transpiler, "const value: number = 1"));
      const transformedSync = await Effect.runPromise(Transpiler.transformSync(transpiler, "const other: number = 2"));
      const scan = await Effect.runPromise(Transpiler.scan(transpiler, 'import value from "value"; export { value }'));
      const imports = await Effect.runPromise(Transpiler.scanImports(transpiler, 'import value from "value"'));
      const memory = await Effect.runPromise(Build.build({ entrypoints: [process.env.API_ENTRY] }).pipe(Effect.provide(Build.layer)));
      const direct = await Effect.runPromise(Build.buildToDirectory({ entrypoints: [process.env.API_ENTRY], outdir: process.env.API_OUTDIR }).pipe(Effect.provide(Build.layer)));
      const compiled = await Effect.runPromise(Compile.compileExecutableDirect({ entrypoints: [process.env.API_ENTRY], compile: { outfile: process.env.API_EXECUTABLE } }).pipe(Effect.provide(Compile.layer)));
      console.log(JSON.stringify({ version: Bun.version, transformed, transformedSync, scanImports: scan.imports.length, imports: imports.length, memory: memory.outputs.length, direct: direct.outputs.length, compiled: compiled.outputs.length }));
    `;
    const completion = await execute(selectedBun, ["-e", script], {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      env: {
        ...process.env,
        API_ENTRY: entrypoint,
        API_OUTDIR: apiOutdir,
        API_EXECUTABLE: apiExecutable,
      },
      maxBuffer: 10 * 1024 * 1024,
    });
    const receipt = JSON.parse(completion.stdout.trim()) as {
      readonly version: string;
      readonly transformed: string;
      readonly transformedSync: string;
      readonly scanImports: number;
      readonly imports: number;
      readonly memory: number;
      readonly direct: number;
      readonly compiled: number;
    };
    expect(receipt).toMatchObject({
      version: "1.3.14",
      scanImports: 1,
      imports: 1,
      memory: 1,
      direct: 1,
      compiled: 1,
    });
    expect(receipt.transformed).toContain("const value = 1");
    expect(receipt.transformedSync).toContain("const other = 2");
    await access(join(apiOutdir, "hello.js"));
    await access(apiExecutable);
    await observeProviderNativeEvidence(
      "CAN-BUN-001",
      "CAN-BUN-002",
      "CAN-BUN-003",
      "CAN-BUN-004",
      "CAN-BUN-005",
      "CAN-BUN-006",
      "CAN-BUN-007",
      "CAN-BUN-011",
    );
  }, 120_000);

  it("executes every selected Bun host-API positive finding without normalizing native results", async () => {
    const findingsRoot = join(root, "host-positive-findings");
    const fullStackExecutable = join(findingsRoot, "full-stack-api");
    const script = String.raw`
      import { Effect } from "effect";
      import { join } from "node:path";
      import * as Build from "./packages/effect-build-bun/src/Api/Build.ts";
      import * as Compile from "./packages/effect-build-bun/src/Api/CompileExecutable.ts";

      const fixture = process.env.API_FINDINGS_FIXTURE;
      const root = process.env.API_FINDINGS_ROOT;
      const runBuild = (effect) => Effect.runPromise(effect.pipe(Effect.provide(Build.layer)));
      const runCompile = (effect) => Effect.runPromise(effect.pipe(Effect.provide(Compile.layer)));
      const texts = async (output) => (await Promise.all(output.outputs.map((artifact) => artifact.text()))).join("\n");
      const kinds = (output) => [...new Set(output.outputs.map((artifact) => artifact.kind))].sort();
      const isNativeArtifact = (artifact) =>
        Object.prototype.toString.call(artifact) === "[object BuildArtifact]"
        && typeof artifact.size === "number"
        && typeof artifact.type === "string"
        && typeof artifact.text === "function"
        && typeof artifact.arrayBuffer === "function"
        && typeof artifact.stream === "function"
        && typeof artifact.slice === "function"
        && typeof artifact.path === "string"
        && typeof artifact.loader === "string"
        && (artifact.hash === null || typeof artifact.hash === "string")
        && typeof artifact.kind === "string";

      const virtualEntry = join(root, "virtual", "index.ts");
      const virtualHelper = join(root, "virtual", "helper.ts");
      const virtualNote = join(root, "virtual", "message.note");
      const virtualMemory = await runBuild(Build.build({
        entrypoints: [virtualEntry],
        files: {
          [virtualEntry]: 'import helper from "./helper.ts"; import note from "./message.note"; console.log(helper + ":" + note.trim());',
          [virtualHelper]: 'export default "virtual-graph-ok";',
          [virtualNote]: "virtual-loader-ok",
        },
        loader: { ".note": "text" },
        target: "bun",
      }));

      const mixedGenerated = join(fixture, "generated.ts");
      const mixedDirect = await runBuild(Build.buildToDirectory({
        entrypoints: [join(fixture, "mixed-entry.ts")],
        files: { [mixedGenerated]: 'export default "mixed-virtual-ok";' },
        loader: { ".note": "text" },
        target: "bun",
        outdir: join(root, "mixed-direct"),
      }));

      const pluginEvents = [];
      const plugin = {
        name: "effect-build-per-build-callbacks",
        setup(builder) {
          pluginEvents.push("setup");
          builder.onStart(() => pluginEvents.push("start"));
          builder.onResolve({ filter: /^virtual:message$/ }, () => {
            pluginEvents.push("resolve");
            return { path: "message", namespace: "effect-build" };
          });
          builder.onLoad({ filter: /.*/, namespace: "effect-build" }, () => {
            pluginEvents.push("load");
            return { contents: 'export const message = "plugin-callback-ok";', loader: "js" };
          });
          builder.onEnd((result) => pluginEvents.push("end:" + result.success));
        },
      };
      const pluginEntry = join(fixture, "plugin-entry.ts");
      const pluginMemory = await runBuild(Build.build({ entrypoints: [pluginEntry], plugins: [plugin], target: "bun" }));
      const pluginDirect = await runBuild(Build.buildToDirectory({
        entrypoints: [pluginEntry],
        plugins: [plugin],
        target: "bun",
        outdir: join(root, "plugin-direct"),
      }));
      const pluginCountsBeforeMissingBuild = Object.fromEntries(
        ["setup", "start", "resolve", "load", "end:true"].map((name) => [name, pluginEvents.filter((event) => event === name).length]),
      );
      const pluginMissing = await runBuild(Build.build({ entrypoints: [pluginEntry], target: "bun", throw: false }));

      const htmlEntry = join(fixture, "html", "index.html");
      const htmlMemory = await runBuild(Build.build({ entrypoints: [htmlEntry], target: "browser", splitting: true }));
      const htmlDirect = await runBuild(Build.buildToDirectory({
        entrypoints: [htmlEntry],
        target: "browser",
        splitting: true,
        metafile: true,
        outdir: join(root, "html-direct"),
      }));
      const htmlArtifact = htmlMemory.outputs.find((artifact) => artifact.type.startsWith("text/html"));

      const topologyEntrypoints = [
        join(fixture, "topology", "entry-a.ts"),
        join(fixture, "topology", "entry-b.ts"),
      ];
      const topologyOptions = {
        entrypoints: topologyEntrypoints,
        target: "browser",
        splitting: true,
        loader: { ".asset": "file" },
        naming: {
          entry: "entries/[name]-[hash].[ext]",
          chunk: "chunks/[name]-[hash].[ext]",
          asset: "assets/[name]-[hash].[ext]",
        },
        metafile: true,
      };
      const topologyMemory = await runBuild(Build.build({ ...topologyOptions, sourcemap: "external" }));
      const retainedArtifact = topologyMemory.outputs.find((artifact) => artifact.kind === "chunk") ?? topologyMemory.outputs[0];
      const retainedBefore = retainedArtifact === undefined ? undefined : new Uint8Array(await retainedArtifact.arrayBuffer());
      const topologyDirect = await runBuild(Build.buildToDirectory({
        ...topologyOptions,
        sourcemap: "linked",
        outdir: join(root, "topology-direct"),
      }));
      const retainedAfter = retainedArtifact === undefined ? undefined : new Uint8Array(await retainedArtifact.arrayBuffer());
      const metafileOutputs = Object.values(topologyMemory.metafile?.outputs ?? {});

      const compiled = await runCompile(Compile.compileExecutableDirect({
        entrypoints: [join(fixture, "fullstack", "server.ts")],
        compile: { outfile: process.env.API_FULL_STACK_EXECUTABLE },
      }));

      console.log("EFFECT_BUILD_BUN_POSITIVE_FINDINGS=" + JSON.stringify({
        version: Bun.version,
        virtual: {
          success: virtualMemory.success,
          text: await texts(virtualMemory),
          kinds: kinds(virtualMemory),
        },
        mixed: {
          success: mixedDirect.success,
          text: await texts(mixedDirect),
          kinds: kinds(mixedDirect),
        },
        plugins: {
          memorySuccess: pluginMemory.success,
          directSuccess: pluginDirect.success,
          memoryText: await texts(pluginMemory),
          directText: await texts(pluginDirect),
          counts: pluginCountsBeforeMissingBuild,
          missingWithoutPluginSuccess: pluginMissing.success,
          countsUnchangedByMissingBuild: pluginEvents.length === 10,
        },
        html: {
          memorySuccess: htmlMemory.success,
          directSuccess: htmlDirect.success,
          memoryKinds: kinds(htmlMemory),
          directKinds: kinds(htmlDirect),
          memoryText: htmlArtifact === undefined ? "" : await htmlArtifact.text(),
          metafileInputs: Object.keys(htmlDirect.metafile?.inputs ?? {}).length,
        },
        topology: {
          memorySuccess: topologyMemory.success,
          directSuccess: topologyDirect.success,
          memoryKinds: kinds(topologyMemory),
          directKinds: kinds(topologyDirect),
          nativeArtifactShape: topologyMemory.outputs.every((artifact) =>
            isNativeArtifact(artifact)
            && (
              artifact.sourcemap === null
              || isNativeArtifact(artifact.sourcemap)
            )
          ),
          assetHashesPresent: topologyMemory.outputs
            .filter((artifact) => artifact.kind === "asset")
            .every((artifact) => typeof artifact.hash === "string" && artifact.hash.length > 0),
          metafileInputCount: Object.keys(topologyMemory.metafile?.inputs ?? {}).length,
          metafileOutputCount: metafileOutputs.length,
          metafileChunkImportPresent: metafileOutputs.some((output) =>
            output.imports.some((item) => item.path.includes("chunk"))
          ),
          retainedArtifactReadableAfterNextBuild: retainedBefore !== undefined
            && retainedAfter !== undefined
            && retainedBefore.length > 0
            && retainedBefore.length === retainedAfter.length
            && retainedBefore.every((byte, index) => byte === retainedAfter[index]),
        },
        fullStack: {
          success: compiled.success,
          kinds: kinds(compiled),
          outputs: compiled.outputs.length,
        },
      }));
    `;
    const completion = await execute(selectedBun, ["-e", script], {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      env: {
        ...process.env,
        API_FINDINGS_FIXTURE: findings,
        API_FINDINGS_ROOT: findingsRoot,
        API_FULL_STACK_EXECUTABLE: fullStackExecutable,
      },
      maxBuffer: 20 * 1024 * 1024,
      timeout: 120_000,
    });
    const receiptLine = completion.stdout.split("\n").find((line) =>
      line.startsWith("EFFECT_BUILD_BUN_POSITIVE_FINDINGS=")
    );
    expect(receiptLine).toBeDefined();
    const receipt = JSON.parse(receiptLine?.slice("EFFECT_BUILD_BUN_POSITIVE_FINDINGS=".length) ?? "null");

    expect(receipt).toMatchObject({
      version: "1.3.14",
      virtual: { success: true },
      mixed: { success: true },
      plugins: {
        memorySuccess: true,
        directSuccess: true,
        counts: { setup: 2, start: 2, resolve: 2, load: 2, "end:true": 2 },
        missingWithoutPluginSuccess: false,
        countsUnchangedByMissingBuild: true,
      },
      html: { memorySuccess: true, directSuccess: true },
      topology: {
        memorySuccess: true,
        directSuccess: true,
        nativeArtifactShape: true,
        assetHashesPresent: true,
        metafileChunkImportPresent: true,
        retainedArtifactReadableAfterNextBuild: true,
      },
      fullStack: { success: true, outputs: 1 },
    });
    expect(receipt.virtual.text).toContain("virtual-graph-ok");
    expect(receipt.virtual.text).toContain("virtual-loader-ok");
    expect(receipt.mixed.text).toContain("mixed-virtual-ok");
    expect(receipt.mixed.text).toContain("loader-text-ok");
    expect(receipt.plugins.memoryText).toContain("plugin-callback-ok");
    expect(receipt.plugins.directText).toContain("plugin-callback-ok");
    expect(receipt.html.memoryKinds).toEqual(expect.arrayContaining(["asset", "entry-point"]));
    expect(receipt.html.memoryText).toContain("html-graph-ok");
    expect(receipt.html.metafileInputs).toBeGreaterThanOrEqual(4);
    expect(receipt.topology.memoryKinds).toEqual(
      expect.arrayContaining(["asset", "chunk", "entry-point", "sourcemap"]),
    );
    expect(receipt.topology.directKinds).toEqual(
      expect.arrayContaining(["asset", "chunk", "entry-point", "sourcemap"]),
    );
    expect(receipt.topology.metafileInputCount).toBeGreaterThanOrEqual(6);
    expect(receipt.topology.metafileOutputCount).toBeGreaterThanOrEqual(6);

    await access(join(findingsRoot, "mixed-direct", "mixed-entry.js"));
    await access(join(findingsRoot, "html-direct", "index.html"));
    await access(fullStackExecutable);
    const fullStackRun = await execute(fullStackExecutable, [], { timeout: 30_000 });
    const fullStackLine = fullStackRun.stdout.split("\n").find((line) =>
      line.startsWith("EFFECT_BUILD_FULL_STACK_RECEIPT=")
    );
    expect(JSON.parse(fullStackLine?.slice("EFFECT_BUILD_FULL_STACK_RECEIPT=".length) ?? "null")).toEqual({
      htmlStatus: 200,
      htmlMarker: true,
      scriptStatus: 200,
      scriptMarker: true,
      styleStatus: 200,
      styleMarker: true,
      apiStatus: 200,
      apiMarker: true,
    });
    await observeProviderNativeEvidence("B02.1", "B06.1", "B06.2", "B07.1", "B08.1", "B08.2");
  }, 180_000);

  it("executes every eligible selected-command loader, HTML, splitting, asset, map, and metafile shape", async () => {
    const loaderEntry = join(findings, "command-loader-entry.ts");
    const stdout = await run(Build.build({
      entrypoint: loaderEntry,
      target: "bun",
      loader: { ".note": "text" },
      sourcemap: "inline",
    }));
    const stdoutText = new TextDecoder().decode(stdout.output);
    expect(stdoutText).toContain("loader-text-ok");
    expect(stdoutText).toContain("sourceMappingURL=data:application/json");

    const topologyOutdir = join(root, "command-positive-topology");
    const metafile = join(root, "command-positive-topology.json");
    const topology = await run(Build.buildToDirectory({
      entrypoints: [
        join(findings, "topology", "entry-a.ts"),
        join(findings, "topology", "entry-b.ts"),
      ],
      outdir: topologyOutdir,
      target: "browser",
      splitting: true,
      sourcemap: "linked",
      loader: { ".asset": "file" },
      naming: {
        entry: "entries/[name]-[hash].[ext]",
        chunk: "chunks/[name]-[hash].[ext]",
        asset: "assets/[name]-[hash].[ext]",
      },
      metafile,
    }));
    expect(topology.publication).toBe("provider-direct-durable");
    const topologyFiles = await readdir(topologyOutdir, { recursive: true });
    expect(topologyFiles.some((path) => path.startsWith("chunks/") && path.endsWith(".js"))).toBe(true);
    expect(topologyFiles.some((path) => path.startsWith("assets/") && path.endsWith(".asset"))).toBe(true);
    expect(topologyFiles.some((path) => path.endsWith(".js.map"))).toBe(true);
    const metadata = JSON.parse(await readFile(metafile, "utf8")) as {
      readonly inputs: Readonly<Record<string, unknown>>;
      readonly outputs: Readonly<
        Record<string, {
          readonly imports: ReadonlyArray<{ readonly path: string }>;
        }>
      >;
    };
    expect(Object.keys(metadata.inputs).length).toBeGreaterThanOrEqual(6);
    expect(Object.keys(metadata.outputs).length).toBeGreaterThanOrEqual(6);
    expect(Object.values(metadata.outputs).some((output) => output.imports.some((item) => item.path.includes("chunk"))))
      .toBe(true);

    const htmlOutdir = join(root, "command-positive-html");
    const html = await run(Build.buildToDirectory({
      entrypoints: [join(findings, "html", "index.html")],
      outdir: htmlOutdir,
      target: "browser",
      splitting: true,
    }));
    expect(html.publication).toBe("provider-direct-durable");
    const htmlFiles = await readdir(htmlOutdir, { recursive: true });
    expect(htmlFiles.some((path) => path.endsWith(".html"))).toBe(true);
    expect(htmlFiles.some((path) => path.endsWith(".js"))).toBe(true);
    expect(htmlFiles.some((path) => path.endsWith(".css"))).toBe(true);
    const htmlOutput = await readFile(join(htmlOutdir, "index.html"), "utf8");
    expect(htmlOutput).toContain("html-graph-ok");
    expect(htmlOutput).toMatch(/<script[^>]+src=["'][^"']+\.js["']/u);
    expect(htmlOutput).toMatch(/<link[^>]+href=["'][^"']+\.css["']/u);
    const cssPath = htmlFiles.find((path) => path.endsWith(".css"));
    expect(cssPath).toBeDefined();
    expect(await readFile(join(htmlOutdir, cssPath ?? "missing.css"), "utf8")).toContain("data:image/svg+xml");
  }, 120_000);
});
