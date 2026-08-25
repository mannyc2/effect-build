import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { authenticateCandidate, candidateRequestFromEnvironment } from "../release/candidate.mjs";
import {
  canonicalBytes,
  contract,
  hex,
  positiveDecimal,
  requireEnvironment,
  sha256,
} from "../node-finalizer/common.mjs";
import { assembleBundle, categoryCoordinates } from "./receipt.mjs";

const evidenceRoot = resolve(process.argv[2] ?? "apple-certification-evidence");
const outputRoot = resolve(process.argv[3] ?? "apple-certification-output");
const repository = requireEnvironment("GITHUB_REPOSITORY");
const token = requireEnvironment("GITHUB_TOKEN");
const workflowRunId = positiveDecimal(requireEnvironment("GITHUB_RUN_ID"), "GITHUB_RUN_ID");
const workflowRunAttempt = positiveDecimal(requireEnvironment("GITHUB_RUN_ATTEMPT"), "GITHUB_RUN_ATTEMPT");
if (workflowRunAttempt !== "1" || requireEnvironment("GITHUB_EVENT_NAME") !== "workflow_dispatch") {
  throw new Error("Apple certification authority requires first-attempt workflow_dispatch");
}
const candidate = await authenticateCandidate({ repository, token, inputs: candidateRequestFromEnvironment() });
const sourceSha = hex(requireEnvironment("GITHUB_SHA"), 40, "GITHUB_SHA");
const checkedOutSourceSha = hex(requireEnvironment("CHECKED_OUT_SOURCE_SHA"), 40, "CHECKED_OUT_SOURCE_SHA");
const apple = contract.release.appleCertificationEvidence;
if (
  repository !== apple.workflowRepository || requireEnvironment("GITHUB_REF") !== apple.workflowRef
  || sourceSha !== candidate.descriptor.sourceSha || checkedOutSourceSha !== sourceSha
) throw new Error("Apple certification workflow source authority mismatch");
const expected = [
  ...categoryCoordinates.distribution.map((coordinate) => ({
    category: "distribution",
    coordinate,
    sourceSha,
    candidateWorkflowRunId: candidate.descriptor.workflowRunId,
    candidateDescriptorDigest: candidate.descriptorDigest,
    certificationWorkflowRunId: workflowRunId,
  })),
  ...categoryCoordinates["clean-host"].map((coordinate) => ({
    category: "clean-host",
    coordinate,
    sourceSha,
    candidateWorkflowRunId: candidate.descriptor.workflowRunId,
    candidateDescriptorDigest: candidate.descriptorDigest,
    certificationWorkflowRunId: workflowRunId,
  })),
  ...categoryCoordinates.cell.map((coordinate) => ({
    category: "cell",
    coordinate,
    sourceSha,
    candidateWorkflowRunId: candidate.descriptor.workflowRunId,
    candidateDescriptorDigest: candidate.descriptorDigest,
    certificationWorkflowRunId: workflowRunId,
  })),
];
const bundle = await assembleBundle({ root: evidenceRoot, expected });
const index = {
  schema: contract.protocols.appleCertificationIndex,
  version: "0.5.0",
  sourceSha,
  candidateWorkflowRunId: candidate.descriptor.workflowRunId,
  candidateWorkflowRunAttempt: candidate.descriptor.workflowRunAttempt,
  descriptorArtifactId: requireEnvironment("DESCRIPTOR_ARTIFACT_ID"),
  descriptorArtifactDigest: requireEnvironment("DESCRIPTOR_ARTIFACT_DIGEST"),
  payloadArtifactId: candidate.descriptor.payloadArtifactId,
  payloadArtifactDigest: candidate.descriptor.payloadArtifactDigest,
  candidateDescriptorDigest: candidate.descriptorDigest,
  certificationWorkflowRepository: apple.workflowRepository,
  certificationWorkflowPath: apple.workflowPath,
  certificationWorkflowRef: apple.workflowRef,
  certificationWorkflowRunId: workflowRunId,
  certificationWorkflowRunAttempt: workflowRunAttempt,
  certificationWorkflowRunHeadSha: sourceSha,
  certificationWorkflowEvent: apple.workflowEvent,
  checkedOutSourceSha,
  bundleFileName: apple.bundleFileName,
  bundleBytes: String(bundle.length),
  bundleSha256: sha256(bundle),
  verdict: apple.verdict,
  certificationCells: apple.certificationCells,
  appleDistributionCoordinates: apple.appleDistributionCoordinates,
  appleCleanHostCoordinates: apple.appleCleanHostCoordinates,
};
await mkdir(outputRoot, { recursive: true });
const indexPath = join(outputRoot, apple.indexFileName);
const bundlePath = join(outputRoot, apple.bundleFileName);
await writeFile(indexPath, canonicalBytes(index), { flag: "wx" });
await writeFile(bundlePath, bundle, { flag: "wx" });
for (const path of [indexPath, bundlePath]) await readFile(path);
process.stdout.write(`${JSON.stringify({ index: indexPath, indexSha256: sha256(canonicalBytes(index)), bundleSha256: sha256(bundle) })}\n`);
