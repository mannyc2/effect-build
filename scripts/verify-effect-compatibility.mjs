import { spawn } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const effectEndpoints = ["4.0.0-beta.104", "4.0.0-rc.108"];

const usage = `usage: node scripts/verify-effect-compatibility.mjs (--all | --effect-version <${effectEndpoints.join(" | ")}>)`;

export const parseArguments = (argv) => {
  if (argv.length === 1 && argv[0] === "--all") return [...effectEndpoints];
  if (argv.length === 2 && argv[0] === "--effect-version" && effectEndpoints.includes(argv[1])) {
    return [argv[1]];
  }
  throw new Error(`${usage}; only the exact Effect endpoints ${effectEndpoints.join(" and ")} are accepted`);
};

export const rewriteManifest = (manifest, effectVersion) => {
  if (!effectEndpoints.includes(effectVersion)) {
    throw new Error(`unsupported Effect endpoint: ${effectVersion}`);
  }
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("package manifest must be an object");
  }
  const devDependencies = manifest.devDependencies;
  if (devDependencies === null || typeof devDependencies !== "object" || Array.isArray(devDependencies)) {
    throw new Error("package manifest must contain devDependencies");
  }
  const rewritten = structuredClone(manifest);
  for (const dependency of [
    "effect",
    "@effect/platform-bun",
    "@effect/platform-deno",
    "@effect/platform-node",
  ]) {
    if (typeof rewritten.devDependencies[dependency] !== "string") {
      throw new Error(`package manifest is missing ${dependency}`);
    }
    rewritten.devDependencies[dependency] = effectVersion;
  }
  return rewritten;
};

const repository = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temporaryRootPrefix = "effect-build-effect-compatibility-";
const excludedRoots = new Set([
  ".agent-sources",
  ".cache",
  ".git",
  ".pnpm-store",
  "dist",
  "node_modules",
  "outputs",
  "work",
]);

export const shouldCopyRepositoryPath = (source) => {
  const path = relative(repository, source);
  if (path === "") return true;
  if (path.startsWith(`..${sep}`) || path === ".." || isAbsolute(path)) return false;
  const root = path.split(sep)[0];
  if (excludedRoots.has(root) || root.startsWith(temporaryRootPrefix)) return false;
  return !basename(path).endsWith(".tsbuildinfo");
};

const isInsideRepository = (path) => {
  const fromRepository = relative(repository, resolve(path));
  return fromRepository === "" ||
    (!isAbsolute(fromRepository) && !fromRepository.startsWith(`..${sep}`) && fromRepository !== "..");
};

export const selectCompatibilityTemporaryDirectory = (
  configuredTemporaryDirectory = tmpdir(),
  platform = process.platform,
) => {
  const configured = resolve(configuredTemporaryDirectory);
  if (!isInsideRepository(configured)) return configured;
  const systemTemporaryDirectory = resolve("/tmp");
  if (platform !== "win32" && !isInsideRepository(systemTemporaryDirectory)) return systemTemporaryDirectory;
  throw new Error(`compatibility temporary directory must be outside the repository: ${configured}`);
};

const packageManagerInvocation = async (environment) => {
  const npmExecPath = environment.npm_execpath;
  if (npmExecPath !== undefined) {
    if (!isAbsolute(npmExecPath)) throw new Error("npm_execpath must be absolute when provided");
    await access(npmExecPath, constants.R_OK);
    return { executable: process.execPath, prefix: [npmExecPath] };
  }
  return { executable: "pnpm", prefix: [] };
};

const execute = (executable, argv, options) =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(executable, argv, { ...options, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(signal === null ? `exited with code ${code}` : `terminated by ${signal}`));
    });
  });

const requireOwnedTemporaryRoot = (path, temporaryDirectory) => {
  const ownedParent = resolve(temporaryDirectory);
  const resolved = resolve(path);
  if (
    resolve(resolved, "..") !== ownedParent ||
    !basename(resolved).startsWith(temporaryRootPrefix) ||
    isInsideRepository(resolved)
  ) {
    throw new Error(`refusing to remove unowned compatibility directory: ${resolved}`);
  }
  return resolved;
};

export const verifyEffectEndpoint = async (effectVersion, dependencies = {}) => {
  const temporaryDirectory = dependencies.temporaryDirectory ?? selectCompatibilityTemporaryDirectory();
  const makeTemporaryDirectory = dependencies.makeTemporaryDirectory ?? (() =>
    mkdtemp(join(temporaryDirectory, temporaryRootPrefix)));
  const copyRepository = dependencies.copyRepository ?? ((destination) =>
    cp(repository, destination, { recursive: true, filter: shouldCopyRepositoryPath }));
  const removeDirectory = dependencies.removeDirectory ?? ((path) => rm(path, { recursive: true, force: true }));
  const run = dependencies.execute ?? execute;
  const environment = dependencies.environment ?? process.env;
  const temporaryRoot = requireOwnedTemporaryRoot(await makeTemporaryDirectory(), temporaryDirectory);
  const copy = join(temporaryRoot, "repository");
  let verificationFailure;
  try {
    await copyRepository(copy);
    const manifestPath = join(copy, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const sourcePeer = manifest.peerDependencies?.effect;
    const rewritten = rewriteManifest(manifest, effectVersion);
    if (rewritten.peerDependencies?.effect !== sourcePeer) {
      throw new Error("temporary manifest rewrite changed the Effect peer contract");
    }
    await writeFile(manifestPath, `${JSON.stringify(rewritten, null, 2)}\n`);

    const cache = join(temporaryRoot, "cache");
    await mkdir(cache, { recursive: true });
    const childEnvironment = {
      ...environment,
      npm_config_cache: join(cache, "npm"),
      npm_config_store_dir: join(cache, "pnpm-store"),
    };
    const packageManager = dependencies.packageManager ?? await packageManagerInvocation(environment);
    const commands = [
      ["install", "--no-frozen-lockfile", "--strict-peer-dependencies"],
      ["check"],
      ["test:types"],
      ["test:unit"],
      ["test:consumer:fresh"],
    ];
    for (const command of commands) {
      try {
        await run(packageManager.executable, [...packageManager.prefix, ...command], {
          cwd: copy,
          env: childEnvironment,
        });
      } catch (error) {
        throw new Error(
          `Effect ${effectVersion} failed pnpm ${command.join(" ")}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  } catch (error) {
    verificationFailure = error;
  }
  try {
    await removeDirectory(temporaryRoot);
  } catch (cleanupFailure) {
    if (verificationFailure !== undefined) {
      throw new AggregateError(
        [verificationFailure, cleanupFailure],
        `${verificationFailure instanceof Error ? verificationFailure.message : String(verificationFailure)}; cleanup failed: ${
          cleanupFailure instanceof Error ? cleanupFailure.message : String(cleanupFailure)
        }`,
        { cause: verificationFailure },
      );
    }
    throw new Error(
      `Effect ${effectVersion} cleanup failed: ${
        cleanupFailure instanceof Error ? cleanupFailure.message : String(cleanupFailure)
      }`,
      { cause: cleanupFailure },
    );
  }
  if (verificationFailure !== undefined) throw verificationFailure;
  console.log(`Effect compatibility verified: ${effectVersion}`);
};

const main = async () => {
  for (const endpoint of parseArguments(process.argv.slice(2))) await verifyEffectEndpoint(endpoint);
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main().catch((error) => {
    console.error(`Effect compatibility verification failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
