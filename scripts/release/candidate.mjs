import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import {
  canonicalBytes,
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

const identity = contract.release.candidateIdentity;
const packageNames = contract.release.orderedPackages;
const recordFields = contract.release.candidatePackageRecordFields;
const compareUtf16 = (left, right) => left < right ? -1 : left > right ? 1 : 0;

const exactFields = (value, expected, subject) => {
  if (value === null || Array.isArray(value) || typeof value !== "object") throw new Error(`${subject} must be an object`);
  const actual = Object.keys(value).sort(compareUtf16);
  const wanted = [...expected].sort(compareUtf16);
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) throw new Error(`${subject} field mismatch: ${actual.join(",")}`);
};

const exactTimestamp = (value, field) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value)) {
    throw new Error(`${field} is not a canonical UTC-second timestamp`);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString().replace(".000Z", "Z") !== value) {
    throw new Error(`${field} is not a real canonical timestamp`);
  }
  return date;
};

const canonicalSRI = (value, field) => {
  if (typeof value !== "string" || !/^sha512-[A-Za-z0-9+/]{86}==$/u.test(value)) {
    throw new Error(`${field} is not canonical SHA-512 SRI`);
  }
  const encoded = value.slice("sha512-".length);
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.length !== 64 || decoded.toString("base64") !== encoded) throw new Error(`${field} is not canonical SHA-512 SRI`);
};

const manifestFromTarball = (bytes) => {
  const archive = gunzipSync(bytes);
  const record = 512;
  for (let offset = 0; offset < archive.byteLength; offset += record) {
    const name = archive.subarray(offset, offset + 100).toString("utf8").split("\0", 1)[0];
    const sizeSource = archive.subarray(offset + 124, offset + 136).toString("utf8").split("\0", 1)[0].trim();
    if (!/^[0-7]+$/u.test(sizeSource || "0")) throw new Error("tar entry size is malformed");
    const size = Number.parseInt(sizeSource || "0", 8);
    if (name === "package/package.json") {
      return JSON.parse(archive.subarray(offset + record, offset + record + size).toString("utf8"));
    }
    offset += Math.ceil(size / record) * record;
  }
  throw new Error("packed package manifest missing");
};

export const validateCandidateDescriptor = (bytes, { now = new Date(), requireFresh = true } = {}) => {
  const descriptor = decodeCanonical(bytes, identity.requiredDescriptorFields);
  if (descriptor.schema !== identity.schema || descriptor.version !== "0.5.0") throw new Error("candidate protocol or version mismatch");
  if (
    descriptor.sourceRepository !== identity.sourceRepository || descriptor.sourceRef !== identity.sourceRef
    || descriptor.workflowRepository !== identity.workflowRepository || descriptor.workflowPath !== identity.workflowPath
    || descriptor.workflowRef !== identity.workflowRef
  ) throw new Error("candidate authority mismatch");
  hex(descriptor.sourceSha, 40, "sourceSha");
  hex(descriptor.workflowRunHeadSha, 40, "workflowRunHeadSha");
  hex(descriptor.checkedOutSourceSha, 40, "checkedOutSourceSha");
  if (descriptor.sourceSha !== descriptor.workflowRunHeadSha || descriptor.sourceSha !== descriptor.checkedOutSourceSha) {
    throw new Error("candidate source identities diverged");
  }
  positiveDecimal(descriptor.workflowRunId, "workflowRunId");
  positiveDecimal(descriptor.workflowRunAttempt, "workflowRunAttempt");
  positiveDecimal(descriptor.payloadArtifactId, "payloadArtifactId");
  if (descriptor.payloadArtifactName !== identity.payloadArtifactName) throw new Error("payload artifact name mismatch");
  githubDigest(descriptor.payloadArtifactDigest, "payloadArtifactDigest");
  const created = exactTimestamp(descriptor.createdAt, "createdAt");
  const expires = exactTimestamp(descriptor.expiresAt, "expiresAt");
  const lifetime = expires.getTime() - created.getTime();
  if (lifetime <= 0 || lifetime > identity.maximumAgeSeconds * 1000) throw new Error("candidate lifetime exceeds policy");
  if (requireFresh && (created.getTime() > now.getTime() || expires.getTime() < now.getTime())) {
    throw new Error("candidate is not fresh");
  }
  if (!Array.isArray(descriptor.packages) || descriptor.packages.length !== packageNames.length) {
    throw new Error("candidate must contain the fixed seven records");
  }
  descriptor.packages.forEach((record, index) => {
    exactFields(record, recordFields, `packages[${index}]`);
    const name = packageNames[index];
    if (
      record.name !== name || record.packedName !== name || record.version !== "0.5.0"
      || record.packedVersion !== "0.5.0" || record.filename !== `${name}-0.5.0.tgz`
    ) throw new Error(`package identity mismatch at index ${index}`);
    if (JSON.stringify(record.dependencyPrerequisites) !== JSON.stringify(contract.release.orderedPackagePrerequisites[name])) {
      throw new Error(`package prerequisite mismatch for ${name}`);
    }
    positiveDecimal(record.bytes, `${name}.bytes`);
    hex(record.sha256, 64, `${name}.sha256`);
    hex(record.sha1, 40, `${name}.sha1`);
    canonicalSRI(record.sha512SRI, `${name}.sha512SRI`);
  });
  return Object.freeze({ descriptor, descriptorDigest: sha256(bytes), created, expires });
};

const assertAvailableArtifact = (artifact, expected, now) => {
  if (String(artifact.id) !== expected.id || artifact.name !== expected.name || artifact.digest !== expected.digest) {
    throw new Error(`${expected.name} artifact identity mismatch`);
  }
  githubDigest(artifact.digest, `${expected.name}.digest`);
  if (artifact.expired !== false || new Date(artifact.expires_at).getTime() <= now.getTime()) {
    throw new Error(`${expected.name} artifact is unavailable`);
  }
  if (
    String(artifact.workflow_run?.id) !== expected.runId
    || artifact.workflow_run?.head_sha !== expected.sourceSha
  ) throw new Error(`${expected.name} workflow binding mismatch`);
};

export const authenticateCandidate = async ({ repository, token, inputs, now = new Date(), requireFresh = true }) => {
  if (repository !== identity.workflowRepository) throw new Error("candidate repository mismatch");
  const candidateWorkflowRunId = positiveDecimal(inputs.candidateWorkflowRunId, "candidateWorkflowRunId");
  const candidateWorkflowRunAttempt = positiveDecimal(inputs.candidateWorkflowRunAttempt, "candidateWorkflowRunAttempt");
  const descriptorArtifactId = positiveDecimal(inputs.descriptorArtifactId, "descriptorArtifactId");
  const descriptorArtifactDigest = githubDigest(inputs.descriptorArtifactDigest, "descriptorArtifactDigest");
  const payloadArtifactId = positiveDecimal(inputs.payloadArtifactId, "payloadArtifactId");
  const payloadArtifactDigest = githubDigest(inputs.payloadArtifactDigest, "payloadArtifactDigest");
  const run = await observeRun({ repository, runId: candidateWorkflowRunId, token });
  if (
    String(run.id) !== candidateWorkflowRunId || String(run.run_attempt) !== candidateWorkflowRunAttempt
    || run.event !== identity.workflowEvent || run.path !== identity.workflowPath || run.head_sha === undefined
    || run.head_repository?.full_name !== repository || run.conclusion !== "success"
    || `refs/heads/${run.head_branch}` !== identity.sourceRef
  ) throw new Error("candidate workflow run authority mismatch");
  const sourceSha = hex(run.head_sha, 40, "candidate run head_sha");
  const [descriptorArtifact, payloadArtifact] = await Promise.all([
    observeArtifactById({ repository, artifactId: descriptorArtifactId, token }),
    observeArtifactById({ repository, artifactId: payloadArtifactId, token }),
  ]);
  assertAvailableArtifact(descriptorArtifact, {
    id: descriptorArtifactId,
    name: identity.descriptorArtifactName,
    digest: descriptorArtifactDigest,
    runId: candidateWorkflowRunId,
    sourceSha,
  }, now);
  assertAvailableArtifact(payloadArtifact, {
    id: payloadArtifactId,
    name: identity.payloadArtifactName,
    digest: payloadArtifactDigest,
    runId: candidateWorkflowRunId,
    sourceSha,
  }, now);
  const [descriptorWrapper, payloadWrapper] = await Promise.all([
    downloadArtifact(descriptorArtifact, token),
    downloadArtifact(payloadArtifact, token),
  ]);
  const descriptorEntries = readArtifactZip(descriptorWrapper);
  requireEntries(descriptorEntries, [identity.descriptorFileName]);
  const descriptorBytes = descriptorEntries.get(identity.descriptorFileName);
  const validated = validateCandidateDescriptor(descriptorBytes, { now, requireFresh });
  const { descriptor } = validated;
  if (
    descriptor.workflowRunId !== candidateWorkflowRunId
    || descriptor.workflowRunAttempt !== candidateWorkflowRunAttempt || descriptor.sourceSha !== sourceSha
    || descriptor.payloadArtifactId !== payloadArtifactId || descriptor.payloadArtifactDigest !== payloadArtifactDigest
  ) throw new Error("candidate descriptor input binding mismatch");
  const payloadEntries = readArtifactZip(payloadWrapper);
  requireEntries(payloadEntries, descriptor.packages.map(({ filename }) => filename));
  for (const record of descriptor.packages) {
    const bytes = payloadEntries.get(record.filename);
    if (
      String(bytes.length) !== record.bytes || sha256(bytes) !== record.sha256
      || createHash("sha1").update(bytes).digest("hex") !== record.sha1
      || `sha512-${createHash("sha512").update(bytes).digest("base64")}` !== record.sha512SRI
    ) throw new Error(`candidate payload digest mismatch for ${record.name}`);
    const manifest = manifestFromTarball(bytes);
    if (manifest.name !== record.name || manifest.version !== record.version) {
      throw new Error(`candidate packed manifest mismatch for ${record.name}`);
    }
  }
  return Object.freeze({
    ...validated,
    run,
    descriptorArtifact,
    payloadArtifact,
    descriptorWrapper,
    payloadWrapper,
    descriptorBytes,
    payloadEntries,
  });
};

export const candidateRequestFromEnvironment = (environment = process.env) => ({
  candidateWorkflowRunId: environment.CANDIDATE_WORKFLOW_RUN_ID,
  candidateWorkflowRunAttempt: environment.CANDIDATE_WORKFLOW_RUN_ATTEMPT,
  descriptorArtifactId: environment.DESCRIPTOR_ARTIFACT_ID,
  descriptorArtifactDigest: environment.DESCRIPTOR_ARTIFACT_DIGEST,
  payloadArtifactId: environment.PAYLOAD_ARTIFACT_ID,
  payloadArtifactDigest: environment.PAYLOAD_ARTIFACT_DIGEST,
});

export const candidateDescriptorBytes = (descriptor) => canonicalBytes(descriptor);
