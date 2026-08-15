import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, delimiter, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

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
const exactSemver = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

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
  "effect-build-bun": ["Compiler", "Target", "compileExecutable", "compileExecutableMatrix", "layer"],
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

const install = async ({ installer, fixture, cache, manifest, bun }) => {
  await writeFile(join(fixture, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(fixture, ".npmrc"), "@jsr:registry=https://npm.jsr.io\n");
  if (installer === "npm") {
    await execute("npm", ["install", "--ignore-scripts", "--strict-peer-deps", "--cache", cache], {
      cwd: fixture,
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
    });
  } else {
    await execute(bun, ["install", "--ignore-scripts", "--cache-dir", cache, "--no-progress"], {
      cwd: fixture,
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
    });
  }
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

const installIsolatedFixture = async ({ installer, name, tarballs, root, bun, versions }) => {
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
  await install({
    installer,
    fixture,
    cache,
    bun,
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
};

const compositionTypeScriptSource = [
  'import { NodeServices } from "@effect/platform-node";',
  'import { Effect } from "effect";',
  'import * as Esbuild from "effect-build-esbuild";',
  'import * as NodeSea from "effect-build-node-sea";',
  "export const program = Esbuild.withJavaScriptBundle(",
  '  { entrypoint: "src/main.ts", format: "esm" },',
  '  (main) => NodeSea.createExecutable({ main, outfile: "dist/app", digest: true }),',
  ").pipe(",
  "  Effect.provide(Esbuild.layer),",
  "  Effect.provide(NodeSea.layer()),",
  "  Effect.provide(NodeServices.layer),",
  ");",
].join("\n");

const installComposedFixture = async ({ installer, tarballs, root, bun, versions }) => {
  const label = `${installer}-esbuild-node-sea`;
  const fixture = join(root, "fixtures", label);
  const cache = join(root, "caches", label);
  await mkdir(fixture, { recursive: true });
  await install({
    installer,
    fixture,
    cache,
    bun,
    manifest: {
      name: `fixture-${label}`,
      private: true,
      type: "module",
      dependencies: {
        ...commonDependencies(versions, tarballs),
        "@effect/platform-node": versions["@effect/platform-node"],
        "effect-build-esbuild": `file:${tarballs.get("effect-build-esbuild")}`,
        "effect-build-node-sea": `file:${tarballs.get("effect-build-node-sea")}`,
      },
      overrides: commonOverrides(versions, installer, tarballs),
    },
  });
  await verifyDevelopmentDependencies(fixture, versions, true);
  for (const name of ["effect-build", "effect-build-esbuild", "effect-build-node-sea"]) {
    if (await readInstalledVersion(fixture, name) !== packageVersion) {
      throw new Error(`${label} did not resolve ${name}@${packageVersion}`);
    }
  }
  await assertCannotResolve(fixture, "effect-build-bun", label);
  await assertCannotResolve(fixture, "effect-build-deno", label);
  await writeFile(join(fixture, "main.ts"), compositionTypeScriptSource);
  await writeFile(join(fixture, "runtime.mjs"), [
    'import assert from "node:assert/strict";',
    'const Esbuild = await import("effect-build-esbuild");',
    'const NodeSea = await import("effect-build-node-sea");',
    'assert.equal(typeof Esbuild.withJavaScriptBundle, "function");',
    'assert.equal(typeof NodeSea.createExecutable, "function");',
  ].join("\n"));
  await runTypeAndRuntimeChecks(fixture);
  console.log(`PASS packed consumer ${label}`);
};

const sourceCommit = async () => {
  const { stdout } = await execute("git", ["rev-parse", "HEAD"], { cwd: repository });
  const source = stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(source)) throw new Error("HEAD is not an exact 40-character lowercase commit SHA");
  return source;
};

const writeCandidateManifest = async (directory, tarballs) => {
  const packages = [];
  for (const name of packageNames) {
    const tarball = tarballs.get(name);
    const contents = await readFile(tarball);
    const manifest = await packedManifest(tarball);
    packages.push({
      filename: basename(tarball),
      name,
      version: manifest.version,
      bytes: contents.byteLength,
      sha256: createHash("sha256").update(contents).digest("hex"),
      dependencies: manifest.dependencies ?? {},
      peerDependencies: manifest.peerDependencies ?? {},
      optionalDependencies: manifest.optionalDependencies ?? {},
    });
  }
  await writeFile(
    join(directory, "manifest.json"),
    `${JSON.stringify({ version: 1, source: await sourceCommit(), packages }, null, 2)}\n`,
  );
};

export const verifyPackedConsumers = async ({ candidateDirectory, build = true } = {}) => {
  const bun = await bunInvocation();
  if (build) {
    await execute(bun, ["run", "build"], { cwd: repository, env: process.env, maxBuffer: 16 * 1024 * 1024 });
  }
  const temporaryRoot = assertOwnedTemporaryRoot(await mkdtemp(join(tmpdir(), temporaryPrefix)));
  try {
    const packDirectory = candidateDirectory ?? join(temporaryRoot, "tarballs");
    const tarballs = await packPackages(bun, packDirectory);
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
    for (const installer of ["npm", "bun"]) {
      for (const name of packageNames) {
        await installIsolatedFixture({ installer, name, tarballs, root: temporaryRoot, bun, versions });
      }
      await installComposedFixture({ installer, tarballs, root: temporaryRoot, bun, versions });
    }
    if (candidateDirectory !== undefined) await writeCandidateManifest(candidateDirectory, tarballs);
    console.log("packed consumers verified: 12/12");
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
