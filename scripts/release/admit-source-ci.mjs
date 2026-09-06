import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { buildTerminalReference, loadExactGeneratedContract } from "./build-terminal-reference.mjs";
import { createGitHubReadOnlyBoundary } from "./github-read-only-boundary.mjs";
import { canonicalJson } from "./protocol.mjs";

// Discover one latest run, then authenticate its exact attempt through the same
// boundary used by release readiness. Never search backwards for an older green
// run when the latest result failed or is still running.
export const admitSourceCi = async ({ contract, contractBytes, repository, sourceSha, github, now }) => {
  const authority = contract?.releaseCertification?.githubAuthority;
  if (
    repository !== authority?.repository
    || authority?.branchPolicy?.name !== "main"
    || typeof sourceSha !== "string"
    || !/^[0-9a-f]{40}$/u.test(sourceSha)
  ) throw new Error("source CI admission requires the exact repository and source SHA");
  const endpoint = `repos/${repository}/actions/workflows/ci.yml/runs?branch=main&event=push&head_sha=${sourceSha}&per_page=1`;
  const latestRun = async () => {
    const response = await github.readJson(endpoint);
    if (
      !Number.isSafeInteger(response?.total_count)
      || response.total_count < 1
      || !Array.isArray(response.workflow_runs)
      || response.workflow_runs.length !== 1
    ) throw new Error("source CI has no unique latest exact-source push run");
    const run = response.workflow_runs[0];
    if (
      !Number.isSafeInteger(run?.id)
      || run.id <= 0
      || !Number.isSafeInteger(run.run_attempt)
      || run.run_attempt <= 0
    ) throw new Error("source CI latest run coordinate is not canonical");
    return run;
  };
  const run = await latestRun();
  const reference = await buildTerminalReference({
    contract,
    contractBytes,
    kind: "exact-main-ci",
    sourceSha,
    runId: String(run.id),
    runAttempt: String(run.run_attempt),
    github,
    now,
  });
  const latest = await latestRun();
  if (
    latest.id !== run.id
    || latest.run_attempt !== run.run_attempt
    || latest.status !== "completed"
    || latest.conclusion !== "success"
  ) throw new Error("source CI latest run changed during admission");
  return reference;
};

const cli = async () => {
  const { contract, contractBytes } = await loadExactGeneratedContract();
  const repository = process.env.REPOSITORY;
  const sourceSha = process.env.SOURCE_SHA;
  const token = process.env.ACTIONS_READ_TOKEN;
  delete process.env.ACTIONS_READ_TOKEN;
  const github = createGitHubReadOnlyBoundary({
    repository,
    token,
    transport: contract.releaseCertification.githubAuthority.readOnlyTransport,
  });
  const reference = await admitSourceCi({ contract, contractBytes, repository, sourceSha, github });
  process.stdout.write(canonicalJson(reference));
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  cli().catch(() => {
    process.stderr.write("source CI admission failed closed\n");
    process.exitCode = 1;
  });
}
