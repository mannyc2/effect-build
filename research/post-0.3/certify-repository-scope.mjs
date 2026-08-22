import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { conclusion, infrastructure, writeReceipt } from "./receipt.mjs";
import { assertion, sourceSha } from "./probe-runtime.mjs";

const execFileAsync = promisify(execFile);
const baseSha = process.env.RESEARCH_BASE_SHA;
const releaseSha = process.env.RESEARCH_RELEASE_SHA;
infrastructure(typeof baseSha === "string" && /^[0-9a-f]{40}$/.test(baseSha), "RESEARCH_BASE_SHA is missing");
infrastructure(
  typeof releaseSha === "string" && /^[0-9a-f]{40}$/.test(releaseSha),
  "RESEARCH_RELEASE_SHA is missing",
);

const git = async (argv) => {
  const { stdout } = await execFileAsync("git", argv, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
};
const isAncestor = async (ancestor, descendant) => {
  try {
    await git(["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch (error) {
    if (error?.code === 1) return false;
    throw error;
  }
};

const head = (await git(["rev-parse", "HEAD"])).trim();
conclusion(head === sourceSha, `checked-out source ${head} does not equal SOURCE_SHA ${sourceSha}`);
conclusion(await isAncestor(releaseSha, sourceSha), "released 0.3 source is not an ancestor of the research head");
conclusion(await isAncestor(baseSha, sourceSha), "approved research base is not an ancestor of the research head");

const changedPaths = (await git(["diff", "--name-only", "-z", `${baseSha}...${sourceSha}`]))
  .split("\0")
  .filter((path) => path.length > 0)
  .sort();
const allowedPath = (path) =>
  path === "AGENTS.md"
  || path === "dprint.json"
  || path === ".github/workflows/ci.yml"
  || path === ".github/workflows/release.yml"
  || path === ".github/workflows/architecture-research.yml"
  || path === ".github/workflows/research-source-export.yml"
  || path.startsWith("plans/")
  || path.startsWith("research/post-0.3/")
  || path.startsWith("test/architecture/");
const disallowedPaths = changedPaths.filter((path) => !allowedPath(path));
conclusion(
  disallowedPaths.length === 0,
  `research-only certification includes disallowed paths: ${disallowedPaths.join(", ")}`,
);

const changedPathDigest = createHash("sha256").update(changedPaths.join("\0")).digest("hex");
await writeReceipt({
  id: "repository-scope",
  sourceSha,
  claims: [{
    id: "research-only-repository-scope",
    classification: "established",
    conclusion:
      "exact-head-descends-from-release-and-approved-base-with-only-instruction-ci-research-workflow-plan-and-architecture-test-changes",
    assertions: [
      assertion("checkout-equals-source-sha"),
      assertion("released-source-is-ancestor"),
      assertion("approved-base-is-ancestor"),
      assertion("changed-paths-are-research-only"),
    ],
  }],
  evidence: {
    result: "passed",
    sourceSha,
    baseSha,
    releaseSha,
    changedPaths,
    changedPathDigest: `sha256:${changedPathDigest}`,
  },
});
