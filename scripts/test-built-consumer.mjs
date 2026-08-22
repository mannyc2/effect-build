import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, delimiter, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { parse as parseYaml } from "yaml";

const execFileAsync = promisify(execFile);
const execute = async (...arguments_) => {
  try {
    return await execFileAsync(...arguments_);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    const output = [error.message, error.stdout, error.stderr]
      .filter((value) => typeof value === "string" && value.trim() !== "")
      .join("\n");
    throw new Error(output, { cause: error });
  }
};

const repository = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temporaryPrefix = "effect-build-consumers-";
const packageVersion = "0.3.0";
const effectPeer = ">=4.0.0-beta.104 <4.1.0-0";
const packageNames = [
  "effect-build",
  "effect-build-bun",
  "effect-build-deno",
  "effect-build-esbuild",
  "effect-build-node-sea",
];
const integrationNames = packageNames.slice(1);
const npmInstaller = "npm@11.11.0";
const bunInstaller = "bun@1.3.14";
const exactSemver = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const isSha512Integrity = (value) => {
  if (typeof value !== "string" || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  return Buffer.from(value.slice("sha512-".length), "base64").byteLength === 64;
};

const isExactRegistrySpecifier = (value) => {
  if (typeof value !== "string") return false;
  if (exactSemver.test(value)) return true;
  if (!value.startsWith("npm:")) return false;
  const versionSeparator = value.lastIndexOf("@");
  return versionSeparator > "npm:".length && exactSemver.test(value.slice(versionSeparator + 1));
};

const isPinnedHttpsLocator = (value) => {
  if (typeof value !== "string") return false;
  try {
    const locator = new URL(value);
    return locator.protocol === "https:"
      && locator.username === ""
      && locator.password === ""
      && locator.hash === "";
  } catch {
    return false;
  }
};

const isExactResolvedIdentity = (value) => isExactRegistrySpecifier(value) || isPinnedHttpsLocator(value);

const expectedDependencies = (name) => name === "effect-build"
  ? {}
  : name === "effect-build-esbuild"
  ? { "effect-build": `^${packageVersion}`, esbuild: "0.28.2" }
  : { "effect-build": `^${packageVersion}` };

export const parseArguments = (argv) => {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === "--fresh-install")) {
    return { candidateDirectory: undefined, build: true };
  }
  if (argv.length === 1 && argv[0] === "--built") {
    return { candidateDirectory: undefined, build: false };
  }
  if (argv.length === 2 && argv[0] === "--candidate-dir" && isAbsolute(argv[1])) {
    return { candidateDirectory: resolve(argv[1]), build: false };
  }
  throw new Error("usage: test-built-consumer.mjs [--fresh-install | --built | --candidate-dir <absolute-directory>]");
};

const readInstalledVersion = async (root, packageName) => {
  const manifest = JSON.parse(
    await readFile(join(root, "node_modules", ...packageName.split("/"), "package.json"), "utf8"),
  );
  if (typeof manifest.version !== "string" || !exactSemver.test(manifest.version)) {
    throw new Error(`${packageName} does not have an exact installed SemVer version`);
  }
  return manifest.version;
};

const readResolvedDependencyVersion = async (root, fromPackage, dependency) => {
  const fromManifest = await realpath(join(root, "node_modules", ...fromPackage.split("/"), "package.json"));
  const dependencyManifest = createRequire(fromManifest).resolve(`${dependency}/package.json`);
  const manifest = JSON.parse(await readFile(dependencyManifest, "utf8"));
  if (typeof manifest.version !== "string" || !exactSemver.test(manifest.version)) {
    throw new Error(`${dependency} does not have an exact resolved SemVer version`);
  }
  return manifest.version;
};

const assertCannotResolve = async (root, packageName, label) => {
  const resolver = createRequire(join(root, "package.json"));
  try {
    resolver.resolve(`${packageName}/package.json`);
  } catch {
    return;
  }
  throw new Error(`${label} unexpectedly resolves ${packageName}`);
};

const findExecutable = async (name, environment = process.env) => {
  for (const directory of (environment.PATH ?? "").split(delimiter)) {
    if (!isAbsolute(directory)) continue;
    const candidate = join(directory, process.platform === "win32" ? `${name}.exe` : name);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue through the caller's explicit PATH.
    }
  }
  throw new Error(`${name} was not found on absolute PATH entries`);
};

export const bunInvocation = async (environment = process.env) => {
  const npmExecPath = environment.npm_execpath;
  let executable;
  if (npmExecPath !== undefined && /(?:^|[\\/])bun(?:\.exe)?$/.test(npmExecPath)) {
    if (!isAbsolute(npmExecPath)) throw new Error("Bun npm_execpath must be absolute");
    await access(npmExecPath, constants.X_OK);
    executable = npmExecPath;
  } else {
    executable = await findExecutable("bun", environment);
  }
  const { stdout } = await execute(executable, ["--version"], { env: environment });
  if (stdout.trim() !== "1.3.14") throw new Error(`package-manager Bun must be 1.3.14, received ${stdout.trim()}`);
  return executable;
};

const assertOwnedTemporaryRoot = (path) => {
  const resolved = resolve(path);
  if (resolve(resolved, "..") !== resolve(tmpdir()) || !basename(resolved).startsWith(temporaryPrefix)) {
    throw new Error(`refusing to remove unowned consumer directory: ${resolved}`);
  }
  return resolved;
};

const tarEntries = async (tarball) => {
  const { stdout } = await execute("tar", ["-tzf", tarball], { maxBuffer: 8 * 1024 * 1024 });
  return stdout.trim().split("\n").filter(Boolean);
};

const packedManifest = async (tarball) => {
  const { stdout } = await execute("tar", ["-xOf", tarball, "package/package.json"], {
    maxBuffer: 8 * 1024 * 1024,
  });
  return JSON.parse(stdout);
};

const dependencySections = ["dependencies", "peerDependencies", "optionalDependencies", "devDependencies"];

export const isNonRegistryDependency = (value) =>
  typeof value !== "string"
  || /^(?:workspace:|catalog:|file:|link:|portal:|\.{1,2}(?:[\\/]|$)|[\\/]|[A-Za-z]:[\\/])/.test(value);

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const candidateMap = (expectation) => {
  if (
    !isRecord(expectation)
    || typeof expectation.fixtureName !== "string"
    || expectation.fixtureName === ""
    || typeof expectation.fixtureDirectory !== "string"
    || !isAbsolute(expectation.fixtureDirectory)
  ) {
    throw new Error("consumer lock expectation requires one fixture name");
  }
  if (!Array.isArray(expectation.candidates)) {
    throw new Error("consumer lock expectation requires candidate tarballs");
  }
  const candidates = new Map();
  for (const candidate of expectation.candidates) {
    if (
      !isRecord(candidate)
      || typeof candidate.name !== "string"
      || candidate.name === ""
      || !exactSemver.test(candidate.version)
      || typeof candidate.tarball !== "string"
      || !isAbsolute(candidate.tarball)
      || !isSha512Integrity(candidate.integrity)
      || candidates.has(candidate.name)
    ) {
      throw new Error("consumer lock expectation contains an invalid candidate tarball");
    }
    candidates.set(candidate.name, candidate);
  }
  return candidates;
};

const assertDirectDependencies = (dependencies, candidates) => {
  if (!isRecord(dependencies)) throw new Error("consumer lock has no direct dependencies");
  for (const [name, specifier] of Object.entries(dependencies)) {
    const candidate = candidates.get(name);
    if (candidate !== undefined) {
      if (specifier !== `file:${candidate.tarball}`) {
        throw new Error(`${name} direct candidate tarball identity does not match`);
      }
      continue;
    }
    if (!isExactRegistrySpecifier(specifier)) {
      throw new Error(`${name} direct dependency must be an exact registry version`);
    }
  }
};

const assertRegistryDependencyLocators = (dependencies, label) => {
  if (dependencies === undefined) return;
  if (!isRecord(dependencies)) throw new Error(`${label} dependencies are malformed`);
  for (const [name, specifier] of Object.entries(dependencies)) {
    if (isNonRegistryDependency(specifier)) {
      throw new Error(`${label} dependency ${name} contains an unauthorized locator`);
    }
  }
};

const npmPackageName = (path) => {
  const marker = "node_modules/";
  const start = path.lastIndexOf(marker);
  if (start < 0) return undefined;
  const segments = path.slice(start + marker.length).split("/");
  return segments[0]?.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
};

export const validateNpmLock = (lock, expectation) => {
  const candidates = candidateMap(expectation);
  if (
    !isRecord(lock)
    || lock.lockfileVersion !== 3
    || lock.name !== expectation.fixtureName
    || !isRecord(lock.packages)
    || !isRecord(lock.packages[""])
    || lock.packages[""].name !== expectation.fixtureName
  ) {
    throw new Error("npm lock fixture name or schema does not match");
  }
  const root = lock.packages[""];
  assertDirectDependencies(root.dependencies, candidates);
  for (const section of ["devDependencies", "optionalDependencies", "peerDependencies"]) {
    if (root[section] !== undefined && Object.keys(root[section]).length !== 0) {
      throw new Error(`npm consumer lock has unexpected root ${section}`);
    }
  }
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (path === "") continue;
    if (!isRecord(entry) || !exactSemver.test(entry.version) || !isSha512Integrity(entry.integrity)) {
      throw new Error(`${path} npm lock integrity or version is invalid`);
    }
    const name = npmPackageName(path);
    const candidate = name === undefined ? undefined : candidates.get(name);
    if (candidate !== undefined) {
      if (
        path !== `node_modules/${candidate.name}`
        || root.dependencies[candidate.name] === undefined
        || entry.version !== candidate.version
        || entry.integrity !== candidate.integrity
        || typeof entry.resolved !== "string"
        || !entry.resolved.startsWith("file:")
        || resolve(expectation.fixtureDirectory, entry.resolved.slice("file:".length)) !== candidate.tarball
      ) {
        throw new Error(`${name} npm candidate tarball identity or integrity does not match`);
      }
    } else if (!isPinnedHttpsLocator(entry.resolved)) {
      throw new Error(`${path} npm lock contains an unauthorized locator`);
    }
    assertRegistryDependencyLocators(entry.dependencies, path);
    assertRegistryDependencyLocators(entry.optionalDependencies, path);
    assertRegistryDependencyLocators(entry.peerDependencies, path);
  }
  for (const candidate of candidates.values()) {
    if (
      root.dependencies[candidate.name] !== undefined
      && !isRecord(lock.packages[`node_modules/${candidate.name}`])
    ) {
      throw new Error(`${candidate.name} npm candidate lock record is missing`);
    }
  }
};

const bunIdentity = (identity) => {
  if (typeof identity !== "string") return undefined;
  const separator = identity.lastIndexOf("@");
  if (separator <= 0) return undefined;
  return { name: identity.slice(0, separator), locator: identity.slice(separator + 1) };
};

const assertBunPackageDependencies = (tuple, label) => {
  for (const metadata of tuple.slice(1, -1)) {
    if (!isRecord(metadata)) continue;
    assertRegistryDependencyLocators(metadata.dependencies, label);
    assertRegistryDependencyLocators(metadata.optionalDependencies, label);
    assertRegistryDependencyLocators(metadata.peerDependencies, label);
  }
};

const assertBunOverrides = (overrides, directDependencies, candidates) => {
  if (overrides === undefined) return;
  if (!isRecord(overrides)) throw new Error("Bun lock overrides are malformed");
  for (const [name, specifier] of Object.entries(overrides)) {
    const candidate = candidates.get(name);
    if (
      candidate !== undefined
      && directDependencies[name] === `file:${candidate.tarball}`
      && specifier === `file:${candidate.tarball}`
    ) {
      continue;
    }
    if (!isExactRegistrySpecifier(specifier)) {
      throw new Error(`${name} Bun override contains an unauthorized locator`);
    }
  }
};

export const validateBunLock = (input, expectation) => {
  const candidates = candidateMap(expectation);
  const lock = typeof input === "string" || input instanceof Uint8Array
    ? parseYaml(typeof input === "string" ? input : new TextDecoder().decode(input))
    : input;
  if (
    !isRecord(lock)
    || lock.lockfileVersion !== 1
    || !isRecord(lock.workspaces)
    || Object.keys(lock.workspaces).length !== 1
    || !isRecord(lock.workspaces[""])
    || lock.workspaces[""].name !== expectation.fixtureName
    || !isRecord(lock.packages)
  ) {
    throw new Error("Bun lock fixture name or schema does not match");
  }
  const workspace = lock.workspaces[""];
  assertDirectDependencies(workspace.dependencies, candidates);
  for (const section of ["devDependencies", "optionalDependencies", "peerDependencies"]) {
    if (workspace[section] !== undefined && Object.keys(workspace[section]).length !== 0) {
      throw new Error(`Bun consumer lock has unexpected root ${section}`);
    }
  }
  for (const [key, value] of Object.entries(workspace)) {
    if (
      key !== "name"
      && key !== "dependencies"
      && !["devDependencies", "optionalDependencies", "peerDependencies"].includes(key)
      && value !== undefined
    ) {
      throw new Error(`Bun root workspace contains unexpected ${key}`);
    }
  }
  for (const [key, tuple] of Object.entries(lock.packages)) {
    if (!Array.isArray(tuple) || tuple.length < 3) throw new Error(`${key} Bun lock record is malformed`);
    const identity = bunIdentity(tuple[0]);
    const integrity = tuple.at(-1);
    if (identity === undefined || !isSha512Integrity(integrity)) {
      throw new Error(`${key} Bun lock integrity or identity is invalid`);
    }
    const candidate = candidates.get(key) ?? candidates.get(identity.name);
    if (candidate !== undefined) {
      if (
        key !== candidate.name
        || workspace.dependencies[candidate.name] === undefined
        || tuple[0] !== `${candidate.name}@${candidate.tarball}`
        || integrity !== candidate.integrity
      ) {
        throw new Error(`${identity.name} Bun candidate tarball identity or integrity does not match`);
      }
    } else if (!isExactResolvedIdentity(identity.locator)) {
      throw new Error(`${key} Bun lock does not contain an exact registry identity`);
    }
    assertBunPackageDependencies(tuple, `${key} Bun lock record`);
  }
  for (const candidate of candidates.values()) {
    if (
      workspace.dependencies[candidate.name] !== undefined
      && !Array.isArray(lock.packages[candidate.name])
    ) {
      throw new Error(`${candidate.name} Bun candidate lock record is missing`);
    }
  }
  assertBunOverrides(lock.overrides, workspace.dependencies, candidates);
  for (const key of Object.keys(lock)) {
    if (!["lockfileVersion", "configVersion", "workspaces", "packages", "overrides"].includes(key)) {
      throw new Error(`Bun lock contains unexpected top-level ${key}`);
    }
  }
};

export const assertLockUnchanged = (before, after) => {
  if (!(before instanceof Uint8Array) || !(after instanceof Uint8Array) || before.byteLength !== after.byteLength) {
    throw new Error("consumer lock bytes changed during frozen install");
  }
  for (let index = 0; index < before.byteLength; index++) {
    if (before[index] !== after[index]) throw new Error("consumer lock bytes changed during frozen install");
  }
};

export const normalizeDependencyTree = (tree) => {
  if (!Array.isArray(tree) || tree.length === 0) throw new Error("installed dependency inventory is malformed");
  const paths = new Set();
  return tree.map((entry) => {
    if (
      !isRecord(entry)
      || typeof entry.path !== "string"
      || entry.path === ""
      || isAbsolute(entry.path)
      || entry.path.startsWith("../")
      || typeof entry.name !== "string"
      || entry.name === ""
      || !exactSemver.test(entry.version)
      || paths.has(entry.path)
    ) {
      throw new Error("installed dependency inventory is malformed");
    }
    paths.add(entry.path);
    return { path: entry.path, name: entry.name, version: entry.version };
  }).sort((left, right) => left.path.localeCompare(right.path));
};

export const inspectPackedPackage = async (tarball, expectedName) => {
  const manifest = await packedManifest(tarball);
  const entries = await tarEntries(tarball);
  if (manifest.name !== expectedName || manifest.version !== packageVersion) {
    throw new Error(`unexpected packed identity for ${expectedName}`);
  }
  for (const section of dependencySections) {
    for (const [name, value] of Object.entries(manifest[section] ?? {})) {
      if (isNonRegistryDependency(value)) {
        throw new Error(`${expectedName} packed ${section}.${name} leaks a non-registry dependency`);
      }
    }
  }
  if (JSON.stringify(manifest.dependencies ?? {}) !== JSON.stringify(expectedDependencies(expectedName))) {
    throw new Error(`${expectedName} packed dependency graph drifted`);
  }
  if (JSON.stringify(manifest.peerDependencies ?? {}) !== JSON.stringify({ effect: effectPeer })) {
    throw new Error(`${expectedName} packed Effect peer drifted`);
  }
  if (manifest.optionalDependencies !== undefined) {
    throw new Error(`${expectedName} unexpectedly packed optional dependencies`);
  }
  const exports = manifest.exports;
  if (exports === null || typeof exports !== "object" || Array.isArray(exports)) {
    throw new Error(`${expectedName} has no packed export map`);
  }
  const expectedSubpaths = expectedName === "effect-build" ? [".", "./Integration", "./Provider"] : ["."];
  if (JSON.stringify(Object.keys(exports)) !== JSON.stringify(expectedSubpaths)) {
    throw new Error(`${expectedName} packed export graph drifted`);
  }
  for (const [subpath, value] of Object.entries(exports)) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${expectedName} has malformed packed export ${subpath}`);
    }
    for (const field of ["types", "import"]) {
      const target = value[field];
      if (typeof target !== "string" || !target.startsWith("./dist/") || target.includes("/src/")) {
        throw new Error(`${expectedName} export ${subpath}.${field} must target built dist output`);
      }
      if (!entries.includes(`package/${target.slice(2)}`)) {
        throw new Error(`${expectedName} export ${subpath}.${field} is missing from its tarball`);
      }
    }
  }
  return { manifest, entries };
};

const packPackages = async (bun, destination) => {
  await mkdir(destination, { recursive: true });
  if ((await readdir(destination)).length !== 0) {
    throw new Error(`candidate directory must start empty: ${destination}`);
  }
  const tarballs = new Map();
  for (const name of packageNames) {
    const filename = `${name}-${packageVersion}.tgz`;
    const tarball = join(destination, filename);
    await execute(bun, ["pm", "pack", "--destination", destination, "--ignore-scripts", "--quiet"], {
      cwd: resolve(repository, "packages", name),
      env: process.env,
      maxBuffer: 8 * 1024 * 1024,
    });
    await access(tarball, constants.R_OK);
    await inspectPackedPackage(tarball, name);
    tarballs.set(name, tarball);
  }
  return tarballs;
};

const compilerTypeScriptSource = (name) => {
  const alias = name === "effect-build-bun" ? "Bun" : "Deno";
  const target = name === "effect-build-bun" ? "linux-x64-musl" : "windows-aarch64";
  const options = name === "effect-build-bun" ? "{ minify: true }" : "{ bundle: true, minify: true }";
  return [
    'import { Effect } from "effect";',
    `import * as ${alias} from ${JSON.stringify(name)};`,
    `export const scalar = ${alias}.compileExecutable({ entrypoint: "src/main.ts", outfile: "dist/app", target: ${JSON.stringify(target)}, options: ${options} });`,
    `export const matrix = ${alias}.compileExecutableMatrix({ entrypoint: "src/main.ts", outdir: "dist", name: "app", targets: [${JSON.stringify(target)}] });`,
    ...(name === "effect-build-bun"
      ? [
        'export const bundle = Bun.withJavaScriptBundle({ entrypoint: "src/main.ts", format: "esm" }, (main) => Effect.succeed(main.stages));',
        "export type BundleContext = typeof bundle extends Effect.Effect<unknown, unknown, infer R> ? R : never;",
      ]
      : []),
    `export type ScalarContext = typeof scalar extends Effect.Effect<unknown, unknown, infer R> ? R : never;`,
    `export const targetSchema: typeof ${alias}.Target = ${alias}.Target;`,
  ].join("\n");
};

const typeScriptSource = (name) => {
  if (name === "effect-build") {
    return [
      'import * as Core from "effect-build";',
      'import * as Integration from "effect-build/Integration";',
      'import * as Provider from "effect-build/Provider";',
      "export type Executable = Core.Artifact.ExecutableArtifact;",
      "export const executeCommand = Integration.executeCommand;",
      "export const defineProvider = Provider.define;",
    ].join("\n");
  }
  if (name === "effect-build-bun" || name === "effect-build-deno") return compilerTypeScriptSource(name);
  if (name === "effect-build-esbuild") {
    return [
      'import { Effect } from "effect";',
      'import * as Esbuild from "effect-build-esbuild";',
      "export const bundle = Esbuild.withJavaScriptBundle(",
      '  { entrypoint: "src/main.ts", format: "esm" },',
      "  (artifact) => Effect.succeed({ path: artifact.path, stages: artifact.stages }),",
      ");",
      "export type BundleContext = typeof bundle extends Effect.Effect<unknown, unknown, infer R> ? R : never;",
    ].join("\n");
  }
  return [
    'import { JavaScriptBundle } from "effect-build";',
    'import * as NodeSea from "effect-build-node-sea";',
    "declare const main: JavaScriptBundle.Artifact<readonly []>;",
    'export const executable = NodeSea.createExecutable({ main, outfile: "dist/app", digest: true });',
  ].join("\n");
};

const runtimeKeys = {
  "effect-build-bun": [
    "BunBundleFailed", "BunBundleInvalid", "BunBundleMaterializationFailed", "BunBundleMaterializationOperation",
    "BunBundleSpawnFailed", "BunBundleVersionMismatch", "Compiler", "InvalidBundleInput", "Target",
    "compileExecutable", "compileExecutableMatrix", "layer", "withJavaScriptBundle",
  ],
  "effect-build-deno": ["Compiler", "Target", "compileExecutable", "compileExecutableMatrix", "layer"],
  "effect-build-esbuild": [
    "BundleMaterializationFailed", "BundleMaterializationOperation", "Esbuild", "EsbuildDiagnostic",
    "EsbuildFailed", "EsbuildVersionMismatch", "InvalidBundleInput", "JavaScriptBundleInvalid", "layer",
    "withJavaScriptBundle",
  ],
  "effect-build-node-sea": [
    "InvalidNodeSeaInput", "NodeSea", "NodeSeaFailed", "NodeSeaPreparationFailed", "NodeSeaPreparationOperation",
    "NodeSeaProbeFailed", "NodeSeaSpawnFailed", "NodeSeaSyntaxCheckFailed", "NodeSeaToolNotFound", "createExecutable",
    "layer",
  ],
};

const runtimeSource = (name) => {
  const lines = [
    'import assert from "node:assert/strict";',
    'const core = await import("effect-build");',
    'assert.deepEqual(Object.keys(core), ["Artifact", "BuildError", "JavaScriptBundle", "MatrixError", "Target"]);',
    'assert.deepEqual(Object.keys(core.JavaScriptBundle), ["Format", "InvalidReason", "InvalidJavaScriptBundle", "JavaScriptBundleAccessOperation", "JavaScriptBundleAccessFailed", "JavaScriptBundleTemporaryDirectoryFailed", "withFile"]);',
    'const integration = await import("effect-build/Integration");',
    'assert.deepEqual(Object.keys(integration), ["executeCommand", "inspectLiveJavaScriptBundle", "produceExecutable", "withOwnedJavaScriptBundle"]);',
    'const author = await import("effect-build/Provider");',
    'assert.deepEqual(Object.keys(author), ["define"]);',
    'for (const path of [["effect-build", "bun"].join("/"), ["effect-build", "deno"].join("/"), "effect-build/internal", "effect-build/standalone/internal/Process.js"]) {',
    '  await import(path).then(() => { throw new Error(`private or legacy path resolved: ${path}`); }, () => undefined);',
    '}',
  ];
  if (name !== "effect-build") {
    lines.push(
      `const selected = await import(${JSON.stringify(name)});`,
      `assert.deepEqual(Object.keys(selected), ${JSON.stringify(runtimeKeys[name])});`,
      `await import(${JSON.stringify(`${name}/internal`)}).then(() => { throw new Error("integration private path resolved"); }, () => undefined);`,
    );
  }
  return lines.join("\n");
};

const writeExampleSources = async (fixture, name) => {
  const exampleName = name === "effect-build-bun"
    ? "bun"
    : name === "effect-build-deno"
    ? "deno"
    : name === "effect-build-esbuild"
    ? "esbuild"
    : undefined;
  if (exampleName === undefined) return;
  const exampleDirectory = join(fixture, "examples");
  await mkdir(exampleDirectory, { recursive: true });
  const filenames = exampleName === "bun"
    ? ["compile.ts", "matrix.ts"]
    : exampleName === "esbuild"
    ? ["bundle.ts"]
    : ["compile.ts"];
  for (const filename of filenames) {
    await writeFile(
      join(exampleDirectory, filename),
      await readFile(join(repository, "examples", exampleName, "src", filename), "utf8"),
    );
  }
};

const sha256 = (contents) => createHash("sha256").update(contents).digest("hex");
const sha512 = (contents) => `sha512-${createHash("sha512").update(contents).digest("base64")}`;

export const assertCandidateBytesUnchanged = (candidate, contents) => {
  if (
    !isRecord(candidate)
    || !(contents instanceof Uint8Array)
    || contents.byteLength !== candidate.bytes
    || sha256(contents) !== candidate.sha256
    || sha512(contents) !== candidate.integrity
  ) {
    throw new Error(`${candidate?.name ?? "candidate"} tarball bytes changed after packing`);
  }
};

const candidateDescriptors = async (tarballs) => await Promise.all(packageNames.map(async (name) => {
  const tarball = tarballs.get(name);
  const contents = await readFile(tarball);
  const manifest = await packedManifest(tarball);
  return {
    filename: basename(tarball),
    name,
    version: manifest.version,
    tarball: resolve(tarball),
    bytes: contents.byteLength,
    sha256: sha256(contents),
    integrity: sha512(contents),
    dependencies: manifest.dependencies ?? {},
    peerDependencies: manifest.peerDependencies ?? {},
    optionalDependencies: manifest.optionalDependencies ?? {},
  };
}));

const installedTree = async (fixture) => {
  const packages = [];
  const scanPackage = async (directory) => {
    const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
    if (typeof manifest.name !== "string" || !exactSemver.test(manifest.version)) {
      throw new Error(`installed package at ${directory} has no exact identity`);
    }
    packages.push({
      path: relative(fixture, directory).split(sep).join("/"),
      name: manifest.name,
      version: manifest.version,
    });
    await scanNodeModules(join(directory, "node_modules"));
  };
  const scanNodeModules = async (directory) => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name === ".bin" || !entry.isDirectory()) continue;
      if (entry.name === ".bun") {
        const store = join(directory, entry.name);
        for (const stored of (await readdir(store, { withFileTypes: true }))
          .filter((item) => item.isDirectory())
          .sort((left, right) => left.name.localeCompare(right.name))) {
          await scanNodeModules(join(store, stored.name, "node_modules"));
        }
      } else if (entry.name.startsWith("@")) {
        const scope = join(directory, entry.name);
        for (const scoped of (await readdir(scope, { withFileTypes: true }))
          .filter((item) => item.isDirectory())
          .sort((left, right) => left.name.localeCompare(right.name))) {
          await scanPackage(join(scope, scoped.name));
        }
      } else {
        await scanPackage(join(directory, entry.name));
      }
    }
  };
  await scanNodeModules(join(fixture, "node_modules"));
  return packages.sort((left, right) => left.path.localeCompare(right.path));
};

const install = async ({ installer, fixture, label, cache, manifest, bun, candidates }) => {
  await writeFile(join(fixture, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(fixture, ".npmrc"), "@jsr:registry=https://npm.jsr.io\n");
  const expectation = { fixtureName: manifest.name, fixtureDirectory: fixture, candidates };
  const lockfile = installer === "npm" ? "package-lock.json" : "bun.lock";
  const lock = join(fixture, lockfile);
  if (installer === "npm") {
    await execute("npm", [
      "install",
      "--package-lock-only",
      "--ignore-scripts",
      "--strict-peer-deps",
      "--cache",
      cache,
    ], {
      cwd: fixture,
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
    });
    validateNpmLock(JSON.parse(await readFile(lock, "utf8")), expectation);
  } else {
    await execute(bun, [
      "install",
      "--lockfile-only",
      "--ignore-scripts",
      "--cache-dir",
      cache,
      "--no-progress",
    ], {
      cwd: fixture,
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
    });
    validateBunLock(await readFile(lock), expectation);
  }
  await rm(join(fixture, "node_modules"), { recursive: true, force: true });
  const locked = await readFile(lock);
  if (installer === "npm") {
    await execute("npm", ["ci", "--ignore-scripts", "--strict-peer-deps", "--cache", cache], {
      cwd: fixture,
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
    });
  } else {
    await execute(bun, [
      "install",
      "--frozen-lockfile",
      "--ignore-scripts",
      "--cache-dir",
      cache,
      "--no-progress",
    ], {
      cwd: fixture,
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
    });
  }
  assertLockUnchanged(locked, await readFile(lock));
  const tree = normalizeDependencyTree(await installedTree(fixture));
  for (const candidate of candidates) {
    if (
      manifest.dependencies[candidate.name] !== undefined
      && !tree.some((entry) => entry.name === candidate.name && entry.version === candidate.version)
    ) {
      throw new Error(`${label} installed tree is missing ${candidate.name}@${candidate.version}`);
    }
  }
  return {
    fixture: label,
    installer: installer === "npm" ? npmInstaller : bunInstaller,
    lockfile,
    lockSha256: sha256(locked),
    treeSha256: sha256(JSON.stringify(tree)),
  };
};

const commonDependencies = (versions, tarballs) => ({
  "@types/node": versions["@types/node"],
  effect: versions.effect,
  "effect-build": `file:${tarballs.get("effect-build")}`,
  typescript: versions.typescript,
});

const commonOverrides = (versions, installer, tarballs) => ({
  "@effect/platform-node-shared": versions["@effect/platform-node-shared"],
  ...(installer === "bun" ? { "effect-build": `file:${tarballs.get("effect-build")}` } : {}),
});

const verifyDevelopmentDependencies = async (fixture, versions, withPlatform) => {
  for (const name of ["effect", "typescript", "@types/node"]) {
    if (await readInstalledVersion(fixture, name) !== versions[name]) {
      throw new Error(`consumer resolved an unexpected ${name}`);
    }
  }
  if (withPlatform) {
    if (await readInstalledVersion(fixture, "@effect/platform-node") !== versions["@effect/platform-node"]) {
      throw new Error("consumer resolved an unexpected @effect/platform-node");
    }
    if (
      await readResolvedDependencyVersion(fixture, "@effect/platform-node", "@effect/platform-node-shared")
      !== versions["@effect/platform-node-shared"]
    ) {
      throw new Error("consumer resolved an unexpected @effect/platform-node-shared");
    }
  }
};

const runTypeAndRuntimeChecks = async (fixture) => {
  await writeFile(join(fixture, "tsconfig.json"), `${JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: ["node"],
    },
    include: ["*.ts", "examples/**/*.ts"],
  }, null, 2)}\n`);
  await execute(process.execPath, [join(fixture, "node_modules", "typescript", "bin", "tsc"), "-p", "."], {
    cwd: fixture,
  });
  await execute(process.execPath, [join(fixture, "runtime.mjs")], { cwd: fixture });
};

const installIsolatedFixture = async ({ installer, name, tarballs, root, bun, versions, candidates }) => {
  const label = `${installer}-${name}`;
  const fixture = join(root, "fixtures", label);
  const cache = join(root, "caches", label);
  await mkdir(fixture, { recursive: true });
  const withPlatform = name !== "effect-build";
  const dependencies = {
    ...commonDependencies(versions, tarballs),
    ...(withPlatform ? { "@effect/platform-node": versions["@effect/platform-node"] } : {}),
    ...(name === "effect-build" ? {} : { [name]: `file:${tarballs.get(name)}` }),
  };
  const receipt = await install({
    installer,
    fixture,
    label,
    cache,
    bun,
    candidates,
    manifest: {
      name: `fixture-${label}`,
      private: true,
      type: "module",
      dependencies,
      ...(withPlatform ? { overrides: commonOverrides(versions, installer, tarballs) } : {}),
    },
  });
  await verifyDevelopmentDependencies(fixture, versions, withPlatform);
  if (await readInstalledVersion(fixture, "effect-build") !== packageVersion) {
    throw new Error(`${label} did not resolve core ${packageVersion}`);
  }
  if (name !== "effect-build" && await readInstalledVersion(fixture, name) !== packageVersion) {
    throw new Error(`${label} did not resolve ${name}@${packageVersion}`);
  }
  for (const absent of integrationNames.filter((candidate) => candidate !== name)) {
    await assertCannotResolve(fixture, absent, label);
  }
  if (name !== "effect-build-esbuild") await assertCannotResolve(fixture, "esbuild", label);
  if (name === "effect-build-esbuild") {
    if (await readResolvedDependencyVersion(fixture, name, "esbuild") !== "0.28.2") {
      throw new Error(`${label} did not resolve exact esbuild 0.28.2`);
    }
  }
  await writeFile(join(fixture, "main.ts"), typeScriptSource(name));
  await writeExampleSources(fixture, name);
  await writeFile(join(fixture, "runtime.mjs"), runtimeSource(name));
  await runTypeAndRuntimeChecks(fixture);
  console.log(`PASS packed consumer ${label}`);
  return receipt;
};

const compositionTypeScriptSource = (producer) => {
  const alias = producer === "esbuild" ? "Esbuild" : "Bun";
  const packageName = `effect-build-${producer}`;
  return [
    'import { NodeServices } from "@effect/platform-node";',
    'import { Effect } from "effect";',
    `import * as ${alias} from ${JSON.stringify(packageName)};`,
    'import * as NodeSea from "effect-build-node-sea";',
    `export const program = ${alias}.withJavaScriptBundle(`,
    '  { entrypoint: "src/main.ts", format: "esm" },',
    '  (main) => NodeSea.createExecutable({ main, outfile: "dist/app", digest: true }),',
    ").pipe(",
    `  Effect.provide(${alias}.layer${producer === "bun" ? "()" : ""}),`,
    "  Effect.provide(NodeSea.layer()),",
    "  Effect.provide(NodeServices.layer),",
    ");",
  ].join("\n");
};

const installComposedFixture = async ({ installer, producer, tarballs, root, bun, versions, candidates }) => {
  const producerPackage = `effect-build-${producer}`;
  const label = `${installer}-${producer}-node-sea`;
  const fixture = join(root, "fixtures", label);
  const cache = join(root, "caches", label);
  await mkdir(fixture, { recursive: true });
  const receipt = await install({
    installer,
    fixture,
    label,
    cache,
    bun,
    candidates,
    manifest: {
      name: `fixture-${label}`,
      private: true,
      type: "module",
      dependencies: {
        ...commonDependencies(versions, tarballs),
        "@effect/platform-node": versions["@effect/platform-node"],
        [producerPackage]: `file:${tarballs.get(producerPackage)}`,
        "effect-build-node-sea": `file:${tarballs.get("effect-build-node-sea")}`,
      },
      overrides: commonOverrides(versions, installer, tarballs),
    },
  });
  await verifyDevelopmentDependencies(fixture, versions, true);
  for (const name of ["effect-build", producerPackage, "effect-build-node-sea"]) {
    if (await readInstalledVersion(fixture, name) !== packageVersion) {
      throw new Error(`${label} did not resolve ${name}@${packageVersion}`);
    }
  }
  await assertCannotResolve(fixture, producer === "bun" ? "effect-build-esbuild" : "effect-build-bun", label);
  await assertCannotResolve(fixture, "effect-build-deno", label);
  if (producer !== "esbuild") await assertCannotResolve(fixture, "esbuild", label);
  await writeFile(join(fixture, "main.ts"), compositionTypeScriptSource(producer));
  await writeFile(join(fixture, "runtime.mjs"), [
    'import assert from "node:assert/strict";',
    `const Producer = await import(${JSON.stringify(producerPackage)});`,
    'const NodeSea = await import("effect-build-node-sea");',
    'assert.equal(typeof Producer.withJavaScriptBundle, "function");',
    'assert.equal(typeof NodeSea.createExecutable, "function");',
  ].join("\n"));
  await runTypeAndRuntimeChecks(fixture);
  console.log(`PASS packed consumer ${label}`);
  return receipt;
};

const sourceCommit = async () => {
  const { stdout } = await execute("git", ["rev-parse", "HEAD"], { cwd: repository });
  const source = stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(source)) throw new Error("HEAD is not an exact 40-character lowercase commit SHA");
  return source;
};

const writeCandidateManifest = async (directory, candidates, consumers) => {
  const packages = [];
  for (const candidate of candidates) {
    assertCandidateBytesUnchanged(candidate, await readFile(candidate.tarball));
    packages.push({
      filename: candidate.filename,
      name: candidate.name,
      version: candidate.version,
      bytes: candidate.bytes,
      sha256: candidate.sha256,
      dependencies: candidate.dependencies,
      peerDependencies: candidate.peerDependencies,
      optionalDependencies: candidate.optionalDependencies,
    });
  }
  await writeFile(
    join(directory, "manifest.json"),
    `${JSON.stringify({ version: 2, source: await sourceCommit(), packages, consumers }, null, 2)}\n`,
  );
};

export const verifyPackedConsumers = async ({ candidateDirectory, build = true } = {}) => {
  const bun = await bunInvocation();
  const { stdout: npmVersion } = await execute("npm", ["--version"], { env: process.env });
  if (npmVersion.trim() !== npmInstaller.slice("npm@".length)) {
    throw new Error(`consumer npm must be ${npmInstaller}, received npm@${npmVersion.trim()}`);
  }
  if (build) {
    await execute(bun, ["run", "build"], { cwd: repository, env: process.env, maxBuffer: 16 * 1024 * 1024 });
  }
  const temporaryRoot = assertOwnedTemporaryRoot(await mkdtemp(join(tmpdir(), temporaryPrefix)));
  try {
    const packDirectory = candidateDirectory ?? join(temporaryRoot, "tarballs");
    const tarballs = await packPackages(bun, packDirectory);
    const candidates = await candidateDescriptors(tarballs);
    const versions = Object.fromEntries(await Promise.all(
      ["effect", "@effect/platform-node", "typescript", "@types/node"].map(
        async (name) => [name, await readInstalledVersion(repository, name)],
      ),
    ));
    versions["@effect/platform-node-shared"] = await readResolvedDependencyVersion(
      repository,
      "@effect/platform-node",
      "@effect/platform-node-shared",
    );
    if (
      versions.effect !== versions["@effect/platform-node"]
      || versions.effect !== versions["@effect/platform-node-shared"]
    ) {
      throw new Error("workspace Effect and platform development versions differ");
    }
    const consumers = [];
    for (const installer of ["npm", "bun"]) {
      for (const name of packageNames) {
        consumers.push(await installIsolatedFixture({
          installer,
          name,
          tarballs,
          root: temporaryRoot,
          bun,
          versions,
          candidates,
        }));
      }
      for (const producer of ["esbuild", "bun"]) {
        consumers.push(await installComposedFixture({
          installer,
          producer,
          tarballs,
          root: temporaryRoot,
          bun,
          versions,
          candidates,
        }));
      }
    }
    if (candidateDirectory !== undefined) await writeCandidateManifest(candidateDirectory, candidates, consumers);
    console.log("packed consumers verified: 14/14");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await verifyPackedConsumers(parseArguments(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
