import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

// @ts-expect-error Source CI admission is an intentionally unprotected Node script module.
import { admitSourceCi } from "../../scripts/release/admit-source-ci.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contractBytes = await readFile(resolve(root, "tooling/effect-build-contract.json"));
const contract = JSON.parse(contractBytes.toString("utf8"));
const repository = "mannyc2/effect-build";
const sourceSha = "a".repeat(40);
const observedAt = "2026-09-06T18:00:00.000Z";
const run = {
  id: 101,
  run_attempt: 2,
  path: ".github/workflows/ci.yml",
  head_sha: sourceSha,
  head_branch: "main",
  event: "push",
  status: "completed",
  conclusion: "success",
  // Source CI is deliberately older than the authenticated observation TTL.
  created_at: "2026-08-01T17:55:00Z",
  updated_at: "2026-08-01T17:59:00Z",
  repository: { id: 1331906770, full_name: repository },
  head_repository: { id: 1331906770, full_name: repository },
};

const fixture = ({
  attempt = run,
  latest = run,
  finalLatest = latest,
  mainSha = sourceSha,
}: {
  readonly attempt?: Record<string, unknown>;
  readonly latest?: Record<string, unknown> | null;
  readonly finalLatest?: Record<string, unknown> | null;
  readonly mainSha?: string;
} = {}) => {
  let lists = 0;
  const github = {
    readJson: vi.fn(async (endpoint: string) => {
      if (endpoint.includes("actions/workflows/ci.yml/runs?")) {
        const value = lists++ === 0 ? latest : finalLatest;
        return { total_count: value === null ? 0 : 1, workflow_runs: value === null ? [] : [value] };
      }
      if (endpoint.endsWith("git/ref/heads/main")) {
        return { ref: "refs/heads/main", object: { type: "commit", sha: mainSha } };
      }
      if (endpoint.endsWith("actions/runs/101/attempts/2")) return attempt;
      throw new Error(`unexpected GitHub endpoint ${endpoint}`);
    }),
  };
  return {
    github,
    admit: (overrides = {}) =>
      admitSourceCi({
        contract,
        contractBytes,
        repository,
        sourceSha,
        github,
        now: () => observedAt,
        ...overrides,
      }),
  };
};

describe("source CI reuse during candidate preparation", () => {
  it("authenticates an old exact-source execution and creates a fresh expiring observation", async () => {
    const test = fixture();
    await expect(test.admit()).resolves.toMatchObject({
      sourceSha,
      runId: "101",
      runAttempt: "2",
      terminal: "success",
      observedAt,
      expiresAt: "2026-09-08T18:00:00.000Z",
    });
    expect(test.github.readJson.mock.calls.map(([endpoint]) => endpoint)).toEqual([
      `repos/${repository}/actions/workflows/ci.yml/runs?branch=main&event=push&head_sha=${sourceSha}&per_page=1`,
      `repos/${repository}/git/ref/heads/main`,
      `repos/${repository}/actions/runs/101/attempts/2`,
      `repos/${repository}/git/ref/heads/main`,
      `repos/${repository}/actions/workflows/ci.yml/runs?branch=main&event=push&head_sha=${sourceSha}&per_page=1`,
    ]);
  });

  it.each([
    ["source SHA", { head_sha: "b".repeat(40) }],
    ["workflow", { path: ".github/workflows/release.yml" }],
    ["trigger", { event: "workflow_dispatch" }],
    ["branch", { head_branch: "feature" }],
    ["repository", { repository: { id: 9, full_name: repository } }],
    ["fork", { head_repository: { id: 9, full_name: "attacker/effect-build" } }],
    ["attempt", { run_attempt: 1 }],
    ["failed run", { conclusion: "failure" }],
    ["running attempt", { status: "in_progress", conclusion: null }],
    ["future completion", { updated_at: "2026-09-07T18:00:00Z" }],
  ])("rejects changed %s despite a successful discovery response", async (_label, changed) => {
    const test = fixture({ attempt: { ...run, ...changed } });
    await expect(test.admit()).rejects.toThrow();
  });

  it("fails closed when no exact push CI exists or current main changes", async () => {
    await expect(fixture({ latest: null }).admit()).rejects.toThrow(/no unique latest/u);
    await expect(fixture({ mainSha: "b".repeat(40) }).admit()).rejects.toThrow(/current main/u);
  });

  it.each([
    { ...run, run_attempt: 3, status: "in_progress", conclusion: null },
    { ...run, conclusion: "failure" },
    { ...run, id: 102 },
  ])("does not reuse a successful attempt after the latest run changes", async (finalLatest) => {
    await expect(fixture({ finalLatest }).admit()).rejects.toThrow(/latest run changed/u);
  });

  it("rejects noncanonical admission inputs before discovery", async () => {
    const test = fixture();
    await expect(test.admit({ repository: "attacker/effect-build" })).rejects.toThrow();
    await expect(test.admit({ sourceSha: "main" })).rejects.toThrow();
    expect(test.github.readJson).not.toHaveBeenCalled();
  });
});
