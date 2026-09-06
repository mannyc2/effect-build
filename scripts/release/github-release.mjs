import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { digest, readCandidate } from "./candidate.mjs";

// gh release view resolves both published tags and drafts' pending tag names.
// The REST by-tag endpoint cannot find drafts; use the resulting database ID.
export const observeRelease = (repository, tag, execute = execFileSync) => {
  let output;
  try {
    output = execute("gh", ["release", "view", tag, "--repo", repository, "--json", "databaseId"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (error.status === 1 && String(error.stderr).trim() === "release not found") return undefined;
    throw error;
  }
  const { databaseId } = JSON.parse(output);
  return JSON.parse(
    execute("gh", ["api", `repos/${repository}/releases/${databaseId}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
};

export const discardFailedUpload = ({ repository, release, asset, expectedFile, execute = execFileSync }) => {
  if (!expectedFile) {
    throw new Error(`unexpected GitHub Release asset ${asset.name}; inspect the release before retrying`);
  }
  if (asset.state !== "starter") return false;
  if (!release.draft) {
    throw new Error(`${asset.name}: published release contains an unfinished upload; inspect it before retrying`);
  }
  // GitHub documents empty starter assets left by a failed upload as safe to delete.
  // Delete that exact asset ID; completed assets must still pass the digest comparison.
  execute("gh", ["api", "--method", "DELETE", `repos/${repository}/releases/assets/${asset.id}`], { stdio: "inherit" });
  return true;
};

const main = async () => {
  if (!process.argv[2] || !process.env.GITHUB_REPOSITORY || !process.env.GH_TOKEN) {
    throw new Error(
      "usage: GITHUB_REPOSITORY=owner/repo GH_TOKEN=... node scripts/release/github-release.mjs <candidate-directory>",
    );
  }
  const directory = resolve(process.argv[2]);
  const candidate = readCandidate(directory);
  const repository = process.env.GITHUB_REPOSITORY;
  const scratch = mkdtempSync(join(tmpdir(), "effect-build-release-"));
  const gh = (...args) => execFileSync("gh", [...args, "--repo", repository], { stdio: "inherit" });

  try {
    const files = [...candidate.packages.map((entry) => entry.file), "release-candidate.json"];
    const checksums = files.map((file) => `${digest(readFileSync(join(directory, file)))}  ${file}`).join("\n") + "\n";
    writeFileSync(join(scratch, "SHA256SUMS"), checksums);
    const paths = new Map(files.map((file) => [file, join(directory, file)]));
    paths.set("SHA256SUMS", join(scratch, "SHA256SUMS"));
    let release = observeRelease(repository, candidate.tag);
    if (!release) {
      gh(
        "release",
        "create",
        candidate.tag,
        "--draft",
        "--verify-tag",
        "--title",
        `effect-build ${candidate.tag}`,
        "--generate-notes",
      );
      release = observeRelease(repository, candidate.tag);
      if (!release) throw new Error("created release not yet observable; retry later");
    }
    // A failed upload or a lost publication response can be retried without replacing any assets.
    // Existing assets must match, whether the release is still a draft or already immutable.
    for (const asset of release.assets) {
      const path = paths.get(asset.name);
      if (discardFailedUpload({ repository, release, asset, expectedFile: path })) continue;
      let remoteDigest = asset.digest;
      if (!remoteDigest) {
        const downloaded = join(scratch, "downloaded");
        gh("release", "download", candidate.tag, "--pattern", asset.name, "--dir", downloaded);
        remoteDigest = `sha256:${digest(readFileSync(join(downloaded, asset.name)))}`;
      }
      if (remoteDigest !== `sha256:${digest(readFileSync(path))}`) {
        throw new Error(`${asset.name}: existing GitHub asset differs from the candidate`);
      }
      paths.delete(asset.name);
    }
    if (!release.draft && paths.size) {
      throw new Error("published release is missing candidate assets; inspect it before retrying");
    }
    for (const path of paths.values()) gh("release", "upload", candidate.tag, path);
    if (release.draft) gh("release", "edit", candidate.tag, "--draft=false");
    release = observeRelease(repository, candidate.tag);
    if (!release?.immutable || release.draft) {
      throw new Error("GitHub Release is not immutable; inspect repository release settings");
    }
    console.log(`Immutable GitHub Release complete: ${release.html_url}`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
