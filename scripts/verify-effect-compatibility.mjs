import { execFile, spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, delimiter, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const effectEndpoints = ["4.0.0-beta.104", "4.0.0-rc.108"];
const usage = `usage: node scripts/verify-effect-compatibility.mjs (--all | --effect-version <${effectEndpoints.join(" | ")}>)`;
const referenceDependencies = new Set([
  "effect",
  "@effect/platform-bun",
  "@effect/platform-deno",
  "@effect/platform-node",
]);
const workspaceManifestPaths = [
  "package.json",
  "packages/effect-build/package.json",
  "packages/effect-build-bun/package.json",
  "packages/effect-build-deno/package.json",
  "packages/effect-build-esbuild/package.json",
  "packages/effect-build-node-sea/package.json",
  "examples/bun/package.json",
  "examples/deno/package.json",
  "examples/esbuild/package.json",
  "examples/node-sea/package.json",
];

export const parseArguments = (argv) => {
  if (argv.length === 1 && argv[0] === "--all") return [...effectEndpoints];
  if (argv.length === 2 && argv[0] === "--effect-version" && effectEndpoints.includes(argv[1])) return [argv[1]];
  throw new Error(`${usage}; only the exact Effect endpoints ${effectEndpoints.join(" and ")} are accepted`);
};

export const rewriteManifest = (manifest, effectVersion) => {
  if (!effectEndpoints.includes(effectVersion)) throw new Error(`unsupported Effect endpoint: ${effectVersion}`);
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("package manifest must be an object");
  }
  const rewritten = structuredClone(manifest);
  let rewrites = 0;
  for (const sectionName of ["dependencies", "devDependencies"]) {
    const section = rewritten[sectionName];
    if (section === undefined) continue;
    if (section === null || typeof section !== "object" || Array.isArray(section)) {
      throw new Error(`package manifest ${sectionName} must be an object`);
    }
    for (const dependency of Object.keys(section)) {
      if (referenceDependencies.has(dependency)) {
        if (typeof section[dependency] !== "string") throw new Error(`package manifest has malformed ${dependency}`);
        section[dependency] = effectVersion;
        rewrites += 1;
      }
    }
  }
  if (rewrites === 0) throw new Error("package manifest contains no Effect development references");
  return rewritten;
};

const repository = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temporaryRootPrefix = "effect-build-effect-compatibility-";
const excludedComponents = new Set([
  ".agent-sources", ".cache", ".git", "dist", "node_modules", "outputs", "work",
]);

export const shouldCopyRepositoryPath = (source) => {
  const path = relative(repository, source);
  if (path === "") return true;
  if (path.startsWith(`..${sep}`) || path === ".." || isAbsolute(path)) return false;
  const components = path.split(sep);
  if (components.some((component) => excludedComponents.has(component))) return false;
  if (components[0].startsWith(temporaryRootPrefix)) return false;
  return !basename(path).endsWith(".tsbuildinfo");
};

const isInsideRepository = (path) => {
  const fromRepository = relative(repository, resolve(path));
  return fromRepository === "" || (!isAbsolute(fromRepository) && !fromRepository.startsWith(`..${sep}`) && fromRepository !== "..");
};

export const selectCompatibilityTemporaryDirectory = (configuredTemporaryDirectory = tmpdir(), platform = process.platform) => {
  const configured = resolve(configuredTemporaryDirectory);
  if (!isInsideRepository(configured)) return configured;
  const systemTemporaryDirectory = resolve("/tmp");
  if (platform !== "win32" && !isInsideRepository(systemTemporaryDirectory)) return systemTemporaryDirectory;
  throw new Error(`compatibility temporary directory must be outside the repository: ${configured}`);
};

export const packageManagerInvocation = async (
  environment = process.env,
  executableAccess = access,
  probe = (executable) => execFileAsync(executable, ["--version"], { env: environment }),
) => {
  const npmExecPath = environment.npm_execpath;
  if (npmExecPath !== undefined) {
    if (typeof npmExecPath !== "string" || !isAbsolute(npmExecPath)) throw new Error("npm_execpath must be absolute");
    if (!/(?:^|[\\/])bun(?:\.exe)?$/.test(npmExecPath)) throw new Error("npm_execpath must identify Bun");
    await executableAccess(npmExecPath, constants.X_OK);
    const { stdout } = await probe(npmExecPath);
    if (stdout.trim() !== "1.3.14") throw new Error(`package-manager Bun must be 1.3.14, received ${stdout.trim()}`);
    return { executable: npmExecPath };
  }
  for (const directory of (environment.PATH ?? "").split(delimiter)) {
    if (!isAbsolute(directory)) continue;
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

const execute = (executable, argv, options) => new Promise((resolvePromise, reject) => {
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
  if (resolve(resolved, "..") !== ownedParent || !basename(resolved).startsWith(temporaryRootPrefix) || isInsideRepository(resolved)) {
    throw new Error(`refusing to remove unowned compatibility directory: ${resolved}`);
  }
  return resolved;
};

const rewriteWorkspace = async (copy, effectVersion) => {
  for (const relativePath of workspaceManifestPaths) {
    const path = join(copy, relativePath);
    const source = JSON.parse(await readFile(path, "utf8"));
    const sourcePeer = source.peerDependencies?.effect;
    const rewritten = rewriteManifest(source, effectVersion);
    if (relativePath === "package.json") {
      rewritten.overrides = {
        ...(rewritten.overrides ?? {}),
        "@effect/platform-node-shared": effectVersion,
      };
    }
    if (rewritten.peerDependencies?.effect !== sourcePeer) {
      throw new Error(`${relativePath} rewrite changed the Effect peer contract`);
    }
    await writeFile(path, `${JSON.stringify(rewritten, null, 2)}\n`);
  }
};

export const verifyEffectEndpoint = async (effectVersion, dependencies = {}) => {
  if (!effectEndpoints.includes(effectVersion)) {
    throw new Error(`unsupported Effect endpoint: ${effectVersion}`);
  }
  const temporaryDirectory = dependencies.temporaryDirectory ?? selectCompatibilityTemporaryDirectory();
  const makeTemporaryDirectory = dependencies.makeTemporaryDirectory ?? (() => mkdtemp(join(temporaryDirectory, temporaryRootPrefix)));
  const copyRepository = dependencies.copyRepository ?? ((destination) => cp(repository, destination, { recursive: true, filter: shouldCopyRepositoryPath }));
  const removeDirectory = dependencies.removeDirectory ?? ((path) => rm(path, { recursive: true, force: true }));
  const run = dependencies.execute ?? execute;
  const environment = dependencies.environment ?? process.env;
  const temporaryRoot = requireOwnedTemporaryRoot(await makeTemporaryDirectory(), temporaryDirectory);
  const copy = join(temporaryRoot, "repository");
  let verificationFailure;
  try {
    await copyRepository(copy);
    await rewriteWorkspace(copy, effectVersion);
    const cache = join(temporaryRoot, "cache");
    await mkdir(cache, { recursive: true });
    const childEnvironment = { ...environment, BUN_INSTALL_CACHE_DIR: join(cache, "bun") };
    const packageManager = dependencies.packageManager ?? await packageManagerInvocation(environment);
    const commands = [
      ["install", "--cache-dir", join(cache, "bun")],
      ["run", "build"],
      ["run", "check"],
      ["run", "test:types"],
      ["run", "test:unit"],
      ["run", "test:consumer:fresh"],
    ];
    for (const command of commands) {
      try {
        await run(packageManager.executable, command, { cwd: copy, env: childEnvironment });
      } catch (error) {
        throw new Error(`Effect ${effectVersion} failed Bun ${command.join(" ")}: ${error instanceof Error ? error.message : String(error)}`);
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
        `${verificationFailure instanceof Error ? verificationFailure.message : String(verificationFailure)}; cleanup failed: ${cleanupFailure instanceof Error ? cleanupFailure.message : String(cleanupFailure)}`,
        { cause: verificationFailure },
      );
    }
    throw new Error(`Effect ${effectVersion} cleanup failed: ${cleanupFailure instanceof Error ? cleanupFailure.message : String(cleanupFailure)}`, { cause: cleanupFailure });
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
