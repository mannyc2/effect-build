import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), "effect-build-versioning-research-"));

const writePackage = async (directory, json, source) => {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "package.json"), JSON.stringify(json, null, 2));
  await writeFile(join(directory, "index.js"), source);
};

const pack = async (directory, destination) => {
  const result = await execFileAsync("npm", ["pack", "--json", "--pack-destination", destination], {
    cwd: directory,
    maxBuffer: 8 * 1024 * 1024,
    timeout: 120_000,
    env: { ...process.env, npm_config_cache: join(root, "npm-cache") },
  });
  const parsed = JSON.parse(result.stdout);
  return join(destination, parsed[0].filename);
};

const install = async (application) => {
  try {
    const result = await execFileAsync(
      "npm",
      ["install", "--offline", "--strict-peer-deps", "--ignore-scripts", "--no-audit", "--no-fund"],
      {
        cwd: application,
        maxBuffer: 8 * 1024 * 1024,
        timeout: 120_000,
        env: { ...process.env, npm_config_cache: join(root, "npm-cache") },
      },
    );
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

try {
  const core040 = join(root, "core-0.4.0");
  const core050 = join(root, "core-0.5.0");
  const provider = join(root, "provider-0.7.0");
  await writePackage(
    core040,
    { name: "effect-build", version: "0.4.0", type: "module", exports: "./index.js" },
    'export const coreVersion = "0.4.0";\n',
  );
  await writePackage(
    core050,
    { name: "effect-build", version: "0.5.0", type: "module", exports: "./index.js" },
    'export const coreVersion = "0.5.0";\n',
  );
  await writePackage(
    provider,
    {
      name: "effect-build-bun",
      version: "0.7.0",
      type: "module",
      exports: "./index.js",
      peerDependencies: { "effect-build": ">=0.4.0 <0.5.0" },
    },
    'import { coreVersion } from "effect-build"; export const observation = { providerVersion: "0.7.0", coreVersion };\n',
  );

  const packed = join(root, "packed");
  await mkdir(packed, { recursive: true });
  const core040Tarball = await pack(core040, packed);
  const core050Tarball = await pack(core050, packed);
  const providerTarball = await pack(provider, packed);

  const compatible = join(root, "compatible-app");
  await writePackage(
    compatible,
    {
      name: "compatible-app",
      private: true,
      type: "module",
      dependencies: {
        "effect-build": `file:${core040Tarball}`,
        "effect-build-bun": `file:${providerTarball}`,
      },
    },
    'import { observation } from "effect-build-bun"; console.log(JSON.stringify(observation));\n',
  );
  const compatibleInstall = await install(compatible);
  if (!compatibleInstall.ok) throw new Error(`compatible independent install failed: ${compatibleInstall.stderr}`);
  const compatibleRun = await execFileAsync(process.execPath, [join(compatible, "index.js")]);

  const incompatible = join(root, "incompatible-app");
  await writePackage(
    incompatible,
    {
      name: "incompatible-app",
      private: true,
      type: "module",
      dependencies: {
        "effect-build": `file:${core050Tarball}`,
        "effect-build-bun": `file:${providerTarball}`,
      },
    },
    'export {};\n',
  );
  const incompatibleInstall = await install(incompatible);

  console.log(`EFFECT_BUILD_VERSIONING_RECEIPT=${JSON.stringify({
    compatible: {
      installed: compatibleInstall.ok,
      observation: JSON.parse(compatibleRun.stdout.trim()),
      lockCreated: (await readFile(join(compatible, "package-lock.json"), "utf8")).length > 0,
    },
    incompatible: {
      rejectedByPeerRange: !incompatibleInstall.ok,
      stderr: incompatibleInstall.stderr.slice(0, 4_096),
    },
    conclusion: !incompatibleInstall.ok
      ? "coordinated-0.4-cut-independent-provider-releases-technically-coherent"
      : "peer-range-did-not-enforce-boundary",
  })}`);
} finally {
  await rm(root, { recursive: true, force: true });
}
