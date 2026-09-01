import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { extractStrictPackageManifest } from "./tar-protocol.mjs";

// This module is repository code for unprotected preparation and verification
// only. Protected release jobs must independently validate adopted bytes from
// their inline, workflow-reviewed bodies and must never import this module.

const isRecord = (value) =>
  value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const canonicalize = (value, path, ancestors) => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} contains a non-finite number`);
    return value;
  }
  if (typeof value !== "object") throw new Error(`${path} is not canonical JSON data`);
  if (ancestors.has(value)) throw new Error(`${path} contains a cycle`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry, index) => canonicalize(entry, `${path}[${index}]`, ancestors));
    }
    if (!isRecord(value)) throw new Error(`${path} is not a plain JSON object`);
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key], `${path}.${key}`, ancestors)]),
    );
  } finally {
    ancestors.delete(value);
  }
};

export const canonicalJson = (value) => JSON.stringify(canonicalize(value, "$", new Set()), null, 2) + "\n";

const bytes = (value, label) => {
  if (typeof value === "string") return Buffer.from(value);
  if (value instanceof Uint8Array) return value;
  throw new Error(`${label} must be text or bytes`);
};

export const sha256Digest = (value) =>
  `sha256:${createHash("sha256").update(bytes(value, "SHA-256 input")).digest("hex")}`;

export const normalizeUploadArtifactDigest = (value, policy) => {
  if (
    !isRecord(policy)
    || policy.canonicalAlgorithm !== "sha256"
    || !isRecord(policy.uploadActionBoundary)
    || policy.uploadActionBoundary.normalization !== "prefix-sha256-exactly-once"
  ) {
    throw new Error("GitHub artifact digest policy is invalid");
  }
  if (typeof value !== "string" || !new RegExp(policy.uploadActionBoundary.acceptedPattern, "u").test(value)) {
    throw new Error("upload-artifact returned a non-canonical bare SHA-256 digest");
  }
  const canonical = `${policy.canonicalAlgorithm}:${value}`;
  if (!new RegExp(policy.canonicalPattern, "u").test(canonical)) {
    throw new Error("upload-artifact digest normalization did not produce the canonical form");
  }
  return canonical;
};

const exactKeys = (value, expected, label) => {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  const observed = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (JSON.stringify(observed) !== JSON.stringify(canonical)) {
    throw new Error(`${label} has missing or additional fields`);
  }
  return value;
};

const nonEmptyText = (value, label) => {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be non-empty text`);
  return value;
};

const releasePolicy = (contract) => {
  if (!isRecord(contract) || contract.schema !== "effect-build/combined-contract@1") {
    throw new Error("candidate protocol requires the canonical combined contract");
  }
  const policy = contract.releaseCertification;
  if (!isRecord(policy)) throw new Error("combined contract has no releaseCertification policy");
  return policy;
};

export const derivePublicPackageNames = (contract) => {
  const policy = releasePolicy(contract);
  const projection = contract.publicApiProjection;
  const registry = contract.npmRegistryBoundary;
  if (!isRecord(projection) || !isRecord(projection.packages) || !isRecord(registry)) {
    throw new Error("combined contract has no canonical public or registry projection");
  }
  const names = Object.keys(projection.packages).sort();
  const admitted = [...(registry.publicationAdmission?.packages ?? [])].sort();
  if (
    policy.publicAdmission?.packageSource !== "publicApiProjection.packages"
    || policy.publicAdmission?.packageCount !== names.length
    || JSON.stringify(names) !== JSON.stringify(admitted)
  ) {
    throw new Error("release package admission is not the public contract projection");
  }
  return names;
};

export const derivePublicModules = (contract) => {
  const policy = releasePolicy(contract);
  const packages = contract.publicApiProjection?.packages;
  if (!isRecord(packages)) throw new Error("combined contract has no public package projection");
  const modules = Object.entries(packages)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([name, entry]) => {
      if (!isRecord(entry) || !isRecord(entry.subpaths)) {
        throw new Error(`public projection is invalid for ${name}`);
      }
      const subpaths = Object.keys(entry.subpaths).sort().map((subpath) => {
        if (!/^\.\/[A-Za-z0-9][A-Za-z0-9/-]*$/u.test(subpath)) {
          throw new Error(`public projection has a non-canonical subpath for ${name}: ${subpath}`);
        }
        return `${name}/${subpath.slice(2)}`;
      });
      return [name, ...subpaths];
    });
  if (
    policy.publicAdmission?.moduleSource !== "publicApiProjection.packages package roots and subpaths"
    || policy.publicAdmission?.moduleCount !== modules.length
    || new Set(modules).size !== modules.length
  ) {
    throw new Error("release module admission is not the exact public contract projection");
  }
  return modules;
};

const canonicalPositiveDecimal = (value) => typeof value === "string" && /^[1-9][0-9]*$/u.test(value);

export const artifactCoordinate = (releaseCertification, input, expectedWorkflow) => {
  const policy = releaseCertification?.githubArtifactCoordinate;
  const digestPolicy = releaseCertification?.githubArtifactDigest;
  if (
    !isRecord(policy)
    || !Array.isArray(policy.orderedFields)
    || !isRecord(policy.fieldFormats)
    || !isRecord(digestPolicy)
  ) {
    throw new Error("artifact coordinate policy is invalid");
  }
  const coordinate = exactKeys(input, policy.orderedFields, "GitHub artifact coordinate");
  const workflow = nonEmptyText(coordinate.workflow, "artifact workflow");
  if (
    !/^[^/\s]+\/[^/\s]+\/\.github\/workflows\/[^@\s]+@refs\/heads\/[^\s]+$/u.test(workflow)
    || (expectedWorkflow !== undefined && workflow !== expectedWorkflow)
  ) {
    throw new Error("artifact workflow identity is not exact");
  }
  if (typeof coordinate.sourceSha !== "string" || !/^[0-9a-f]{40}$/u.test(coordinate.sourceSha)) {
    throw new Error("artifact source SHA is not one full lowercase commit SHA");
  }
  for (const field of ["runId", "runAttempt", "artifactId"]) {
    if (!canonicalPositiveDecimal(coordinate[field])) throw new Error(`artifact ${field} is not a positive decimal`);
  }
  if (
    typeof coordinate.artifactDigest !== "string"
    || !new RegExp(digestPolicy.canonicalPattern, "u").test(coordinate.artifactDigest)
  ) {
    throw new Error("artifact digest is not canonical sha256:<64 lowercase hex>");
  }
  return Object.fromEntries(policy.orderedFields.map((field) => [field, coordinate[field]]));
};

const expectedRepository = (contract, name) => {
  const repository = nonEmptyText(
    contract.npmRegistryBoundary?.trustedPublisher?.repository,
    "trusted-publisher repository",
  );
  return {
    type: "git",
    url: `git+https://github.com/${repository}.git`,
    directory: `packages/${name}`,
  };
};

export const validateEmbeddedPackageManifest = (manifest, { contract, name, version }) => {
  if (!isRecord(manifest)) throw new Error(`${name} embedded package manifest must be an object`);
  if (manifest.name !== name || manifest.version !== version || manifest.private !== undefined) {
    throw new Error(`${name} embedded npm identity is not the admitted public slot`);
  }
  const publishConfig = exactKeys(manifest.publishConfig, ["access", "provenance"], `${name} publishConfig`);
  if (publishConfig.access !== "public" || publishConfig.provenance !== true) {
    throw new Error(`${name} publishConfig must equal exactly access=public and provenance=true`);
  }
  const repository = exactKeys(manifest.repository, ["type", "url", "directory"], `${name} repository`);
  if (canonicalJson(repository) !== canonicalJson(expectedRepository(contract, name))) {
    throw new Error(`${name} repository identity does not match the trusted-publisher repository`);
  }
  return manifest;
};

export const extractEmbeddedPackageManifest = (tarballPath, policy) => {
  const manifestBytes = extractStrictPackageManifest({
    tarballBytes: readFileSync(tarballPath),
    policy,
    label: "packed tarball",
  });
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes);
  } catch {
    throw new Error("packed package manifest is not valid UTF-8");
  }
  try {
    return { bytes: manifestBytes, manifest: JSON.parse(text) };
  } catch {
    throw new Error("packed package manifest is not valid JSON");
  }
};

export const sha512Integrity = (value) =>
  `sha512-${createHash("sha512").update(bytes(value, "SHA-512 input")).digest("base64")}`;

const semanticContractMatchesBytes = (contract, contractBytes) => {
  let decoded;
  try {
    decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes(contractBytes, "contract")));
  } catch {
    throw new Error("candidate contract bytes are not canonical JSON input");
  }
  if (canonicalJson(decoded) !== canonicalJson(contract)) {
    throw new Error("candidate contract bytes do not encode the supplied combined contract");
  }
};

export const validateReleaseCandidate = ({
  candidate,
  contract,
  contractBytes,
  expectedSourceSha,
  files,
  packageBytes,
  packageManifests,
}) => {
  const policy = releasePolicy(contract);
  const names = derivePublicPackageNames(contract);
  const modules = derivePublicModules(contract);
  semanticContractMatchesBytes(contract, contractBytes);
  const value = exactKeys(
    candidate,
    ["schema", "sourceSha", "version", "contract", "toolchain", "publicModules", "packages"],
    "release candidate",
  );
  if (value.schema !== policy.candidate?.protocol) throw new Error("release candidate protocol changed");
  if (
    typeof value.sourceSha !== "string"
    || !/^[0-9a-f]{40}$/u.test(value.sourceSha)
    || value.sourceSha !== expectedSourceSha
  ) {
    throw new Error("release candidate source SHA changed");
  }
  if (value.version !== contract.npmRegistryBoundary?.publicationAdmission?.target?.version) {
    throw new Error("release candidate target version changed");
  }
  const candidateContract = exactKeys(value.contract, ["schema", "digest"], "release candidate contract");
  if (
    candidateContract.schema !== contract.schema
    || candidateContract.digest !== sha256Digest(contractBytes)
    || !new RegExp(policy.githubArtifactDigest?.canonicalPattern, "u").test(candidateContract.digest)
  ) {
    throw new Error("release candidate contract identity changed");
  }
  const toolchain = exactKeys(value.toolchain, ["bun", "node", "npm"], "release candidate toolchain");
  const bun = contract.exactToolEvidenceRegister?.tools?.find((entry) => entry.name === "bun");
  const expectedTools = {
    bun: { name: "bun", version: bun?.version },
    node: { name: "node", version: policy.npmOidcCertification?.client?.node },
    npm: { name: "npm", version: policy.npmOidcCertification?.client?.npm },
  };
  if (canonicalJson(toolchain) !== canonicalJson(expectedTools)) {
    throw new Error("release candidate toolchain identity changed");
  }
  if (JSON.stringify(value.publicModules) !== JSON.stringify(modules)) {
    throw new Error("release candidate public module order or membership changed");
  }
  if (!Array.isArray(value.packages) || value.packages.length !== names.length) {
    throw new Error("release candidate package ledger length changed");
  }
  const observedNames = value.packages.map((entry) => isRecord(entry) ? entry.name : undefined);
  if (JSON.stringify(observedNames) !== JSON.stringify(names)) {
    throw new Error("release candidate package ledger order or membership changed");
  }
  if (!(packageBytes instanceof Map) || !(packageManifests instanceof Map)) {
    throw new Error("release candidate validation requires exact tarball and embedded-manifest bytes");
  }
  for (const entry of value.packages) {
    exactKeys(entry, ["name", "file", "bytes", "sha256", "integrity", "manifestDigest"], `${entry.name} ledger`);
    const expectedFile = `${entry.name}-${value.version}.tgz`;
    const tarball = packageBytes.get(entry.name);
    const embedded = packageManifests.get(entry.name);
    if (
      entry.file !== expectedFile
      || basename(entry.file) !== entry.file
      || !(tarball instanceof Uint8Array)
      || !isRecord(embedded)
      || !(embedded.bytes instanceof Uint8Array)
    ) {
      throw new Error(`release candidate has no exact observed bytes for ${entry.name}`);
    }
    validateEmbeddedPackageManifest(embedded.manifest, {
      contract,
      name: entry.name,
      version: value.version,
    });
    if (
      entry.bytes !== tarball.byteLength
      || !Number.isInteger(entry.bytes)
      || entry.bytes <= 0
      || entry.sha256 !== sha256Digest(tarball)
      || entry.integrity !== sha512Integrity(tarball)
      || entry.manifestDigest !== sha256Digest(embedded.bytes)
    ) {
      throw new Error(`release candidate byte ledger changed for ${entry.name}`);
    }
  }
  const expectedFiles = [policy.candidate.manifest, ...value.packages.map((entry) => entry.file)].sort();
  if (
    !Array.isArray(files)
    || files.some((entry) => typeof entry !== "string")
    || JSON.stringify([...files].sort()) !== JSON.stringify(expectedFiles)
  ) {
    throw new Error("release candidate directory contains missing or additional files");
  }
  return value;
};
