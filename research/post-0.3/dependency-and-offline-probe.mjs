import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { conclusion, infrastructure } from "./receipt.mjs";
import { repository, requiredPath } from "./probe-runtime.mjs";

const execFileAsync = promisify(execFile);
const run = async (executable, argv, options = {}) => {
  try {
    const result = await execFileAsync(executable, [...argv], {
      cwd: options.cwd,
      env: { ...process.env, LC_ALL: "C", ...options.env },
      maxBuffer: 64 * 1024 * 1024,
      timeout: options.timeout ?? 600_000,
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

const locate = async (name) => {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!isAbsolute(directory)) continue;
    const candidate = join(directory, process.platform === "win32" ? `${name}.cmd` : name);
    const result = await run(candidate, ["--version"], { timeout: 30_000 });
    if (result.ok) return candidate;
  }
  throw new Error(`${name} is unavailable on absolute PATH entries`);
};

const walk = async (root) => {
  const values = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) values.push(path);
    }
  };
  try {
    await visit(root);
  } catch {
    return [];
  }
  return values.sort();
};

const npm = await locate("npm");
const root = await mkdtemp(join(tmpdir(), "effect-build-dependency-research-"));

const packWorkspace = async (bun, path, destination) => {
  const directory = resolve(repository, path);
  const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  const result = await run(bun, ["pm", "pack", "--destination", destination, "--ignore-scripts", "--quiet"], {
    cwd: directory,
  });
  infrastructure(result.ok, `bun pm pack ${path} failed: ${result.stderr || result.message}`);
  const tarball = join(destination, `${manifest.name}-${manifest.version}.tgz`);
  const metadata = await stat(tarball).catch(() => undefined);
  infrastructure(metadata?.isFile() === true, `bun pm pack ${path} emitted no exact tarball`);
  return tarball;
};

const esbuildOwnership = async (bun) => {
  const manifest = JSON.parse(await readFile(
    join(repository, "packages/effect-build-esbuild/package.json"),
    "utf8",
  ));
  conclusion(manifest.dependencies?.esbuild === "0.28.2", "Esbuild provider no longer owns exact esbuild 0.28.2");
  conclusion(manifest.peerDependencies?.esbuild === undefined, "Esbuild unexpectedly became a peer dependency");
  const tarballs = join(root, "tarballs");
  await mkdir(tarballs, { recursive: true });
  const coreTarball = await packWorkspace(bun, "./packages/effect-build", tarballs);
  const providerTarball = await packWorkspace(bun, "./packages/effect-build-esbuild", tarballs);
  const consumer = join(root, "esbuild-consumer");
  await mkdir(consumer, { recursive: true });
  await writeFile(join(consumer, "package.json"), `${JSON.stringify({
    private: true,
    type: "module",
    dependencies: {
      "effect-build": `file:${coreTarball}`,
      "effect-build-esbuild": `file:${providerTarball}`,
      effect: "4.0.0-rc.108",
      esbuild: "0.28.1",
    },
  }, null, 2)}\n`);
  await writeFile(join(consumer, "inspect.mjs"), `import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { readFile } from "node:fs/promises";
const consumerRequire = createRequire(import.meta.url);
const providerEntry = import.meta.resolve("effect-build-esbuild");
const providerRequire = createRequire(providerEntry);
const topLevel = JSON.parse(await readFile(consumerRequire.resolve("esbuild/package.json"), "utf8"));
const providerOwned = JSON.parse(await readFile(providerRequire.resolve("esbuild/package.json"), "utf8"));
console.log(JSON.stringify({ topLevel: topLevel.version, providerOwned: providerOwned.version, providerEntry }));
`);
  const installed = await run(npm, ["install", "--no-audit", "--no-fund"], { cwd: consumer });
  infrastructure(installed.ok, `Esbuild ownership consumer install failed: ${installed.stderr || installed.message}`);
  const inspected = await run(process.execPath, ["inspect.mjs"], { cwd: consumer });
  infrastructure(inspected.ok, `Esbuild ownership inspection failed: ${inspected.stderr || inspected.message}`);
  const observation = JSON.parse(inspected.stdout.trim());
  conclusion(observation.topLevel === "0.28.1", "consumer Esbuild control version changed");
  conclusion(observation.providerOwned === "0.28.2", "provider did not resolve its exact owned Esbuild version");
  conclusion(observation.topLevel !== observation.providerOwned, "provider silently used consumer Esbuild dependency");
  return {
    decision: "exact-provider-dependency",
    manifest: {
      dependency: manifest.dependencies.esbuild,
      peer: manifest.peerDependencies?.esbuild,
    },
    packed: {
      core: basename(coreTarball),
      provider: basename(providerTarball),
    },
    consumer: observation,
  };
};

const bundleArgs = (outdir, entry) => ["bundle", "--outdir", outdir, entry];
const networkBlocked = {
  ALL_PROXY: "http://127.0.0.1:1",
  HTTP_PROXY: "http://127.0.0.1:1",
  HTTPS_PROXY: "http://127.0.0.1:1",
  NO_PROXY: "",
  all_proxy: "http://127.0.0.1:1",
  http_proxy: "http://127.0.0.1:1",
  https_proxy: "http://127.0.0.1:1",
  no_proxy: "",
};

const denoOfflineBoundary = async (deno, label) => {
  const fixture = join(root, `deno-${label}`);
  const source = join(fixture, "source");
  await mkdir(source, { recursive: true });
  await writeFile(join(source, "main.ts"), 'export const value = "offline";\n');
  const emptyCache = join(fixture, "empty-cache");
  const emptyOut = join(fixture, "empty-out");
  await mkdir(emptyOut, { recursive: true });
  const empty = await run(deno, bundleArgs(emptyOut, "main.ts"), {
    cwd: source,
    env: { DENO_DIR: emptyCache, ...networkBlocked },
  });
  conclusion(empty.ok === false, `Deno ${label} unexpectedly bundled through a network-blocked empty cache`);
  conclusion((await walk(emptyOut)).length === 0, `Deno ${label} network-blocked empty-cache failure mutated output`);

  const populatedCache = join(fixture, "populated-cache");
  const onlineOut = join(fixture, "online-out");
  await mkdir(onlineOut, { recursive: true });
  const online = await run(deno, ["bundle", "--outdir", onlineOut, "main.ts"], {
    cwd: source,
    env: { DENO_DIR: populatedCache },
  });
  infrastructure(online.ok, `Deno ${label} online bundle failed: ${online.stderr || online.message}`);
  const cacheFiles = await walk(populatedCache);
  const esbuildPaths = cacheFiles
    .map((path) => path.toLowerCase())
    .filter((path) => path.includes("esbuild"));
  conclusion(esbuildPaths.length > 0, `Deno ${label} populated no provider-managed Esbuild cache entries`);

  const offlineOut = join(fixture, "offline-out");
  await mkdir(offlineOut, { recursive: true });
  const offline = await run(deno, bundleArgs(offlineOut, "main.ts"), {
    cwd: source,
    env: { DENO_DIR: populatedCache, ...networkBlocked },
  });
  conclusion(offline.ok, `Deno ${label} network-blocked bundle failed after managed acquisition: ${offline.stderr || offline.message}`);
  conclusion((await walk(offlineOut)).some((path) => /\.(?:m?js|cjs)$/.test(path)), `Deno ${label} network-blocked bundle emitted no JavaScript`);
  return {
    version: label,
    offlineControl: "unreachable-loopback-proxy",
    emptyCache: {
      failed: true,
      exitCode: empty.code,
      stderr: empty.stderr.slice(0, 4096),
      outputFiles: [],
    },
    acquisition: {
      onlineSucceeded: true,
      esbuildCacheEntries: esbuildPaths.map((path) => path.slice(populatedCache.length)),
    },
    offlineAfterAcquisition: {
      succeeded: true,
      outputFiles: (await walk(offlineOut)).map((path) => path.slice(offlineOut.length + 1)),
    },
  };
};

export let dependencyAndOfflineResult;
try {
  const currentBun = await requiredPath("EFFECT_BUILD_BUN_CURRENT_BIN");
  const selectedDeno = await requiredPath("EFFECT_BUILD_DENO_BIN");
  const currentDeno = await requiredPath("EFFECT_BUILD_DENO_CURRENT_BIN");
  dependencyAndOfflineResult = {
    esbuild: await esbuildOwnership(currentBun),
    deno: [
      await denoOfflineBoundary(selectedDeno, "2.9.3"),
      await denoOfflineBoundary(currentDeno, "2.9.5"),
    ],
  };
} finally {
  await rm(root, { recursive: true, force: true });
}
