import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readCandidate } from "./candidate.mjs";
import { createNpmAdapter } from "./npm.mjs";

export const EXIT = { FAILED: 1, CONFLICT: 2, UNKNOWN: 3 };
const fail = (code, message) => {
  throw Object.assign(new Error(message), { code });
};
const classify = (observation, entry) =>
  observation.status !== "present"
    ? observation.status
    : observation.integrity === entry.integrity
    ? "matching"
    : "conflict";

// Registry versions are immutable; latest is mutable. Serializing complete release workflows
// prevents our own different versions from racing. All mutations use the retained candidate bytes.
export const publish = async ({ manifest, npm, clock, log = console.log, visibilityTimeoutMs = 15 * 60_000 }) => {
  const { version, packages } = manifest;
  const observe = async (entry) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const observation = await npm.viewVersion(entry.name, version);
      if (observation.status !== "unknown") return classify(observation, entry);
      if (attempt < 2) await clock.sleep(2_000);
    }
    return "unknown";
  };
  const missing = [];
  for (const entry of packages) {
    const state = await observe(entry);
    if (state === "unknown") fail(EXIT.UNKNOWN, `${entry.name}: registry read inconclusive; retry later`);
    if (state === "conflict") {
      fail(EXIT.CONFLICT, `${entry.name}@${version}: published bytes differ; preserve the candidate and investigate`);
    }
    const latest = await npm.latestTag(entry.name);
    if (latest.status === "unknown") fail(EXIT.UNKNOWN, `${entry.name}: latest could not be read; retry later`);
    if (latest.status === "present" && npm.newerThan(latest.version, version)) {
      fail(EXIT.CONFLICT, `${entry.name}: latest is already ${latest.version}; refusing to move it back to ${version}`);
    }
    if (state === "absent") missing.push(entry);
  }

  // Check every missing package's OIDC binding immediately before publication. npm's own dry-run
  // is not certification: require its successful exchange marker as well as its exit status.
  for (const entry of missing) {
    const result = await npm.publish(entry, { dryRun: true });
    if (!result.ok) {
      fail(
        EXIT.FAILED,
        `${entry.name}: preflight did not confirm a successful OIDC exchange; check trusted-publisher configuration`,
      );
    }
  }
  for (const entry of missing) {
    log(`Publishing ${entry.name}@${version}`);
    const result = await npm.publish(entry, { dryRun: false });
    if (result.ok) continue;
    // With PUT retries disabled a lost response is still ambiguous. Observe before attempting any
    // further upload. A future rerun observes again; it never trusts the previous command's exit.
    const deadline = clock.now() + visibilityTimeoutMs;
    let state;
    do {
      state = await observe(entry);
      if (state === "matching") break;
      if (state === "conflict") fail(EXIT.CONFLICT, `${entry.name}@${version}: conflicting published bytes`);
      if (clock.now() >= deadline) {
        fail(
          EXIT.UNKNOWN,
          `${entry.name}@${version}: publication outcome unknown; retain this candidate and retry later`,
        );
      }
      await clock.sleep(10_000);
    } while (true);
  }

  const deadline = clock.now() + visibilityTimeoutMs;
  const pending = new Set(packages.map((entry) => entry.name));
  const wrongTags = new Map();
  while (pending.size) {
    for (const entry of packages) {
      if (!pending.has(entry.name)) continue;
      const state = await observe(entry);
      if (state === "conflict") fail(EXIT.CONFLICT, `${entry.name}@${version}: registry contains different bytes`);
      if (state !== "matching") continue;
      const latest = await npm.latestTag(entry.name);
      if (latest.status === "present" && latest.version === version) {
        pending.delete(entry.name);
        wrongTags.delete(entry.name);
      } else if (latest.status === "present") {
        if (npm.newerThan(latest.version, version)) {
          fail(
            EXIT.CONFLICT,
            `${entry.name}: another publication moved latest to ${latest.version}; do not downgrade it`,
          );
        }
        wrongTags.set(entry.name, latest.version);
      } else if (latest.status === "absent") wrongTags.set(entry.name, "(missing)");
      else wrongTags.delete(entry.name);
    }
    if (!pending.size) break;
    if (clock.now() >= deadline) {
      if (wrongTags.size) {
        fail(
          EXIT.CONFLICT,
          `Matching package bytes are published, but latest differs: ${
            [...wrongTags].map(([name, tag]) => `${name}=${tag}`).join(", ")
          }. Repair the dist-tags with authorized npm access, then rerun; uploading again cannot repair them.`,
        );
      }
      fail(
        EXIT.UNKNOWN,
        `Registry visibility is still inconclusive for ${
          [...pending].join(", ")
        }; retain the candidate and retry later`,
      );
    }
    await clock.sleep(10_000);
  }
  log(`Published bytes and latest verified for ${packages.length} packages at ${version}`);
  return { published: missing.map((entry) => entry.name), skipped: packages.length - missing.length };
};

const main = async () => {
  if (!process.argv[2]) throw new Error("usage: node scripts/release/publish.mjs <candidate-directory>");
  const directory = resolve(process.argv[2]);
  const candidate = readCandidate(directory);
  const manifest = {
    ...candidate,
    packages: candidate.packages.map((entry) => ({ ...entry, tarball: resolve(directory, entry.file) })),
  };
  await publish({
    manifest,
    npm: createNpmAdapter({ cwd: directory }),
    clock: { now: Date.now, sleep: (ms) => new Promise((done) => setTimeout(done, ms)) },
  });
};
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = Number.isInteger(error.code) ? error.code : EXIT.FAILED;
  });
}
