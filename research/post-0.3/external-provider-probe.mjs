import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import * as esbuild from "esbuild";

const execFileAsync = promisify(execFile);
const externalRoot = process.env.RESEARCH_EXTERNAL_NODE_MODULES;
const nodeSea = process.env.EFFECT_BUILD_NODE_SEA_BIN;
if (externalRoot === undefined || nodeSea === undefined) {
  throw new Error("RESEARCH_EXTERNAL_NODE_MODULES and EFFECT_BUILD_NODE_SEA_BIN are required");
}

const run = async (executable, argv, options = {}) => {
  try {
    const result = await execFileAsync(executable, [...argv], {
      cwd: options.cwd,
      env: { ...process.env, LC_ALL: "C", ...options.env },
      maxBuffer: 16 * 1024 * 1024,
      timeout: options.timeout ?? 180_000,
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (error) {
    return {
      ok: false,
      stdout: typeof error.stdout === "string" ? error.stdout : "",
      stderr: typeof error.stderr === "string" ? error.stderr : "",
      code: typeof error.code === "number" ? error.code : null,
      message: error instanceof Error ? error.message : String(error),
    };
  }
};

const chunkCode = (result) => {
  const output = result.output ?? result;
  const entries = Array.isArray(output) ? output : output.output;
  const chunk = Array.isArray(entries)
    ? entries.find((entry) => entry.type === "chunk" || typeof entry.code === "string")
    : undefined;
  return typeof chunk?.code === "string" ? chunk.code : "";
};

const root = await mkdtemp(join(tmpdir(), "effect-build-external-research-"));
const receipt = {};
try {
  const entrypoint = join(root, "incremental.ts");
  await writeFile(entrypoint, 'console.log("incremental-v1")\n');

  const esbuildContext = await esbuild.context({ entryPoints: [entrypoint], bundle: true, write: false, format: "esm" });
  const esbuildFirst = await esbuildContext.rebuild();
  await writeFile(entrypoint, 'console.log("incremental-v2")\n');
  const esbuildSecond = await esbuildContext.rebuild();
  await esbuildContext.cancel();
  await esbuildContext.dispose();
  receipt.esbuildIncremental = {
    firstContainsV1: esbuildFirst.outputFiles?.some((file) => file.text.includes("incremental-v1")) ?? false,
    secondContainsV2: esbuildSecond.outputFiles?.some((file) => file.text.includes("incremental-v2")) ?? false,
    lifecycle: ["context", "rebuild", "rebuild", "cancel", "dispose"],
  };

  try {
    const rolldownPath = resolve(externalRoot, "rolldown/dist/index.mjs");
    const rolldownModule = await import(pathToFileURL(rolldownPath).href);
    await writeFile(entrypoint, 'console.log("incremental-v1")\n');
    const build = await rolldownModule.rolldown({ input: entrypoint });
    const first = await build.generate({ format: "esm" });
    await writeFile(entrypoint, 'console.log("incremental-v2")\n');
    const second = await build.generate({ format: "esm" });
    await build.close();
    let afterCloseRejected = false;
    try {
      await build.generate({ format: "esm" });
    } catch {
      afterCloseRejected = true;
    }
    receipt.rolldownIncremental = {
      firstContainsV1: chunkCode(first).includes("incremental-v1"),
      secondContainsV2: chunkCode(second).includes("incremental-v2"),
      afterCloseRejected,
      lifecycle: ["rolldown", "generate", "generate", "close"],
    };
  } catch (error) {
    receipt.rolldownIncremental = { available: false, error: error instanceof Error ? error.message : String(error) };
  }

  const main = join(root, "main.cjs");
  await writeFile(main, 'console.log(JSON.stringify({ runtime: "node", value: "single-main" }));\n');
  const seaOutput = join(root, "node-sea-output");
  const seaConfig = join(root, "sea-config.json");
  await writeFile(seaConfig, JSON.stringify({
    main,
    mainFormat: "commonjs",
    output: seaOutput,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
  }));
  const directSea = await run(nodeSea, ["--build-sea", seaConfig]);
  if (!directSea.ok) throw new Error(`direct Node SEA failed: ${directSea.stderr || directSea.message}`);
  const directRun = await run(seaOutput, []);
  if (!directRun.ok) throw new Error(`direct Node SEA output failed: ${directRun.stderr || directRun.message}`);
  receipt.nodeSea = {
    output: JSON.parse(directRun.stdout.trim()),
    bytes: Number((await stat(seaOutput)).size),
  };

  try {
    const pkgPath = resolve(externalRoot, "@yao-pkg/pkg/lib-es5/index.js");
    const pkgModule = await import(pathToFileURL(pkgPath).href);
    const pkgOutput = join(root, "pkg-output");
    await pkgModule.exec({
      input: main,
      output: pkgOutput,
      targets: ["host"],
      sea: true,
      bytecode: false,
      signature: false,
    });
    const pkgRun = await run(pkgOutput, []);
    receipt.pkg = pkgRun.ok
      ? { output: JSON.parse(pkgRun.stdout.trim()), bytes: Number((await stat(pkgOutput)).size) }
      : { available: false, error: pkgRun.stderr || pkgRun.message };
  } catch (error) {
    receipt.pkg = { available: false, error: error instanceof Error ? error.message : String(error) };
  }

  receipt.nodeMainExecutable = {
    nodeSeaConforms: receipt.nodeSea?.output?.value === "single-main",
    pkgConforms: receipt.pkg?.output?.value === "single-main",
    conclusion: receipt.pkg?.output?.value === "single-main"
      ? "two-node-runtime-implementations-conform"
      : "second-implementation-not-established",
  };

  receipt.incrementalNodeMain = {
    esbuildConforms: receipt.esbuildIncremental.firstContainsV1 && receipt.esbuildIncremental.secondContainsV2,
    rolldownConforms: receipt.rolldownIncremental.firstContainsV1 && receipt.rolldownIncremental.secondContainsV2,
    conclusion: receipt.rolldownIncremental.firstContainsV1 && receipt.rolldownIncremental.secondContainsV2
      ? "scoped-incremental-main-role-supported"
      : "second-implementation-not-established",
  };

  console.log(`EFFECT_BUILD_EXTERNAL_RESEARCH_RECEIPT=${JSON.stringify(receipt)}`);
} finally {
  await rm(root, { recursive: true, force: true });
}
