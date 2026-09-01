import { Buffer } from "node:buffer";
import { readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { canonicalJson, sha256Digest } from "./protocol.mjs";
import {
  assertReadinessArtifactAllowed,
  validateExternalReceiptForProducer,
} from "./readiness-protocol.mjs";
import { signCanonicalSigstoreDsse } from "./sigstore-dsse-signer.mjs";
import {
  validateProducerIdentityPolicy,
  validateSigstoreBundleTransport,
} from "./sigstore-dsse-verifier.mjs";

const producerWorkflowPaths = Object.freeze({
  "npm-authority": ".github/workflows/npm-authority.yml",
  "github-release-governance": ".github/workflows/github-release-governance.yml",
});

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const exactKeys = (value, expected, label) => {
  if (
    !isRecord(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())
  ) throw new Error(`${label} has missing or additional fields`);
  return value;
};

const fullSha = (value, label) => {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/u.test(value)) {
    throw new Error(`${label} is not one full lowercase source SHA`);
  }
  return value;
};

const canonicalTimestamp = (value, label) => {
  if (typeof value !== "string") throw new Error(`${label} is not a timestamp`);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new Error(`${label} is not one canonical UTC timestamp`);
  }
  return milliseconds;
};

const canonicalBytes = (value, label) => {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) throw new Error(`${label} is empty`);
  let text;
  let decoded;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(value);
    decoded = JSON.parse(text);
  } catch {
    throw new Error(`${label} is not UTF-8 JSON`);
  }
  if (text !== canonicalJson(decoded)) throw new Error(`${label} is not canonical JSON`);
  return Buffer.from(value);
};

const producerRolePolicy = (contract, role) => {
  assertReadinessArtifactAllowed(contract);
  const release = contract.releaseCertification;
  const readiness = release.readiness;
  const authentication = readiness.externalEvidenceAuthentication;
  const verifier = authentication.verifier;
  const definition = readiness.evidenceRoles.find((entry) => entry.role === role);
  const receiptPolicy = Object.values(readiness.externalReceipts).find((entry) => entry.role === role);
  const identityMatches = authentication.producerIdentities.filter((entry) => entry?.role === role);
  const workflowPath = producerWorkflowPaths[role];
  if (
    typeof workflowPath !== "string"
    || !isRecord(definition)
    || definition.type !== "externalObservation"
    || !isRecord(receiptPolicy)
    || identityMatches.length !== 1
  ) throw new Error(`external evidence producer role is not one supported same-repository role: ${role}`);
  const identity = validateProducerIdentityPolicy({ authentication, identity: identityMatches[0], role, verifier });
  const expectedWorkflow = `${release.githubAuthority.repository}/${workflowPath}@refs/heads/${release.githubAuthority.branchPolicy.name}`;
  if (
    identity.repository !== release.githubAuthority.repository
    || identity.workflow !== expectedWorkflow
    || identity.ref !== `refs/heads/${release.githubAuthority.branchPolicy.name}`
    || canonicalJson(identity.sourceBinding) !== canonicalJson({ kind: authentication.sourceBinding.releaseSourceKind })
  ) throw new Error(`external evidence producer identity is not the future-pinned ${role} workflow`);
  return { authentication, definition, identity, receiptPolicy, verifier, workflowPath };
};

export const assertExternalEvidenceProducerEnabled = ({ contract, role, sourceSha }) => {
  fullSha(sourceSha, "external evidence release source SHA");
  const policy = producerRolePolicy(contract, role);
  return Object.freeze({ ...policy, producerSourceSha: sourceSha, releaseSourceSha: sourceSha });
};

export const buildCanonicalExternalEvidencePayload = ({
  contract,
  definition,
  identity,
  producerSourceSha,
  receiptBytes,
  releaseSourceSha,
  observedAt,
  expiresAt,
}) => {
  const verifier = contract.releaseCertification.readiness.externalEvidenceAuthentication.verifier;
  const receipt = canonicalBytes(receiptBytes, `${definition.role} receipt`);
  fullSha(producerSourceSha, "external evidence producer source SHA");
  fullSha(releaseSourceSha, "external evidence release source SHA");
  const observed = canonicalTimestamp(observedAt, "external evidence observedAt");
  const expires = canonicalTimestamp(expiresAt, "external evidence expiresAt");
  if (
    producerSourceSha !== releaseSourceSha
    || expires <= observed
    || expires - observed > definition.maximumValiditySeconds * 1_000
    || receipt.byteLength > verifier.maximumReceiptBytes
  ) throw new Error("external evidence source, validity, or receipt bound changed");
  validateExternalReceiptForProducer({
    contract,
    observedAt,
    producerSourceSha,
    receiptBytes: receipt,
    role: definition.role,
    sourceSha: releaseSourceSha,
  });
  const payload = {
    schema: verifier.payloadProtocol,
    role: definition.role,
    producerWorkflow: identity.workflow,
    producerSourceSha,
    releaseSourceSha,
    receiptProtocol: definition.protocol,
    receiptBytes: `${receipt.byteLength}`,
    receiptDigest: sha256Digest(receipt),
    observedAt,
    expiresAt,
    receiptBase64: receipt.toString("base64"),
  };
  exactKeys(payload, verifier.payloadFields, "external evidence signed payload");
  return Object.freeze({ payload, payloadBytes: Buffer.from(canonicalJson(payload)), receiptBytes: receipt });
};

export const buildCanonicalExternalObservationReference = ({
  contract,
  definition,
  identity,
  receiptPolicy,
  sourceSha,
  observedAt,
  expiresAt,
  bundleBytes,
}) => {
  const readiness = contract.releaseCertification.readiness;
  const bundle = canonicalBytes(bundleBytes, `${definition.role} Sigstore bundle`);
  validateSigstoreBundleTransport({ contract, bundleBytes: bundle });
  const reference = {
    role: definition.role,
    type: definition.type,
    protocol: definition.protocol,
    identity: receiptPolicy.identity,
    sourceSha,
    terminal: definition.terminal,
    observedAt,
    expiresAt,
    bytes: `${bundle.byteLength}`,
    digest: sha256Digest(bundle),
  };
  exactKeys(reference, readiness.referenceShapes.externalObservation, "external observation reference");
  if (
    identity.role !== definition.role
    || reference.sourceSha !== sourceSha
    || reference.identity !== receiptPolicy.identity
  ) throw new Error("external observation signer, source, or receipt identity changed");
  return Object.freeze({ bundleBytes: bundle, reference, referenceBytes: Buffer.from(canonicalJson(reference)) });
};

export const produceSignedExternalEvidence = async ({
  contract,
  role,
  sourceSha,
  receiptBytes,
  observedAt,
  environment = process.env,
}) => {
  const policy = assertExternalEvidenceProducerEnabled({ contract, role, sourceSha });
  const observed = canonicalTimestamp(observedAt, "external evidence producer observedAt");
  const expiresAt = new Date(observed + policy.definition.maximumValiditySeconds * 1_000).toISOString();
  const payload = buildCanonicalExternalEvidencePayload({
    contract,
    definition: policy.definition,
    expiresAt,
    identity: policy.identity,
    observedAt,
    producerSourceSha: policy.producerSourceSha,
    receiptBytes,
    releaseSourceSha: policy.releaseSourceSha,
  });
  const bundleBytes = await signCanonicalSigstoreDsse({
    contract,
    environment,
    identity: policy.identity,
    payloadBytes: payload.payloadBytes,
    sourceSha,
  });
  return Object.freeze({
    ...payload,
    ...buildCanonicalExternalObservationReference({
      bundleBytes,
      contract,
      definition: policy.definition,
      expiresAt,
      identity: policy.identity,
      observedAt,
      receiptPolicy: policy.receiptPolicy,
      sourceSha,
    }),
    expiresAt,
    identity: policy.identity,
  });
};

export const writeExternalEvidenceProducerOutput = ({ contract, role, sourceSha, outputDirectory, result }) => {
  const ingress = contract.releaseCertification.readiness.externalEvidenceIngress;
  const output = resolve(outputDirectory);
  if (output === resolve("/") || readdirSync(output).length !== 0) {
    throw new Error("external evidence producer output directory must be a non-root empty directory");
  }
  const [referenceFile, bundleFile] = ingress.artifact.orderedFiles;
  writeFileSync(resolve(output, referenceFile), result.referenceBytes, { flag: "wx", mode: 0o600 });
  writeFileSync(resolve(output, bundleFile), result.bundleBytes, { flag: "wx", mode: 0o600 });
  return Object.freeze({
    artifactName: `effect-build-v0.6.0-external-evidence-producer-${role}-${sourceSha}`,
    bundleFile,
    referenceFile,
  });
};
