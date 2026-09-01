import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

export const isRecord = (value) =>
  value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export const appleEvidenceFileName = (id) => {
  if (
    typeof id !== "string"
    || id.length === 0
    || id.normalize("NFC") !== id
    || !/^[\x21-\x7e]+$/u.test(id)
    || id.includes("/")
    || id.includes("\\")
  ) throw new Error("generated Apple evidence descriptor is not portable canonical text");
  const encoded = Buffer.from(id, "utf8").toString("hex");
  const name = `eb-${encoded}.evidence`;
  if (!/^eb-[a-f0-9]+\.evidence$/u.test(name) || name.length > 255) {
    throw new Error("generated Apple evidence descriptor has no bounded portable filename");
  }
  return name;
};

export const exactKeys = (value, expected, label) => {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (!sameJson(actual, canonical)) throw new Error(`${label} has missing or additional fields`);
  return value;
};

const canonicalize = (value, path, ancestors) => {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value !== value.normalize("NFC")) throw new Error(`${path} is not NFC text`);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
      throw new Error(`${path} is not a canonical safe integer`);
    }
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
      Object.keys(value).sort().map((key) => {
        if (key !== key.normalize("NFC")) throw new Error(`${path} has a non-NFC key`);
        return [key, canonicalize(value[key], `${path}.${key}`, ancestors)];
      }),
    );
  } finally {
    ancestors.delete(value);
  }
};

export const canonicalJson = (value) => `${JSON.stringify(canonicalize(value, "$", new Set()))}\n`;

export const canonicalBytes = (value) => Buffer.from(canonicalJson(value), "utf8");

export const bytes = (value, label) => {
  if (typeof value === "string") return Buffer.from(value, "utf8");
  if (value instanceof Uint8Array) return Buffer.from(value);
  throw new Error(`${label} must be text or bytes`);
};

export const decodeCanonicalJson = (value, label) => {
  const input = bytes(value, label);
  let text;
  let decoded;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(input);
    decoded = JSON.parse(text);
  } catch {
    throw new Error(`${label} must be canonical UTF-8 JSON`);
  }
  if (!input.equals(canonicalBytes(decoded))) throw new Error(`${label} is not canonical JSON`);
  return decoded;
};

export const sha256Digest = (value) =>
  `sha256:${createHash("sha256").update(bytes(value, "SHA-256 input")).digest("hex")}`;

export const nonEmptyText = (value, label) => {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.includes("\0")
    || value !== value.normalize("NFC")
  ) throw new Error(`${label} must be non-empty NFC text without NUL`);
  return value;
};

export const canonicalNonNegativeDecimal = (value, label) => {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new Error(`${label} must be a canonical nonnegative decimal string`);
  }
  return value;
};

export const canonicalDigest = (value, contract, label) => {
  const pattern = contract.releaseCertification?.githubArtifactDigest?.canonicalPattern;
  if (typeof pattern !== "string" || typeof value !== "string" || !new RegExp(pattern, "u").test(value)) {
    throw new Error(`${label} must be canonical sha256:<64 lowercase hex>`);
  }
  return value;
};

export const fullSourceSha = (value, label) => {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/u.test(value)) {
    throw new Error(`${label} must be one full lowercase source SHA`);
  }
  return value;
};

export const canonicalTimestamp = (value, label) => {
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

const requireStringArray = (value, label) => {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${label} must be an array of strings`);
  }
  if (new Set(value).size !== value.length) throw new Error(`${label} contains duplicates`);
  return value;
};

const requirePolicyRecord = (value, fields, label) => exactKeys(value, fields, label);

const hostedReceiptRunnerSelectors = [
  ["N-native", "macos-aarch64"],
  ["N-native", "macos-x64"],
  ["P-signed-app", "macos-aarch64"],
  ["P-signed-app", "macos-x64"],
  ["P-notarized-product", "macos-aarch64"],
  ["P-notarized-product", "macos-x64"],
  ["G-clean-host", "macos-aarch64"],
  ["G-clean-host", "macos-x64"],
  ["A-verdict", null],
];

const hostedCredentialLayer = {
  type: "keychain-profile-app-store-connect-api-key",
  environment: "apple-certification",
  secretNames: [
    "APPLE_DEVELOPER_ID_APPLICATION_P12_BASE64",
    "APPLE_DEVELOPER_ID_APPLICATION_P12_PASSWORD",
    "APPLE_DEVELOPER_ID_INSTALLER_P12_BASE64",
    "APPLE_DEVELOPER_ID_INSTALLER_P12_PASSWORD",
    "APPLE_NOTARY_API_PRIVATE_KEY_BASE64",
    "APPLE_NOTARY_API_KEY_ID",
    "APPLE_NOTARY_API_ISSUER_ID",
  ],
};

const hostedEnvironmentGovernance = {
  repository: "mannyc2/effect-build",
  repositoryId: "1331906770",
  repositoryOwnerId: "126291407",
  environmentId: "20977544910",
  name: "apple-certification",
  canAdminsBypass: true,
  reviewer: {
    id: 126291407,
    login: "mannyc2",
    type: "User",
    preventSelfReview: false,
  },
  branchPolicy: {
    name: "main",
    type: "branch",
    deploymentBranchPolicy: {
      customBranchPolicies: true,
      protectedBranches: false,
    },
    exactProtectionRuleTypes: ["branch_policy", "required_reviewers"],
    branchPolicies: [{ name: "main", type: "branch" }],
  },
  variableNames: [],
  oidcSubjectPolicy: {
    use_default: true,
    use_immutable_subject: true,
    sub_claim_prefix: "repo:mannyc2@126291407/effect-build@1331906770",
  },
};

const requireNull = (value, label) => {
  if (value !== null) throw new Error(`${label} must remain an explicit null while Apple hosting is blocked`);
};

const requirePositiveInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer`);
  return value;
};

const validateHostedBundleIdentity = (input, expectedProtocol, contract, configured, label) => {
  const value = requirePolicyRecord(
    input,
    ["status", "bundleProtocol", "sourceSha", "bundleDigest"],
    label,
  );
  if (value.bundleProtocol !== expectedProtocol) throw new Error(`${label} protocol changed`);
  if (!configured) {
    if (value.status !== "unconfigured") throw new Error(`${label} must remain unconfigured while blocked`);
    requireNull(value.sourceSha, `${label}.sourceSha`);
    requireNull(value.bundleDigest, `${label}.bundleDigest`);
    return value;
  }
  if (value.status !== "configured") throw new Error(`${label} is not configured`);
  fullSourceSha(value.sourceSha, `${label}.sourceSha`);
  canonicalDigest(value.bundleDigest, contract, `${label}.bundleDigest`);
  return value;
};

const validateHostedActivationInterfaces = (input, contract, policy, configured) => {
  const value = requirePolicyRecord(
    input,
    [
      "protocol",
      "status",
      "producer",
      "verifier",
      "certificates",
      "environment",
      "credentialLayer",
      "journal",
      "aws",
      "runners",
      "continuation",
    ],
    "Apple hosted activation interfaces",
  );
  if (
    value.protocol !== "effect-build/apple-hosted-activation-interfaces@1"
    || value.status !== (configured ? "configured" : "unconfigured")
  ) throw new Error("Apple hosted activation-interface status changed");

  const producer = validateHostedBundleIdentity(
    value.producer,
    "effect-build/apple-producer-bundle@1",
    contract,
    configured,
    "Apple hosted producer",
  );
  const verifier = validateHostedBundleIdentity(
    value.verifier,
    "effect-build/apple-clean-host-verifier-bundle@1",
    contract,
    configured,
    "Apple hosted verifier",
  );
  if (configured && producer.bundleDigest === verifier.bundleDigest) {
    throw new Error("Apple hosted producer and verifier bundles must be distinct");
  }

  const certificates = requirePolicyRecord(
    value.certificates,
    ["status", "teamId", "applicationSha1", "installerSha1"],
    "Apple hosted certificate identities",
  );
  if (!configured) {
    if (certificates.status !== "unconfigured") {
      throw new Error("Apple hosted certificate identities must remain unconfigured while blocked");
    }
    for (const field of ["teamId", "applicationSha1", "installerSha1"]) {
      requireNull(certificates[field], `Apple hosted certificate identities.${field}`);
    }
  } else {
    if (certificates.status !== "configured" || !/^[A-Z0-9]{10}$/u.test(certificates.teamId)) {
      throw new Error("Apple hosted certificate Team ID is not configured");
    }
    for (const field of ["applicationSha1", "installerSha1"]) {
      if (!/^[0-9a-f]{40}$/u.test(certificates[field])) {
        throw new Error(`Apple hosted certificate identities.${field} is not one lowercase SHA-1`);
      }
    }
    if (certificates.applicationSha1 === certificates.installerSha1) {
      throw new Error("Apple hosted Application and Installer certificates must be distinct");
    }
  }

  const environment = requirePolicyRecord(
    value.environment,
    [
      "status",
      "authorityScope",
      "repository",
      "repositoryId",
      "repositoryOwnerId",
      "environmentId",
      "name",
      "canAdminsBypass",
      "reviewer",
      "branchPolicy",
      "secretNames",
      "variableNames",
      "oidcSubjectPolicy",
    ],
    "Apple hosted environment",
  );
  requireStringArray(environment.secretNames, "Apple hosted environment secret names");
  requireStringArray(environment.variableNames, "Apple hosted environment variable names");
  const { variableNames, oidcSubjectPolicy, ...environmentIdentity } = hostedEnvironmentGovernance;
  const expectedEnvironment = {
    status: configured ? "configured" : "provisioned-policy-only",
    authorityScope: configured
      ? "environment-and-credential-name-policy-not-runner-qualification"
      : "environment-policy-only-not-credential-or-runner-qualification",
    ...environmentIdentity,
    secretNames: configured ? hostedCredentialLayer.secretNames : [],
    variableNames,
    oidcSubjectPolicy,
  };
  if (!sameJson(environment, expectedEnvironment)) {
    throw new Error("Apple hosted environment governance or name inventory changed");
  }

  const credentialLayer = requirePolicyRecord(
    value.credentialLayer,
    ["status", "type", "environment", "secretNames"],
    "Apple hosted credential layer",
  );
  if (credentialLayer.environment !== "apple-certification") {
    throw new Error("Apple hosted credential layer environment changed");
  }
  requireStringArray(credentialLayer.secretNames, "Apple hosted credential-layer secret names");
  if (!configured) {
    if (credentialLayer.status !== "unconfigured" || credentialLayer.secretNames.length !== 0) {
      throw new Error("Apple hosted credential layer must remain unconfigured while blocked");
    }
    requireNull(credentialLayer.type, "Apple hosted credential layer.type");
  } else if (
    credentialLayer.status !== "configured"
    || !sameJson(
      {
        type: credentialLayer.type,
        environment: credentialLayer.environment,
        secretNames: credentialLayer.secretNames,
      },
      hostedCredentialLayer,
    )
  ) {
    throw new Error("Apple hosted credential layer is not configured");
  }

  const journal = requirePolicyRecord(
    value.journal,
    [
      "status",
      "packageName",
      "packageVersion",
      "sourceSha",
      "reusableWorkflowRef",
      "reusableWorkflowSha",
      "codecId",
    ],
    "Apple hosted journal",
  );
  if (journal.packageName !== "@mannyc1/ts-release") throw new Error("Apple hosted journal owner changed");
  if (!configured) {
    if (journal.status !== "unconfigured") throw new Error("Apple hosted journal must remain unconfigured while blocked");
    for (const field of ["packageVersion", "sourceSha", "reusableWorkflowRef", "reusableWorkflowSha", "codecId"]) {
      requireNull(journal[field], `Apple hosted journal.${field}`);
    }
  } else {
    if (journal.status !== "configured") throw new Error("Apple hosted journal is not configured");
    nonEmptyText(journal.packageVersion, "Apple hosted journal.packageVersion");
    fullSourceSha(journal.sourceSha, "Apple hosted journal.sourceSha");
    if (
      journal.reusableWorkflowRef
        !== "mannyc2/ts-release/.github/workflows/operational-journal.yml@refs/heads/main"
    ) throw new Error("Apple hosted journal reusable workflow ref changed");
    fullSourceSha(journal.reusableWorkflowSha, "Apple hosted journal.reusableWorkflowSha");
    if (journal.codecId !== policy.notaryJournal.submissionCodec) {
      throw new Error("Apple hosted journal codec does not match the Apple-owned codec");
    }
  }

  const aws = requirePolicyRecord(
    value.aws,
    [
      "status",
      "accountId",
      "bucketArn",
      "region",
      "roleArn",
      "prefix",
      "retentionPolicyDigest",
      "iamPolicyDigest",
      "bucketPolicyDigest",
      "oidcTrustPolicyDigest",
      "oidcJobWorkflowRef",
      "oidcJobWorkflowSha",
    ],
    "Apple hosted AWS journal authority",
  );
  if (aws.prefix !== "operation-journal/v1") throw new Error("Apple hosted journal namespace changed");
  if (!configured) {
    if (aws.status !== "unconfigured") {
      throw new Error("Apple hosted AWS journal authority must remain unconfigured while blocked");
    }
    for (const field of [
      "accountId",
      "bucketArn",
      "region",
      "roleArn",
      "retentionPolicyDigest",
      "iamPolicyDigest",
      "bucketPolicyDigest",
      "oidcTrustPolicyDigest",
      "oidcJobWorkflowRef",
      "oidcJobWorkflowSha",
    ]) requireNull(aws[field], `Apple hosted AWS journal authority.${field}`);
  } else {
    if (aws.status !== "configured" || !/^[0-9]{12}$/u.test(aws.accountId)) {
      throw new Error("Apple hosted AWS journal authority account is not configured");
    }
    if (typeof aws.bucketArn !== "string" || !/^arn:aws:s3:::[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u.test(aws.bucketArn)) {
      throw new Error("Apple hosted AWS journal authority bucket ARN is invalid");
    }
    if (typeof aws.region !== "string" || !/^[a-z]{2}(?:-gov)?-[a-z]+-[1-9][0-9]*$/u.test(aws.region)) {
      throw new Error("Apple hosted AWS journal authority region is invalid");
    }
    if (
      typeof aws.roleArn !== "string"
      || !new RegExp(`^arn:aws:iam::${aws.accountId}:role/[A-Za-z0-9+=,.@_/-]+$`, "u").test(aws.roleArn)
    ) throw new Error("Apple hosted AWS journal authority role ARN is invalid");
    canonicalDigest(aws.retentionPolicyDigest, contract, "Apple hosted AWS retention policy digest");
    canonicalDigest(aws.iamPolicyDigest, contract, "Apple hosted AWS IAM policy digest");
    canonicalDigest(aws.bucketPolicyDigest, contract, "Apple hosted AWS bucket policy digest");
    canonicalDigest(aws.oidcTrustPolicyDigest, contract, "Apple hosted AWS OIDC trust policy digest");
    if (
      new Set([
        aws.retentionPolicyDigest,
        aws.iamPolicyDigest,
        aws.bucketPolicyDigest,
        aws.oidcTrustPolicyDigest,
      ]).size !== 4
    ) throw new Error("Apple hosted AWS governance evidence digests must be distinct");
    if (aws.oidcJobWorkflowRef !== journal.reusableWorkflowRef) {
      throw new Error("Apple hosted AWS OIDC job_workflow_ref does not bind the journal workflow");
    }
    if (aws.oidcJobWorkflowSha !== journal.reusableWorkflowSha) {
      throw new Error("Apple hosted AWS OIDC job_workflow_sha does not bind the journal workflow SHA");
    }
  }

  const runners = requirePolicyRecord(value.runners, ["status", "receiptPins"], "Apple hosted runners");
  if (!Array.isArray(runners.receiptPins) || runners.receiptPins.length !== hostedReceiptRunnerSelectors.length) {
    throw new Error("Apple hosted runner pins do not cover the exact receipt selectors");
  }
  for (const [index, pin] of runners.receiptPins.entries()) {
    const selected = requirePolicyRecord(
      pin,
      [
        "category",
        "coordinateArchitecture",
        "status",
        "runnerLabel",
        "platform",
        "architecture",
        "image",
        "runnerEnvironment",
      ],
      `Apple hosted runner pin ${index}`,
    );
    const [category, architecture] = hostedReceiptRunnerSelectors[index];
    if (selected.category !== category || selected.coordinateArchitecture !== architecture) {
      throw new Error("Apple hosted runner selector order changed");
    }
    if (!configured) {
      if (selected.status !== "unqualified") throw new Error("Apple hosted runner pin must remain unqualified");
      for (const field of ["runnerLabel", "platform", "architecture", "image", "runnerEnvironment"]) {
        requireNull(selected[field], `Apple hosted runner pin ${index}.${field}`);
      }
    } else {
      if (selected.status !== "qualified") throw new Error("Apple hosted runner pin is not qualified");
      for (const field of ["runnerLabel", "platform", "architecture", "image", "runnerEnvironment"]) {
        nonEmptyText(selected[field], `Apple hosted runner pin ${index}.${field}`);
      }
      const expectedPlatform = category === "A-verdict" ? "linux" : "macos";
      const expectedArchitecture = architecture ?? "linux-x64";
      if (
        selected.platform !== expectedPlatform
        || selected.architecture !== expectedArchitecture
        || selected.runnerEnvironment !== "github-hosted"
      ) {
        throw new Error("Apple hosted runner pin has an unsupported platform or runner environment");
      }
    }
  }
  if (runners.status !== (configured ? "qualified" : "unqualified")) {
    throw new Error("Apple hosted runner qualification status changed");
  }

  const continuation = requirePolicyRecord(
    value.continuation,
    ["status", "initialDelaySeconds", "pollIntervalSeconds", "maximumPolls", "maximumElapsedSeconds"],
    "Apple hosted continuation policy",
  );
  if (!configured) {
    if (continuation.status !== "unconfigured") {
      throw new Error("Apple hosted continuation policy must remain unconfigured while blocked");
    }
    for (const field of ["initialDelaySeconds", "pollIntervalSeconds", "maximumPolls", "maximumElapsedSeconds"]) {
      requireNull(continuation[field], `Apple hosted continuation policy.${field}`);
    }
  } else {
    if (continuation.status !== "configured") throw new Error("Apple hosted continuation policy is not configured");
    for (const field of ["initialDelaySeconds", "pollIntervalSeconds", "maximumPolls", "maximumElapsedSeconds"]) {
      requirePositiveInteger(continuation[field], `Apple hosted continuation policy.${field}`);
    }
    const minimumElapsed = continuation.initialDelaySeconds
      + continuation.pollIntervalSeconds * (continuation.maximumPolls - 1);
    if (continuation.maximumElapsedSeconds < minimumElapsed) {
      throw new Error("Apple hosted continuation elapsed bound cannot contain its polling schedule");
    }
  }
  return value;
};

const validateHostedExecution = (input, contract, policy) => {
  const value = requirePolicyRecord(
    input,
    ["protocol", "status", "blockerIds", "artifactDisposition", "protectedStageIds", "activationInterfaces"],
    "Apple hosted execution",
  );
  if (value.protocol !== "effect-build/apple-hosted-execution@1") {
    throw new Error("Apple hosted execution protocol changed");
  }
  requireStringArray(value.blockerIds, "Apple hosted-execution blocker IDs");
  requireStringArray(value.protectedStageIds, "Apple hosted protected-stage IDs");
  if (!sameJson(value.protectedStageIds, ["sign-app", "submit-product", "continue-notary"])) {
    throw new Error("Apple hosted protected-stage allowlist changed");
  }
  const configured = value.status === "supported";
  if (
    !configured
    && value.status !== "blocked"
  ) throw new Error("Apple hosted execution status is unsupported");
  if (
    configured
      ? value.blockerIds.length !== 0 || value.artifactDisposition !== "required-on-terminal-success"
      : value.blockerIds.length === 0 || value.artifactDisposition !== "forbidden-while-blocked"
  ) throw new Error("Apple hosted execution status and artifact disposition disagree");
  validateHostedActivationInterfaces(value.activationInterfaces, contract, policy, configured);
  return value;
};

export const appleCertificationPolicy = (contract) => {
  if (!isRecord(contract) || contract.schema !== "effect-build/combined-contract@1") {
    throw new Error("Apple certification requires the generated combined contract");
  }
  const release = contract.releaseCertification;
  const policy = release?.apple;
  if (!isRecord(release) || !isRecord(policy)) {
    throw new Error("combined contract has no generated Apple certification policy");
  }
  const { artifact, encoding, scalarFormats } = policy;
  if (
    !isRecord(artifact)
    || artifact.attempt !== 1
    || !Array.isArray(artifact.orderedFiles)
    || artifact.orderedFiles.length !== 2
    || !isRecord(encoding)
    || encoding.canonicalJson
      !== "utf8-nfc-recursive-lexicographic-keys-no-insignificant-whitespace-final-lf"
    || encoding.bundleFraming !== "protocol-line-u32be-canonical-header-u64be-opaque-payload"
    || encoding.offsetAndByteEncoding !== "canonical-nonnegative-decimal-string"
    || encoding.payloadLayout !== "ordered-contiguous-zero-based-no-gaps-no-trailing-bytes"
    || !isRecord(scalarFormats)
    || scalarFormats.digest !== "releaseCertification.githubArtifactDigest"
  ) throw new Error("generated Apple encoding or artifact policy is unsupported");

  validateHostedExecution(policy.hostedExecution, contract, policy);

  for (const [name, fields] of Object.entries(policy.receiptSchemas ?? {})) {
    requireStringArray(fields, `Apple receipt schema ${name}`);
  }
  for (const fields of [
    policy.commonReceiptFields,
    policy.coordinateRuleFields,
    encoding.bundleHeaderFields,
    encoding.evidenceEntryFields,
    encoding.indexFields,
  ]) requireStringArray(fields, "generated Apple field list");

  const coordinates = requireStringArray(policy.coordinates, "Apple coordinates");
  const coordinateRules = policy.coordinateRules;
  if (
    coordinates.length !== 28
    || !isRecord(policy.counts)
    || !sameJson(policy.counts, { total: 28, N: 2, P: 10, G: 6, A: 10 })
    || !Array.isArray(coordinateRules)
    || coordinateRules.length !== coordinates.length
  ) throw new Error("Apple policy must contain exactly N=2, P=10, G=6, A=10 coordinates");
  for (const [index, rule] of coordinateRules.entries()) {
    const value = requirePolicyRecord(rule, policy.coordinateRuleFields, `Apple coordinate rule ${index}`);
    if (value.coordinate !== coordinates[index]) throw new Error("Apple coordinate rule order changed");
    requireStringArray(value.dependencies, `${value.coordinate} dependencies`);
    requireStringArray(value.operationIds, `${value.coordinate} operation IDs`);
    if (!isRecord(value.fieldValues)) throw new Error(`${value.coordinate} field values must be closed data`);
  }

  const a7 = coordinateRules.find(({ coordinate }) => coordinate === "A7");
  const subordinateEvidence = a7?.fieldValues?.subordinateEvidence;
  const evidenceOrder = requireStringArray(policy.evidenceDescriptorOrder, "Apple evidence descriptor order");
  const evidenceFileOrder = policy.evidenceFileOrder;
  if (
    !Array.isArray(subordinateEvidence)
    || !sameJson(evidenceOrder, [...coordinates, ...subordinateEvidence])
    || !Array.isArray(evidenceFileOrder)
    || evidenceFileOrder.length !== evidenceOrder.length
    || !evidenceFileOrder.every((entry, index) => {
      if (!isRecord(entry) || !sameJson(Object.keys(entry).sort(), ["file", "id"])) return false;
      const id = evidenceOrder[index];
      return entry.id === id && entry.file === appleEvidenceFileName(id);
    })
    || new Set(evidenceFileOrder.map(({ file }) => file.toLowerCase())).size !== evidenceFileOrder.length
  ) throw new Error("Apple evidence descriptor order is not the exact receipts plus A7 evidence");

  const appleCapabilities = contract.producerCapabilityRegister?.capabilities?.filter(
    (entry) => entry.family === "apple" && entry.visibility === "public",
  );
  const toolLineage = requirePolicyRecord(
    policy.operationToolLineage,
    ["order", "componentFields", "byOperationId"],
    "Apple operation tool lineage",
  );
  const componentFields = requireStringArray(toolLineage.componentFields, "Apple tool-lineage component fields");
  if (
    toolLineage.order !== "first-executed-distinct-tool"
    || !sameJson(componentFields, ["name", "capabilityId"])
    || !isRecord(toolLineage.byOperationId)
    || !sameJson(Object.keys(toolLineage.byOperationId), appleCapabilities?.map(({ id }) => id))
  ) throw new Error("Apple operation tool lineage does not cover the exact public operation order");
  for (const [operationId, products] of Object.entries(toolLineage.byOperationId)) {
    if (!isRecord(products) || Object.keys(products).length === 0) {
      throw new Error(`${operationId} has no Apple product tool lineage`);
    }
    for (const [product, components] of Object.entries(products)) {
      if (!["app", "dmg", "pkg"].includes(product) || !Array.isArray(components) || components.length === 0) {
        throw new Error(`${operationId}/${product} has no exact Apple tool lineage`);
      }
      const names = [];
      for (const [index, input] of components.entries()) {
        const component = requirePolicyRecord(
          input,
          componentFields,
          `${operationId}/${product} tool ${index}`,
        );
        names.push(nonEmptyText(component.name, `${operationId}/${product} tool ${index} name`));
        nonEmptyText(component.capabilityId, `${operationId}/${product} tool ${index} capability`);
      }
      if (new Set(names).size !== names.length) throw new Error(`${operationId}/${product} repeats a tool`);
    }
  }
  const covered = new Set(coordinateRules.flatMap(({ operationIds }) => operationIds));
  if (
    !Array.isArray(appleCapabilities)
    || appleCapabilities.length !== 13
    || appleCapabilities.some(({ id }) => !covered.has(id))
  ) throw new Error("Apple policy does not account for all thirteen public producer operations");

  if (
    !sameJson(policy.nativeOperationIds, ["CAN-BUN-012", "CAN-DENO-010"])
    || !sameJson(policy.pairArchitectureOrder, ["macos-aarch64", "macos-x64"])
    || policy.workflowPath !== ".github/workflows/apple-certification.yml"
    || policy.workflow !== "mannyc2/effect-build/.github/workflows/apple-certification.yml@refs/heads/main"
    || !isRecord(policy.providerVersions)
    || !isRecord(policy.notaryJournal)
    || !sameJson(policy.receiptSchemas.appleToolObservation, [
      "name",
      "version",
      "executableDigest",
      "observationDigest",
      "nativeObservation",
    ])
    || !sameJson(policy.receiptSchemas.assessment, [
      "product",
      "architecture",
      "accepted",
      "evidenceDigest",
      "toolObservations",
    ])
  ) throw new Error("Apple native, pair, provider, or journal canon changed");
  return { policy, release };
};

export const artifactCoordinate = (contract, input, label) => {
  const { release } = appleCertificationPolicy(contract);
  const coordinatePolicy = release.githubArtifactCoordinate;
  const coordinate = exactKeys(input, coordinatePolicy?.orderedFields ?? [], label);
  if (
    typeof coordinate.workflow !== "string"
    || !/^[^/\s]+\/[^/\s]+\/\.github\/workflows\/[^@\s]+@refs\/heads\/[^\s]+$/u.test(
      coordinate.workflow,
    )
  ) throw new Error(`${label}.workflow is not an exact repository workflow identity`);
  fullSourceSha(coordinate.sourceSha, `${label}.sourceSha`);
  for (const field of ["runId", "runAttempt", "artifactId"]) {
    if (typeof coordinate[field] !== "string" || !/^[1-9][0-9]*$/u.test(coordinate[field])) {
      throw new Error(`${label}.${field} must be a canonical positive decimal string`);
    }
  }
  canonicalDigest(coordinate.artifactDigest, contract, `${label}.artifactDigest`);
  return Object.fromEntries(coordinatePolicy.orderedFields.map((field) => [field, coordinate[field]]));
};

export const sameCanonical = (left, right) => canonicalJson(left) === canonicalJson(right);
