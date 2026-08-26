import { execFile } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { authenticateCandidate, candidateRequestFromEnvironment } from "../release/candidate.mjs";
import { canonicalBytes, requireEnvironment, sha256 } from "../node-finalizer/common.mjs";
import {
  reauthenticateCertifierSnapshot,
  snapshotApprovedCertifier,
} from "./certifier.mjs";
import {
  categoryCoordinates,
  coordinateSlug,
  maximumEvidenceBytes,
  maximumReceiptBytes,
  packageVersion,
  readBoundedRegularFile,
  requestProtocol,
  validateReceipt,
  validateRequest,
} from "./receipt.mjs";
import {
  reauthenticatePriorEvidenceSnapshot,
  snapshotPriorEvidence,
} from "./prior-evidence.mjs";
import {
  authenticateCertificationSource,
  reauthenticateCertificationSource,
} from "./source.mjs";
import {
  captureCandidateSnapshot,
  captureRequestSnapshot,
  reauthenticateCandidateSnapshot,
  reauthenticateRequestSnapshot,
} from "./snapshots.mjs";

const execute = promisify(execFile);
const repositoryRoot = await realpath(fileURLToPath(new URL("../../", import.meta.url)));
const argument = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0 || process.argv[index + 1] === undefined) throw new Error(`missing ${name}`);
  return process.argv[index + 1];
};
const category = argument("--category");
const coordinate = argument("--coordinate");
const outputRoot = resolve(argument("--output"));
const evidenceRootIndex = process.argv.indexOf("--prior-evidence");
const priorEvidenceInput = evidenceRootIndex < 0 ? undefined : process.argv[evidenceRootIndex + 1];
if (evidenceRootIndex >= 0 && priorEvidenceInput === undefined) throw new Error("missing --prior-evidence value");
if (!Object.hasOwn(categoryCoordinates, category) || !categoryCoordinates[category].includes(coordinate)) {
  throw new Error(`unsupported certification coordinate ${category}/${coordinate}`);
}
if ((category === "distribution") !== (priorEvidenceInput === undefined)) {
  throw new Error("only clean-host and cell certification requests require prior evidence");
}
const priorEvidence = priorEvidenceInput === undefined ? undefined : await realpath(resolve(priorEvidenceInput));
if (priorEvidence !== undefined && !(await stat(priorEvidence)).isDirectory()) {
  throw new Error("prior certification evidence must be a directory");
}
const repository = requireEnvironment("GITHUB_REPOSITORY");
const token = requireEnvironment("GITHUB_TOKEN");
const certificationWorkflowRunId = requireEnvironment("GITHUB_RUN_ID");
const certificationWorkflowRunAttempt = requireEnvironment("GITHUB_RUN_ATTEMPT");
if (certificationWorkflowRunAttempt !== "1") throw new Error("Apple certification reruns are forbidden");
const candidate = await authenticateCandidate({
  repository,
  token,
  inputs: candidateRequestFromEnvironment(),
});
const checkedOutSourceSha = requireEnvironment("CHECKED_OUT_SOURCE_SHA");
if (checkedOutSourceSha !== candidate.descriptor.sourceSha || requireEnvironment("GITHUB_SHA") !== candidate.descriptor.sourceSha) {
  throw new Error("Apple certification checkout does not match candidate source");
}
const source = await authenticateCertificationSource({
  repositoryRoot,
  expectedSourceSha: candidate.descriptor.sourceSha,
});
const runner = {
  os: requireEnvironment("RUNNER_OS"),
  arch: requireEnvironment("RUNNER_ARCH"),
};
const temporaryRoot = await mkdtemp(join(tmpdir(), "effect-build-apple-certification-"));
const candidateRoot = join(temporaryRoot, "candidate");
try {
  const certifier = await snapshotApprovedCertifier({ category, temporaryRoot });
  await mkdir(candidateRoot, { mode: 0o700 });
  for (const [filename, bytes] of candidate.payloadEntries) {
    await writeFile(join(candidateRoot, filename), bytes, { flag: "wx", mode: 0o400 });
  }
  await chmod(candidateRoot, 0o500);
  const candidateSnapshot = await captureCandidateSnapshot({ root: candidateRoot, entries: candidate.payloadEntries });
  const slug = coordinateSlug(category, coordinate);
  const priorEvidenceManifestOutputPath = join(outputRoot, `${slug}.prior-evidence.json`);
  const receiptPath = join(outputRoot, `${slug}.receipt.json`);
  const evidencePath = join(outputRoot, `${slug}.evidence.json`);
  const requestPath = join(temporaryRoot, "request.json");
  const baseExpected = {
    category,
    coordinate,
    sourceSha: candidate.descriptor.sourceSha,
    candidateWorkflowRunId: candidate.descriptor.workflowRunId,
    candidateDescriptorDigest: candidate.descriptorDigest,
    certificationWorkflowRunId,
    certifierPath: certifier.path,
    certifierSha256: certifier.sha256,
    bunLockSha256: source.bunLockSha256,
    runnerOs: runner.os,
    runnerArch: runner.arch,
  };
  const authenticatedPriorEvidence = await snapshotPriorEvidence({
    category,
    coordinate,
    inputRoot: priorEvidence,
    temporaryRoot,
    expected: baseExpected,
  });
  const expected = {
    ...baseExpected,
    priorEvidenceManifestPath: authenticatedPriorEvidence.manifestPath,
    priorEvidenceManifestSha256: authenticatedPriorEvidence.manifestSha256,
  };
  const request = {
    protocol: requestProtocol,
    packageVersion,
    category,
    coordinate,
    sourceSha: source.sourceSha,
    checkedOutSourceSha: source.sourceSha,
    candidateWorkflowRunId: candidate.descriptor.workflowRunId,
    candidateDescriptorDigest: candidate.descriptorDigest,
    certificationWorkflowRunId,
    certificationWorkflowRunAttempt,
    certifierPath: certifier.path,
    certifierSha256: certifier.sha256,
    bunLockSha256: source.bunLockSha256,
    cleanWorktree: source.cleanWorktree,
    runnerOs: runner.os,
    runnerArch: runner.arch,
    candidateDirectory: candidateRoot,
    priorEvidenceDirectory: authenticatedPriorEvidence.snapshotRoot,
    priorEvidenceManifestPath: authenticatedPriorEvidence.manifestPath,
    priorEvidenceManifestSha256: authenticatedPriorEvidence.manifestSha256,
    receiptPath,
    evidencePath,
  };
  const requestBytes = canonicalBytes(request);
  validateRequest({ requestBytes, expected });
  await writeFile(requestPath, requestBytes, { flag: "wx", mode: 0o400 });
  const requestSnapshot = await captureRequestSnapshot({ path: requestPath, bytes: requestBytes });
  await reauthenticateCertificationSource(source);
  await reauthenticateCertifierSnapshot(certifier);
  await reauthenticatePriorEvidenceSnapshot(authenticatedPriorEvidence);
  await reauthenticateCandidateSnapshot(candidateSnapshot);
  await reauthenticateRequestSnapshot(requestSnapshot);
  await mkdir(dirname(outputRoot), { recursive: true });
  await mkdir(outputRoot);
  const childEnvironment = Object.fromEntries([
    "HOME",
    "PATH",
    "TMPDIR",
    "RUNNER_TEMP",
    "EFFECT_BUILD_APPLE_APPLICATION_FINGERPRINT",
    "EFFECT_BUILD_APPLE_INSTALLER_FINGERPRINT",
    "EFFECT_BUILD_APPLE_TEAM_ID",
    "EFFECT_BUILD_APPLE_NOTARY_KEYCHAIN_PROFILE",
  ].flatMap((name) => process.env[name] === undefined ? [] : [[name, process.env[name]]]));
  await execute(certifier.snapshotPath, ["--request", requestPath], {
    cwd: temporaryRoot,
    env: childEnvironment,
    timeout: 60 * 60 * 1000,
    maxBuffer: 1_048_576,
    windowsHide: true,
  });
  await reauthenticateCertificationSource(source);
  await reauthenticateCertifierSnapshot(certifier);
  await reauthenticatePriorEvidenceSnapshot(authenticatedPriorEvidence);
  await reauthenticateCandidateSnapshot(candidateSnapshot);
  await reauthenticateRequestSnapshot(requestSnapshot);
  const outputEntries = await readdir(outputRoot, { withFileTypes: true });
  if (outputEntries.some((entry) => !entry.isFile())) throw new Error("certifier outputs must be regular files");
  const actualFiles = outputEntries.map(({ name }) => name).sort();
  const expectedFiles = [receiptPath, evidencePath].map((path) => path.slice(outputRoot.length + 1)).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(`certifier output file set mismatch: ${actualFiles.join(",")}`);
  }
  const [receiptBytes, evidenceBytes] = await Promise.all([
    readBoundedRegularFile({ path: receiptPath, maximumBytes: maximumReceiptBytes, subject: "certification receipt" }),
    readBoundedRegularFile({ path: evidencePath, maximumBytes: maximumEvidenceBytes, subject: "certification evidence" }),
  ]);
  const receipt = validateReceipt({
    receiptBytes,
    evidenceBytes,
    priorEvidenceManifestBytes: authenticatedPriorEvidence.manifestBytes,
    expected: { ...expected, requestSha256: sha256(requestBytes) },
    runner,
  });
  await Promise.all([chmod(receiptPath, 0o400), chmod(evidencePath, 0o400)]);
  const [sealedReceiptBytes, sealedEvidenceBytes] = await Promise.all([
    readBoundedRegularFile({ path: receiptPath, maximumBytes: maximumReceiptBytes, subject: "sealed certification receipt" }),
    readBoundedRegularFile({ path: evidencePath, maximumBytes: maximumEvidenceBytes, subject: "sealed certification evidence" }),
  ]);
  if (!sealedReceiptBytes.equals(receiptBytes) || !sealedEvidenceBytes.equals(evidenceBytes)) {
    throw new Error("certifier outputs changed while they were sealed");
  }
  await writeFile(priorEvidenceManifestOutputPath, authenticatedPriorEvidence.manifestBytes, { flag: "wx", mode: 0o400 });
  process.stdout.write(
    `${JSON.stringify({ coordinate, evidenceSha256: receipt.evidenceSha256, receiptSha256: sha256(receiptBytes) })}\n`,
  );
} finally {
  const candidateMetadata = await lstat(candidateRoot).catch(() => undefined);
  if (candidateMetadata?.isDirectory() === true && !candidateMetadata.isSymbolicLink()) {
    await chmod(candidateRoot, 0o700);
  }
  await rm(temporaryRoot, { recursive: true, force: true });
}
