import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

export const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const integrity = (bytes) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
export const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

// The job output binds the manifest; the manifest binds every tarball. Local consumers may omit
// the expected digest. A rebuild is a new candidate, never an assertion of reproducibility.
export const readCandidate = (directory, expectedDigest = process.env.CANDIDATE_SHA256) => {
  const bytes = readFileSync(resolve(directory, "release-candidate.json"));
  if (expectedDigest !== undefined && (!/^[a-f0-9]{64}$/u.test(expectedDigest) || digest(bytes) !== expectedDigest)) {
    throw new Error("candidate manifest does not match the packing job's digest");
  }
  const manifest = JSON.parse(bytes);
  if (
    !stableVersion.test(manifest.version) || manifest.tag !== `v${manifest.version}`
    || !/^[a-f0-9]{40}$/u.test(manifest.sourceSha)
    || !Array.isArray(manifest.packages) || manifest.packages.length === 0
  ) throw new Error("invalid release candidate identity or package list");
  const files = new Set(["release-candidate.json"]);
  const names = new Set();
  for (const entry of manifest.packages) {
    if (
      typeof entry.name !== "string" || !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/u.test(entry.name)
      || names.has(entry.name) || typeof entry.file !== "string" || basename(entry.file) !== entry.file
      || entry.file.includes("\\") || !entry.file.endsWith(".tgz") || files.has(entry.file)
    ) throw new Error("invalid or duplicate candidate package");
    names.add(entry.name);
    files.add(entry.file);
    const tarball = readFileSync(resolve(directory, entry.file));
    if (tarball.length !== entry.bytes || digest(tarball) !== entry.sha256 || integrity(tarball) !== entry.integrity) {
      throw new Error(`${entry.file}: candidate tarball bytes do not match the manifest`);
    }
  }
  const actualFiles = readdirSync(directory);
  if (actualFiles.length !== files.size || actualFiles.some((file) => !files.has(file))) {
    throw new Error("candidate directory contains files not listed in the manifest");
  }
  return manifest;
};
