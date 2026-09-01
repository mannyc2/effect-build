#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildContract, readInputs, renderJson, validateContract } from "../effect-build-contract/model.mjs";
import {
  anonymousNpmBoundary,
  candidateFromZip,
  createCollectorGitHubBoundary,
} from "./collect-release-readiness.mjs";
import {
  artifactCoordinate,
  sha256Digest,
  sha512Integrity,
} from "./protocol.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contractPath = resolve(repositoryRoot, "tooling/effect-build-contract.json");
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const exactKeys = (value, expected, label) => {
  if (!isRecord(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${label} has missing or additional fields`);
  }
  return value;
};

const parseReference = (source) => {
  try {
    return JSON.parse(source);
  } catch {
    throw new Error("fake certification candidate reference is not JSON");
  }
};

export const prepareFakeCertificationInputs = async ({
  contract,
  contractBytes,
  sourceSha,
  reference,
  outputDirectory,
  github,
  npm = anonymousNpmBoundary,
}) => {
  const release = contract.releaseCertification;
  const authority = release.githubAuthority;
  const candidatePolicy = release.candidate;
  const githubClient = github ?? createCollectorGitHubBoundary(contract);
  const value = exactKeys(reference, release.readiness.referenceShapes.candidate, "fake certification candidate");
  const coordinate = artifactCoordinate(release, value.coordinate, candidatePolicy.workflow);
  const expectedName = candidatePolicy.artifactName.replace("<sourceSha>", sourceSha);
  if (
    coordinate.sourceSha !== sourceSha
    || value.protocol !== candidatePolicy.protocol
    || value.artifactName !== expectedName
  ) throw new Error("fake certification candidate source or artifact name changed");
  const run = await githubClient.readJson(
    `repos/${authority.repository}/actions/runs/${coordinate.runId}/attempts/${coordinate.runAttempt}`,
  );
  const metadata = await githubClient.readJson(
    `repos/${authority.repository}/actions/artifacts/${coordinate.artifactId}`,
  );
  if (
    run?.id !== Number(coordinate.runId)
    || run?.run_attempt !== Number(coordinate.runAttempt)
    || run?.path !== candidatePolicy.workflowPath
    || run?.head_sha !== sourceSha
    || run?.head_branch !== authority.branchPolicy.name
    || run?.event !== candidatePolicy.event
    || run?.status !== "completed"
    || run?.conclusion !== "success"
    || run?.repository?.id !== Number(authority.repositoryId)
    || run?.head_repository?.id !== Number(authority.repositoryId)
    || metadata?.id !== Number(coordinate.artifactId)
    || metadata?.name !== expectedName
    || metadata?.digest !== coordinate.artifactDigest
    || metadata?.expired !== false
    || metadata?.workflow_run?.id !== Number(coordinate.runId)
    || metadata?.workflow_run?.head_sha !== sourceSha
    || metadata?.workflow_run?.head_branch !== authority.branchPolicy.name
    || metadata?.workflow_run?.repository_id !== Number(authority.repositoryId)
    || metadata?.workflow_run?.head_repository_id !== Number(authority.repositoryId)
  ) throw new Error("fake certification candidate GitHub identity changed");
  const zipBytes = await githubClient.readArtifactZip(
    `repos/${authority.repository}/actions/artifacts/${coordinate.artifactId}/zip`,
    release.readiness.zipExtraction.maximumArchiveBytes,
  );
  if (sha256Digest(zipBytes) !== coordinate.artifactDigest) {
    throw new Error("fake certification candidate ZIP bytes changed");
  }
  const candidate = candidateFromZip({ zipBytes, contract, contractBytes, sourceSha });
  if (
    sha256Digest(candidate.manifestBytes) !== value.manifestDigest
    || `${candidate.manifestBytes.byteLength}` !== value.bytes
  ) throw new Error("fake certification candidate manifest reference changed");

  const candidateDirectory = resolve(outputDirectory, "candidate");
  const placeholderDirectory = resolve(outputDirectory, "placeholders");
  mkdirSync(candidateDirectory, { mode: 0o700, recursive: true });
  mkdirSync(placeholderDirectory, { mode: 0o700, recursive: true });
  writeFileSync(resolve(outputDirectory, "candidate.zip"), zipBytes, { mode: 0o600 });
  writeFileSync(resolve(candidateDirectory, candidatePolicy.manifest), candidate.manifestBytes, { mode: 0o600 });
  for (const entry of candidate.manifest.packages) {
    writeFileSync(resolve(candidateDirectory, entry.file), candidate.packageBytes.get(entry.name), { mode: 0o600 });
  }
  for (const ledger of contract.npmRegistryBoundary.bootstrap.placeholderLedger) {
    const url = `${contract.npmRegistryBoundary.registry}/${ledger.name}/-/${ledger.name}-${ledger.version}.tgz`;
    const bytes = await npm.readTarball(url, ledger.bytes);
    if (
      bytes.byteLength !== ledger.bytes
      || sha256Digest(bytes) !== `sha256:${ledger.sha256}`
      || sha512Integrity(bytes) !== ledger.integrity
    ) throw new Error(`fake certification placeholder bytes changed: ${ledger.name}`);
    writeFileSync(resolve(placeholderDirectory, `${ledger.name}-${ledger.version}.tgz`), bytes, { mode: 0o600 });
  }
  return {
    candidateDirectory,
    candidateReference: value,
    candidateZip: resolve(outputDirectory, "candidate.zip"),
    placeholderDirectory,
  };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inputs = await readInputs(repositoryRoot);
  const contract = buildContract(inputs);
  validateContract(contract, inputs);
  const contractBytes = Buffer.from(renderJson(contract));
  if (!readFileSync(contractPath).equals(contractBytes)) throw new Error("generated contract bytes are stale");
  const sourceSha = process.env.SOURCE_SHA;
  const outputDirectory = process.env.OUTPUT_DIRECTORY;
  if (!/^[0-9a-f]{40}$/u.test(sourceSha ?? "") || typeof outputDirectory !== "string") {
    throw new Error("fake certification preparation inputs are incomplete");
  }
  const github = createCollectorGitHubBoundary(contract);
  delete process.env.GITHUB_TOKEN;
  const result = await prepareFakeCertificationInputs({
    contract,
    contractBytes,
    sourceSha,
    reference: parseReference(process.env.CANDIDATE_REFERENCE_JSON),
    outputDirectory,
    github,
  });
  writeFileSync(process.env.GITHUB_OUTPUT, [
    `candidate-directory=${result.candidateDirectory}`,
    `candidate-zip=${result.candidateZip}`,
    `placeholder-directory=${result.placeholderDirectory}`,
    `candidate-reference=${JSON.stringify(result.candidateReference)}`,
    "",
  ].join("\n"), { flag: "a" });
}
