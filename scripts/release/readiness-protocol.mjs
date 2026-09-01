import { Buffer } from "node:buffer";

import {
  artifactCoordinate,
  canonicalJson,
  derivePublicModules,
  derivePublicPackageNames,
  sha256Digest,
} from "./protocol.mjs";
import {
  validateProducerIdentityPolicy,
  validateTrustedRootBytes,
  verifyExternalEvidenceEnvelope,
} from "./sigstore-dsse-verifier.mjs";
import { validateAppleAggregate } from "../apple-certification/aggregate.mjs";

// The closed receipt and framing code below is intentionally inert while the
// generated contract has no authenticated external producer identities. No
// readiness artifact may be built or admitted from caller-asserted bytes.

const isRecord = (value) =>
  value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const exactKeys = (value, expected, label) => {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${label} has missing or additional fields`);
  }
  return value;
};

const payloadBytes = (value, label) => {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) {
    throw new Error(`${label} must be non-empty opaque bytes`);
  }
  return Buffer.from(value);
};

const positiveDecimal = (value, label) => {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/u.test(value)) {
    throw new Error(`${label} must be a canonical positive decimal string`);
  }
  return value;
};

const fullSha = (value, label) => {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/u.test(value)) {
    throw new Error(`${label} must be one full lowercase source SHA`);
  }
  return value;
};

const canonicalDigest = (value, contract, label) => {
  const pattern = contract.releaseCertification?.githubArtifactDigest?.canonicalPattern;
  if (typeof value !== "string" || typeof pattern !== "string" || !new RegExp(pattern, "u").test(value)) {
    throw new Error(`${label} must be canonical sha256:<64 lowercase hex>`);
  }
  return value;
};

const canonicalTimestamp = (value, label) => {
  if (
    typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  ) throw new Error(`${label} must be a canonical UTC timestamp`);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new Error(`${label} must be a real canonical UTC timestamp`);
  }
  return milliseconds;
};

const canonicalIdentity = (value, label) => {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/u.test(value)) {
    throw new Error(`${label} must be one non-secret canonical identity`);
  }
  return value;
};

const decodeCanonicalJson = (value, label) => {
  const input = payloadBytes(value, label);
  let text;
  let decoded;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(input);
    decoded = JSON.parse(text);
  } catch {
    throw new Error(`${label} must be canonical UTF-8 JSON`);
  }
  if (text !== canonicalJson(decoded)) throw new Error(`${label} is not canonical JSON`);
  return decoded;
};

const readinessPolicy = (contract) => {
  if (!isRecord(contract) || contract.schema !== "effect-build/combined-contract@1") {
    throw new Error("readiness requires the canonical combined contract");
  }
  const release = contract.releaseCertification;
  const policy = release?.readiness;
  if (
    !isRecord(release)
    || !isRecord(policy)
    || policy.externalEvidencePolicy !== "closed-receipts-require-contract-pinned-sigstore-dsse-authentication"
    || policy.bundleFraming !== "protocol-line-u32be-canonical-header-u64be-opaque-payload"
    || !Array.isArray(policy.orderedFiles)
    || !Array.isArray(policy.evidenceRoles)
    || !isRecord(policy.referenceShapes)
    || !isRecord(policy.candidate)
  ) throw new Error("combined contract has no closed release-readiness policy");
  if (
    JSON.stringify(policy.orderedFiles) !== JSON.stringify([
      policy.manifest,
      policy.evidenceBundle,
      policy.externalEvidenceAuthentication?.verifier?.trustedRoot?.artifactFile,
    ])
    || policy.candidate.protocolSource !== "releaseCertification.candidate.protocol"
    || policy.candidate.referenceType !== "candidate"
    || policy.candidate.coordinate !== "required-exact"
    || policy.candidate.workflowSource !== "releaseCertification.candidate.workflow"
    || policy.candidate.artifactNameSource !== "releaseCertification.candidate.artifactName"
    || typeof policy.workflow !== "string"
    || policy.evidenceRoles.length !== 7
    || new Set(policy.evidenceRoles.map(({ role }) => role)).size !== policy.evidenceRoles.length
  ) throw new Error("release-readiness policy has ambiguous files, candidate, or evidence roles");
  return { policy, release };
};

export const assertReadinessArtifactAllowed = (contract) => {
  const { policy } = readinessPolicy(contract);
  const authentication = exactKeys(
    policy.externalEvidenceAuthentication,
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
    authentication.status === "blocked"
    && authentication.artifactDisposition === "forbidden-while-blocked"
    && authentication.blocker
      === "contract-pinned-external-producer-identities-and-provisioned-signers-not-established"
    && authentication.requiredEnvelope === "sigstore-bundle-v0.3-dsse"
    && authentication.verifier?.status === "implemented"
    && authentication.verifier?.module === "scripts/release/sigstore-dsse-verifier.mjs"
    && Array.isArray(authentication.producerIdentityFields)
    && Array.isArray(authentication.producerIdentities)
    && authentication.producerIdentities.length === 0
  ) {
    throw new Error(`release readiness artifact forbidden: ${authentication.blocker}`);
  }
  const externalRoles = policy.evidenceRoles
    .filter(({ type }) => type === "externalObservation")
    .map(({ role }) => role);
  if (
    authentication.status === "supported"
    && authentication.artifactDisposition === "required-on-terminal-workflow-success"
    && authentication.requiredEnvelope === "sigstore-bundle-v0.3-dsse"
    && authentication.verifier?.status === "implemented"
    && Array.isArray(authentication.producerIdentities)
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
  throw new Error("release readiness artifact forbidden: external producer authentication policy is not exact");
};

const semanticContractIdentity = (contract, contractBytes) => {
  const decoded = decodeCanonicalOrGeneratedJson(contractBytes, "combined contract bytes");
  if (canonicalJson(decoded) !== canonicalJson(contract)) {
    throw new Error("combined contract bytes do not encode the supplied contract");
  }
  return {
    schema: contract.schema,
    digest: sha256Digest(contractBytes),
  };
};

const decodeCanonicalOrGeneratedJson = (value, label) => {
  const input = payloadBytes(value, label);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input));
  } catch {
    throw new Error(`${label} must be UTF-8 JSON`);
  }
};

const expectedToolchain = (contract) => {
  const bun = contract.exactToolEvidenceRegister?.tools?.find((entry) => entry.name === "bun");
  const client = contract.releaseCertification?.npmOidcCertification?.client;
  return {
    bun: { name: "bun", version: bun?.version },
    node: { name: "node", version: client?.node },
    npm: { name: "npm", version: client?.npm },
  };
};

const validateTemporalReference = (value, aggregateObservedAt, validationTime, freshness, label) => {
  const observedAt = canonicalTimestamp(value.observedAt, `${label}.observedAt`);
  const expiresAt = canonicalTimestamp(value.expiresAt, `${label}.expiresAt`);
  if (
    !Number.isSafeInteger(freshness?.maximumAgeSeconds)
    || freshness.maximumAgeSeconds <= 0
    || !Number.isSafeInteger(freshness.maximumValiditySeconds)
    || freshness.maximumValiditySeconds < freshness.maximumAgeSeconds
  ) throw new Error(`${label} has no exact freshness policy`);
  if (
    observedAt > aggregateObservedAt
    || aggregateObservedAt - observedAt > freshness.maximumAgeSeconds * 1_000
    || expiresAt <= observedAt
    || expiresAt - observedAt > freshness.maximumValiditySeconds * 1_000
    || expiresAt <= validationTime
  ) {
    throw new Error(`${label} is future, stale, expired, or has an excessive validity window`);
  }
};

const referenceDigest = (reference) => sha256Digest(canonicalJson(reference));

const evidencePayloadDigest = (reference) => reference.type === "githubArtifact"
  ? reference.coordinate.artifactDigest
  : reference.digest;

const validateOpaquePayload = (reference, payload, contract, label) => {
  const input = payloadBytes(payload, `${label} payload`);
  if (positiveDecimal(reference.bytes, `${label}.bytes`) !== `${input.byteLength}`) {
    throw new Error(`${label} byte count changed`);
  }
  const expectedDigest = canonicalDigest(evidencePayloadDigest(reference), contract, `${label}.digest`);
  if (sha256Digest(input) !== expectedDigest) throw new Error(`${label} opaque bytes changed`);
  return input;
};

const sameJson = (left, right) => canonicalJson(left) === canonicalJson(right);

const validateExternalReceipt = ({ definition, reference, payload, contract, producerSourceSha }) => {
  const policy = contract.releaseCertification.readiness;
  const receiptPolicy = Object.values(policy.externalReceipts).find(({ role }) => role === definition.role);
  if (!isRecord(receiptPolicy)) throw new Error(`readiness ${definition.role} has no external receipt policy`);
  const receipt = exactKeys(
    decodeCanonicalJson(payload, `readiness ${definition.role} receipt`),
    receiptPolicy.fields,
    `readiness ${definition.role} receipt`,
  );

  if (definition.role === "npm-authority") {
    const summary = exactKeys(receipt.summary, receiptPolicy.summaryFields, "npm authority summary");
    if (
      receipt.schema !== definition.protocol
      || receipt.sourceSha !== reference.sourceSha
      || receipt.identity !== reference.identity
      || receipt.identity !== receiptPolicy.identity
      || receipt.observedAt !== reference.observedAt
      || receipt.decision !== reference.terminal
      || !Array.isArray(receipt.issues)
      || receipt.issues.length !== 0
      || !Array.isArray(receipt.checks)
      || receipt.checks.length !== receiptPolicy.expectedCheckIds.length
      || !Number.isSafeInteger(summary.match)
      || summary.match !== receipt.checks.length
      || summary.mismatch !== 0
      || summary.unobserved !== 0
      || receipt.checks.some((check, index) => {
        const value = exactKeys(check, receiptPolicy.checkFields, `npm authority check ${index}`);
        return value.id !== receiptPolicy.expectedCheckIds[index] || value.status !== "match";
      })
    ) throw new Error("npm authority receipt is not one exact supported audit");
    return receipt;
  }

  if (
    receipt.schema !== definition.protocol
    || receipt.sourceSha !== reference.sourceSha
    || receipt.identity !== reference.identity
    || receipt.observedAt !== reference.observedAt
    || receipt.terminal !== reference.terminal
  ) throw new Error(`readiness ${definition.role} receipt does not correlate to its reference`);

  const digestFields = Object.keys(receipt).filter((name) => name.endsWith("Digest"));
  if (digestFields.some((name) => !/^sha256:[0-9a-f]{64}$/u.test(receipt[name]))) {
    throw new Error(`readiness ${definition.role} receipt contains a noncanonical digest`);
  }
  if (definition.role === "operational-journal") {
    if (
      receipt.ownerRepository !== receiptPolicy.ownerRepository
      || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(receipt.ownerVersion)
      || receipt.ownerSourceSha !== producerSourceSha
      || receipt.candidateSourceSha !== reference.sourceSha
      || receipt.appleCodecId !== contract.releaseCertification.apple.notaryJournal.submissionCodec
      || !/^\d{12}$/u.test(receipt.awsAccountId)
      || !/^arn:aws:s3:::[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u.test(receipt.bucketArn)
      || !/^[a-z]{2}-[a-z]+-\d$/u.test(receipt.region)
      || !new RegExp(`^arn:aws:iam::${receipt.awsAccountId}:role/[A-Za-z0-9+=,.@_/-]+$`, "u").test(receipt.roleArn)
      || !/^operation-journal\/v1\/[A-Za-z0-9._/-]+\/$/u.test(receipt.prefix)
      || !sameJson(receipt.claims, receiptPolicy.claims)
      || receipt.backendAuthentication !== receiptPolicy.backendAuthentication
    ) throw new Error("operational journal receipt is not the exact qualified one-backend claim");
    return receipt;
  }
  if (definition.role === "github-release-governance") {
    const decision = receiptPolicy.decisions.find((entry) => entry.decision === receipt.decision);
    if (
      receipt.identity !== receiptPolicy.identity
      || receipt.repository !== contract.releaseCertification.githubAuthority.repository
      || receipt.endpoint !== `repos/${receipt.repository}/immutable-releases`
      || !isRecord(decision)
      || receipt.enabled !== decision.enabled
      || !sameJson(receipt.claims, decision.claims)
      || receipt.backendAuthentication !== receiptPolicy.backendAuthentication
    ) throw new Error("GitHub Release governance receipt is not one exact resolved decision");
    return receipt;
  }
  throw new Error(`unsupported external readiness receipt: ${definition.role}`);
};

const validateCandidateManifest = ({ bytes, contract, contractIdentity, sourceSha }) => {
  const candidate = exactKeys(
    decodeCanonicalJson(bytes, "candidate manifest bytes"),
    ["schema", "sourceSha", "version", "contract", "toolchain", "publicModules", "packages"],
    "candidate manifest",
  );
  if (
    candidate.schema !== contract.releaseCertification.candidate.protocol
    || candidate.sourceSha !== sourceSha
    || candidate.version !== contract.npmRegistryBoundary?.publicationAdmission?.target?.version
    || canonicalJson(exactKeys(candidate.contract, ["schema", "digest"], "candidate contract"))
      !== canonicalJson(contractIdentity)
    || canonicalJson(exactKeys(candidate.toolchain, ["bun", "node", "npm"], "candidate toolchain"))
      !== canonicalJson(expectedToolchain(contract))
    || JSON.stringify(candidate.publicModules) !== JSON.stringify(derivePublicModules(contract))
  ) throw new Error("candidate manifest is not exactly bound to source, contract, toolchain, and public modules");
  const names = derivePublicPackageNames(contract);
  if (
    !Array.isArray(candidate.packages)
    || JSON.stringify(candidate.packages.map((entry) => isRecord(entry) ? entry.name : undefined))
      !== JSON.stringify(names)
  ) throw new Error("candidate manifest package order or membership changed");
  for (const entry of candidate.packages) {
    exactKeys(entry, ["name", "file", "bytes", "sha256", "integrity", "manifestDigest"], `${entry.name} ledger`);
    if (
      entry.file !== `${entry.name}-${candidate.version}.tgz`
      || !Number.isInteger(entry.bytes)
      || entry.bytes <= 0
      || !/^sha256:[0-9a-f]{64}$/u.test(entry.sha256)
      || !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(entry.integrity)
      || !/^sha256:[0-9a-f]{64}$/u.test(entry.manifestDigest)
    ) throw new Error(`${entry.name} candidate ledger identity changed`);
  }
  return candidate;
};

const validateCandidateReference = ({
  reference,
  payload,
  contract,
  sourceSha,
  aggregateObservedAt,
  validationTime,
  contractIdentity,
}) => {
  const { policy, release } = readinessPolicy(contract);
  const value = exactKeys(reference, policy.referenceShapes.candidate, "readiness candidate reference");
  if (value.protocol !== release.candidate.protocol) throw new Error("readiness candidate protocol changed");
  const coordinate = artifactCoordinate(release, value.coordinate);
  const expectedArtifactName = release.candidate.artifactName.replace("<sourceSha>", sourceSha);
  if (
    coordinate.sourceSha !== sourceSha
    || coordinate.workflow !== release.candidate.workflow
    || value.artifactName !== expectedArtifactName
  ) throw new Error("readiness candidate source, workflow, or artifact name changed");
  validateTemporalReference(value, aggregateObservedAt, validationTime, policy.candidate, "readiness candidate");
  const input = payloadBytes(payload, "candidate manifest payload");
  if (positiveDecimal(value.bytes, "readiness candidate.bytes") !== `${input.byteLength}`) {
    throw new Error("readiness candidate manifest byte count changed");
  }
  if (
    canonicalDigest(value.manifestDigest, contract, "readiness candidate manifest digest") !== sha256Digest(input)
  ) throw new Error("readiness candidate manifest digest changed");
  const candidate = validateCandidateManifest({
    bytes: input,
    contract,
    contractIdentity,
    sourceSha,
  });
  return { candidate, coordinate, payload: input, reference: value };
};

const expectedPackageRepository = (contract) => ({
  type: "git",
  url: `git+https://github.com/${contract.releaseCertification.githubAuthority.repository}.git`,
});

const semverCore = (value, label) => {
  const match = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u
    .exec(value);
  if (match === null) throw new Error(`${label} is not an exact semantic version`);
  return match.slice(1, 4).map(Number);
};

const newerCoreVersion = (left, right) => {
  const leftCore = semverCore(left, "readiness observed npm version");
  const rightCore = semverCore(right, "readiness target npm version");
  for (let index = 0; index < 3; index += 1) {
    if (leftCore[index] !== rightCore[index]) return leftCore[index] > rightCore[index];
  }
  return false;
};

export const validateReadinessDirectObservation = ({ contract, sourceSha, observedAt, observation }) => {
  const policy = contract.releaseCertification.readiness.directObservation;
  const authority = contract.releaseCertification.githubAuthority;
  const registry = contract.npmRegistryBoundary;
  const value = exactKeys(observation, policy.fields, "readiness direct observation");
  const github = exactKeys(value.github, policy.githubFields, "readiness direct GitHub observation");
  const environment = exactKeys(
    github.environment,
    policy.environmentFields,
    "readiness direct GitHub environment",
  );
  const reviewer = exactKeys(environment.reviewer, policy.reviewerFields, "readiness direct reviewer");
  if (
    value.schema !== policy.protocol
    || value.sourceSha !== sourceSha
    || value.observedAt !== observedAt
    || github.repository !== authority.repository
    || github.repositoryId !== authority.repositoryId
    || github.repositoryOwnerId !== authority.repositoryOwnerId
    || github.visibility !== authority.repositoryVisibility
    || environment.name !== authority.environment
    || JSON.stringify(environment.protectionRuleTypes) !== JSON.stringify(authority.branchPolicy.exactProtectionRuleTypes)
    || canonicalJson(reviewer) !== canonicalJson({
      id: authority.reviewer.id,
      login: authority.reviewer.login,
      type: authority.reviewer.type,
    })
    || environment.preventSelfReview !== authority.reviewer.preventSelfReview
    || canonicalJson(github.deploymentBranchPolicy)
      !== canonicalJson(authority.branchPolicy.deploymentBranchPolicy)
    || !Array.isArray(github.deploymentBranchPolicies)
    || github.deploymentBranchPolicies.length !== 1
    || canonicalJson(exactKeys(
      github.deploymentBranchPolicies[0],
      policy.branchPolicyFields,
      "readiness direct deployment branch policy",
    )) !== canonicalJson({ name: authority.branchPolicy.name, type: authority.branchPolicy.type })
    || canonicalJson(github.oidcSubjectPolicy) !== canonicalJson(authority.oidcSubjectPolicy)
    || github.workflowPath !== contract.releaseCertification.readiness.workflowPath
    || canonicalDigest(github.workflowDigest, contract, "readiness workflow digest") !== github.workflowDigest
    || github.currentMain !== sourceSha
  ) throw new Error("readiness direct GitHub state differs from the canonical release authority");
  const npm = exactKeys(value.npm, policy.npmFields, "readiness direct npm observation");
  const names = [
    ...derivePublicPackageNames(contract),
    ...[...registry.reservation.packages].sort(),
  ];
  if (
    npm.registry !== registry.registry
    || npm.targetVersion !== registry.publicationAdmission.target.version
    || !Array.isArray(npm.packages)
    || npm.packages.length !== names.length
  ) throw new Error("readiness direct npm registry or package projection changed");
  const expectedLatest = new Map(
    registry.publicationAdmission.target.expectedLatestBeforePublication.map((entry) => [entry.name, entry.version]),
  );
  const placeholderLedger = new Map(registry.bootstrap.placeholderLedger.map((entry) => [entry.name, entry]));
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    const entry = exactKeys(npm.packages[index], policy.npmPackageFields, `readiness npm ${name}`);
    const repository = exactKeys(entry.repository, policy.repositoryFields, `readiness npm ${name} repository`);
    if (
      entry.name !== name
      || !Array.isArray(entry.versions)
      || entry.versions.length === 0
      || new Set(entry.versions).size !== entry.versions.length
      || JSON.stringify([...entry.versions].sort()) !== JSON.stringify(entry.versions)
      || entry.versions.some((version) =>
        typeof version !== "string"
        || version.length === 0
        || newerCoreVersion(version, npm.targetVersion)
      )
      || entry.versions.includes(npm.targetVersion)
      || !isRecord(entry.distTags)
      || entry.distTags.latest !== (expectedLatest.get(name) ?? placeholderLedger.get(name)?.bootstrapTags.latest)
      || canonicalJson(repository) !== canonicalJson(expectedPackageRepository(contract))
    ) throw new Error(`readiness direct npm public state changed for ${name}`);
    const ledger = placeholderLedger.get(name);
    if (ledger === undefined) {
      if (
        entry.placeholder !== null
        || JSON.stringify(Object.keys(entry.distTags)) !== JSON.stringify(["latest"])
        || entry.distTags.latest !== expectedLatest.get(name)
      ) {
        throw new Error(`readiness direct npm non-placeholder state changed for ${name}`);
      }
    } else {
      const placeholder = exactKeys(entry.placeholder, policy.placeholderFields, `readiness npm ${name} placeholder`);
      const expectedUrl = `${registry.registry}/${name}/-/${name}-${ledger.version}.tgz`;
      if (
        JSON.stringify(entry.versions) !== JSON.stringify([ledger.version])
        || JSON.stringify(Object.keys(entry.distTags).sort()) !== JSON.stringify(["latest", "reserved"])
        || entry.distTags.latest !== ledger.bootstrapTags.latest
        || entry.distTags.reserved !== ledger.bootstrapTags.reserved
        || placeholder.version !== ledger.version
        || placeholder.bytes !== ledger.bytes
        || placeholder.sha256 !== `sha256:${ledger.sha256}`
        || placeholder.integrity !== ledger.integrity
        || placeholder.tarballUrl !== expectedUrl
      ) throw new Error(`readiness direct npm placeholder state changed for ${name}`);
    }
  }
  return value;
};

const validateRunIdentity = (value, sourceSha, expectedWorkflow, label) => {
  if (
    typeof value.workflow !== "string"
    || !/^[^/\s]+\/[^/\s]+\/\.github\/workflows\/[^@\s]+@refs\/heads\/[^\s]+$/u.test(value.workflow)
    || value.sourceSha !== sourceSha
    || value.workflow !== expectedWorkflow
    || !/^[1-9][0-9]*$/u.test(value.runId)
    || !/^[1-9][0-9]*$/u.test(value.runAttempt)
  ) throw new Error(`${label} workflow, source SHA, run, or attempt changed`);
};

const exactCoordinate = (contract, value, expected, label) => {
  const normalized = artifactCoordinate(contract.releaseCertification, value, expected.workflow);
  if (canonicalJson(normalized) !== canonicalJson(expected)) throw new Error(`${label} coordinate changed`);
  return normalized;
};

const validateNpmOidcArtifact = ({
  contract,
  sourceSha,
  candidateCoordinate,
  workflowCoordinate,
  evidenceObservedAt,
  artifactObservedAt,
  aggregateObservedAt,
  maximumAgeSeconds,
  files,
}) => {
  const release = contract.releaseCertification;
  const policy = release.npmOidcCertification.evidence;
  if (JSON.stringify([...files.keys()]) !== JSON.stringify(policy.orderedFiles)) {
    throw new Error("npm OIDC artifact files are missing, additional, or out of order");
  }
  const claims = exactKeys(
    decodeCanonicalJson(files.get(policy.orderedFiles[0]), "npm OIDC claims receipt"),
    policy.receiptSchemas.githubOidcClaims,
    "npm OIDC claims receipt",
  );
  const npm = exactKeys(
    decodeCanonicalJson(files.get(policy.orderedFiles[1]), "npm OIDC exchange receipt"),
    policy.receiptSchemas.npmOidcExchangeAccepted,
    "npm OIDC exchange receipt",
  );
  const expectedSourceDigests = release.npmOidcCertification.sourceDigests.map(({ path, sha256 }) => ({
    path,
    sha256: `sha256:${sha256}`,
  }));
  const authority = release.githubAuthority;
  const expectedClaims = {
    ...policy.githubOidcClaims.staticClaims,
    environment: authority.environment,
    ref: `refs/heads/${authority.branchPolicy.name}`,
    repository: authority.repository,
    repository_id: authority.repositoryId,
    repository_owner: authority.repositoryOwner,
    repository_owner_id: authority.repositoryOwnerId,
    run_attempt: workflowCoordinate.runAttempt,
    run_id: workflowCoordinate.runId,
    sha: sourceSha,
    sub: authority.expectedEnvironmentSubject,
    workflow_ref: release.candidate.workflow,
    workflow_sha: sourceSha,
  };
  if (
    JSON.stringify(Object.keys(expectedClaims).sort())
      !== JSON.stringify([...policy.githubOidcClaims.orderedClaimFields].sort())
  ) {
    throw new Error("npm OIDC generated claims order changed");
  }
  const jwt = exactKeys(claims.jwtValidation, policy.receiptSchemas.jwtValidation, "npm OIDC JWT validation");
  if (
    claims.schema !== policy.protocols.githubOidcClaims
    || claims.sourceSha !== sourceSha
    || canonicalJson(exactCoordinate(contract, claims.candidate, candidateCoordinate, "npm OIDC claims candidate"))
      !== canonicalJson(candidateCoordinate)
    || canonicalJson(exactKeys(claims.client, policy.receiptSchemas.client, "npm OIDC claims client"))
      !== canonicalJson(release.npmOidcCertification.client)
    || canonicalJson(claims.claims) !== canonicalJson(expectedClaims)
    || claims.claimsDigest !== sha256Digest(Buffer.from(canonicalJson(claims.claims)))
    || jwt.alg !== policy.githubOidcClaims.jwtValidation.alg
    || typeof jwt.kid !== "string"
    || jwt.kid.length === 0
    || jwt.kid.includes("\0")
    || ![jwt.iat, jwt.nbf, jwt.exp].every(Number.isSafeInteger)
    || jwt.exp <= jwt.iat
    || jwt.nbf > jwt.exp
    || jwt.exp - jwt.iat > policy.githubOidcClaims.jwtValidation.maximumLifetimeSeconds
    || ![jwt.issuerConfigurationDigest, jwt.jwksDigest, jwt.signingKeyDigest]
      .every((digest) => /^sha256:[0-9a-f]{64}$/u.test(digest))
    || jwt.signatureVerified !== true
    || canonicalJson(claims.sourceDigests) !== canonicalJson(expectedSourceDigests)
    || claims.registryMutation !== false
    || canonicalJson(claims.proves) !== canonicalJson(policy.receiptClaims.githubOidcClaims.proves)
    || canonicalJson(claims.doesNotProve) !== canonicalJson(policy.receiptClaims.githubOidcClaims.doesNotProve)
  ) throw new Error("npm OIDC claims receipt is not exact");
  const names = derivePublicPackageNames(contract);
  if (
    npm.schema !== policy.protocols.npmOidcExchangeAccepted
    || npm.sourceSha !== sourceSha
    || canonicalJson(exactCoordinate(contract, npm.candidate, candidateCoordinate, "npm OIDC exchange candidate"))
      !== canonicalJson(candidateCoordinate)
    || canonicalJson(exactKeys(npm.client, policy.receiptSchemas.client, "npm OIDC exchange client"))
      !== canonicalJson(release.npmOidcCertification.client)
    || canonicalJson(npm.packages) !== canonicalJson(names)
    || !Array.isArray(npm.exchanges)
    || npm.exchanges.length !== names.length
    || npm.exchanges.some((entry, index) => {
      const exchange = exactKeys(entry, policy.receiptSchemas.exchange, `npm OIDC exchange ${index}`);
      return exchange.name !== names[index] || exchange.accepted !== true || exchange.markerCount !== 1;
    })
    || !/^sha256:[0-9a-f]{64}$/u.test(npm.beforeRegistryStateDigest)
    || npm.afterRegistryStateDigest !== npm.beforeRegistryStateDigest
    || canonicalJson(npm.sourceDigests) !== canonicalJson(expectedSourceDigests)
    || npm.registryMutation !== false
    || canonicalJson(npm.proves) !== canonicalJson(policy.receiptClaims.npmOidcExchangeAccepted.proves)
    || canonicalJson(npm.doesNotProve) !== canonicalJson(policy.receiptClaims.npmOidcExchangeAccepted.doesNotProve)
  ) throw new Error("npm OIDC exchange receipt is not exact");
  const claimsObservedAt = canonicalTimestamp(claims.observedAt, "npm OIDC claims observedAt");
  const npmObservedAt = canonicalTimestamp(npm.observedAt, "npm OIDC exchange observedAt");
  const evidenceTime = canonicalTimestamp(evidenceObservedAt, "npm OIDC evidenceObservedAt");
  const artifactTime = canonicalTimestamp(artifactObservedAt, "npm OIDC artifact observedAt");
  if (
    claims.observedAt !== new Date(jwt.iat * 1_000).toISOString()
    || claimsObservedAt < jwt.nbf * 1_000
    || claimsObservedAt > jwt.exp * 1_000
    || npmObservedAt < claimsObservedAt
    || npmObservedAt > jwt.exp * 1_000
    || npmObservedAt !== evidenceTime
    || evidenceTime > artifactTime
    || evidenceTime > aggregateObservedAt
    || aggregateObservedAt - evidenceTime > maximumAgeSeconds * 1_000
  ) throw new Error("npm OIDC receipt times are stale, future, out of order, or outside the signed token lifetime");
  return { claims, npm };
};

const expandedFakeCoordinates = (contract) => contract.releaseCertification.fakeRegistry.hypotheticalStateMachine.cases
  .flatMap(({ id, variants }) => (variants ?? [undefined]).map((variant) =>
    variant === undefined ? id : `${id}/${variant}`
  ));

const validateFakeRegistryArtifact = ({
  contract,
  sourceSha,
  candidateCoordinate,
  candidateManifestDigest,
  contractDigest,
  observedAt,
  files,
}) => {
  const release = contract.releaseCertification;
  const policy = release.fakeRegistry.exactProtectedBodyCertification;
  if (JSON.stringify([...files.keys()]) !== JSON.stringify(policy.orderedFiles)) {
    throw new Error("fake-registry exact certification files changed");
  }
  const receipt = exactKeys(
    decodeCanonicalJson(files.get(policy.orderedFiles[0]), "fake-registry exact certification receipt"),
    policy.receiptFields,
    "fake-registry exact certification receipt",
  );
  const expectedCoordinates = expandedFakeCoordinates(contract);
  const expectedLedger = policy.exactMutationLedger;
  if (
    receipt.schema !== policy.protocol
    || receipt.sourceSha !== sourceSha
    || receipt.observedAt !== observedAt
    || receipt.workflow !== policy.workflow
    || receipt.contractDigest !== contractDigest
    || receipt.externalAuthenticationStatus !== "supported"
    || policy.implementationStatus !== "implemented"
    || policy.status !== "supported"
    || release.readiness.externalEvidenceAuthentication.status !== "supported"
    || policy.status !== release.readiness.externalEvidenceAuthentication.status
    || canonicalJson(exactCoordinate(contract, receipt.candidate, candidateCoordinate, "fake-registry candidate"))
      !== canonicalJson(candidateCoordinate)
    || receipt.candidateManifestDigest !== candidateManifestDigest
    || receipt.coordinateCount !== expectedCoordinates.length
    || !Array.isArray(expectedLedger)
    || expectedLedger.length !== expectedCoordinates.length
    || expectedLedger.some((entry, index) => entry.coordinate !== expectedCoordinates[index])
    || !Array.isArray(receipt.coordinates)
    || receipt.coordinates.length !== expectedCoordinates.length
    || receipt.coordinates.some((entry, index) => {
      const result = exactKeys(entry, policy.coordinateFields, `fake-registry coordinate ${index}`);
      const expected = expectedLedger[index];
      return result.coordinate !== expected.coordinate
        || result.status !== "passed"
        || result.attemptedFakeMutations !== expected.attemptedFakeMutations
        || result.committedFakeMutations !== expected.committedFakeMutations
        || result.candidateBinding !== expected.candidateBinding
        || canonicalDigest(result.candidateArtifactDigest, contract, `fake-registry coordinate ${index} candidate artifact`)
          !== result.candidateArtifactDigest
        || canonicalDigest(result.candidateManifestDigest, contract, `fake-registry coordinate ${index} candidate manifest`)
          !== result.candidateManifestDigest
        || (expected.candidateBinding === "exact-release-candidate" && (
          result.candidateArtifactDigest !== candidateCoordinate.artifactDigest
          || result.candidateManifestDigest !== candidateManifestDigest
        ))
        || (expected.candidateBinding === "derived-hostile-candidate" && (
          result.candidateArtifactDigest === candidateCoordinate.artifactDigest
          && result.candidateManifestDigest === candidateManifestDigest
        ));
    })
    || canonicalJson(receipt.claims) !== canonicalJson(policy.requiredClaims)
    || canonicalJson(receipt.doesNotProve) !== canonicalJson(policy.doesNotProve)
    || receipt.realRegistryMutation !== false
    || receipt.realNpmOrRegistryCredentialsUsed !== false
    || receipt.terminal !== policy.terminal
  ) throw new Error("fake-registry exact protected-body certification receipt changed");
  return receipt;
};

export const validateGithubArtifactEvidence = ({
  contract,
  definition,
  reference,
  sourceSha,
  candidateCoordinate,
  candidateManifestDigest,
  contractDigest,
  files,
}) => {
  const workflowCoordinate = artifactCoordinate(
    contract.releaseCertification,
    reference.coordinate,
    definition.workflow,
  );
  if (!(files instanceof Map)) throw new Error(`${definition.role} artifact files are unavailable`);
  if (definition.role === "fake-registry") {
    return validateFakeRegistryArtifact({
      contract,
      sourceSha,
      candidateCoordinate,
      candidateManifestDigest,
      contractDigest,
      observedAt: reference.evidenceObservedAt,
      files,
    });
  }
  if (definition.role === "npm-oidc-certification") {
    return validateNpmOidcArtifact({
      contract,
      sourceSha,
      candidateCoordinate,
      workflowCoordinate,
      evidenceObservedAt: reference.evidenceObservedAt,
      artifactObservedAt: reference.observedAt,
      aggregateObservedAt: reference.aggregateObservedAt,
      maximumAgeSeconds: definition.maximumAgeSeconds,
      files,
    });
  }
  if (definition.role === "apple-certification") {
    const policy = contract.releaseCertification.apple;
    const result = validateAppleAggregate({
      contract,
      expectedSourceSha: sourceSha,
      expectedCandidateCoordinate: candidateCoordinate,
      expectedWorkflowCoordinate: workflowCoordinate,
      files: [...files.keys()],
      indexBytes: files.get(policy.artifact.orderedFiles[0]),
      bundleBytes: files.get(policy.artifact.orderedFiles[1]),
    });
    if (result.verdict !== policy.encoding.terminalVerdict) {
      throw new Error("Apple certification artifact has no exact terminal verdict");
    }
    return result;
  }
  throw new Error(`unsupported GitHub artifact evidence role: ${definition.role}`);
};

const validateEvidenceReference = async ({
  definition,
  reference,
  payload,
  contract,
  sourceSha,
  aggregateObservedAt,
  validationTime,
  candidateCoordinate,
  candidateManifestDigest,
  contractDigest,
  artifactFiles,
}) => {
  const { policy, release } = readinessPolicy(contract);
  const fields = policy.referenceShapes[definition.type];
  if (!Array.isArray(fields)) throw new Error(`unknown readiness reference type: ${definition.type}`);
  const value = exactKeys(reference, fields, `readiness ${definition.role} reference`);
  if (
    value.role !== definition.role
    || value.type !== definition.type
    || value.protocol !== definition.protocol
    || value.terminal !== definition.terminal
  ) throw new Error(`readiness ${definition.role} role, type, protocol, or terminal verdict changed`);
  validateTemporalReference(value, aggregateObservedAt, validationTime, definition, `readiness ${definition.role}`);
  const input = validateOpaquePayload(value, payload, contract, `readiness ${definition.role}`);
  let authenticatedReceipt;
  let producerAuthentication;
  if (definition.type === "githubArtifact") {
    const evidenceObservedAt = canonicalTimestamp(
      value.evidenceObservedAt,
      `readiness ${definition.role}.evidenceObservedAt`,
    );
    const artifactObservedAt = canonicalTimestamp(value.observedAt, `readiness ${definition.role}.observedAt`);
    if (
      evidenceObservedAt > artifactObservedAt
      || evidenceObservedAt > aggregateObservedAt
      || aggregateObservedAt - evidenceObservedAt > definition.maximumAgeSeconds * 1_000
    ) throw new Error(`readiness ${definition.role} evidence time is future or stale`);
    const coordinate = artifactCoordinate(release, value.coordinate);
    if (
      coordinate.sourceSha !== sourceSha
      || coordinate.workflow !== definition.workflow
      || value.artifactName !== definition.artifactName
    ) throw new Error(`readiness ${definition.role} source, workflow, or artifact name changed`);
    authenticatedReceipt = validateGithubArtifactEvidence({
      contract,
      definition,
      reference: { ...value, aggregateObservedAt },
      sourceSha,
      candidateCoordinate,
      candidateManifestDigest,
      contractDigest,
      files: artifactFiles,
    });
  } else if (definition.type === "githubRun") {
    validateRunIdentity(value, sourceSha, definition.workflow, `readiness ${definition.role}`);
    canonicalDigest(value.digest, contract, `readiness ${definition.role}.digest`);
  } else if (definition.type === "externalObservation") {
    fullSha(value.sourceSha, `readiness ${definition.role}.sourceSha`);
    if (value.sourceSha !== sourceSha) throw new Error(`readiness ${definition.role} source SHA changed`);
    canonicalIdentity(value.identity, `readiness ${definition.role}.identity`);
    canonicalDigest(value.digest, contract, `readiness ${definition.role}.digest`);
    const authenticated = await verifyExternalEvidenceEnvelope({
      contract,
      definition,
      reference: value,
      bundleBytes: input,
      validationTime: new Date(validationTime).toISOString(),
    });
    authenticatedReceipt = validateExternalReceipt({
      definition,
      reference: value,
      payload: authenticated.receiptBytes,
      contract,
      producerSourceSha: authenticated.payload.producerSourceSha,
    });
    producerAuthentication = {
      identity: authenticated.identity,
      producerSourceSha: authenticated.payload.producerSourceSha,
      producerWorkflow: authenticated.payload.producerWorkflow,
    };
  } else {
    throw new Error(`unsupported readiness reference type: ${definition.type}`);
  }
  return { authenticatedReceipt, payload: input, producerAuthentication, reference: value };
};

const candidateDescriptor = (candidate) => ({
  key: "candidate",
  protocol: candidate.protocol,
  bytes: candidate.bytes,
  digest: candidate.manifestDigest,
  referenceDigest: referenceDigest(candidate),
});

const evidenceDescriptor = (reference) => ({
  key: reference.role,
  protocol: reference.protocol,
  bytes: reference.bytes,
  digest: evidencePayloadDigest(reference),
  referenceDigest: referenceDigest(reference),
});

const frame = (descriptor, payload) => {
  const header = Buffer.from(canonicalJson(descriptor));
  const headerLength = Buffer.alloc(4);
  headerLength.writeUInt32BE(header.byteLength);
  const payloadLength = Buffer.alloc(8);
  payloadLength.writeBigUInt64BE(BigInt(payload.byteLength));
  return Buffer.concat([headerLength, header, payloadLength, payload]);
};

const encodeBundle = (policy, candidate, candidateBytes, evidence, evidenceBytes) => {
  const parts = [Buffer.from(`${policy.bundleProtocol}\n`)];
  parts.push(frame(candidateDescriptor(candidate), candidateBytes));
  for (const reference of evidence) {
    parts.push(frame(evidenceDescriptor(reference), evidenceBytes.get(reference.role)));
  }
  return Buffer.concat(parts);
};

const readUnsigned = (bundle, cursor, width, label) => {
  if (cursor + width > bundle.byteLength) throw new Error(`readiness bundle truncated before ${label}`);
  return width === 4 ? BigInt(bundle.readUInt32BE(cursor)) : bundle.readBigUInt64BE(cursor);
};

const decodeBundle = (bundleBytes, policy, descriptors) => {
  const bundle = payloadBytes(bundleBytes, "readiness evidence bundle");
  const magic = Buffer.from(`${policy.bundleProtocol}\n`);
  if (!bundle.subarray(0, magic.byteLength).equals(magic)) {
    throw new Error("readiness evidence bundle protocol changed");
  }
  let cursor = magic.byteLength;
  const payloads = new Map();
  for (const expected of descriptors) {
    const headerLength = readUnsigned(bundle, cursor, 4, `${expected.key} header length`);
    cursor += 4;
    if (headerLength === 0n || headerLength > 1_048_576n || headerLength > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`readiness ${expected.key} frame header length is invalid`);
    }
    const headerEnd = cursor + Number(headerLength);
    if (headerEnd > bundle.byteLength) throw new Error(`readiness ${expected.key} frame header is truncated`);
    const headerBytes = bundle.subarray(cursor, headerEnd);
    cursor = headerEnd;
    const header = exactKeys(
      decodeCanonicalJson(headerBytes, `readiness ${expected.key} frame header`),
      ["key", "protocol", "bytes", "digest", "referenceDigest"],
      `readiness ${expected.key} frame header`,
    );
    if (canonicalJson(header) !== canonicalJson(expected)) {
      throw new Error(`readiness ${expected.key} frame identity or order changed`);
    }
    const payloadLength = readUnsigned(bundle, cursor, 8, `${expected.key} payload length`);
    cursor += 8;
    if (payloadLength > BigInt(Number.MAX_SAFE_INTEGER) || `${payloadLength}` !== expected.bytes) {
      throw new Error(`readiness ${expected.key} framed byte count changed`);
    }
    const payloadEnd = cursor + Number(payloadLength);
    if (payloadEnd > bundle.byteLength) throw new Error(`readiness ${expected.key} payload is truncated`);
    const payload = bundle.subarray(cursor, payloadEnd);
    cursor = payloadEnd;
    if (sha256Digest(payload) !== expected.digest) throw new Error(`readiness ${expected.key} framed digest changed`);
    payloads.set(expected.key, payload);
  }
  if (cursor !== bundle.byteLength) throw new Error("readiness evidence bundle has trailing or additional frames");
  return payloads;
};

const validateRootManifest = ({ manifest, contract, contractIdentity, expectedSourceSha, validationTime }) => {
  const { policy } = readinessPolicy(contract);
  const value = exactKeys(
    manifest,
    [
      "schema",
      "sourceSha",
      "observedAt",
      "externalEvidencePolicy",
      "externalEvidence",
      "contract",
      "toolchain",
      "directObservation",
      "candidate",
      "evidence",
      "bundle",
    ],
    "release-readiness manifest",
  );
  if (
    value.schema !== policy.protocol
    || fullSha(value.sourceSha, "readiness sourceSha") !== expectedSourceSha
    || value.externalEvidencePolicy !== policy.externalEvidencePolicy
    || canonicalJson(exactKeys(
      value.externalEvidence,
      ["validation", "producerAuthentication", "authenticationRequiredRoles"],
      "readiness external evidence manifest",
    )) !== canonicalJson(policy.externalEvidenceManifest)
    || canonicalJson(exactKeys(value.contract, ["schema", "digest"], "readiness contract"))
      !== canonicalJson(contractIdentity)
    || canonicalJson(exactKeys(value.toolchain, ["bun", "node", "npm"], "readiness toolchain"))
      !== canonicalJson(expectedToolchain(contract))
  ) throw new Error("readiness root protocol, source, contract, or toolchain changed");
  const observedAt = canonicalTimestamp(value.observedAt, "readiness observedAt");
  const validationAt = canonicalTimestamp(validationTime, "readiness validationTime");
  if (
    !Number.isSafeInteger(policy.clockSkewSeconds)
    || policy.clockSkewSeconds < 0
    || !Number.isSafeInteger(policy.aggregateMaximumAgeSeconds)
    || policy.aggregateMaximumAgeSeconds <= 0
    || validationAt + policy.clockSkewSeconds * 1_000 < observedAt
    || validationAt - observedAt > policy.aggregateMaximumAgeSeconds * 1_000
  ) throw new Error("readiness aggregate observation is future or stale at validation");
  if (!Array.isArray(value.evidence) || value.evidence.length !== policy.evidenceRoles.length) {
    throw new Error("readiness evidence count changed");
  }
  const bundle = exactKeys(value.bundle, ["protocol", "framing", "bytes", "digest"], "readiness bundle");
  if (bundle.protocol !== policy.bundleProtocol || bundle.framing !== policy.bundleFraming) {
    throw new Error("readiness bundle protocol or framing changed");
  }
  positiveDecimal(bundle.bytes, "readiness bundle.bytes");
  canonicalDigest(bundle.digest, contract, "readiness bundle.digest");
  validateReadinessDirectObservation({
    contract,
    sourceSha: expectedSourceSha,
    observedAt: value.observedAt,
    observation: value.directObservation,
  });
  return { bundle, observedAt, validationAt, value };
};

const validateAllowedReadinessAggregate = async ({
  contract,
  contractBytes,
  expectedSourceSha,
  validationTime,
  files,
  manifestBytes,
  bundleBytes,
  trustedRootBytes,
  artifactFiles,
  artifactExtractor,
}) => {
  const { policy } = readinessPolicy(contract);
  fullSha(expectedSourceSha, "expected readiness source SHA");
  if (JSON.stringify(files) !== JSON.stringify(policy.orderedFiles)) {
    throw new Error("readiness aggregate must contain exactly its three ordered files");
  }
  validateTrustedRootBytes({
    trustedRootBytes,
    verifier: policy.externalEvidenceAuthentication.verifier,
  });
  const contractIdentity = semanticContractIdentity(contract, contractBytes);
  const manifest = decodeCanonicalJson(manifestBytes, "release-readiness manifest bytes");
  const root = validateRootManifest({
    manifest,
    contract,
    contractIdentity,
    expectedSourceSha,
    validationTime,
  });
  const descriptors = [
    candidateDescriptor(root.value.candidate),
    ...root.value.evidence.map(evidenceDescriptor),
  ];
  const payloads = decodeBundle(bundleBytes, policy, descriptors);
  if (
    positiveDecimal(root.bundle.bytes, "readiness bundle.bytes") !== `${bundleBytes.byteLength}`
    || root.bundle.digest !== sha256Digest(bundleBytes)
  ) throw new Error("readiness bundle byte identity changed");
  const candidate = validateCandidateReference({
    reference: root.value.candidate,
    payload: payloads.get("candidate"),
    contract,
    sourceSha: expectedSourceSha,
    aggregateObservedAt: root.observedAt,
    validationTime: root.validationAt,
    contractIdentity,
  });
  if (canonicalJson(root.value.toolchain) !== canonicalJson(candidate.candidate.toolchain)) {
    throw new Error("readiness and candidate toolchain bindings differ");
  }
  const authenticatedExternalReceipts = new Map();
  const authenticatedExternalProducers = new Map();
  for (let index = 0; index < policy.evidenceRoles.length; index += 1) {
    const definition = policy.evidenceRoles[index];
    const payload = payloads.get(definition.role);
    const filesForRole = artifactFiles?.get(definition.role)
      ?? (definition.type === "githubArtifact" && typeof artifactExtractor === "function"
        ? artifactExtractor({ contract, definition, payload })
        : undefined);
    const result = await validateEvidenceReference({
      definition,
      reference: root.value.evidence[index],
      payload,
      contract,
      sourceSha: expectedSourceSha,
      aggregateObservedAt: root.observedAt,
      validationTime: root.validationAt,
      candidateCoordinate: candidate.coordinate,
      candidateManifestDigest: candidate.reference.manifestDigest,
      contractDigest: contractIdentity.digest,
      artifactFiles: filesForRole,
    });
    if (result.authenticatedReceipt !== undefined) {
      authenticatedExternalReceipts.set(definition.role, result.authenticatedReceipt);
    }
    if (result.producerAuthentication !== undefined) {
      authenticatedExternalProducers.set(definition.role, result.producerAuthentication);
    }
  }
  return { authenticatedExternalProducers, authenticatedExternalReceipts, manifest };
};

export const validateReadinessAggregate = (arguments_) => {
  assertReadinessArtifactAllowed(arguments_?.contract);
  return validateAllowedReadinessAggregate(arguments_).then(({ manifest }) => manifest);
};

export const validateReadinessAggregateWithEvidence = (arguments_) => {
  assertReadinessArtifactAllowed(arguments_?.contract);
  return validateAllowedReadinessAggregate(arguments_);
};

const buildAllowedReadinessAggregate = async ({
  contract,
  contractBytes,
  sourceSha,
  observedAt,
  directObservation,
  candidate,
  candidateBytes,
  evidence,
  evidenceBytes,
  trustedRootBytes,
  artifactFiles,
}) => {
  const { policy } = readinessPolicy(contract);
  fullSha(sourceSha, "readiness source SHA");
  const aggregateObservedAt = canonicalTimestamp(observedAt, "readiness observedAt");
  if (!(evidenceBytes instanceof Map)) throw new Error("readiness evidence bytes must be a role-keyed Map");
  if (!Array.isArray(evidence) || evidence.length !== policy.evidenceRoles.length) {
    throw new Error("readiness requires exactly seven ordered evidence references");
  }
  const contractIdentity = semanticContractIdentity(contract, contractBytes);
  const candidateResult = validateCandidateReference({
    reference: candidate,
    payload: candidateBytes,
    contract,
    sourceSha,
    aggregateObservedAt,
    validationTime: aggregateObservedAt,
    contractIdentity,
  });
  const normalizedEvidence = [];
  const normalizedEvidenceBytes = new Map();
  if (
    evidenceBytes.size !== policy.evidenceRoles.length
    || evidence.some((reference, index) => reference?.role !== policy.evidenceRoles[index].role)
  ) throw new Error("readiness evidence roles are missing, additional, duplicated, or out of order");
  for (let index = 0; index < policy.evidenceRoles.length; index += 1) {
    const definition = policy.evidenceRoles[index];
    if (!evidenceBytes.has(definition.role)) throw new Error(`readiness evidence bytes missing ${definition.role}`);
    const result = await validateEvidenceReference({
      definition,
      reference: evidence[index],
      payload: evidenceBytes.get(definition.role),
      contract,
      sourceSha,
      aggregateObservedAt,
      validationTime: aggregateObservedAt,
      candidateCoordinate: candidateResult.coordinate,
      candidateManifestDigest: candidateResult.reference.manifestDigest,
      contractDigest: contractIdentity.digest,
      artifactFiles: artifactFiles?.get(definition.role),
    });
    normalizedEvidence.push(result.reference);
    normalizedEvidenceBytes.set(definition.role, result.payload);
  }
  const bundleBytes = encodeBundle(
    policy,
    candidateResult.reference,
    candidateResult.payload,
    normalizedEvidence,
    normalizedEvidenceBytes,
  );
  const manifest = {
    schema: policy.protocol,
    sourceSha,
    observedAt,
    externalEvidencePolicy: policy.externalEvidencePolicy,
    externalEvidence: policy.externalEvidenceManifest,
    contract: contractIdentity,
    toolchain: candidateResult.candidate.toolchain,
    directObservation: validateReadinessDirectObservation({
      contract,
      sourceSha,
      observedAt,
      observation: directObservation,
    }),
    candidate: candidateResult.reference,
    evidence: normalizedEvidence,
    bundle: {
      protocol: policy.bundleProtocol,
      framing: policy.bundleFraming,
      bytes: `${bundleBytes.byteLength}`,
      digest: sha256Digest(bundleBytes),
    },
  };
  const manifestBytes = Buffer.from(canonicalJson(manifest));
  await validateAllowedReadinessAggregate({
    contract,
    contractBytes,
    expectedSourceSha: sourceSha,
    validationTime: observedAt,
    files: policy.orderedFiles,
    manifestBytes,
    bundleBytes,
    trustedRootBytes,
    artifactFiles,
  });
  return { bundleBytes, manifest, manifestBytes };
};

export const buildReadinessAggregate = (arguments_) => {
  assertReadinessArtifactAllowed(arguments_?.contract);
  return buildAllowedReadinessAggregate(arguments_);
};
