import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repository = fileURLToPath(new URL("../..", import.meta.url));
const verifier = join(repository, "scripts/verify-workflow-receipt.mjs");
const fakeGhFixture = fileURLToPath(new URL("../fixtures/workflow-receipt/fake-gh.mjs", import.meta.url));
const sha = "a".repeat(40);
const requiredJobNames = [
  "quality",
  "real-tools",
  "publication-hosts (ubuntu-24.04)",
  "publication-hosts (macos-15)",
  "publication-hosts (windows-2025)",
  "target-support (bun)",
  "target-support (deno)",
];

const successfulRun = {
  html_url: "https://github.com/example/effect-build/actions/runs/123",
  head_sha: sha,
  path: ".github/workflows/ci.yml",
  conclusion: "success",
  event: "push",
};
const successfulJobs = requiredJobNames.map((name) => ({ name, status: "completed", conclusion: "success" }));

describe("workflow receipt verifier", () => {
  let root: string;
  let bin: string;
  let receiptFile: string;
  let logFile: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "effect-build-workflow-receipt-"));
    bin = join(root, "bin");
    receiptFile = join(root, "receipt.md");
    logFile = join(root, "gh.log");
    mkdirSync(bin);
    copyFileSync(fakeGhFixture, join(bin, "gh"));
    chmodSync(join(bin, "gh"), 0o755);
    writeFileSync(logFile, "");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const runVerifier = ({
    receipt = `Target evidence: https://github.com/example/effect-build/actions/runs/123 @ ${sha}`,
    run = successfulRun,
    jobs = successfulJobs,
    totalCount = jobs.length,
  }: {
    receipt?: string;
    run?: Record<string, unknown>;
    jobs?: Array<Record<string, unknown>>;
    totalCount?: number;
  } = {}) => {
    writeFileSync(receiptFile, `${receipt}\n`);
    const result = spawnSync(
      process.execPath,
      [verifier, "--receipt-file", receiptFile, "--prefix", "Target evidence:"],
      {
        cwd: repository,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
          FAKE_GH_LOG: logFile,
          FAKE_GH_RUN_JSON: JSON.stringify(run),
          FAKE_GH_JOBS_JSON: JSON.stringify({ total_count: totalCount, jobs }),
        },
      },
    );
    const calls = readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean).map((line) =>
      JSON.parse(line) as string[]
    );
    return { ...result, calls };
  };

  it("accepts one exact receipt and every successful required job", () => {
    const result = runVerifier();

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(`https://github.com/example/effect-build/actions/runs/123 @ ${sha}`);
    expect(result.calls).toEqual([
      ["api", "repos/example/effect-build/actions/runs/123"],
      ["api", "repos/example/effect-build/actions/runs/123/jobs?per_page=100"],
    ]);
  });

  it("rejects a malformed GitHub Actions URL before invoking gh", () => {
    const result = runVerifier({
      receipt: `Target evidence: https://example.com/example/effect-build/actions/runs/123 @ ${sha}`,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("receipt line must exactly match");
    expect(result.calls).toEqual([]);
  });

  it("rejects a run whose head SHA differs from the receipt", () => {
    const result = runVerifier({ run: { ...successfulRun, head_sha: "b".repeat(40) } });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("workflow run head_sha mismatch");
  });

  it("rejects a run whose API URL differs from the receipt", () => {
    const result = runVerifier({
      run: { ...successfulRun, html_url: "https://github.com/other/effect-build/actions/runs/123" },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("workflow run html_url mismatch");
  });

  it("rejects a run from a different workflow path", () => {
    const result = runVerifier({ run: { ...successfulRun, path: ".github/workflows/release.yml" } });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("workflow run path must be exactly .github/workflows/ci.yml");
  });

  it("rejects a missing required job", () => {
    const result = runVerifier({ jobs: successfulJobs.slice(1) });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('required job "quality" is missing');
  });

  it("rejects a duplicate required job", () => {
    const result = runVerifier({ jobs: [...successfulJobs, successfulJobs[0]!] });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('required job "quality" appears 2 times');
  });

  it.each(["failure", "skipped"])("rejects a required job with conclusion %s", (conclusion) => {
    const jobs = successfulJobs.map((job) => job.name === "real-tools" ? { ...job, conclusion } : job);
    const result = runVerifier({ jobs });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`required job "real-tools" conclusion must be success, received "${conclusion}"`);
  });

  it("rejects a successful required job that is not completed", () => {
    const jobs = successfulJobs.map((job) => job.name === "real-tools" ? { ...job, status: "in_progress" } : job);
    const result = runVerifier({ jobs });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('required job "real-tools" status must be completed, received "in_progress"');
  });

  it("rejects a jobs response whose total exceeds the requested page", () => {
    const result = runVerifier({ totalCount: 101 });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("workflow jobs response exceeds the requested 100-job page: received 101");
  });

  it("rejects a non-successful workflow run", () => {
    const result = runVerifier({ run: { ...successfulRun, conclusion: "failure" } });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('workflow run conclusion must be success, received "failure"');
  });
});
