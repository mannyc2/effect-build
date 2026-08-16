import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const requiredPath = (name) => {
  const value = process.env[name];
  if (value === undefined || !isAbsolute(value)) throw new Error(`${name} must be absolute`);
  return value;
};
const run = async (executable, argv, options = {}) => {
  try {
    const result = await execFileAsync(executable, [...argv], {
      cwd: options.cwd,
      env: { ...process.env, LC_ALL: "C" },
      maxBuffer: 16 * 1024 * 1024,
      timeout: 180_000,
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      ok: false,
      stdout: typeof error.stdout === "string" ? error.stdout : "",
      stderr: typeof error.stderr === "string" ? error.stderr : "",
      message: error instanceof Error ? error.message : String(error),
    };
  }
};
const probeBun = async (executable, label, root) => {
  const version = await run(executable, ["--version"]);
  const help = await run(executable, ["build", "--help"]);
  const outdir = join(root, `bun-${label}`);
  await mkdir(outdir, { recursive: true });
  const build = await run(executable, ["build", join(root, "entry.ts"), "--outdir", outdir, "--target=node"]);
  return {
    label,
    version: version.stdout.trim(),
    capabilities: {
      build: help.ok,
      compile: /--compile/.test(`${help.stdout}\n${help.stderr}`),
      watch: /--watch/.test(`${help.stdout}\n${help.stderr}`),
      metafile: /--metafile/.test(`${help.stdout}\n${help.stderr}`),
    },
    buildSucceeded: build.ok,
    diagnostics: (build.stderr || build.stdout).slice(0, 2_048),
  };
};
const probeDeno = async (executable, label, root) => {
  const version = await run(executable, ["--version"]);
  const help = await run(executable, ["bundle", "--help"]);
  const outdir = join(root, `deno-${label}`);
  await mkdir(outdir, { recursive: true });
  const build = await run(executable, ["bundle", "--outdir", outdir, join(root, "entry.ts")]);
  return {
    label,
    version: version.stdout.split("\n")[0].replace(/^deno\s+/, ""),
    capabilities: {
      bundle: help.ok,
      watch: /--watch/.test(`${help.stdout}\n${help.stderr}`),
      declaration: /--declaration/.test(`${help.stdout}\n${help.stderr}`),
      platform: /--platform/.test(`${help.stdout}\n${help.stderr}`),
    },
    buildSucceeded: build.ok,
    diagnostics: (build.stderr || build.stdout).slice(0, 2_048),
  };
};
const probeEsbuild = async (packageDirectory, label, root) => {
  const api = await import(pathToFileURL(resolve(packageDirectory, "lib/main.js")).href);
  const first = await api.build({ entryPoints: [join(root, "entry.ts")], bundle: true, write: false, platform: "node" });
  const context = await api.context({ entryPoints: [join(root, "entry.ts")], bundle: true, write: false, platform: "node" });
  try {
    const rebuilt = await context.rebuild();
    await context.cancel();
    return {
      label,
      version: api.version,
      build: first.outputFiles?.length === 1,
      context: rebuilt.outputFiles?.length === 1,
      cancel: typeof context.cancel === "function",
      dispose: typeof context.dispose === "function",
    };
  } finally {
    await context.dispose();
  }
};

const root = await mkdtemp(join(tmpdir(), "effect-build-version-boundary-"));
try {
  await writeFile(join(root, "entry.ts"), 'console.log("version-boundary")\n');
  const external = requiredPath("RESEARCH_EXTERNAL_NODE_MODULES");
  const result = {
    bun: [
      await probeBun(requiredPath("EFFECT_BUILD_BUN_BIN"), "oldest", root),
      await probeBun(requiredPath("EFFECT_BUILD_BUN_CURRENT_BIN"), "newest-current", root),
    ],
    deno: [
      await probeDeno(requiredPath("EFFECT_BUILD_DENO_BIN"), "oldest", root),
      await probeDeno(requiredPath("EFFECT_BUILD_DENO_CURRENT_BIN"), "newest-current", root),
    ],
    esbuild: [
      await probeEsbuild(resolve(external, "esbuild-0281"), "oldest", root),
      await probeEsbuild(resolve(external, "esbuild-0282"), "newest-current", root),
    ],
  };
  console.log(`EFFECT_BUILD_VERSION_BOUNDARY_RECEIPT=${JSON.stringify(result)}`);
} finally {
  await rm(root, { recursive: true, force: true });
}
