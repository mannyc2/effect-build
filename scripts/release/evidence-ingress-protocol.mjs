import { Buffer } from "node:buffer";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildContract,
  readInputs,
  renderJson,
  validateContract,
} from "../effect-build-contract/model.mjs";
import { canonicalJson, sha256Digest } from "./protocol.mjs";
import { validateSigstoreBundleTransport } from "./sigstore-dsse-verifier.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contractPath = resolve(repositoryRoot, "tooling/effect-build-contract.json");

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, fields, label) => {
  if (
    !isRecord(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())
  ) throw new Error(`${label} has missing or additional fields`);
  return value;
};

const canonicalTimestamp = (value, label) => {
  if (typeof value !== "string") throw new Error(`${label} is not a canonical timestamp`);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new Error(`${label} is not a canonical timestamp`);
  }
  return milliseconds;
};

const canonicalBase64 = (value, maximumCharacters) => {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maximumCharacters
    || value.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)
  ) throw new Error("external evidence ingress bundle is not bounded canonical base64");
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) {
    throw new Error("external evidence ingress bundle is not canonical base64");
  }
  return bytes;
};

export const prepareEvidenceIngress = ({
  contract,
  sourceSha,
  role,
  referenceJson,
  bundleBase64,
}) => {
  const release = contract?.releaseCertification;
  const readiness = release?.readiness;
  const ingress = readiness?.externalEvidenceIngress;
  if (
    contract?.schema !== "effect-build/combined-contract@1"
    || !isRecord(ingress)
    || ingress.authority
      !== "transport-only-sigstore-producer-identity-remains-the-sole-evidence-authority"
    || ingress.readinessInput
      !== "exact-authenticated-ingress-artifact-reference-downloaded-and-byte-validated"
  ) throw new Error("combined contract has no exact external evidence ingress");
  if (!/^[0-9a-f]{40}$/u.test(sourceSha) || !ingress.roles.includes(role)) {
    throw new Error("external evidence ingress source or role is not exact");
  }
  const dispatch = ingress.dispatch;
  if (
    typeof referenceJson !== "string"
    || typeof bundleBase64 !== "string"
    || referenceJson.length === 0
    || referenceJson.length > dispatch.maximumReferenceCharacters
    || referenceJson.length + bundleBase64.length + sourceSha.length + role.length + 1_024
      >= dispatch.maximumTotalPayloadCharacters
  ) throw new Error("external evidence ingress exceeds the workflow dispatch payload budget");
  let reference;
  try {
    reference = JSON.parse(referenceJson);
  } catch {
    throw new Error("external evidence ingress reference is not JSON");
  }
  if (referenceJson !== canonicalJson(reference).trimEnd()) {
    throw new Error("external evidence ingress reference is not canonical compact JSON");
  }
  const definition = readiness.evidenceRoles.find((entry) => entry.role === role);
  const value = exactKeys(reference, readiness.referenceShapes.externalObservation, "external evidence reference");
  if (
    definition?.type !== "externalObservation"
    || value.role !== role
    || value.type !== definition.type
    || value.protocol !== definition.protocol
    || value.sourceSha !== sourceSha
    || value.terminal !== definition.terminal
    || typeof value.identity !== "string"
    || value.identity.length === 0
    || !/^[1-9][0-9]*$/u.test(value.bytes)
    || !new RegExp(release.githubArtifactDigest.canonicalPattern, "u").test(value.digest)
  ) throw new Error("external evidence ingress reference identity changed");
  const observedAt = canonicalTimestamp(value.observedAt, "external evidence reference observedAt");
  const expiresAt = canonicalTimestamp(value.expiresAt, "external evidence reference expiresAt");
  if (expiresAt <= observedAt || expiresAt - observedAt > definition.maximumValiditySeconds * 1_000) {
    throw new Error("external evidence ingress reference validity changed");
  }
  const bundleBytes = canonicalBase64(bundleBase64, dispatch.maximumEncodedBundleCharacters);
  if (
    bundleBytes.byteLength > dispatch.maximumBundleBytes
    || `${bundleBytes.byteLength}` !== value.bytes
    || sha256Digest(bundleBytes) !== value.digest
  ) throw new Error("external evidence ingress byte identity changed");
  validateSigstoreBundleTransport({ contract, bundleBytes });
  return {
    artifactName: ingress.artifact.nameTemplate
      .replace("<role>", role)
      .replace("<sourceSha>", sourceSha),
    bundleBytes,
    evidenceObservedAt: value.observedAt,
    reference: value,
    referenceBytes: Buffer.from(canonicalJson(value)),
  };
};

const loadContract = async () => {
  const source = readFileSync(contractPath, "utf8");
  const inputs = await readInputs(repositoryRoot);
  const generated = validateContract(buildContract(inputs), inputs);
  if (source !== renderJson(generated)) throw new Error("external evidence ingress contract is not exact generated bytes");
  return generated;
};

const main = async () => {
  const contract = await loadContract();
  const ingress = contract.releaseCertification.readiness.externalEvidenceIngress;
  const output = resolve(process.env.OUTPUT_DIRECTORY ?? "");
  if (output === repositoryRoot || readdirSync(output).length !== 0) {
    throw new Error("external evidence ingress output directory is not exact and empty");
  }
  const result = prepareEvidenceIngress({
    contract,
    sourceSha: process.env.SOURCE_SHA,
    role: process.env.EVIDENCE_ROLE,
    referenceJson: process.env.EVIDENCE_REFERENCE_JSON,
    bundleBase64: process.env.SIGSTORE_BUNDLE_BASE64,
  });
  writeFileSync(resolve(output, ingress.artifact.orderedFiles[0]), result.referenceBytes, { mode: 0o600 });
  writeFileSync(resolve(output, ingress.artifact.orderedFiles[1]), result.bundleBytes, { mode: 0o600 });
  if (typeof process.env.GITHUB_OUTPUT === "string") {
    writeFileSync(process.env.GITHUB_OUTPUT, [
      `artifact-name=${result.artifactName}`,
      `evidence-observed-at=${result.evidenceObservedAt}`,
      `retention-days=${ingress.artifact.retentionDays}`,
      `workflow=${ingress.workflow}`,
      `workflow-path=${ingress.workflowPath}`,
      "",
    ].join("\n"), { flag: "a" });
  }
};

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write("external evidence ingress failed closed\n");
    process.exitCode = 1;
  });
}
