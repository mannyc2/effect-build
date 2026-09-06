import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { digest, integrity, readCandidate, stableVersion } from "./candidate.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const [destination, tag] = process.argv.slice(2);
const version = tag?.slice(1);
if (!destination || tag !== `v${version}` || !stableVersion.test(version)) {
  throw new Error("usage: node scripts/release/pack-candidate.mjs <new-directory> v<major>.<minor>.<patch>");
}
const directory = resolve(destination);
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
if (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== sourceSha) {
  throw new Error("checkout differs from release source");
}
const manifests = readdirSync(resolve(root, "packages"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const cwd = resolve(root, "packages", entry.name);
    return { cwd, manifest: JSON.parse(readFileSync(resolve(cwd, "package.json"), "utf8")) };
  })
  .filter(({ manifest }) => manifest.private !== true)
  .sort((a, b) =>
    a.manifest.name === "effect-build"
      ? -1
      : b.manifest.name === "effect-build"
      ? 1
      : a.manifest.name.localeCompare(b.manifest.name)
  );
for (const { manifest } of manifests) {
  if (manifest.version !== version) {
    throw new Error(`${manifest.name}: version ${manifest.version} differs from ${tag}`);
  }
}
mkdirSync(directory); // Never mix a new build with a retained candidate.
const packages = manifests.map(({ cwd, manifest }) => {
  const file = `${manifest.name.replace(/^@/u, "").replaceAll("/", "-")}-${version}.tgz`;
  execFileSync("bun", ["pm", "pack", "--filename", resolve(directory, file)], { cwd, stdio: "inherit" });
  const bytes = readFileSync(resolve(directory, file));
  return { name: manifest.name, file, bytes: bytes.length, sha256: digest(bytes), integrity: integrity(bytes) };
});
const bytes = Buffer.from(`${JSON.stringify({ sourceSha, tag, version, packages }, null, 2)}\n`);
writeFileSync(resolve(directory, "release-candidate.json"), bytes);
readCandidate(directory, digest(bytes));
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\nmanifest-sha256=${digest(bytes)}\n`);
}
console.log(`Packed ${packages.length} packages for ${tag}; candidate sha256 ${digest(bytes)}`);
