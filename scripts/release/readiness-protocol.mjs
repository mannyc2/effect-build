import { Buffer } from "node:buffer";
import { isDeepStrictEqual } from "node:util";

import {
  artifactCoordinate,
  canonicalJson,
  derivePublicModules,
  derivePublicPackageNames,
  sha256Digest,
} from "./protocol.mjs";

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
  const expectedRoles = [
    ["exact-main-ci", "githubRun"],
    ["fake-registry", "githubArtifact"],
    ["npm-oidc-certification", "githubArtifact"],
  ];
  if (
    !isRecord(release)
    || !isRecord(policy)
    || policy.protocol !== "effect-build/release-readiness@3"
    || policy.bundleProtocol !== "effect-build/release-readiness-evidence-bundle@3"
    || policy.bundleFraming !== "protocol-line-u32be-canonical-header-u64be-opaque-payload"
    || policy.event !== "workflow_dispatch"
    || !Array.isArray(policy.orderedFiles)
    || !Array.isArray(policy.evidenceRoles)
    || !isRecord(policy.referenceShapes)
    || !isRecord(policy.candidate)
  ) throw new Error("combined contract has no closed release-readiness policy");
  if (
    JSON.stringify(policy.orderedFiles) !== JSON.stringify([
      policy.manifest,
      policy.evidenceBundle,
    ])
    || policy.candidate.protocolSource !== "releaseCertification.candidate.protocol"
    || policy.candidate.referenceType !== "candidate"
    || policy.candidate.coordinate !== "required-exact"
    || policy.candidate.workflowSource !== "releaseCertification.candidate.workflow"
    || policy.candidate.artifactNameSource !== "releaseCertification.candidate.artifactName"
    || typeof policy.workflow !== "string"
    || policy.evidenceRoles.length !== expectedRoles.length
    || !isDeepStrictEqual(
      policy.evidenceRoles.map(({ role, type }) => [role, type]),
      expectedRoles,
    )
    || new Set(policy.evidenceRoles.map(({ role }) => role)).size !== policy.evidenceRoles.length
  ) throw new Error("release-readiness policy has ambiguous files, candidate, or evidence roles");
  return { policy, release };
};

export const assertReadinessArtifactAllowed = (contract) => {
  readinessPolicy(contract);
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
  const expectedDistTags = new Map(
    registry.publicationAdmission.target.expectedDistTagsBeforePublication.map((entry) => [entry.name, entry.tags]),
  );
  const placeholderLedger = new Map(registry.bootstrap.placeholderLedger.map((entry) => [entry.name, entry]));
  const reservedOnly = new Set(registry.reservation.packages);
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    const entry = exactKeys(npm.packages[index], policy.npmPackageFields, `readiness npm ${name}`);
    const repository = exactKeys(entry.repository, policy.repositoryFields, `readiness npm ${name} repository`);
    const ledger = placeholderLedger.get(name);
    const expectedTags = expectedDistTags.get(name)
      ?? (reservedOnly.has(name) ? ledger?.bootstrapTags : undefined);
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
      || expectedTags === undefined
      || canonicalJson(entry.distTags) !== canonicalJson(expectedTags)
      || Object.values(entry.distTags).some((version) => !entry.versions.includes(version))
      || canonicalJson(repository) !== canonicalJson(expectedPackageRepository(contract))
    ) throw new Error(`readiness direct npm public state changed for ${name}`);
    if (ledger === undefined) {
      if (
        entry.placeholder !== null
      ) {
        throw new Error(`readiness direct npm non-placeholder state changed for ${name}`);
      }
    } else {
      const placeholder = exactKeys(entry.placeholder, policy.placeholderFields, `readiness npm ${name} placeholder`);
      const expectedUrl = `${registry.registry}/${name}/-/${name}-${ledger.version}.tgz`;
      if (
        JSON.stringify(entry.versions) !== JSON.stringify([ledger.version])
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
    claimsObservedAt < jwt.nbf * 1_000
    || claimsObservedAt > jwt.exp * 1_000
    || npmObservedAt < claimsObservedAt
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
    || receipt.readinessProtocol !== release.readiness.protocol
    || policy.implementationStatus !== "implemented"
    || policy.status !== "supported"
    || policy.artifactDisposition !== "required-on-terminal-workflow-success"
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
  } else {
    throw new Error(`unsupported readiness reference type: ${definition.type}`);
  }
  return { authenticatedReceipt, payload: input, reference: value };
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
  artifactFiles,
  artifactExtractor,
}) => {
  const { policy } = readinessPolicy(contract);
  fullSha(expectedSourceSha, "expected readiness source SHA");
  if (JSON.stringify(files) !== JSON.stringify(policy.orderedFiles)) {
    throw new Error("readiness aggregate must contain exactly its two ordered files");
  }
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
  const authenticatedEvidence = new Map();
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
      authenticatedEvidence.set(definition.role, result.authenticatedReceipt);
    }
  }
  return { authenticatedEvidence, manifest };
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
  artifactFiles,
}) => {
  const { policy } = readinessPolicy(contract);
  fullSha(sourceSha, "readiness source SHA");
  const aggregateObservedAt = canonicalTimestamp(observedAt, "readiness observedAt");
  if (!(evidenceBytes instanceof Map)) throw new Error("readiness evidence bytes must be a role-keyed Map");
  if (!Array.isArray(evidence) || evidence.length !== policy.evidenceRoles.length) {
    throw new Error("readiness requires exactly three ordered evidence references");
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
    artifactFiles,
  });
  return { bundleBytes, manifest, manifestBytes };
};

export const buildReadinessAggregate = (arguments_) => {
  assertReadinessArtifactAllowed(arguments_?.contract);
  return buildAllowedReadinessAggregate(arguments_);
};
