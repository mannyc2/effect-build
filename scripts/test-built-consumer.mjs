import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
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
const packageNames = ["effect-build", "effect-build-bun", "effect-build-deno"];
const providerNames = ["effect-build-bun", "effect-build-deno"];
const documentationContracts = [
  { path: "README.md", owners: ["effect-build-bun", "effect-build-bun", "effect-build-bun"] },
  {
    path: "docs/api.md",
    owners: [
      undefined,
      "effect-build-bun",
      "effect-build-deno",
      "effect-build-bun",
      "effect-build-bun",
      "effect-build-bun",
      "effect-build-bun",
      "effect-build-bun",
      undefined,
      "effect-build-bun",
      "effect-build-bun",
    ],
  },
  { path: "docs/drivers.md", owners: ["effect-build-bun", "effect-build-deno"] },
  { path: "packages/effect-build-bun/README.md", owners: ["effect-build-bun"] },
  { path: "packages/effect-build-deno/README.md", owners: ["effect-build-deno"] },
];
const exactSemver = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

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
  const manifest = JSON.parse(await readFile(join(root, "node_modules", ...packageName.split("/"), "package.json"), "utf8"));
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
  const exports = manifest.exports;
  if (exports === null || typeof exports !== "object" || Array.isArray(exports)) {
    throw new Error(`${expectedName} has no packed export map`);
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
  if (expectedName === "effect-build") {
    if (manifest.dependencies !== undefined || JSON.stringify(Object.keys(exports)) !== JSON.stringify([".", "./Provider"])) {
      throw new Error("packed core dependency or export graph drifted");
    }
  } else {
    if (manifest.dependencies?.["effect-build"] !== `^${packageVersion}` || Object.keys(exports).join() !== ".") {
      throw new Error(`${expectedName} did not rewrite workspace:^ to ^${packageVersion}`);
    }
  }
  return { manifest, entries };
};

const packPackages = async (bun, destination) => {
  await mkdir(destination, { recursive: true });
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

const typeScriptSource = (provider) => {
  if (provider === undefined) {
    return [
      'import * as Core from "effect-build";',
      'import * as Provider from "effect-build/Provider";',
      "export const artifactSchema = Core.Artifact.Artifact;",
      "export const defineProvider = Provider.define;",
    ].join("\n");
  }
  const alias = "Compiler";
  const target = provider === "effect-build-bun" ? "linux-x64-musl" : "windows-aarch64";
  const options = provider === "effect-build-bun" ? "{ minify: true }" : "{ bundle: true, minify: true }";
  return [
    'import { Effect } from "effect";',
    `import * as ${alias} from ${JSON.stringify(provider)};`,
    `export const scalar = ${alias}.compileExecutable({ entrypoint: "src/main.ts", outfile: "dist/app", target: ${JSON.stringify(target)}, options: ${options} });`,
    `export const matrix = ${alias}.compileExecutableMatrix({ entrypoint: "src/main.ts", outdir: "dist", name: "app", targets: [${JSON.stringify(target)}] });`,
    `export type ScalarContext = typeof scalar extends Effect.Effect<unknown, unknown, infer R> ? R : never;`,
    `export const targetSchema: typeof ${alias}.Target = ${alias}.Target;`,
  ].join("\n");
};

const runtimeSource = (provider) => {
  const otherProvider = provider === "effect-build-bun" ? "effect-build-deno" : "effect-build-bun";
  const lines = [
    'import assert from "node:assert/strict";',
    'const core = await import("effect-build");',
    'assert.deepEqual(Object.keys(core), ["Artifact", "BuildError", "MatrixError", "Target"]);',
    'const author = await import("effect-build/Provider");',
    'assert.deepEqual(Object.keys(author), ["define"]);',
    'const removedBun = ["effect-build", "bun"].join("/");',
    'const removedDeno = ["effect-build", "deno"].join("/");',
    'for (const path of [removedBun, removedDeno, "effect-build/internal", "effect-build/standalone/internal/Process.js"]) {',
    '  await import(path).then(() => { throw new Error(`private or legacy path resolved: ${path}`); }, () => undefined);',
    '}',
  ];
  if (provider !== undefined) {
    lines.push(
      'const { Effect } = await import("effect");',
      `const selected = await import(${JSON.stringify(provider)});`,
      'assert.deepEqual(Object.keys(selected), ["Compiler", "Target", "compileExecutable", "compileExecutableMatrix", "layer"]);',
      'const dispatches = [];',
      'const artifactFor = (input, target) => ({',
      '  path: input.outfile ?? `dist/app-${target}`,' ,
      '  bytes: 1,',
      '  target,',
      `  tool: { name: ${JSON.stringify(provider === "effect-build-bun" ? "bun" : "deno")}, version: "fixture", path: "/fixture/compiler" },`,
      '});',
      'const fakeCompiler = {',
      '  compileExecutable: (input) => {',
      '    dispatches.push("scalar");',
      '    return Effect.succeed(artifactFor(input, input.target));',
      '  },',
      '  compileExecutableMatrix: (input) => {',
      '    dispatches.push("matrix");',
      '    return Effect.succeed(input.targets.map((target) => artifactFor(input, target)));',
      '  },',
      '};',
      'const target = selected.Target.literals[0];',
      'const scalar = await Effect.runPromise(selected.compileExecutable({ entrypoint: "src/main.ts", outfile: "dist/app", target }).pipe(Effect.provideService(selected.Compiler, fakeCompiler)));',
      'assert.equal(scalar.target, target);',
      'const matrix = await Effect.runPromise(selected.compileExecutableMatrix({ entrypoint: "src/main.ts", outdir: "dist", name: "app", targets: [target] }).pipe(Effect.provideService(selected.Compiler, fakeCompiler)));',
      'assert.deepEqual(matrix.map((artifact) => artifact.target), [target]);',
      'assert.deepEqual(dispatches, ["scalar", "matrix"]);',
      `await import(${JSON.stringify(`${provider}/Adapter`)}).then(() => { throw new Error("provider private path resolved"); }, () => undefined);`,
      `await import(${JSON.stringify(otherProvider)}).then(() => { throw new Error("unselected provider resolved"); }, () => undefined);`,
    );
  }
  return lines.join("\n");
};

const typeScriptBlocks = (markdown) =>
  [...markdown.matchAll(/```(?:ts|typescript)\n([\s\S]*?)```/g)].map((match) => match[1]);

const documentationSource = (source) => {
  const imports = [];
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (/\bEffect\./.test(code) && !/import\s+\{[^}]*\bEffect\b[^}]*\}\s+from\s+["']effect["']/.test(code)) {
    imports.push('import { Effect } from "effect";');
  }
  if (/\bNodeServices\./.test(code) && !/\bNodeServices\b[^\n]*from\s+["']@effect\/platform-node["']/.test(code)) {
    imports.push('import { NodeServices } from "@effect/platform-node";');
  }
  if (/\bBun\./.test(code) && !/import\s+\*\s+as\s+Bun\s+from/.test(code)) {
    imports.push('import * as Bun from "effect-build-bun";');
  }
  if (/\bDeno\./.test(code) && !/import\s+\*\s+as\s+Deno\s+from/.test(code)) {
    imports.push('import * as Deno from "effect-build-deno";');
  }
  if (/\bBuildError\./.test(code) && !/\bBuildError\b[^\n]*from\s+["']effect-build["']/.test(code)) {
    imports.push('import { BuildError } from "effect-build";');
  }
  if (/\bTarget\./.test(code) && !/\bTarget\b[^\n]*from\s+["']effect-build["']/.test(code)) {
    imports.push('import { Target } from "effect-build";');
  }
  const trimmed = source.trim();
  const body = trimmed.startsWith("Effect.Effect<")
    ? `export type DocumentedEffect = ${trimmed.replace(/;$/, "")};`
    : trimmed;
  return `${imports.join("\n")}${imports.length === 0 ? "" : "\n"}${body}\n`;
};

const writeDocumentationSources = async (fixture, provider) => {
  const directory = join(fixture, "documentation");
  await mkdir(directory, { recursive: true });
  let written = 0;
  for (const contract of documentationContracts) {
    const blocks = typeScriptBlocks(await readFile(join(repository, contract.path), "utf8"));
    if (blocks.length !== contract.owners.length) {
      throw new Error(`${contract.path} TypeScript block count drifted: expected ${contract.owners.length}, received ${blocks.length}`);
    }
    for (const [index, owner] of contract.owners.entries()) {
      if (owner !== provider) continue;
      const filename = `${contract.path.replaceAll("/", "-").replaceAll(".", "-")}-${index}.ts`;
      await writeFile(join(directory, filename), documentationSource(blocks[index]));
      written += 1;
    }
  }
  if (written === 0) throw new Error(`no documentation consumer blocks assigned to ${provider ?? "effect-build"}`);
};

const installFixture = async ({ installer, provider, tarballs, root, bun, versions }) => {
  const label = `${installer}-${provider ?? "core"}`;
  const fixture = join(root, "fixtures", label);
  const cache = join(root, "caches", label);
  await mkdir(fixture, { recursive: true });
  const dependencies = {
    "@types/node": versions["@types/node"],
    effect: versions.effect,
    "effect-build": `file:${tarballs.get("effect-build")}`,
    typescript: versions.typescript,
    ...(provider === undefined
      ? {}
      : {
        "@effect/platform-node": versions["@effect/platform-node"],
        [provider]: `file:${tarballs.get(provider)}`,
      }),
  };
  const manifest = {
    name: `fixture-${label}`,
    private: true,
    type: "module",
    dependencies,
    ...(provider === undefined
      ? {}
      : {
        overrides: {
          "@effect/platform-node-shared": versions["@effect/platform-node-shared"],
          ...(installer === "bun" ? { "effect-build": `file:${tarballs.get("effect-build")}` } : {}),
        },
      }),
  };
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
  for (const [name, version] of Object.entries(versions)) {
    if (name === "@effect/platform-node" && provider === undefined) continue;
    if (name === "typescript" || name === "@types/node" || name === "effect" || provider !== undefined) {
      const installedVersion = name === "@effect/platform-node-shared"
        ? await readResolvedDependencyVersion(fixture, "@effect/platform-node", name)
        : await readInstalledVersion(fixture, name);
      if (installedVersion !== version) throw new Error(`${label} resolved an unexpected ${name}`);
    }
  }
  if (await readInstalledVersion(fixture, "effect-build") !== packageVersion) throw new Error(`${label} did not resolve core 0.3.0`);
  if (provider !== undefined && await readInstalledVersion(fixture, provider) !== packageVersion) {
    throw new Error(`${label} did not resolve ${provider}@0.3.0`);
  }
  const absent = provider === "effect-build-bun" ? "effect-build-deno" : "effect-build-bun";
  if (provider === undefined) {
    for (const name of providerNames) await access(join(fixture, "node_modules", name)).then(
      () => { throw new Error(`${label} unexpectedly installed ${name}`); },
      () => undefined,
    );
  } else {
    await access(join(fixture, "node_modules", absent)).then(
      () => { throw new Error(`${label} unexpectedly installed ${absent}`); },
      () => undefined,
    );
  }
  await writeFile(join(fixture, "main.ts"), typeScriptSource(provider));
  await writeDocumentationSources(fixture, provider);
  if (provider !== undefined) {
    const exampleProvider = provider === "effect-build-bun" ? "bun" : "deno";
    const examples = exampleProvider === "bun" ? ["compile.ts", "matrix.ts"] : ["compile.ts"];
    const exampleDirectory = join(fixture, "examples");
    await mkdir(exampleDirectory, { recursive: true });
    for (const example of examples) {
      await writeFile(
        join(exampleDirectory, example),
        await readFile(join(repository, "examples", exampleProvider, "src", example), "utf8"),
      );
    }
  }
  await writeFile(join(fixture, "runtime.mjs"), runtimeSource(provider));
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
    include: ["*.ts", "documentation/**/*.ts", "examples/**/*.ts"],
  }, null, 2)}\n`);
  await execute(process.execPath, [join(fixture, "node_modules", "typescript", "bin", "tsc"), "-p", "."], { cwd: fixture });
  await execute(process.execPath, [join(fixture, "runtime.mjs")], { cwd: fixture });
  console.log(`PASS packed consumer ${label}`);
};

const writeCandidateManifest = async (directory, tarballs) => {
  const packages = [];
  for (const name of packageNames) {
    const tarball = tarballs.get(name);
    const bytes = await readFile(tarball);
    const manifest = await packedManifest(tarball);
    packages.push({
      name,
      version: manifest.version,
      filename: basename(tarball),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      dependencies: manifest.dependencies ?? {},
      peerDependencies: manifest.peerDependencies ?? {},
    });
  }
  await writeFile(join(directory, "manifest.json"), `${JSON.stringify({ version: 1, packages }, null, 2)}\n`);
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
    if (versions.effect !== versions["@effect/platform-node"]) {
      throw new Error("workspace Effect and platform-node development versions differ");
    }
    if (versions.effect !== versions["@effect/platform-node-shared"]) {
      throw new Error("workspace Effect and platform-node-shared development versions differ");
    }
    for (const installer of ["npm", "bun"]) {
      for (const provider of [undefined, ...providerNames]) {
        await installFixture({ installer, provider, tarballs, root: temporaryRoot, bun, versions });
      }
    }
    if (candidateDirectory !== undefined) await writeCandidateManifest(candidateDirectory, tarballs);
    console.log("packed consumers verified: 6/6");
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
