import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { writeReceipt } from "./receipt.mjs";
import { assertion, repository, requiredPath, sourceSha } from "./probe-runtime.mjs";

const execFileAsync = promisify(execFile);
const endpoints = ["4.0.0-beta.104", "4.0.0-rc.108"];
const manifests = [
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
const effectPackages = new Set([
  "effect",
  "@effect/platform-bun",
  "@effect/platform-deno",
  "@effect/platform-node",
]);
const excluded = new Set([".git", "dist", "node_modules", "outputs", "work"]);

const packageManager = await requiredPath("EFFECT_BUILD_PACKAGE_MANAGER_BIN");

const shouldCopy = (source) => {
  const path = relative(repository, source);
  if (path === "") return true;
  if (path === ".." || path.startsWith(`..${sep}`)) return false;
  return !path.split(sep).some((component) => excluded.has(component))
    && !basename(path).endsWith(".tsbuildinfo");
};

const rewriteManifest = async (copy, manifestPath, endpoint) => {
  const path = join(copy, manifestPath);
  const manifest = JSON.parse(await readFile(path, "utf8"));
  for (const sectionName of ["dependencies", "devDependencies"]) {
    const section = manifest[sectionName];
    if (section === undefined) continue;
    for (const dependency of Object.keys(section)) {
      if (effectPackages.has(dependency)) section[dependency] = endpoint;
    }
  }
  if (manifestPath === "package.json") {
    manifest.overrides = {
      ...(manifest.overrides ?? {}),
      "@effect/platform-node-shared": endpoint,
    };
  }
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
};

const run = async (argv, cwd, environment) => {
  try {
    return await execFileAsync(packageManager, argv, {
      cwd,
      env: { ...process.env, ...environment },
      maxBuffer: 64 * 1024 * 1024,
      timeout: 600_000,
    });
  } catch (error) {
    const stderr = typeof error.stderr === "string" ? error.stderr : "";
    const stdout = typeof error.stdout === "string" ? error.stdout : "";
    throw new Error(
      `Effect endpoint command failed: bun ${argv.join(" ")}\n${stderr || stdout || (error instanceof Error ? error.message : String(error))}`,
      { cause: error },
    );
  }
};

const evidence = [];
for (const endpoint of endpoints) {
  const root = await mkdtemp(join(tmpdir(), `effect-build-contract-${endpoint.replaceAll(".", "-")}-`));
  const copy = join(root, "repository");
  try {
    await cp(repository, copy, { recursive: true, filter: shouldCopy });
    for (const manifest of manifests) await rewriteManifest(copy, manifest, endpoint);
    await rm(join(copy, "bun.lock"), { force: true });
    const cache = join(root, "cache");
    await mkdir(cache, { recursive: true });
    const environment = { BUN_INSTALL_CACHE_DIR: cache };
    await run(["install", "--cache-dir", cache], copy, environment);
    await run(["run", "build"], copy, environment);
    await run([
      "x",
      "tsc",
      "--ignoreConfig",
      "--noEmit",
      "--strict",
      "--exactOptionalPropertyTypes",
      "--skipLibCheck",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--target",
      "ES2022",
      "research/post-0.3/contracts.ts",
      "research/post-0.3/contracts.typecheck.ts",
    ], copy, environment);
    evidence.push({ endpoint, installed: true, built: true, contractsTypechecked: true });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

await writeReceipt({
  id: "effect-contract-endpoints",
  sourceSha,
  claims: [{
    id: "effect-contract-endpoints",
    classification: "established",
    conclusion: "exact-profile-contracts-compile-at-both-supported-effect-endpoints",
    assertions: endpoints.map((endpoint) => assertion(`effect-${endpoint}-contracts-typechecked`)),
  }],
  evidence,
});
