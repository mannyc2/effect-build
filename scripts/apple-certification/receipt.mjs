import { lstat, open, readdir } from "node:fs/promises";
import { basename, isAbsolute, join, normalize } from "node:path";
import {
  appleCertification,
  canonicalBytes,
  decodeCanonical,
  hex,
  positiveDecimal,
  sha256,
} from "../node-finalizer/common.mjs";

export const packageVersion = appleCertification.packageVersion;
export const requestProtocol = appleCertification.protocols.request;
export const receiptProtocol = appleCertification.protocols.receipt;
export const evidenceProtocol = appleCertification.protocols.evidence;
export const bundleProtocol = appleCertification.protocols.bundle;
export const priorEvidenceManifestProtocol = appleCertification.protocols.priorEvidenceManifest;
export const requestFields = Object.freeze([...appleCertification.requestFields]);
export const receiptFields = Object.freeze([...appleCertification.receiptFields]);

const schema = appleCertification.evidenceSchema;
const evidenceFields = schema.fields;
const runnerFields = schema.runnerFields;
const artifactFields = schema.artifactFields;
const toolFields = schema.toolFields;
const stepFields = schema.stepFields;
const credentialFields = schema.credentialFields;
const notaryFields = schema.notaryFields;
const priorEvidenceFields = schema.priorEvidenceFields;
const quarantineFields = schema.quarantineFields;
const claimFields = schema.claimFields;
const priorManifestSchema = schema.priorEvidenceManifest;
const priorManifestFields = priorManifestSchema.fields;
const priorManifestEntryFields = priorManifestSchema.entryFields;
const priorDependencyPolicy = priorManifestSchema.dependencyPolicy;

export const maximumReceiptBytes = 1024 * 1024;
export const maximumEvidenceBytes = 2 * 1024 * 1024;
export const maximumPriorEvidenceManifestBytes = 1024 * 1024;
const maximumBundleBytes = 128 * 1024 * 1024;

export const categoryCoordinates = Object.freeze({
  cell: appleCertification.certificationCells,
  distribution: appleCertification.appleDistributionCoordinates,
  "clean-host": appleCertification.appleCleanHostCoordinates,
});

export const coordinateSlug = (category, coordinate) => `${category}-${coordinate.replaceAll("|", "--")}`;

const dependency = (category, coordinate) => Object.freeze({ category, coordinate });

export const priorEvidenceDependencies = (category, coordinate) => {
  if (category === "distribution") {
    if (priorDependencyPolicy.distribution !== "none") throw new Error("distribution prior-evidence policy changed");
    return Object.freeze([]);
  }
  if (category === "clean-host") {
    const separator = coordinate.lastIndexOf("|");
    const product = coordinate.slice(0, separator);
    const target = coordinate.slice(separator + 1);
    const scenario = priorDependencyPolicy.cleanHostProductDistributionScenario[product];
    if (priorDependencyPolicy.cleanHostTargetRule !== "same-target" || scenario === undefined) {
      throw new Error(`unknown clean-host prior-evidence dependency ${coordinate}`);
    }
    return Object.freeze([dependency("distribution", `${scenario}|${target}`)]);
  }
  const configured = priorDependencyPolicy.cell[coordinate];
  if (configured === "all-distribution-coordinates") {
    return Object.freeze(categoryCoordinates.distribution.map((entry) => dependency("distribution", entry)));
  }
  if (configured === "all-distribution-and-clean-host-coordinates") {
    return Object.freeze([
      ...categoryCoordinates.distribution.map((entry) => dependency("distribution", entry)),
      ...categoryCoordinates["clean-host"].map((entry) => dependency("clean-host", entry)),
    ]);
  }
  if (!Array.isArray(configured)) throw new Error(`unknown cell prior-evidence dependency ${coordinate}`);
  return Object.freeze(configured.map((entry) => {
    const separator = entry.indexOf("/");
    return dependency(entry.slice(0, separator), entry.slice(separator + 1));
  }));
};

const compareUtf16 = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export const readBoundedRegularFile = async ({ path, maximumBytes, subject }) => {
  const pathMetadata = await lstat(path);
  if (!pathMetadata.isFile() || pathMetadata.size <= 0 || pathMetadata.size > maximumBytes) {
    throw new Error(`${subject} must be a non-empty regular file no larger than ${maximumBytes} bytes`);
  }
  const handle = await open(path, "r");
  try {
    const openedMetadata = await handle.stat();
    if (
      !openedMetadata.isFile() || openedMetadata.dev !== pathMetadata.dev || openedMetadata.ino !== pathMetadata.ino
      || openedMetadata.size !== pathMetadata.size
    ) throw new Error(`${subject} changed while it was opened`);
    const bytes = Buffer.alloc(openedMetadata.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (bytesRead === 0) throw new Error(`${subject} was truncated while it was read`);
      offset += bytesRead;
    }
    if ((await handle.read(Buffer.alloc(1), 0, 1, bytes.length)).bytesRead !== 0) {
      throw new Error(`${subject} grew while it was read`);
    }
    const finalMetadata = await handle.stat();
    if (finalMetadata.size !== openedMetadata.size || finalMetadata.mtimeMs !== openedMetadata.mtimeMs) {
      throw new Error(`${subject} changed while it was read`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
};

const exactObject = (value, fields, subject) => {
  if (value === null || Array.isArray(value) || typeof value !== "object") throw new Error(`${subject} must be an object`);
  const actual = Object.keys(value).sort(compareUtf16);
  const expected = [...fields].sort(compareUtf16);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${subject} field mismatch: ${actual.join(",")}`);
  return value;
};

const nonEmpty = (value, field) => {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) throw new Error(`${field} must be a non-empty string`);
  return value;
};

const absolutePath = (value, field) => {
  nonEmpty(value, field);
  if (!isAbsolute(value) || normalize(value) !== value) throw new Error(`${field} must be a normalized absolute path`);
  return value;
};

const utcSecond = (value, field) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value)) {
    throw new Error(`${field} must be a UTC-second timestamp`);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString().replace(".000Z", "Z") !== value) {
    throw new Error(`${field} must be a real UTC-second timestamp`);
  }
  return value;
};

const exactArray = (value, subject, { allowEmpty = false } = {}) => {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) throw new Error(`${subject} must be a non-empty array`);
  return value;
};

const unique = (values, subject) => {
  if (new Set(values).size !== values.length) throw new Error(`${subject} must not contain duplicates`);
};

const validateArtifacts = (value, requiredRoles) => {
  const records = exactArray(value, "payload.artifacts");
  for (const [index, record] of records.entries()) {
    exactObject(record, artifactFields, `payload.artifacts[${index}]`);
    nonEmpty(record.role, `payload.artifacts[${index}].role`);
    nonEmpty(record.kind, `payload.artifacts[${index}].kind`);
    if (record.identityKind !== "file-sha256" && record.identityKind !== "tree-manifest-sha256") {
      throw new Error(`payload.artifacts[${index}].identityKind is invalid`);
    }
    hex(record.identitySha256, 64, `payload.artifacts[${index}].identitySha256`);
    positiveDecimal(record.bytes, `payload.artifacts[${index}].bytes`);
  }
  const roles = records.map(({ role }) => role);
  unique(roles, "payload artifact roles");
  for (const role of requiredRoles) {
    if (!roles.includes(role)) throw new Error(`payload artifacts omit required role ${role}`);
  }
  return records;
};

const validateTools = (value) => {
  const records = exactArray(value, "payload.tools");
  for (const [index, record] of records.entries()) {
    exactObject(record, toolFields, `payload.tools[${index}]`);
    nonEmpty(record.name, `payload.tools[${index}].name`);
    absolutePath(record.path, `payload.tools[${index}].path`);
    nonEmpty(record.version, `payload.tools[${index}].version`);
    hex(record.sha256, 64, `payload.tools[${index}].sha256`);
  }
  unique(records.map(({ name }) => name), "payload tool names");
};

const validateSteps = (value, requiredNames) => {
  const records = exactArray(value, "payload.steps");
  for (const [index, record] of records.entries()) {
    exactObject(record, stepFields, `payload.steps[${index}]`);
    nonEmpty(record.name, `payload.steps[${index}].name`);
    if (record.status !== "passed") throw new Error(`payload.steps[${index}].status must be passed`);
    for (const field of ["inputSha256", "outputSha256", "detailsSha256"]) {
      hex(record[field], 64, `payload.steps[${index}].${field}`);
    }
  }
  const names = records.map(({ name }) => name);
  unique(names, "payload step names");
  for (const name of requiredNames) {
    if (!names.includes(name)) throw new Error(`payload steps omit required operation ${name}`);
  }
};

const distributionRequirements = schema.distribution.requiredOperations;
const cleanHostRequirements = schema.cleanHost.requiredOperations;
const cellClaim = schema.cell.requiredClaims;

const validateCredentials = (value, scenario) => {
  const records = exactArray(value, "payload.credentials");
  for (const [index, record] of records.entries()) {
    exactObject(record, credentialFields, `payload.credentials[${index}]`);
    if (record.kind !== "developer-id-application" && record.kind !== "developer-id-installer") {
      throw new Error(`payload.credentials[${index}].kind is invalid`);
    }
    if (!/^[0-9A-F]{40}$/u.test(record.fingerprint)) throw new Error(`payload.credentials[${index}].fingerprint is invalid`);
    if (!/^[A-Z0-9]{10}$/u.test(record.teamId)) throw new Error(`payload.credentials[${index}].teamId is invalid`);
    utcSecond(record.validFrom, `payload.credentials[${index}].validFrom`);
    utcSecond(record.validUntil, `payload.credentials[${index}].validUntil`);
    if (new Date(record.validFrom).getTime() >= new Date(record.validUntil).getTime()) {
      throw new Error(`payload.credentials[${index}] validity interval is invalid`);
    }
  }
  const requiredKind = scenario === "notarized-stapled-installer-package"
    ? "developer-id-installer"
    : "developer-id-application";
  if (!records.some(({ kind }) => kind === requiredKind)) throw new Error(`payload credentials omit ${requiredKind}`);
};

const validateNotary = (value, required) => {
  const records = exactArray(value, "payload.notary", { allowEmpty: !required });
  if (!required && records.length !== 0) throw new Error("non-notarized distribution evidence must not invent Notary records");
  for (const [index, record] of records.entries()) {
    exactObject(record, notaryFields, `payload.notary[${index}]`);
    nonEmpty(record.submissionId, `payload.notary[${index}].submissionId`);
    if (record.terminalStatus !== "Accepted") throw new Error(`payload.notary[${index}].terminalStatus must be Accepted`);
    for (const field of ["subjectSha256", "transportSha256", "warningSummarySha256", "logSha256"]) {
      hex(record[field], 64, `payload.notary[${index}].${field}`);
    }
  }
};

const priorRecordFromManifestEntry = (entry) => ({
  category: entry.category,
  coordinate: entry.coordinate,
  priorEvidenceManifestSha256: entry.priorEvidenceManifestSha256,
  receiptSha256: entry.receiptSha256,
  evidenceSha256: entry.evidenceSha256,
  artifactIdentityKind: entry.artifactIdentityKind,
  artifactBytes: entry.artifactBytes,
  artifactSha256: entry.artifactSha256,
});

const validatePriorEvidence = (value, category, coordinate, expectedEntries) => {
  const dependencies = priorEvidenceDependencies(category, coordinate);
  const records = exactArray(value, "payload.priorEvidence", { allowEmpty: dependencies.length === 0 });
  for (const [index, record] of records.entries()) {
    exactObject(record, priorEvidenceFields, `payload.priorEvidence[${index}]`);
    if (!Object.hasOwn(categoryCoordinates, record.category) || !categoryCoordinates[record.category].includes(record.coordinate)) {
      throw new Error(`payload.priorEvidence[${index}].coordinate is invalid`);
    }
    hex(record.priorEvidenceManifestSha256, 64, `payload.priorEvidence[${index}].priorEvidenceManifestSha256`);
    hex(record.receiptSha256, 64, `payload.priorEvidence[${index}].receiptSha256`);
    hex(record.evidenceSha256, 64, `payload.priorEvidence[${index}].evidenceSha256`);
    if (record.artifactIdentityKind !== "file-sha256" && record.artifactIdentityKind !== "tree-manifest-sha256") {
      throw new Error(`payload.priorEvidence[${index}].artifactIdentityKind is invalid`);
    }
    positiveDecimal(record.artifactBytes, `payload.priorEvidence[${index}].artifactBytes`);
    hex(record.artifactSha256, 64, `payload.priorEvidence[${index}].artifactSha256`);
  }
  unique(records.map(({ category, coordinate }) => `${category}/${coordinate}`), "payload prior-evidence coordinates");
  const actualCoordinates = records.map(({ category: entryCategory, coordinate: entryCoordinate }) =>
    `${entryCategory}/${entryCoordinate}`
  );
  const requiredCoordinates = dependencies.map(({ category: entryCategory, coordinate: entryCoordinate }) =>
    `${entryCategory}/${entryCoordinate}`
  );
  if (JSON.stringify(actualCoordinates) !== JSON.stringify(requiredCoordinates)) {
    throw new Error(`payload prior-evidence dependency mismatch for ${category}/${coordinate}`);
  }
  if (
    expectedEntries !== undefined
    && !canonicalBytes(records).equals(canonicalBytes(expectedEntries.map(priorRecordFromManifestEntry)))
  ) throw new Error(`payload prior-evidence manifest mismatch for ${category}/${coordinate}`);
  return records;
};

const validateDistributionPayload = (payload, coordinate) => {
  exactObject(payload, schema.distribution.payloadFields, "evidence.payload");
  const scenario = coordinate.slice(0, coordinate.lastIndexOf("|"));
  const requiredSteps = distributionRequirements[scenario];
  if (requiredSteps === undefined) throw new Error(`unsupported distribution scenario ${scenario}`);
  validateArtifacts(payload.artifacts, schema.distribution.requiredArtifactRoles);
  validateCredentials(payload.credentials, scenario);
  validateNotary(payload.notary, scenario.startsWith("notarized-"));
  validateSteps(payload.steps, requiredSteps);
  validateTools(payload.tools);
};

const validateCleanHostPayload = (payload, coordinate, expectedEntries) => {
  exactObject(payload, schema.cleanHost.payloadFields, "evidence.payload");
  const separator = coordinate.lastIndexOf("|");
  const product = coordinate.slice(0, separator);
  const requiredSteps = cleanHostRequirements[product];
  if (requiredSteps === undefined) throw new Error(`unsupported clean-host product ${product}`);
  const artifacts = validateArtifacts(payload.artifacts, schema.cleanHost.requiredArtifactRoles);
  const priorEvidence = validatePriorEvidence(payload.priorEvidence, "clean-host", coordinate, expectedEntries);
  exactObject(payload.quarantine, quarantineFields, "payload.quarantine");
  hex(payload.quarantine.transportSha256, 64, "payload.quarantine.transportSha256");
  hex(payload.quarantine.attributeSha256, 64, "payload.quarantine.attributeSha256");
  if (payload.quarantine.decision !== "accepted") throw new Error("payload.quarantine.decision must be accepted");
  const transport = artifacts.find(({ role }) => role === "transport");
  if (
    transport.identitySha256 !== payload.quarantine.transportSha256
    || priorEvidence[0]?.artifactIdentityKind !== transport.identityKind
    || priorEvidence[0]?.artifactBytes !== transport.bytes
    || priorEvidence[0]?.artifactSha256 !== transport.identitySha256
  ) throw new Error(`clean-host transport identity does not match its distribution dependency for ${coordinate}`);
  validateSteps(payload.steps, requiredSteps);
  validateTools(payload.tools);
};

const validateCellPayload = (payload, coordinate, expectedEntries) => {
  exactObject(payload, schema.cell.payloadFields, "evidence.payload");
  validateArtifacts(payload.artifacts, schema.cell.requiredArtifactRoles);
  validatePriorEvidence(payload.priorEvidence, "cell", coordinate, expectedEntries);
  const claims = exactArray(payload.claims, "payload.claims");
  for (const [index, record] of claims.entries()) {
    exactObject(record, claimFields, `payload.claims[${index}]`);
    nonEmpty(record.name, `payload.claims[${index}].name`);
    if (record.status !== "passed") throw new Error(`payload.claims[${index}].status must be passed`);
    hex(record.evidenceSha256, 64, `payload.claims[${index}].evidenceSha256`);
  }
  unique(claims.map(({ name }) => name), "payload claim names");
  if (!claims.some(({ name }) => name === cellClaim[coordinate])) throw new Error(`payload claims omit ${cellClaim[coordinate]}`);
  validateSteps(payload.steps, [schema.cell.requiredOperation]);
  validateTools(payload.tools);
};

const targetFromCoordinate = (category, coordinate) =>
  category === "cell" ? undefined : coordinate.slice(coordinate.lastIndexOf("|") + 1);

const validateKnownCoordinate = (category, coordinate) => {
  if (!Object.hasOwn(categoryCoordinates, category) || !categoryCoordinates[category].includes(coordinate)) {
    throw new Error(`unknown certification coordinate ${coordinate}`);
  }
};

const validateRunner = (runner, subject) => {
  exactObject(runner, runnerFields, subject);
  nonEmpty(runner.os, `${subject}.os`);
  nonEmpty(runner.arch, `${subject}.arch`);
  nonEmpty(runner.osVersion, `${subject}.osVersion`);
};

export const evidenceArtifactIdentity = (evidence) => {
  const role = evidence.category === "distribution" ? "distributed" : evidence.category === "clean-host" ? "transport" : "candidate";
  const artifact = evidence.payload.artifacts.find((entry) => entry.role === role);
  if (artifact === undefined) throw new Error(`${evidence.category}/${evidence.coordinate} omits ${role} artifact identity`);
  return Object.freeze({
    artifactIdentityKind: artifact.identityKind,
    artifactBytes: artifact.bytes,
    artifactSha256: hex(artifact.identitySha256, 64, `${evidence.category}/${evidence.coordinate}.${role}Sha256`),
  });
};

export const validatePriorEvidenceManifest = ({ manifestBytes, expected }) => {
  if (
    !Buffer.isBuffer(manifestBytes) || manifestBytes.length === 0
    || manifestBytes.length > maximumPriorEvidenceManifestBytes
  ) throw new Error(`prior-evidence manifest size is invalid for ${expected.coordinate}`);
  const manifest = decodeCanonical(manifestBytes, priorManifestFields);
  if (
    manifest.protocol !== priorEvidenceManifestProtocol || manifest.packageVersion !== packageVersion
    || manifest.category !== expected.category || manifest.coordinate !== expected.coordinate
    || manifest.sourceSha !== expected.sourceSha
    || manifest.candidateWorkflowRunId !== expected.candidateWorkflowRunId
    || manifest.candidateDescriptorDigest !== expected.candidateDescriptorDigest
    || manifest.certificationWorkflowRunId !== expected.certificationWorkflowRunId
    || manifest.bunLockSha256 !== expected.bunLockSha256
  ) throw new Error(`prior-evidence manifest binding mismatch for ${expected.coordinate}`);
  validateKnownCoordinate(manifest.category, manifest.coordinate);
  hex(manifest.sourceSha, 40, "prior manifest sourceSha");
  positiveDecimal(manifest.candidateWorkflowRunId, "prior manifest candidateWorkflowRunId");
  hex(manifest.candidateDescriptorDigest, 64, "prior manifest candidateDescriptorDigest");
  positiveDecimal(manifest.certificationWorkflowRunId, "prior manifest certificationWorkflowRunId");
  hex(manifest.bunLockSha256, 64, "prior manifest bunLockSha256");
  const dependencies = priorEvidenceDependencies(manifest.category, manifest.coordinate);
  const entries = exactArray(manifest.entries, "prior manifest entries", { allowEmpty: dependencies.length === 0 });
  for (const [index, entry] of entries.entries()) {
    exactObject(entry, priorManifestEntryFields, `prior manifest entries[${index}]`);
    if (!Object.hasOwn(categoryCoordinates, entry.category) || !categoryCoordinates[entry.category].includes(entry.coordinate)) {
      throw new Error(`prior manifest entries[${index}] has an unknown coordinate`);
    }
    absolutePath(entry.certifierPath, `prior manifest entries[${index}].certifierPath`);
    hex(entry.certifierSha256, 64, `prior manifest entries[${index}].certifierSha256`);
    const slug = coordinateSlug(entry.category, entry.coordinate);
    if (
      entry.priorEvidenceManifestName !== `${slug}.prior-evidence.json`
      || entry.receiptName !== `${slug}.receipt.json`
      || entry.evidenceName !== `${slug}.evidence.json`
    ) throw new Error(`prior manifest entries[${index}] filename mismatch`);
    for (const field of ["priorEvidenceManifestBytes", "receiptBytes", "evidenceBytes"]) {
      positiveDecimal(entry[field], `prior manifest entries[${index}].${field}`);
    }
    if (entry.artifactIdentityKind !== "file-sha256" && entry.artifactIdentityKind !== "tree-manifest-sha256") {
      throw new Error(`prior manifest entries[${index}].artifactIdentityKind is invalid`);
    }
    positiveDecimal(entry.artifactBytes, `prior manifest entries[${index}].artifactBytes`);
    for (const field of [
      "priorEvidenceManifestSha256",
      "receiptSha256",
      "evidenceSha256",
      "artifactSha256",
    ]) hex(entry[field], 64, `prior manifest entries[${index}].${field}`);
  }
  const actualDependencies = entries.map(({ category, coordinate }) => `${category}/${coordinate}`);
  const requiredDependencies = dependencies.map(({ category, coordinate }) => `${category}/${coordinate}`);
  if (JSON.stringify(actualDependencies) !== JSON.stringify(requiredDependencies)) {
    throw new Error(`prior-evidence manifest dependency mismatch for ${manifest.category}/${manifest.coordinate}`);
  }
  if (expected.entries !== undefined && !canonicalBytes(entries).equals(canonicalBytes(expected.entries))) {
    throw new Error(`prior-evidence manifest entry mismatch for ${expected.coordinate}`);
  }
  return manifest;
};

export const validateRequest = ({ requestBytes, expected }) => {
  if (!Buffer.isBuffer(requestBytes) || requestBytes.length === 0 || requestBytes.length > maximumReceiptBytes) {
    throw new Error(`certification request size is invalid for ${expected.coordinate}`);
  }
  const request = decodeCanonical(requestBytes, requestFields);
  if (
    request.protocol !== requestProtocol || request.packageVersion !== packageVersion
    || request.category !== expected.category || request.coordinate !== expected.coordinate
    || request.sourceSha !== expected.sourceSha || request.checkedOutSourceSha !== expected.sourceSha
    || request.candidateWorkflowRunId !== expected.candidateWorkflowRunId
    || request.candidateDescriptorDigest !== expected.candidateDescriptorDigest
    || request.certificationWorkflowRunId !== expected.certificationWorkflowRunId
    || request.certificationWorkflowRunAttempt !== "1"
    || request.certifierPath !== expected.certifierPath || request.certifierSha256 !== expected.certifierSha256
    || request.bunLockSha256 !== expected.bunLockSha256 || request.cleanWorktree !== true
    || request.priorEvidenceManifestPath !== expected.priorEvidenceManifestPath
    || request.priorEvidenceManifestSha256 !== expected.priorEvidenceManifestSha256
    || request.runnerOs !== expected.runnerOs || request.runnerArch !== expected.runnerArch
  ) throw new Error(`certification request binding mismatch for ${expected.coordinate}`);
  validateKnownCoordinate(request.category, request.coordinate);
  hex(request.sourceSha, 40, "sourceSha");
  hex(request.checkedOutSourceSha, 40, "checkedOutSourceSha");
  hex(request.candidateDescriptorDigest, 64, "candidateDescriptorDigest");
  positiveDecimal(request.candidateWorkflowRunId, "candidateWorkflowRunId");
  positiveDecimal(request.certificationWorkflowRunId, "certificationWorkflowRunId");
  positiveDecimal(request.certificationWorkflowRunAttempt, "certificationWorkflowRunAttempt");
  absolutePath(request.certifierPath, "certifierPath");
  hex(request.certifierSha256, 64, "certifierSha256");
  hex(request.bunLockSha256, 64, "bunLockSha256");
  hex(request.priorEvidenceManifestSha256, 64, "priorEvidenceManifestSha256");
  for (const field of [
    "candidateDirectory",
    "priorEvidenceDirectory",
    "priorEvidenceManifestPath",
    "receiptPath",
    "evidencePath",
  ]) absolutePath(request[field], field);
  if (!request.receiptPath.endsWith(".receipt.json") || !request.evidencePath.endsWith(".evidence.json")) {
    throw new Error("certification request output filenames are invalid");
  }
  return request;
};

export const validateEvidence = ({ evidenceBytes, expected, runner }) => {
  if (!Buffer.isBuffer(evidenceBytes) || evidenceBytes.length === 0 || evidenceBytes.length > maximumEvidenceBytes) {
    throw new Error(`certification evidence size is invalid for ${expected.coordinate}`);
  }
  const evidence = decodeCanonical(evidenceBytes, evidenceFields);
  if (
    evidence.protocol !== evidenceProtocol || evidence.packageVersion !== packageVersion
    || evidence.category !== expected.category || evidence.coordinate !== expected.coordinate
    || evidence.sourceSha !== expected.sourceSha || evidence.candidateDescriptorDigest !== expected.candidateDescriptorDigest
    || evidence.certifierPath !== expected.certifierPath || evidence.certifierSha256 !== expected.certifierSha256
    || evidence.bunLockSha256 !== expected.bunLockSha256
    || evidence.priorEvidenceManifestSha256 !== expected.priorEvidenceManifestSha256
    || evidence.requestSha256 !== expected.requestSha256
  ) throw new Error(`certification evidence binding mismatch for ${expected.coordinate}`);
  validateKnownCoordinate(evidence.category, evidence.coordinate);
  validateRunner(evidence.runner, "evidence.runner");
  if (runner !== undefined && (evidence.runner.os !== runner.os || evidence.runner.arch !== runner.arch)) {
    throw new Error(`certification evidence runner mismatch for ${expected.coordinate}`);
  }
  hex(evidence.priorEvidenceManifestSha256, 64, "evidence.priorEvidenceManifestSha256");
  if (evidence.category === "distribution") validateDistributionPayload(evidence.payload, evidence.coordinate);
  else if (evidence.category === "clean-host") {
    validateCleanHostPayload(evidence.payload, evidence.coordinate, expected.priorEvidenceEntries);
  } else validateCellPayload(evidence.payload, evidence.coordinate, expected.priorEvidenceEntries);
  return evidence;
};

export const validateReceipt = ({ receiptBytes, evidenceBytes, priorEvidenceManifestBytes, expected, runner }) => {
  if (!Buffer.isBuffer(receiptBytes) || receiptBytes.length === 0 || receiptBytes.length > maximumReceiptBytes) {
    throw new Error(`certification receipt size is invalid for ${expected.coordinate}`);
  }
  const receipt = decodeCanonical(receiptBytes, receiptFields);
  if (
    receipt.protocol !== receiptProtocol || receipt.packageVersion !== packageVersion
    || receipt.category !== expected.category || receipt.coordinate !== expected.coordinate
    || receipt.sourceSha !== expected.sourceSha || receipt.checkedOutSourceSha !== expected.sourceSha
    || receipt.candidateWorkflowRunId !== expected.candidateWorkflowRunId
    || receipt.candidateDescriptorDigest !== expected.candidateDescriptorDigest
    || receipt.certificationWorkflowRunId !== expected.certificationWorkflowRunId
    || receipt.certificationWorkflowRunAttempt !== "1"
    || receipt.certifierPath !== expected.certifierPath || receipt.certifierSha256 !== expected.certifierSha256
    || receipt.bunLockSha256 !== expected.bunLockSha256 || receipt.cleanWorktree !== true
    || receipt.priorEvidenceManifestSha256 !== expected.priorEvidenceManifestSha256
    || (expected.requestSha256 !== undefined && receipt.requestSha256 !== expected.requestSha256)
    || receipt.verdict !== "certified"
  ) throw new Error(`certification receipt binding mismatch for ${expected.coordinate}`);
  validateKnownCoordinate(receipt.category, receipt.coordinate);
  hex(receipt.sourceSha, 40, "sourceSha");
  hex(receipt.checkedOutSourceSha, 40, "checkedOutSourceSha");
  hex(receipt.candidateDescriptorDigest, 64, "candidateDescriptorDigest");
  positiveDecimal(receipt.candidateWorkflowRunId, "candidateWorkflowRunId");
  positiveDecimal(receipt.certificationWorkflowRunId, "certificationWorkflowRunId");
  positiveDecimal(receipt.certificationWorkflowRunAttempt, "certificationWorkflowRunAttempt");
  absolutePath(receipt.certifierPath, "certifierPath");
  hex(receipt.certifierSha256, 64, "certifierSha256");
  hex(receipt.bunLockSha256, 64, "bunLockSha256");
  hex(receipt.priorEvidenceManifestSha256, 64, "priorEvidenceManifestSha256");
  hex(receipt.requestSha256, 64, "requestSha256");
  positiveDecimal(receipt.evidenceBytes, "evidenceBytes");
  hex(receipt.evidenceSha256, 64, "evidenceSha256");
  if (String(evidenceBytes.length) !== receipt.evidenceBytes || sha256(evidenceBytes) !== receipt.evidenceSha256) {
    throw new Error(`certification evidence digest mismatch for ${receipt.coordinate}`);
  }
  if (
    !Buffer.isBuffer(priorEvidenceManifestBytes)
    || sha256(priorEvidenceManifestBytes) !== receipt.priorEvidenceManifestSha256
  ) throw new Error(`prior-evidence manifest digest mismatch for ${receipt.coordinate}`);
  const priorEvidenceManifest = validatePriorEvidenceManifest({
    manifestBytes: priorEvidenceManifestBytes,
    expected,
  });
  if (runner !== undefined && (receipt.runnerOs !== runner.os || receipt.runnerArch !== runner.arch)) {
    throw new Error(`certification runner mismatch for ${receipt.coordinate}`);
  }
  const target = targetFromCoordinate(receipt.category, receipt.coordinate);
  if (target === "macos-x64" && (receipt.runnerOs !== "macOS" || receipt.runnerArch !== "X64")) {
    throw new Error(`x64 coordinate ran on the wrong host: ${receipt.coordinate}`);
  }
  if (target === "macos-aarch64" && (receipt.runnerOs !== "macOS" || receipt.runnerArch !== "ARM64")) {
    throw new Error(`arm64 coordinate ran on the wrong host: ${receipt.coordinate}`);
  }
  const evidence = validateEvidence({
    evidenceBytes,
    expected: {
      ...expected,
      priorEvidenceEntries: priorEvidenceManifest.entries,
      requestSha256: receipt.requestSha256,
    },
    runner: { os: receipt.runnerOs, arch: receipt.runnerArch },
  });
  return Object.freeze({ ...receipt, evidence, priorEvidenceManifest });
};

export const collectEvidenceFiles = async (root) => {
  const result = new Map();
  const visit = async (directory, depth) => {
    if (depth > 4) throw new Error("certification evidence directory nesting exceeds four levels");
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path, depth + 1);
      else if (entry.isFile()) {
        if (result.has(entry.name)) throw new Error(`duplicate certification evidence filename ${entry.name}`);
        result.set(entry.name, path);
        if (result.size > 128) throw new Error("certification evidence file set exceeds 128 files");
      } else throw new Error(`non-regular certification evidence entry ${path}`);
    }
  };
  await visit(root, 0);
  return result;
};

export const validatedEvidenceRecord = ({
  receipt,
  receiptBytes,
  evidenceBytes,
  priorEvidenceManifestBytes,
}) => Object.freeze({
  category: receipt.category,
  coordinate: receipt.coordinate,
  receipt,
  priorEvidenceManifestSha256: sha256(priorEvidenceManifestBytes),
  receiptSha256: sha256(receiptBytes),
  evidenceSha256: sha256(evidenceBytes),
  ...evidenceArtifactIdentity(receipt.evidence),
});

export const validateCertificationEvidenceCrossLinks = (records) => {
  const byCoordinate = new Map(records.map((record) => [`${record.category}/${record.coordinate}`, record]));
  if (byCoordinate.size !== records.length) throw new Error("certification evidence set contains duplicate coordinates");
  for (const record of records) {
    const references = record.receipt.evidence.payload.priorEvidence ?? [];
    for (const reference of references) {
      const dependencyRecord = byCoordinate.get(`${reference.category}/${reference.coordinate}`);
      if (
        dependencyRecord === undefined
        || reference.priorEvidenceManifestSha256 !== dependencyRecord.priorEvidenceManifestSha256
        || reference.receiptSha256 !== dependencyRecord.receiptSha256
        || reference.evidenceSha256 !== dependencyRecord.evidenceSha256
        || reference.artifactIdentityKind !== dependencyRecord.artifactIdentityKind
        || reference.artifactBytes !== dependencyRecord.artifactBytes
        || reference.artifactSha256 !== dependencyRecord.artifactSha256
      ) throw new Error(`prior-evidence cross-link mismatch for ${record.category}/${record.coordinate}`);
    }
  }
  return records;
};

export const assembleBundle = async ({ root, expected }) => {
  const files = await collectEvidenceFiles(root);
  const records = [];
  const validationRecords = [];
  const bodies = [];
  const expectedFiles = [];
  for (const entry of expected) {
    const slug = coordinateSlug(entry.category, entry.coordinate);
    const priorEvidenceManifestName = `${slug}.prior-evidence.json`;
    const receiptName = `${slug}.receipt.json`;
    const evidenceName = `${slug}.evidence.json`;
    expectedFiles.push(priorEvidenceManifestName, receiptName, evidenceName);
    const priorEvidenceManifestPath = files.get(priorEvidenceManifestName);
    const receiptPath = files.get(receiptName);
    const evidencePath = files.get(evidenceName);
    if (priorEvidenceManifestPath === undefined || receiptPath === undefined || evidencePath === undefined) {
      throw new Error(`missing certification evidence for ${entry.coordinate}`);
    }
    const [priorEvidenceManifestBytes, receiptBytes, evidenceBytes] = await Promise.all([
      readBoundedRegularFile({
        path: priorEvidenceManifestPath,
        maximumBytes: maximumPriorEvidenceManifestBytes,
        subject: `${entry.coordinate} prior-evidence manifest`,
      }),
      readBoundedRegularFile({ path: receiptPath, maximumBytes: maximumReceiptBytes, subject: `${entry.coordinate} receipt` }),
      readBoundedRegularFile({ path: evidencePath, maximumBytes: maximumEvidenceBytes, subject: `${entry.coordinate} evidence` }),
    ]);
    const receipt = validateReceipt({
      receiptBytes,
      evidenceBytes,
      priorEvidenceManifestBytes,
      expected: { ...entry, priorEvidenceManifestSha256: sha256(priorEvidenceManifestBytes) },
    });
    const validationRecord = validatedEvidenceRecord({
      receipt,
      receiptBytes,
      evidenceBytes,
      priorEvidenceManifestBytes,
    });
    validationRecords.push(validationRecord);
    records.push({
      packageVersion: receipt.packageVersion,
      category: entry.category,
      coordinate: entry.coordinate,
      certifierPath: receipt.certifierPath,
      certifierSha256: receipt.certifierSha256,
      bunLockSha256: receipt.bunLockSha256,
      cleanWorktree: receipt.cleanWorktree,
      priorEvidenceManifestName,
      priorEvidenceManifestBytes: String(priorEvidenceManifestBytes.length),
      priorEvidenceManifestSha256: validationRecord.priorEvidenceManifestSha256,
      requestSha256: receipt.requestSha256,
      receiptName,
      receiptBytes: String(receiptBytes.length),
      receiptSha256: sha256(receiptBytes),
      evidenceName,
      evidenceBytes: receipt.evidenceBytes,
      evidenceSha256: receipt.evidenceSha256,
      artifactIdentityKind: validationRecord.artifactIdentityKind,
      artifactBytes: validationRecord.artifactBytes,
      artifactSha256: validationRecord.artifactSha256,
    });
    bodies.push(priorEvidenceManifestBytes, receiptBytes, evidenceBytes);
  }
  const actual = [...files.keys()].sort();
  const wanted = expectedFiles.sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) throw new Error(`certification evidence file set mismatch: ${actual.join(",")}`);
  validateCertificationEvidenceCrossLinks(validationRecords);
  const header = canonicalBytes({ protocol: bundleProtocol, records });
  if (header.length + bodies.reduce((total, body) => total + body.length, 0) > maximumBundleBytes) {
    throw new Error("Apple certification bundle exceeds the bounded aggregate size");
  }
  return Buffer.concat([header, ...bodies]);
};

export const receiptBasename = (path) => basename(path);
