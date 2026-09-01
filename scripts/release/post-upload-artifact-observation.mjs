import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createGitHubReadOnlyBoundary } from "./github-read-only-boundary.mjs";

const fullSha = (value, label) => {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/u.test(value)) {
    throw new Error(`${label} is not one full lowercase Git SHA`);
  }
  return value;
};

const positiveDecimal = (value, label) => {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/u.test(value)) {
    throw new Error(`${label} is not one canonical positive decimal`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} exceeds the safe integer range`);
  return parsed;
};

const bareSha256 = (value, label) => {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} is not one bare lowercase SHA-256 digest`);
  }
  return value;
};

const nonempty = (value, label) => {
  if (typeof value !== "string" || value.length === 0 || /[\0\r\n]/u.test(value)) {
    throw new Error(`${label} is absent or malformed`);
  }
  return value;
};

const exactRepository = (value, label) => {
  const repository = nonempty(value, label);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository) || repository.includes("..")) {
    throw new Error(`${label} is not canonical`);
  }
  return repository;
};

const exactWorkflowPath = (value) => {
  const path = nonempty(value, "expected workflow path");
  if (!/^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/u.test(path)) {
    throw new Error("expected workflow path is not canonical");
  }
  return path;
};

const exactBranch = (value) => {
  const branch = nonempty(value, "expected head branch");
  if (!/^[A-Za-z0-9._/-]+$/u.test(branch) || branch.includes("..") || branch.startsWith("/") || branch.endsWith("/")) {
    throw new Error("expected head branch is not canonical");
  }
  return branch;
};

const exactEvent = (value) => {
  if (value !== "workflow_dispatch") throw new Error("expected workflow event is not canonical");
  return value;
};

const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value)}\n`);

const currentMain = async ({ github, repository, sourceSha }) => {
  const main = await github.readJson(`repos/${repository}/git/ref/heads/main`);
  if (
    main === null
    || typeof main !== "object"
    || Array.isArray(main)
    || main.ref !== "refs/heads/main"
    || main.object?.type !== "commit"
    || main.object?.sha !== sourceSha
  ) throw new Error("current main changed during post-upload artifact observation");
  return main;
};

export const parsePostUploadEnvironment = (contract, environment) => {
  const authority = contract?.releaseCertification?.githubAuthority;
  if (
    contract?.schema !== "effect-build/combined-contract@1"
    || authority === undefined
    || typeof authority !== "object"
    || authority.readOnlyTransport === undefined
  ) throw new Error("combined contract has no GitHub read-only transport policy");

  const repository = exactRepository(environment.REPOSITORY, "repository");
  const expectedRepository = exactRepository(
    environment.EXPECTED_REPOSITORY ?? authority.repository,
    "expected repository",
  );
  const repositoryId = positiveDecimal(environment.EXPECTED_REPOSITORY_ID, "expected repository id");
  const sourceSha = fullSha(environment.SOURCE_SHA, "source SHA");
  const branch = exactBranch(environment.EXPECTED_HEAD_BRANCH ?? authority.branchPolicy?.name);
  const workflowPath = exactWorkflowPath(environment.EXPECTED_WORKFLOW_PATH);
  const workflow = nonempty(environment.EXPECTED_WORKFLOW, "expected workflow identity");
  const event = exactEvent(environment.EXPECTED_EVENT ?? "workflow_dispatch");
  if (
    repository !== expectedRepository
    || repository !== authority.repository
    || String(repositoryId) !== authority.repositoryId
    || branch !== authority.branchPolicy?.name
    || workflow !== `${repository}/${workflowPath}@refs/heads/${branch}`
  ) throw new Error("post-upload repository or workflow authority differs from the combined contract");

  return Object.freeze({
    artifactId: positiveDecimal(environment.ARTIFACT_ID, "artifact id"),
    artifactName: nonempty(environment.EXPECTED_ARTIFACT_NAME, "expected artifact name"),
    bareDigest: bareSha256(environment.UPLOAD_ACTION_BARE_DIGEST, "upload-action artifact digest"),
    branch,
    event,
    repository,
    repositoryId,
    runAttempt: positiveDecimal(environment.RUN_ATTEMPT, "run attempt"),
    runId: positiveDecimal(environment.RUN_ID, "run id"),
    sourceSha,
    workflow,
    workflowPath,
  });
};

export const observePostUploadArtifact = async ({
  contract,
  environment,
  outputDirectory,
  github,
}) => {
  const expected = parsePostUploadEnvironment(contract, environment);
  if (typeof outputDirectory !== "string" || outputDirectory.length === 0) {
    throw new Error("post-upload output directory is absent");
  }
  const firstMain = await currentMain({
    github,
    repository: expected.repository,
    sourceSha: expected.sourceSha,
  });
  const artifact = await github.readJson(
    `repos/${expected.repository}/actions/artifacts/${expected.artifactId}`,
  );
  const run = await github.readJson(
    `repos/${expected.repository}/actions/runs/${expected.runId}/attempts/${expected.runAttempt}`,
  );
  const bytes = await github.readArtifactZip(
    `repos/${expected.repository}/actions/artifacts/${expected.artifactId}/zip`,
    contract.releaseCertification.readiness.zipExtraction.maximumArchiveBytes,
  );
  const finalMain = await currentMain({
    github,
    repository: expected.repository,
    sourceSha: expected.sourceSha,
  });
  const canonicalDigest = `sha256:${expected.bareDigest}`;
  if (
    artifact === null
    || typeof artifact !== "object"
    || Array.isArray(artifact)
    || artifact.id !== expected.artifactId
    || artifact.name !== expected.artifactName
    || artifact.digest !== canonicalDigest
    || artifact.expired !== false
    || artifact.workflow_run?.id !== expected.runId
    || artifact.workflow_run?.head_branch !== expected.branch
    || artifact.workflow_run?.head_sha !== expected.sourceSha
    || artifact.workflow_run?.repository_id !== expected.repositoryId
    || artifact.workflow_run?.head_repository_id !== expected.repositoryId
    || run === null
    || typeof run !== "object"
    || Array.isArray(run)
    || run.id !== expected.runId
    || run.run_attempt !== expected.runAttempt
    || run.path !== expected.workflowPath
    || run.head_sha !== expected.sourceSha
    || run.head_branch !== expected.branch
    || run.event !== expected.event
    || run.status !== "in_progress"
    || run.conclusion !== null
    || run.repository?.id !== expected.repositoryId
    || run.repository?.full_name !== expected.repository
    || run.head_repository?.id !== expected.repositoryId
    || run.head_repository?.full_name !== expected.repository
    || !(bytes instanceof Uint8Array)
    || bytes.byteLength === 0
    || createHash("sha256").update(bytes).digest("hex") !== expected.bareDigest
  ) throw new Error("post-upload artifact coordinate, run, or downloaded bytes changed");

  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  await Promise.all([
    writeFile(resolve(outputDirectory, "artifact.json"), jsonBytes(artifact), { mode: 0o600 }),
    writeFile(resolve(outputDirectory, "artifact.zip"), bytes, { mode: 0o600 }),
    writeFile(resolve(outputDirectory, "run.json"), jsonBytes(run), { mode: 0o600 }),
    writeFile(resolve(outputDirectory, "main.json"), jsonBytes(finalMain), { mode: 0o600 }),
  ]);
  return Object.freeze({
    artifact,
    bytes: Buffer.from(bytes),
    canonicalDigest,
    firstMain,
    finalMain,
    run,
  });
};

const cli = async () => {
  const contractPath = resolve(process.env.CONTRACT_PATH ?? "tooling/effect-build-contract.json");
  const contract = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await readFile(contractPath)));
  const token = process.env.ACTIONS_READ_TOKEN ?? process.env.GH_TOKEN;
  delete process.env.ACTIONS_READ_TOKEN;
  delete process.env.GH_TOKEN;
  delete process.env.GITHUB_TOKEN;
  delete process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  delete process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const github = createGitHubReadOnlyBoundary({
    repository: contract.releaseCertification?.githubAuthority?.repository,
    token,
    transport: contract.releaseCertification?.githubAuthority?.readOnlyTransport,
  });
  await observePostUploadArtifact({
    contract,
    environment: process.env,
    outputDirectory: process.argv[2],
    github,
  });
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  cli().catch(() => {
    process.stderr.write("post-upload artifact observation failed closed\n");
    process.exitCode = 1;
  });
}
