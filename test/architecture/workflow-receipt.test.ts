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
const targetRequiredJobNames = [
  "quality",
  "real-tools",
  "publication-hosts (ubuntu-24.04)",
  "publication-hosts (macos-15)",
  "publication-hosts (windows-2025)",
  "target-support (bun)",
  "target-support (deno)",
];
const effectRequiredJobNames = [
  "effect-compatibility (4.0.0-beta.104)",
  "effect-compatibility (4.0.0-rc.108)",
];

const successfulRun = {
  html_url: "https://github.com/example/effect-build/actions/runs/123",
  head_sha: sha,
  path: ".github/workflows/ci.yml",
  conclusion: "success",
  event: "push",
};
const successfulTargetJobs = targetRequiredJobNames.map((name) => ({
  name,
  status: "completed",
  conclusion: "success",
}));
const successfulEffectJobs = [...targetRequiredJobNames, ...effectRequiredJobNames].map((name) => ({
  name,
  status: "completed",
  conclusion: "success",
}));
const successfulNodeSeaJobs = [...targetRequiredJobNames, ...effectRequiredJobNames, "node-sea"].map((name) => ({
  name,
  status: "completed",
  conclusion: "success",
}));

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
    receipt,
    prefix = "Target evidence:",
    run = successfulRun,
    jobs = successfulTargetJobs,
    totalCount = jobs.length,
    verifierArguments = [],
  }: {
    receipt?: string;
    prefix?: string;
    run?: Record<string, unknown>;
    jobs?: Array<Record<string, unknown>>;
    totalCount?: number;
    verifierArguments?: string[];
  } = {}) => {
    const receiptLine = receipt ?? `${prefix} https://github.com/example/effect-build/actions/runs/123 @ ${sha}`;
    writeFileSync(receiptFile, `${receiptLine}\n`);
    writeFileSync(logFile, "");
    const result = spawnSync(
      process.execPath,
      [verifier, "--receipt-file", receiptFile, "--prefix", prefix, ...verifierArguments],
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

  it("keeps target-v1 as the explicit and prefix-independent default contract", () => {
    const explicit = runVerifier({ verifierArguments: ["--contract", "target-v1"] });
    const defaultWithEffectPrefix = runVerifier({ prefix: "Effect compatibility evidence:" });

    expect(explicit.status).toBe(0);
    expect(explicit.stderr).toBe("");
    expect(defaultWithEffectPrefix.status).toBe(0);
    expect(defaultWithEffectPrefix.stderr).toBe("");
  });

  it("accepts effect-v1 only when both exact compatibility cells succeed", () => {
    const result = runVerifier({
      prefix: "Effect compatibility evidence:",
      jobs: successfulEffectJobs,
      verifierArguments: ["--contract", "effect-v1"],
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("accepts node-sea-v1 only when the full effect-v1 contract and exact node-sea job succeed", () => {
    const result = runVerifier({
      prefix: "Node SEA evidence:",
      jobs: successfulNodeSeaJobs,
      verifierArguments: ["--contract", "node-sea-v1"],
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("keeps node-sea-v1 independent from the receipt prefix", () => {
    const result = runVerifier({
      prefix: "Unrelated operator-selected prefix:",
      jobs: successfulNodeSeaJobs,
      verifierArguments: ["--contract", "node-sea-v1"],
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("rejects a missing effect-v1 compatibility cell", () => {
    const missing = effectRequiredJobNames[0]!;
    const result = runVerifier({
      jobs: successfulEffectJobs.filter((job) => job.name !== missing),
      verifierArguments: ["--contract", "effect-v1"],
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`required job ${JSON.stringify(missing)} is missing`);
  });

  it("rejects a duplicate effect-v1 compatibility cell", () => {
    const duplicate = successfulEffectJobs.find((job) => job.name === effectRequiredJobNames[1])!;
    const result = runVerifier({
      jobs: [...successfulEffectJobs, duplicate],
      verifierArguments: ["--contract", "effect-v1"],
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`required job ${JSON.stringify(duplicate.name)} appears 2 times`);
  });

  it.each(["failure", "skipped"])("rejects an effect-v1 compatibility cell with conclusion %s", (conclusion) => {
    const endpoint = effectRequiredJobNames[1]!;
    const jobs = successfulEffectJobs.map((job) => job.name === endpoint ? { ...job, conclusion } : job);
    const result = runVerifier({ jobs, verifierArguments: ["--contract", "effect-v1"] });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `required job ${JSON.stringify(endpoint)} conclusion must be success, received ${JSON.stringify(conclusion)}`,
    );
  });

  it("rejects a missing node-sea-v1 node-sea job", () => {
    const result = runVerifier({
      jobs: successfulNodeSeaJobs.filter((job) => job.name !== "node-sea"),
      verifierArguments: ["--contract", "node-sea-v1"],
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('required job "node-sea" is missing');
  });

  it("rejects a duplicate node-sea-v1 node-sea job", () => {
    const nodeSea = successfulNodeSeaJobs.find((job) => job.name === "node-sea")!;
    const result = runVerifier({
      jobs: [...successfulNodeSeaJobs, nodeSea],
      verifierArguments: ["--contract", "node-sea-v1"],
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('required job "node-sea" appears 2 times');
  });

  it.each(["failure", "skipped"])("rejects a node-sea-v1 node-sea job with conclusion %s", (conclusion) => {
    const jobs = successfulNodeSeaJobs.map((job) => job.name === "node-sea" ? { ...job, conclusion } : job);
    const result = runVerifier({ jobs, verifierArguments: ["--contract", "node-sea-v1"] });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `required job "node-sea" conclusion must be success, received ${JSON.stringify(conclusion)}`,
    );
  });

  it("rejects an incomplete node-sea-v1 node-sea job", () => {
    const jobs = successfulNodeSeaJobs.map((job) => job.name === "node-sea" ? { ...job, status: "in_progress" } : job);
    const result = runVerifier({ jobs, verifierArguments: ["--contract", "node-sea-v1"] });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('required job "node-sea" status must be completed, received "in_progress"');
  });

  it("rejects unknown and duplicate receipt contracts before invoking gh", () => {
    const unknown = runVerifier({ verifierArguments: ["--contract", "node-sea-v2"] });
    const duplicate = runVerifier({
      verifierArguments: ["--contract", "target-v1", "--contract", "node-sea-v1"],
    });

    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toMatch(/contract/);
    expect(unknown.calls).toEqual([]);
    expect(duplicate.status).toBe(1);
    expect(duplicate.stderr).toMatch(/contract/);
    expect(duplicate.calls).toEqual([]);
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
    const result = runVerifier({ jobs: successfulTargetJobs.slice(1) });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('required job "quality" is missing');
  });

  it("rejects a duplicate required job", () => {
    const result = runVerifier({ jobs: [...successfulTargetJobs, successfulTargetJobs[0]!] });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('required job "quality" appears 2 times');
  });

  it.each(["failure", "skipped"])("rejects a required job with conclusion %s", (conclusion) => {
    const jobs = successfulTargetJobs.map((job) => job.name === "real-tools" ? { ...job, conclusion } : job);
    const result = runVerifier({ jobs });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`required job "real-tools" conclusion must be success, received "${conclusion}"`);
  });

  it("rejects a successful required job that is not completed", () => {
    const jobs = successfulTargetJobs.map((job) => job.name === "real-tools" ? { ...job, status: "in_progress" } : job);
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
