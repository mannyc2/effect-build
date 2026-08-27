import { execFile } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { hex, sha256 } from "../node-finalizer/common.mjs";
import { packageVersion } from "./receipt.mjs";

const execute = promisify(execFile);

const git = async (repositoryRoot, args) => {
  const completion = await execute("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  return completion.stdout.trim();
};

export const authenticateCertificationSource = async ({ repositoryRoot, expectedSourceSha }) => {
  const canonicalRoot = await realpath(repositoryRoot);
  const observedRoot = await realpath(await git(canonicalRoot, ["rev-parse", "--show-toplevel"]));
  if (observedRoot !== canonicalRoot) throw new Error("Apple certification must run at the repository root");
  const sourceSha = hex(await git(canonicalRoot, ["rev-parse", "HEAD"]), 40, "certification source SHA");
  if (sourceSha !== expectedSourceSha) throw new Error("certification source SHA does not match the authenticated candidate");
  const status = await git(canonicalRoot, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status !== "") throw new Error("Apple certification requires a clean worktree including untracked files");
  const manifestPath = join(canonicalRoot, "package.json");
  const bunLockPath = join(canonicalRoot, "bun.lock");
  const [manifestMetadata, bunLockMetadata] = await Promise.all([lstat(manifestPath), lstat(bunLockPath)]);
  if (
    !manifestMetadata.isFile() || manifestMetadata.size <= 0 || manifestMetadata.size > 1024 * 1024
    || !bunLockMetadata.isFile() || bunLockMetadata.size <= 0 || bunLockMetadata.size > 64 * 1024 * 1024
  ) {
    throw new Error("Apple certification package.json and bun.lock must be regular files");
  }
  const [manifestBytes, bunLockBytes] = await Promise.all([
    readFile(manifestPath),
    readFile(bunLockPath),
  ]);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (manifest.version !== packageVersion) throw new Error(`Apple certification requires package version ${packageVersion}`);
  return Object.freeze({
    repositoryRoot: canonicalRoot,
    sourceSha,
    packageVersion,
    bunLockSha256: sha256(bunLockBytes),
    cleanWorktree: true,
  });
};

export const reauthenticateCertificationSource = async (identity) => {
  const current = await authenticateCertificationSource({
    repositoryRoot: identity.repositoryRoot,
    expectedSourceSha: identity.sourceSha,
  });
  if (
    current.packageVersion !== identity.packageVersion || current.bunLockSha256 !== identity.bunLockSha256
    || current.cleanWorktree !== identity.cleanWorktree
  ) throw new Error("certification source identity changed");
  return identity;
};
