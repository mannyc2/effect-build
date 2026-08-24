import {
  contract,
  decodeCanonical,
  downloadArtifact,
  githubDigest,
  hex,
  observeArtifactById,
  observeRun,
  positiveDecimal,
  readArtifactZip,
  requireEntries,
  sha256,
} from "../node-finalizer/common.mjs";

const apple = contract.release.appleCertificationEvidence;

export const validateAppleCertification = ({ wrapperBytes, candidate, subject }) => {
  const entries = readArtifactZip(wrapperBytes);
  requireEntries(entries, [apple.indexFileName, apple.bundleFileName]);
  const indexBytes = entries.get(apple.indexFileName);
  const bundleBytes = entries.get(apple.bundleFileName);
  const index = decodeCanonical(indexBytes, apple.indexFields);
  if (
    index.schema !== contract.protocols.appleCertificationIndex || index.version !== "0.5.0"
    || index.sourceSha !== candidate.descriptor.sourceSha
    || index.candidateWorkflowRunId !== candidate.descriptor.workflowRunId
    || index.candidateWorkflowRunAttempt !== candidate.descriptor.workflowRunAttempt
    || index.descriptorArtifactId !== subject.descriptorArtifactId
    || index.descriptorArtifactDigest !== subject.descriptorArtifactDigest
    || index.payloadArtifactId !== candidate.descriptor.payloadArtifactId
    || index.payloadArtifactDigest !== candidate.descriptor.payloadArtifactDigest
    || index.candidateDescriptorDigest !== candidate.descriptorDigest
    || index.certificationWorkflowRepository !== apple.workflowRepository
    || index.certificationWorkflowPath !== apple.workflowPath
    || index.certificationWorkflowRef !== apple.workflowRef
    || index.certificationWorkflowRunId !== subject.workflowRunId
    || index.certificationWorkflowRunAttempt !== "1"
    || index.certificationWorkflowRunHeadSha !== candidate.descriptor.sourceSha
    || index.certificationWorkflowEvent !== apple.workflowEvent
    || index.checkedOutSourceSha !== candidate.descriptor.sourceSha
    || index.bundleFileName !== apple.bundleFileName || index.verdict !== apple.verdict
  ) throw new Error("Apple certification index authority mismatch");
  for (const field of [
    "candidateWorkflowRunId",
    "candidateWorkflowRunAttempt",
    "descriptorArtifactId",
    "payloadArtifactId",
    "certificationWorkflowRunId",
    "certificationWorkflowRunAttempt",
    "bundleBytes",
  ]) positiveDecimal(index[field], field);
  for (const field of ["sourceSha", "certificationWorkflowRunHeadSha", "checkedOutSourceSha"]) {
    hex(index[field], 40, field);
  }
  for (const field of ["candidateDescriptorDigest", "bundleSha256"]) hex(index[field], 64, field);
  for (const field of ["descriptorArtifactDigest", "payloadArtifactDigest"]) githubDigest(index[field], field);
  if (
    String(bundleBytes.length) !== index.bundleBytes || sha256(bundleBytes) !== index.bundleSha256
    || JSON.stringify(index.certificationCells) !== JSON.stringify(apple.certificationCells)
    || JSON.stringify(index.appleDistributionCoordinates) !== JSON.stringify(apple.appleDistributionCoordinates)
    || JSON.stringify(index.appleCleanHostCoordinates) !== JSON.stringify(apple.appleCleanHostCoordinates)
  ) throw new Error("Apple certification bundle or coordinate set mismatch");
  return Object.freeze({ index, indexBytes, indexDigest: sha256(indexBytes), bundleBytes });
};

export const authenticateAppleCertification = async ({ repository, token, inputs, candidate, now = new Date() }) => {
  const workflowRunId = positiveDecimal(inputs.appleCertificationWorkflowRunId, "appleCertificationWorkflowRunId");
  const workflowRunAttempt = positiveDecimal(
    inputs.appleCertificationWorkflowRunAttempt,
    "appleCertificationWorkflowRunAttempt",
  );
  if (workflowRunAttempt !== "1") throw new Error("Apple certification run attempt must be one");
  const artifactId = positiveDecimal(inputs.appleCertificationArtifactId, "appleCertificationArtifactId");
  const artifactDigest = githubDigest(inputs.appleCertificationArtifactDigest, "appleCertificationArtifactDigest");
  const [run, artifact] = await Promise.all([
    observeRun({ repository, runId: workflowRunId, token }),
    observeArtifactById({ repository, artifactId, token }),
  ]);
  if (
    String(run.id) !== workflowRunId || String(run.run_attempt) !== "1" || run.event !== apple.workflowEvent
    || run.path !== apple.workflowPath || run.head_repository?.full_name !== repository
    || run.head_sha !== candidate.descriptor.sourceSha || `refs/heads/${run.head_branch}` !== apple.workflowRef
    || run.conclusion !== "success"
  ) throw new Error("Apple certification workflow run authority mismatch");
  if (
    String(artifact.id) !== artifactId || artifact.name !== apple.artifactName || artifact.digest !== artifactDigest
    || String(artifact.workflow_run?.id) !== workflowRunId
    || artifact.workflow_run?.head_sha !== candidate.descriptor.sourceSha || artifact.expired !== false
    || new Date(artifact.expires_at).getTime() <= now.getTime()
  ) throw new Error("Apple certification artifact authority mismatch");
  const wrapperBytes = await downloadArtifact(artifact, token);
  return Object.freeze({
    ...validateAppleCertification({
      wrapperBytes,
      candidate,
      subject: {
        descriptorArtifactId: inputs.descriptorArtifactId,
        descriptorArtifactDigest: inputs.descriptorArtifactDigest,
        workflowRunId,
      },
    }),
    run,
    artifact,
    wrapperBytes,
  });
};

export const appleRequestFromEnvironment = (environment = process.env) => ({
  appleCertificationWorkflowRunId: environment.APPLE_CERTIFICATION_WORKFLOW_RUN_ID,
  appleCertificationWorkflowRunAttempt: environment.APPLE_CERTIFICATION_WORKFLOW_RUN_ATTEMPT,
  appleCertificationArtifactId: environment.APPLE_CERTIFICATION_ARTIFACT_ID,
  appleCertificationArtifactDigest: environment.APPLE_CERTIFICATION_ARTIFACT_DIGEST,
  descriptorArtifactId: environment.DESCRIPTOR_ARTIFACT_ID,
  descriptorArtifactDigest: environment.DESCRIPTOR_ARTIFACT_DIGEST,
});
