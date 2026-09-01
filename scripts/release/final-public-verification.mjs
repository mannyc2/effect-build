#!/usr/bin/env node

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { buildContract, readInputs, renderJson, validateContract } from "../effect-build-contract/model.mjs";
import {
  artifactCoordinate,
  canonicalJson,
  derivePublicModules,
  derivePublicPackageNames,
  sha256Digest,
  sha512Integrity,
  validateReleaseCandidate,
} from "./protocol.mjs";
import { validateReadinessAggregateWithEvidence } from "./readiness-protocol.mjs";
import {
  validateProducerIdentityPolicy,
  validateVerifiedSignerIdentity,
  verifySigstoreBundleIsolated,
} from "./sigstore-dsse-verifier.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contractPath = resolve(repositoryRoot, "tooling/effect-build-contract.json");
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const exactKeys = (value, expected, label) => {
  if (!isRecord(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${label} has missing or additional fields`);
  }
  return value;
};

const bytes = (value, label) => {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) throw new Error(`${label} is empty`);
  return Buffer.from(value);
};

const fullSha = (value, label) => {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/u.test(value)) {
    throw new Error(`${label} is not one full lowercase SHA`);
  }
  return value;
};

const positiveDecimal = (value, label) => {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/u.test(value)) {
    throw new Error(`${label} is not one canonical positive decimal`);
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

const decodeCanonicalJson = (value, label) => {
  const input = bytes(value, label);
  let decoded;
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(input);
    decoded = JSON.parse(text);
  } catch {
    throw new Error(`${label} is not UTF-8 JSON`);
  }
  if (text !== canonicalJson(decoded)) throw new Error(`${label} is not canonical JSON`);
  return decoded;
};

const finalPublicPolicy = (contract) => {
  const release = contract?.releaseCertification;
  const policy = release?.finalPublicVerification;
  const implementation = policy?.implementation;
  if (
    contract?.schema !== "effect-build/combined-contract@1"
    || !isRecord(release)
    || !isRecord(policy)
    || !isRecord(implementation)
    || policy.protocol !== "effect-build/final-public-verification@1"
    || policy.upstreamGateSource !== "releaseCertification.readiness.externalEvidenceAuthentication"
    || policy.workflow !== `${policy.repository}/${policy.workflowPath}@refs/heads/main`
    || policy.packageCount !== release.publicAdmission?.packageCount
    || policy.moduleCount !== release.publicAdmission?.moduleCount
    || policy.releaseAssetCount !== policy.packageCount + 1
    || implementation.status !== "implemented-inert-behind-upstream-gate"
    || implementation.module !== "scripts/release/final-public-verification.mjs"
    || implementation.contractAuthentication !== "exact-generated-bytes"
  ) throw new Error("combined contract has no exact final-public verification implementation");
  return { implementation, policy, release };
};

export const assertFinalPublicVerificationAllowed = (contract) => {
  const { policy, release } = finalPublicPolicy(contract);
  const authentication = exactKeys(
    release.readiness?.externalEvidenceAuthentication,
    [
      "status",
      "artifactDisposition",
      "blocker",
      "requiredEnvelope",
      "requiredBindings",
      "verifier",
      "producerIdentityFields",
      "sourceBinding",
      "producerIdentities",
    ],
    "release readiness external evidence authentication",
  );
  if (
    policy.status === "blocked"
    && policy.blocker === "authenticated-release-readiness-aggregate-cannot-yet-exist"
    && policy.artifactDisposition === "forbidden-while-upstream-blocked"
    && authentication.status === "blocked"
    && authentication.artifactDisposition === "forbidden-while-blocked"
    && authentication.requiredEnvelope === "sigstore-bundle-v0.3-dsse"
    && authentication.verifier?.status === "implemented"
    && authentication.verifier?.module === "scripts/release/sigstore-dsse-verifier.mjs"
    && Array.isArray(authentication.producerIdentityFields)
    && Array.isArray(authentication.producerIdentities)
    && authentication.producerIdentities.length === 0
  ) throw new Error(`final public verification artifact forbidden: ${policy.blocker}`);
  const externalRoles = release.readiness.evidenceRoles
    .filter(({ type }) => type === "externalObservation")
    .map(({ role }) => role);
  if (
    policy.status === "ready"
    && policy.artifactDisposition === "allowed"
    && authentication.status === "supported"
    && authentication.artifactDisposition === "required-on-terminal-workflow-success"
    && authentication.verifier?.status === "implemented"
    && authentication.producerIdentities.length === externalRoles.length
    && externalRoles.every((role) =>
      authentication.producerIdentities.filter((identity) => identity?.role === role).length === 1)
  ) {
    for (const role of externalRoles) {
      validateProducerIdentityPolicy({
        authentication,
        identity: authentication.producerIdentities.find((entry) => entry.role === role),
        role,
        verifier: authentication.verifier,
      });
    }
    return;
  }
  throw new Error("final public verification artifact forbidden: authenticated policy is not exact");
};

export const parseFinalPublicDispatch = (contract, environment) => {
  assertFinalPublicVerificationAllowed(contract);
  const policy = contract.releaseCertification.finalPublicVerification;
  const sourceSha = environment[policy.dispatch.sourceInput.toUpperCase()];
  fullSha(sourceSha, "final public source SHA");
  const parse = (input) => {
    const source = environment[input.toUpperCase()];
    if (typeof source !== "string" || source.length === 0) throw new Error(`${input} is absent`);
    try {
      return JSON.parse(source);
    } catch {
      throw new Error(`${input} is not JSON`);
    }
  };
  return {
    sourceSha,
    candidate: parse(policy.dispatch.candidateInput),
    readiness: parse(policy.dispatch.readinessInput),
    tag: parse(policy.dispatch.tagInput),
    release: parse(policy.dispatch.releaseInput),
  };
};

const temporalReference = (value, observedAt, validationAt, policy, label) => {
  const observed = canonicalTimestamp(value.observedAt, `${label}.observedAt`);
  const expires = canonicalTimestamp(value.expiresAt, `${label}.expiresAt`);
  if (
    observed > observedAt + policy.freshness.clockSkewSeconds * 1_000
    || observedAt - observed > policy.freshness.maximumObservationAgeSeconds * 1_000
    || expires <= validationAt
    || expires <= observed
  ) throw new Error(`${label} is future, stale, or expired`);
};

const validateCandidate = ({ contract, contractBytes, sourceSha, observedAt, validationAt, input }) => {
  const { policy, release } = finalPublicPolicy(contract);
  const reference = exactKeys(input.reference, policy.referenceShapes.candidate, "final candidate reference");
  const coordinate = artifactCoordinate(release, reference.coordinate, policy.candidate.workflow);
  const manifestBytes = bytes(input.manifestBytes, "final candidate manifest bytes");
  if (
    coordinate.sourceSha !== sourceSha
    || reference.protocol !== policy.candidate.protocol
    || reference.artifactName !== policy.candidate.artifactName.replace("<sourceSha>", sourceSha)
    || positiveDecimal(reference.bytes, "final candidate bytes") !== `${manifestBytes.byteLength}`
    || reference.manifestDigest !== sha256Digest(manifestBytes)
  ) throw new Error("final candidate coordinate or manifest identity changed");
  temporalReference(reference, observedAt, validationAt, policy, "final candidate");
  const manifest = decodeCanonicalJson(manifestBytes, "final candidate manifest");
  validateReleaseCandidate({
    candidate: manifest,
    contract,
    contractBytes,
    expectedSourceSha: sourceSha,
    files: input.files,
    packageBytes: input.packageBytes,
    packageManifests: input.packageManifests,
  });
  return { coordinate, manifest, manifestBytes, packageBytes: input.packageBytes, reference };
};

const validateReadiness = async ({
  contract,
  contractBytes,
  sourceSha,
  observedAt,
  validationTime,
  validationAt,
  input,
  readinessVerify,
  readinessArtifactExtractor,
}) => {
  const { policy, release } = finalPublicPolicy(contract);
  const reference = exactKeys(input.reference, policy.referenceShapes.readiness, "final readiness reference");
  const coordinate = artifactCoordinate(release, reference.coordinate, policy.readiness.workflow);
  const manifestBytes = bytes(input.manifestBytes, "final readiness manifest bytes");
  if (
    coordinate.sourceSha !== sourceSha
    || reference.protocol !== policy.readiness.protocol
    || reference.artifactName !== policy.readiness.artifactName
    || positiveDecimal(reference.bytes, "final readiness bytes") !== `${manifestBytes.byteLength}`
    || reference.manifestDigest !== sha256Digest(manifestBytes)
  ) throw new Error("final readiness coordinate or manifest identity changed");
  temporalReference(reference, observedAt, validationAt, policy, "final readiness");
  const result = await readinessVerify({
    contract,
    contractBytes,
    expectedSourceSha: sourceSha,
    validationTime,
    files: input.files,
    manifestBytes,
    bundleBytes: input.bundleBytes,
    trustedRootBytes: input.trustedRootBytes,
    artifactExtractor: readinessArtifactExtractor,
  });
  return { ...result, coordinate, reference };
};

const validateTagAndRelease = ({ contract, sourceSha, observedAt, validationAt, tag, release }) => {
  const { policy } = finalPublicPolicy(contract);
  const tagValue = exactKeys(tag, policy.referenceShapes.tag, "final tag reference");
  const releaseValue = exactKeys(release, policy.referenceShapes.release, "final Release reference");
  const releaseObservedAt = canonicalTimestamp(releaseValue.observedAt, "final Release observedAt");
  if (
    tagValue.repository !== policy.repository
    || tagValue.name !== policy.tag
    || tagValue.targetSha !== sourceSha
    || tagValue.objectType !== policy.tagPolicy.objectType
    || tagValue.form !== policy.tagPolicy.form
    || releaseValue.repository !== policy.repository
    || !/^[1-9][0-9]*$/u.test(releaseValue.releaseId)
    || releaseValue.tagName !== policy.tag
    || releaseValue.targetSha !== sourceSha
    || releaseValue.draft !== policy.releasePolicy.draft
    || releaseValue.prerelease !== policy.releasePolicy.prerelease
    || typeof releaseValue.immutable !== "boolean"
    || releaseObservedAt > observedAt + policy.freshness.clockSkewSeconds * 1_000
    || observedAt - releaseObservedAt > policy.freshness.maximumObservationAgeSeconds * 1_000
    || releaseObservedAt > validationAt + policy.freshness.clockSkewSeconds * 1_000
  ) throw new Error("final tag or public Release state changed");
  return { release: releaseValue, tag: tagValue };
};

const validatePublicBytes = ({ contract, candidate, npmPackages, npmPackageBytes, releaseAssets, releaseAssetBytes }) => {
  const { implementation, policy } = finalPublicPolicy(contract);
  const names = derivePublicPackageNames(contract);
  if (!(npmPackageBytes instanceof Map) || !(releaseAssetBytes instanceof Map)) {
    throw new Error("final public verification requires byte-keyed npm and Release maps");
  }
  if (!Array.isArray(npmPackages) || npmPackages.length !== names.length || npmPackageBytes.size !== names.length) {
    throw new Error("final npm package projection changed");
  }
  const normalizedNpm = npmPackages.map((observation, index) => {
    const name = names[index];
    const entry = candidate.manifest.packages[index];
    const value = exactKeys(observation, implementation.observationFields.npmPackage, `final npm ${name}`);
    const publishedBytes = bytes(npmPackageBytes.get(name), `final npm ${name} tarball`);
    const expectedUrl = `${policy.registry}/${name}/-/${entry.file}`;
    if (
      value.name !== name
      || value.version !== policy.version
      || value.latest !== policy.version
      || value.bytes !== publishedBytes.byteLength
      || value.sha256 !== sha256Digest(publishedBytes)
      || value.integrity !== sha512Integrity(publishedBytes)
      || value.tarballUrl !== expectedUrl
      || !publishedBytes.equals(bytes(candidate.packageBytes.get(name), `candidate ${name} tarball`))
      || entry.sha256 !== value.sha256
      || entry.integrity !== value.integrity
    ) throw new Error(`final npm bytes or latest tag changed for ${name}`);
    return value;
  });
  const expectedAssets = [
    ...candidate.manifest.packages.map(({ file }) => file),
    contract.releaseCertification.candidate.manifest,
  ];
  if (
    !Array.isArray(releaseAssets)
    || releaseAssets.length !== expectedAssets.length
    || releaseAssetBytes.size !== expectedAssets.length
  ) throw new Error("final Release asset projection changed");
  const normalizedAssets = releaseAssets.map((observation, index) => {
    const name = expectedAssets[index];
    const value = exactKeys(observation, implementation.observationFields.releaseAsset, `final asset ${name}`);
    const downloaded = bytes(releaseAssetBytes.get(name), `final asset ${name} bytes`);
    const packageName = candidate.manifest.packages.find((entry) => entry.file === name)?.name;
    const expected = name === contract.releaseCertification.candidate.manifest
      ? candidate.manifestBytes
      : candidate.packageBytes.get(packageName);
    if (
      value.name !== name
      || positiveDecimal(value.assetId, `final asset ${name} id`) !== value.assetId
      || value.bytes !== downloaded.byteLength
      || value.digest !== sha256Digest(downloaded)
      || value.apiUrl !== `https://api.github.com/repos/${policy.repository}/releases/assets/${value.assetId}`
      || value.browserDownloadUrl
        !== `https://github.com/${policy.repository}/releases/download/${policy.tag}/${encodeURIComponent(name)}`
      || !downloaded.equals(bytes(expected, `candidate asset ${name}`))
    ) throw new Error(`final Release asset bytes changed for ${name}`);
    return value;
  });
  return { npmPackages: normalizedNpm, releaseAssets: normalizedAssets };
};

const provenanceStatement = (bundle, label) => {
  const envelope = exactKeys(bundle.dsseEnvelope, ["payload", "payloadType", "signatures"], `${label} envelope`);
  try {
    return { envelope, statement: JSON.parse(Buffer.from(envelope.payload, "base64").toString("utf8")) };
  } catch {
    throw new Error(`${label} signed statement is not JSON`);
  }
};

const validateProvenance = async ({
  contract,
  sourceSha,
  candidate,
  provenance,
  provenanceBundles,
  trustedRootBytes,
  sigstoreVerify,
}) => {
  const { implementation, release } = finalPublicPolicy(contract);
  const names = derivePublicPackageNames(contract);
  if (
    !Array.isArray(provenance)
    || provenance.length !== names.length
    || !(provenanceBundles instanceof Map)
    || provenanceBundles.size !== names.length
  ) throw new Error("final provenance projection changed");
  const provenancePolicy = implementation.provenance;
  const verifier = release.readiness.externalEvidenceAuthentication.verifier;
  const identity = `https://github.com/${provenancePolicy.workflow}`;
  const identityPattern = `^${identity.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`;
  const normalized = [];
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    const observation = exactKeys(
      provenance[index],
      implementation.observationFields.provenance,
      `final provenance ${name}`,
    );
    const bundle = provenanceBundles.get(name);
    if (!isRecord(bundle)) throw new Error(`final provenance bundle missing for ${name}`);
    const bundleBytes = Buffer.from(canonicalJson(bundle));
    const expectedAttestationUrl = `${contract.npmRegistryBoundary.registry}`
      + `/-/npm/v1/attestations/${encodeURIComponent(name)}@${contract.npmRegistryBoundary.publicationAdmission.target.version}`;
    const signer = await sigstoreVerify(bundle, {
      certificateIdentityURI: identityPattern,
      certificateIssuer: verifier.certificateIssuer,
      ctLogThreshold: verifier.ctLogThreshold,
      tlogThreshold: verifier.tlogThreshold,
    }, {
      contract,
      trustedRootBytes,
    });
    validateVerifiedSignerIdentity({
      signer,
      verifier,
      identity: {
        certificateIdentityURI: identity,
        certificateIssuer: verifier.certificateIssuer,
        repository: provenancePolicy.repository,
      },
      producerSourceSha: sourceSha,
    });
    const { envelope, statement } = provenanceStatement(bundle, `final provenance ${name}`);
    const sha512Hex = createHash("sha512").update(candidate.packageBytes.get(name)).digest("hex");
    if (
      envelope.payloadType !== provenancePolicy.payloadType
      || statement._type !== provenancePolicy.statementType
      || statement.predicateType !== provenancePolicy.predicateType
      || !isDeepStrictEqual(statement.subject, [{
        digest: { sha512: sha512Hex },
        name: `pkg:npm/${name}@${contract.npmRegistryBoundary.publicationAdmission.target.version}`,
      }])
      || statement.predicate?.buildDefinition?.buildType !== provenancePolicy.buildType
      || !isDeepStrictEqual(statement.predicate?.buildDefinition?.externalParameters?.workflow, {
        path: provenancePolicy.workflowPath,
        ref: provenancePolicy.branchRef,
        repository: `https://github.com/${provenancePolicy.repository}`,
      })
      || !isDeepStrictEqual(statement.predicate?.buildDefinition?.internalParameters?.github, {
        event_name: "workflow_dispatch",
        repository_id: provenancePolicy.repositoryId,
        repository_owner_id: provenancePolicy.repositoryOwnerId,
      })
      || !isDeepStrictEqual(statement.predicate?.buildDefinition?.resolvedDependencies, [{
        digest: { gitCommit: sourceSha },
        uri: `git+https://github.com/${provenancePolicy.repository}@${provenancePolicy.branchRef}`,
      }])
      || statement.predicate?.runDetails?.builder?.id !== provenancePolicy.builderId
      || !new RegExp(
        `^https://github\\.com/${provenancePolicy.repository.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`
          + "/actions/runs/[1-9][0-9]*/attempts/[1-9][0-9]*$",
        "u",
      ).test(statement.predicate?.runDetails?.metadata?.invocationId ?? "")
      || observation.name !== name
      || observation.attestationUrl !== expectedAttestationUrl
      || observation.bundleDigest !== sha256Digest(bundleBytes)
      || observation.subjectDigest !== `sha512:${sha512Hex}`
      || observation.workflow !== provenancePolicy.workflow
      || observation.sourceSha !== sourceSha
    ) throw new Error(`final provenance statement or observation changed for ${name}`);
    normalized.push(observation);
  }
  return normalized;
};

const validateConsumerAndReservation = ({ contract, consumerSmoke, reservation, reservationBytes }) => {
  const { implementation } = finalPublicPolicy(contract);
  const smoke = exactKeys(consumerSmoke, implementation.observationFields.consumerSmoke, "final consumer smoke");
  const node = exactKeys(smoke.node, implementation.consumerSmoke.node.reportFields, "final Node consumer smoke");
  const bun = exactKeys(smoke.bun, implementation.consumerSmoke.bun.reportFields, "final Bun consumer smoke");
  const modules = derivePublicModules(contract);
  const pipelines = implementation.consumerSmoke.representativePipelines;
  if (
    smoke.schema !== implementation.consumerSmoke.protocol
    || smoke.version !== contract.releaseCertification.finalPublicVerification.version
    || node.executor !== implementation.consumerSmoke.node.executor
    || node.version !== implementation.consumerSmoke.node.version
    || node.npm !== implementation.consumerSmoke.node.npm
    || node.cache !== implementation.consumerSmoke.node.cache
    || bun.executor !== implementation.consumerSmoke.bun.executor
    || bun.version !== implementation.consumerSmoke.bun.version
    || bun.cache !== implementation.consumerSmoke.bun.cache
    || !isDeepStrictEqual(node.publicModules, modules)
    || !isDeepStrictEqual(bun.publicModules, modules)
    || !isDeepStrictEqual(node.pipelines, pipelines)
    || !isDeepStrictEqual(bun.pipelines, pipelines)
    || node.passed !== true
    || bun.passed !== true
    || !isDeepStrictEqual(smoke.publicModules, modules)
    || !isDeepStrictEqual(smoke.pipelines, pipelines)
    || smoke.passed !== true
  ) throw new Error("final fresh consumer smoke changed");
  const value = exactKeys(reservation, implementation.observationFields.reservation, "final Rolldown reservation");
  const ledger = implementation.reservation.ledger;
  const downloaded = bytes(reservationBytes, "final Rolldown reservation bytes");
  if (
    value.name !== implementation.reservation.package
    || value.version !== ledger.version
    || !isDeepStrictEqual(value.versions, [ledger.version])
    || value.latest !== ledger.bootstrapTags.latest
    || value.reserved !== ledger.bootstrapTags.reserved
    || value.bytes !== downloaded.byteLength
    || value.bytes !== ledger.bytes
    || value.sha256 !== sha256Digest(downloaded)
    || value.sha256 !== `sha256:${ledger.sha256}`
    || value.integrity !== sha512Integrity(downloaded)
    || value.integrity !== ledger.integrity
  ) throw new Error("final Rolldown reservation state changed");
  return { consumerSmoke: smoke, reservation: value };
};

const validateAllowedFinalPublicState = async ({
  contract,
  contractBytes,
  sourceSha,
  observedAt,
  validationTime,
  candidate,
  readiness,
  tag,
  release,
  npmPackages,
  npmPackageBytes,
  releaseAssets,
  releaseAssetBytes,
  provenance,
  provenanceBundles,
  consumerSmoke,
  reservation,
  reservationBytes,
  sigstoreVerify = verifySigstoreBundleIsolated,
  readinessVerify = validateReadinessAggregateWithEvidence,
  readinessArtifactExtractor,
}) => {
  const { policy } = finalPublicPolicy(contract);
  fullSha(sourceSha, "final public source SHA");
  const observed = canonicalTimestamp(observedAt, "final public observedAt");
  const validation = canonicalTimestamp(validationTime, "final public validationTime");
  if (
    validation + policy.freshness.clockSkewSeconds * 1_000 < observed
    || validation - observed > policy.freshness.maximumObservationAgeSeconds * 1_000
  ) throw new Error("final public observation is future or stale");
  const suppliedContractBytes = bytes(contractBytes, "contract");
  if (!suppliedContractBytes.equals(Buffer.from(renderJson(contract)))) {
    throw new Error("final public contract bytes are not the exact generated rendering");
  }
  const candidateResult = validateCandidate({
    contract,
    contractBytes,
    sourceSha,
    observedAt: observed,
    validationAt: validation,
    input: candidate,
  });
  const readinessResult = await validateReadiness({
    contract,
    contractBytes,
    sourceSha,
    observedAt: observed,
    validationTime,
    validationAt: validation,
    input: readiness,
    readinessVerify,
    readinessArtifactExtractor,
  });
  if (canonicalJson(readinessResult.manifest?.candidate) !== canonicalJson(candidateResult.reference)) {
    throw new Error("final candidate differs from the exact readiness-certified candidate");
  }
  const publicIdentity = validateTagAndRelease({
    contract,
    sourceSha,
    observedAt: observed,
    validationAt: validation,
    tag,
    release,
  });
  const governance = readinessResult.authenticatedExternalReceipts.get("github-release-governance");
  if (!isRecord(governance) || publicIdentity.release.immutable !== governance.enabled) {
    throw new Error("public Release immutability differs from the authenticated governance decision");
  }
  const publicBytes = validatePublicBytes({
    contract,
    candidate: candidateResult,
    npmPackages,
    npmPackageBytes,
    releaseAssets,
    releaseAssetBytes,
  });
  const provenanceResult = await validateProvenance({
    contract,
    sourceSha,
    candidate: candidateResult,
    provenance,
    provenanceBundles,
    trustedRootBytes: readiness.trustedRootBytes,
    sigstoreVerify,
  });
  const consumer = validateConsumerAndReservation({ contract, consumerSmoke, reservation, reservationBytes });
  const values = {
    schema: policy.receipt.protocol,
    sourceSha,
    observedAt,
    contract: { schema: contract.schema, digest: sha256Digest(contractBytes) },
    candidate: candidateResult.reference,
    readiness: readinessResult.reference,
    tag: publicIdentity.tag,
    release: publicIdentity.release,
    npmPackages: publicBytes.npmPackages,
    releaseAssets: publicBytes.releaseAssets,
    provenance: provenanceResult,
    consumerSmoke: consumer.consumerSmoke,
    reservation: consumer.reservation,
    verdict: policy.receipt.terminalVerdict,
  };
  const receipt = Object.fromEntries(policy.receipt.fields.map((field) => [field, values[field]]));
  return { receipt, receiptBytes: Buffer.from(canonicalJson(receipt)) };
};

export const validateFinalPublicState = (arguments_) => {
  assertFinalPublicVerificationAllowed(arguments_?.contract);
  return validateAllowedFinalPublicState(arguments_);
};

const loadAuthenticatedContract = async () => {
  const source = await readFile(contractPath, "utf8");
  const inputs = await readInputs(repositoryRoot);
  const generated = validateContract(buildContract(inputs), inputs);
  if (source !== renderJson(generated)) {
    throw new Error("final public verification contract is not the exact generated contract");
  }
  return generated;
};

const main = async () => {
  if (process.argv.length !== 2) throw new Error("final public verification accepts no CLI fallback arguments");
  const contract = await loadAuthenticatedContract();
  assertFinalPublicVerificationAllowed(contract);
  parseFinalPublicDispatch(contract, process.env);
  throw new Error("final public hosted byte collector has no authenticated input set");
};

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write("final public verification failed closed\n");
    process.exitCode = 1;
  });
}
