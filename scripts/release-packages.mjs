import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const integrity = (bytes) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;

// npm.cmd cannot be execFile'd without a shell on Windows, and running npm-cli.js under
// process.execPath pins the npm/node pair that --provenance records.
export const npm = async (args, options = {}) => {
  const executable = process.platform === "win32"
    ? join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js")
    : await realpath(execFileSync("which", ["npm"], { encoding: "utf8" }).trim());
  return execFileSync(process.execPath, [executable, ...args], { stdio: "inherit", ...options });
};

export const pack = async (directory) => {
  // A release candidate is written once. Resumption consumes this directory unchanged.
  await mkdir(directory);
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const packages = [];
  for (const entry of (await readdir(join(root, "packages"))).sort()) {
    const cwd = join(root, "packages", entry);
    const manifest = JSON.parse(await readFile(join(cwd, "package.json"), "utf8"));
    if (manifest.private) continue;
    if (process.env.GITHUB_REF_TYPE === "tag" && process.env.GITHUB_REF_NAME !== `v${manifest.version}`) {
      throw new Error(`Tag does not match ${manifest.name}@${manifest.version}`);
    }
    const filename = `${manifest.name}-${manifest.version}.tgz`;
    execFileSync(process.env.BUN_EXECUTABLE ?? "bun", [
      "pm",
      "pack",
      "--filename",
      join(directory, filename),
      "--quiet",
    ], { cwd, stdio: ["ignore", "ignore", "inherit"] });
    packages.push({
      name: manifest.name,
      version: manifest.version,
      filename,
      integrity: integrity(await readFile(join(directory, filename))),
    });
  }
  const candidate = { schema: 1, commit, packages };
  await writeFile(join(directory, "manifest.json"), `${JSON.stringify(candidate, null, 2)}\n`, { flag: "wx" });
  return candidate;
};

export const readCandidate = async (directory) => {
  const candidate = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
  if (
    candidate.schema !== 1 || !/^[a-f0-9]{40}$/u.test(candidate.commit) || !Array.isArray(candidate.packages)
    || candidate.packages.length === 0
  ) {
    throw new Error("Invalid candidate manifest: expected schema 1, a 40-hex commit, and a non-empty packages list");
  }
  if (process.env.GITHUB_SHA && candidate.commit !== process.env.GITHUB_SHA) {
    throw new Error("Candidate commit differs from release commit");
  }
  const seen = new Set();
  for (const item of candidate.packages) {
    if (seen.has(item.name)) throw new Error(`Duplicate package in candidate: ${item.name}`);
    if (
      !/^effect-build(?:-[a-z-]+)?$/u.test(item.name) || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u.test(item.version)
      || item.filename !== `${item.name}-${item.version}.tgz`
    ) throw new Error(`Invalid package coordinates: ${item.name}@${item.version} as ${item.filename}`);
    seen.add(item.name);
    if (process.env.GITHUB_REF_TYPE === "tag" && process.env.GITHUB_REF_NAME !== `v${item.version}`) {
      throw new Error("Candidate version differs from release tag");
    }
    if (integrity(await readFile(join(directory, item.filename))) !== item.integrity) {
      throw new Error(`Candidate bytes changed: ${item.filename}`);
    }
  }
  return candidate;
};

const request = async (url) => fetch(url, { signal: AbortSignal.timeout(30_000) });

export const published = async (item, registry = "https://registry.npmjs.org/") => {
  const response = await request(new URL(`${encodeURIComponent(item.name)}/${item.version}`, registry));
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`Registry lookup failed for ${item.name}: HTTP ${response.status}`);
  const metadata = await response.json();
  if (metadata.name !== item.name || metadata.version !== item.version || metadata.dist?.integrity !== item.integrity) {
    throw new Error(`Published bytes differ from candidate: ${item.name}@${item.version}`);
  }
  const tarball = await request(metadata.dist.tarball);
  if (!tarball.ok) throw new Error(`Cannot verify published tarball for ${item.name}: HTTP ${tarball.status}`);
  if (integrity(Buffer.from(await tarball.arrayBuffer())) !== item.integrity) {
    throw new Error(`Published tarball failed integrity: ${item.name}`);
  }
  return true;
};

export const publish = async (directory, options = {}) => {
  const candidate = await readCandidate(directory);
  const registry = options.registry ?? "https://registry.npmjs.org/";
  const publishPackage = options.publishPackage
    ?? ((item) =>
      npm(["publish", join(directory, item.filename), "--registry", registry, "--access", "public", "--provenance"]));
  const existing = new Set();
  // Refuse any conflicting release coordinate before uploading the first missing package.
  for (const item of candidate.packages) {
    if (await published(item, registry)) existing.add(item.name);
  }
  for (const item of candidate.packages) {
    if (existing.has(item.name)) {
      console.log(`Already published identical bytes: ${item.name}@${item.version}`);
      continue;
    }
    let failure;
    try {
      await publishPackage(item);
    } catch (cause) {
      // An upload can succeed before the connection fails. Observe before deciding.
      failure = cause;
    }
    let observed = false;
    for (let attempt = 0; attempt < (options.attempts ?? 6); attempt++) {
      if (attempt > 0) await new Promise((resume) => setTimeout(resume, options.delayMs ?? 5_000));
      if (await published(item, registry)) {
        observed = true;
        break;
      }
    }
    if (!observed) {
      throw new Error(`Publication is unconfirmed for ${item.name}; resume with these exact tarballs`, {
        cause: failure,
      });
    }
    console.log(`Verified published bytes: ${item.name}@${item.version}`);
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, output, ...extra] = process.argv.slice(2);
  if (!output || extra.length || !["pack", "check", "publish"].includes(command)) {
    throw new Error("Usage: node scripts/release-packages.mjs pack|check|publish <candidate-directory>");
  }
  const directory = resolve(output);
  if (command === "pack") await pack(directory);
  if (command === "check") await readCandidate(directory);
  if (command === "publish") await publish(directory);
}
