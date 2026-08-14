import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { readTooling } from "./read-tooling.mjs";

const execFileAsync = promisify(execFile);
const repository = resolve(fileURLToPath(new URL("..", import.meta.url)));

export const packageManagerInvocation = async (
  environment = process.env,
  executableAccess = access,
  probe = (executable) => execFileAsync(executable, ["--version"], { env: environment }),
) => {
  const executable = environment.npm_execpath;
  if (executable !== undefined) {
    if (typeof executable !== "string" || !isAbsolute(executable)) {
      throw new Error("npm_execpath must be absolute when provided");
    }
    await executableAccess(executable, constants.X_OK);
    if (!/(?:^|[\\/])bun(?:\.exe)?$/.test(executable)) throw new Error("npm_execpath must identify Bun");
    const { stdout } = await probe(executable);
    if (stdout.trim() !== "1.3.14") throw new Error(`package-manager Bun must be 1.3.14, received ${stdout.trim()}`);
    return { executable };
  }
  for (const directory of (environment.PATH ?? "").split(delimiter)) {
    if (directory.length === 0 || !isAbsolute(directory)) continue;
    const candidate = join(directory, process.platform === "win32" ? "bun.exe" : "bun");
    try {
      await executableAccess(candidate, constants.X_OK);
      const { stdout } = await probe(candidate);
      if (stdout.trim() !== "1.3.14") throw new Error(`package-manager Bun must be 1.3.14, received ${stdout.trim()}`);
      return { executable: candidate };
    } catch {
      // Continue through the caller's explicit PATH.
    }
  }
  throw new Error("Bun was not found on absolute PATH entries and npm_execpath was not provided");
};

export const parseCompiler = (argv) => {
  if (argv.length === 0) return undefined;
  if (argv.length !== 2 || argv[0] !== "--compiler" || !["bun", "deno"].includes(argv[1])) {
    throw new Error("usage: verify-target-support.mjs [--compiler bun|deno]");
  }
  return argv[1];
};

export const requireUbuntuCompatibleHost = (platform, architecture) => {
  if (platform !== "linux" || architecture !== "x64") {
    throw new Error(
      `verify:targets requires Linux x64 with /usr/bin/file and /usr/bin/readelf; run the required Ubuntu CI gate (current host: ${platform}/${architecture})`,
    );
  }
};

export const parseProvisionedPaths = (stdout, expected) => {
  const entries = new Map();
  const expectedSet = new Set(expected);
  for (const line of stdout.split("\n")) {
    if (line.length === 0) continue;
    if (!/^[a-z]+=\/[^\r\n=]+$/.test(line)) throw new Error(`invalid provisioner output line: ${line}`);
    const separator = line.indexOf("=");
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (!expectedSet.has(key)) throw new Error(`unexpected provisioner output key: ${key}`);
    if (entries.has(key)) throw new Error(`duplicate provisioner output key: ${key}`);
    entries.set(key, value);
  }
  for (const compiler of expected) {
    const path = entries.get(compiler);
    if (path === undefined || !isAbsolute(path)) throw new Error(`provisioner did not emit an absolute ${compiler} path`);
  }
  return entries;
};

const describeFailure = (error) => {
  if (error === null || typeof error !== "object") return String(error);
  const output = [error.stdout, error.stderr].filter((value) => typeof value === "string" && value.length > 0).join("\n");
  return output.length > 0 ? output.trim() : error.message ?? String(error);
};

export const verifyTargetSupport = async ({
  compiler,
  platform = process.platform,
  architecture = process.arch,
  environment = process.env,
  packageManager,
  execute = execFileAsync,
  makeTemporaryDirectory = (prefix) => mkdtemp(prefix),
  removeDirectory = (path) => rm(path, { recursive: true, force: true }),
  log = console.log,
} = {}) => {
  requireUbuntuCompatibleHost(platform, architecture);
  const selected = compiler === undefined ? ["bun", "deno"] : [compiler];
  const { support } = await readTooling();
  const cells = support.supportedCells.filter((cell) => selected.includes(cell.compiler));
  const packageManagerCommand = packageManager ?? await packageManagerInvocation(environment);
  const toolRoot = await makeTemporaryDirectory(join(tmpdir(), "effect-build-targets-"));
  try {
    const paths = new Map();
    for (const selectedCompiler of selected) {
      const provisioned = await execute(
        process.execPath,
        [resolve(repository, "scripts/provision-tool-assets.mjs"), "--only", selectedCompiler],
        {
          cwd: repository,
          env: { ...environment, EFFECT_BUILD_TOOL_DIR: toolRoot },
          maxBuffer: 8 * 1024 * 1024,
        },
      );
      const provisionedCompiler = parseProvisionedPaths(provisioned.stdout, [selectedCompiler]);
      paths.set(selectedCompiler, provisionedCompiler.get(selectedCompiler));
    }
    const failures = [];
    for (const cell of cells) {
      const cellEnvironment = {
        ...environment,
        EFFECT_BUILD_TARGET_COMPILER: cell.compiler,
        EFFECT_BUILD_TARGET: cell.target,
      };
      delete cellEnvironment.DENORT_BIN;
      delete cellEnvironment.EFFECT_BUILD_BUN_BIN;
      delete cellEnvironment.EFFECT_BUILD_DENO_BIN;
      delete cellEnvironment.BUN_INSTALL_CACHE_DIR;
      delete cellEnvironment.DENO_DIR;
      if (cell.compiler === "bun") {
        cellEnvironment.EFFECT_BUILD_BUN_BIN = paths.get("bun");
        cellEnvironment.BUN_INSTALL_CACHE_DIR = join(toolRoot, "bun-install-cache");
      } else {
        cellEnvironment.EFFECT_BUILD_DENO_BIN = paths.get("deno");
        cellEnvironment.DENO_DIR = join(toolRoot, "deno-cache");
      }
      const label = `${cell.compiler}/${cell.target}`;
      try {
        await execute(
          packageManagerCommand.executable,
          ["run", "test:integration:target"],
          {
          cwd: repository,
            env: cellEnvironment,
          maxBuffer: 32 * 1024 * 1024,
          },
        );
        log(`PASS ${label}`);
      } catch (error) {
        failures.push(label);
        log(`FAIL ${label}\n${describeFailure(error)}`);
      }
    }
    log(`target-support: ${cells.length - failures.length}/${cells.length} cells passed`);
    if (failures.length > 0) throw new Error(`target-support failures: ${failures.join(", ")}`);
    return { attempted: cells.length, failures };
  } finally {
    await removeDirectory(toolRoot);
  }
};

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const compiler = parseCompiler(process.argv.slice(2));
  await verifyTargetSupport({ compiler });
}
