import {
  appleCertificationPolicy,
  artifactCoordinate,
  canonicalDigest,
  canonicalNonNegativeDecimal,
  canonicalTimestamp,
  canonicalBytes,
  exactKeys,
  fullSourceSha,
  isRecord,
  nonEmptyText,
  sameCanonical,
  sha256Digest,
} from "./canonical.mjs";
import { verifyCompactToolObservation } from "./tool-observation.mjs";

const sameArray = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const requireArray = (value, label, { allowEmpty = false } = {}) => {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(`${label} must be ${allowEmpty ? "an" : "a non-empty"} array`);
  }
  return value;
};

const scalarArray = (value, label, { allowEmpty = false, digest = false } = {}, contract) => {
  const values = requireArray(value, label, { allowEmpty });
  for (const [index, entry] of values.entries()) {
    if (digest) canonicalDigest(entry, contract, `${label}[${index}]`);
    else nonEmptyText(entry, `${label}[${index}]`);
  }
  if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicates`);
  return values;
};

const schema = (value, name, policy, label) => {
  const fields = policy.receiptSchemas[name];
  if (!Array.isArray(fields)) throw new Error(`generated Apple schema is missing: ${name}`);
  return exactKeys(value, fields, label);
};

const artifactIdentityDigest = (identity) => identity.digest ?? identity.manifestDigest;

const validateToolObservation = (input, context, label) => {
  const { contract, policy } = context;
  const value = schema(input, "toolObservation", policy, label);
  nonEmptyText(value.name, `${label}.name`);
  nonEmptyText(value.version, `${label}.version`);
  canonicalDigest(value.executableDigest, contract, `${label}.executableDigest`);
  canonicalDigest(value.observationDigest, contract, `${label}.observationDigest`);
  return value;
};

const expectedAppleOperationTools = (context, rule, operationId, label) => {
  const byProduct = context.policy.operationToolLineage?.byOperationId?.[operationId];
  if (byProduct === undefined) return undefined;
  const expected = byProduct[rule.product];
  if (!Array.isArray(expected) || expected.length === 0) {
    throw new Error(`${label} has no exact ${rule.product} Apple tool lineage`);
  }
  return expected;
};

const validateAppleToolObservation = (input, context, expected, label) => {
  const { contract, policy } = context;
  const value = schema(input, "appleToolObservation", policy, label);
  const compact = {
    name: value.name,
    version: value.version,
    executableDigest: value.executableDigest,
    observationDigest: value.observationDigest,
  };
  verifyCompactToolObservation(
    compact,
    value.nativeObservation,
    expected.name,
    expected.capabilityId,
    label,
  );
  canonicalDigest(value.executableDigest, contract, `${label}.executableDigest`);
  canonicalDigest(value.observationDigest, contract, `${label}.observationDigest`);
  return value;
};

const validateExactAppleToolArray = (input, context, expected, label) => {
  const tools = requireArray(input, label);
  if (tools.length !== expected.length) throw new Error(`${label} does not contain its exact ordered Apple tools`);
  return tools.map((tool, index) =>
    validateAppleToolObservation(tool, context, expected[index], `${label}[${index}]`)
  );
};

const operationNames = (contract) => {
  const names = new Map();
  for (const operation of contract.providerOperationRegister?.operations ?? []) {
    if (operation.implementation?.export !== undefined) names.set(operation.operationId, operation.implementation.export);
  }
  for (const capability of contract.producerCapabilityRegister?.capabilities ?? []) {
    if (capability.exports?.length === 1) names.set(capability.id, capability.exports[0]);
  }
  return names;
};

const validateOperationFact = (input, context, rule, label) => {
  const { contract, policy } = context;
  const value = schema(input, "operationFact", policy, label);
  const expectedName = operationNames(contract).get(value.operationId);
  if (expectedName === undefined || value.operation !== expectedName) {
    throw new Error(`${label} operation ID and name do not match a generated register`);
  }
  scalarArray(value.inputDigests, `${label}.inputDigests`, { digest: true }, contract);
  scalarArray(value.outputDigests, `${label}.outputDigests`, { digest: true }, contract);
  const expectedAppleTools = expectedAppleOperationTools(context, rule, value.operationId, label);
  if (expectedAppleTools === undefined) {
    const tools = requireArray(value.toolObservations, `${label}.toolObservations`);
    for (const [index, tool] of tools.entries()) {
      validateToolObservation(tool, context, `${label}.toolObservations[${index}]`);
    }
  } else {
    validateExactAppleToolArray(value.toolObservations, context, expectedAppleTools, `${label}.toolObservations`);
  }
  return value;
};

const validateOperationFacts = (input, context, rule, label) => {
  const facts = requireArray(input, label);
  for (const [index, fact] of facts.entries()) validateOperationFact(fact, context, rule, `${label}[${index}]`);
  const ids = facts.map(({ operationId }) => operationId);
  if (new Set(ids).size !== ids.length) throw new Error(`${label} contains duplicate operation IDs`);
  return facts;
};

const validateArtifactIdentity = (input, context, identitySchema, product, architecture, label) => {
  const { contract, policy } = context;
  const value = schema(input, identitySchema, policy, label);
  if (value.product !== product || value.architecture !== architecture) {
    throw new Error(`${label} product or architecture changed`);
  }
  if (identitySchema === "treeArtifactIdentity") {
    canonicalNonNegativeDecimal(value.totalBytes, `${label}.totalBytes`);
    if (value.totalBytes === "0") throw new Error(`${label} must contain non-empty tree bytes`);
    canonicalDigest(value.manifestDigest, contract, `${label}.manifestDigest`);
  } else if (identitySchema === "fileArtifactIdentity") {
    canonicalNonNegativeDecimal(value.bytes, `${label}.bytes`);
    if (value.bytes === "0") throw new Error(`${label} must contain non-empty file bytes`);
    canonicalDigest(value.digest, contract, `${label}.digest`);
  } else {
    throw new Error(`${label} uses an unknown generated artifact identity schema`);
  }
  return value;
};

const validatePairMembers = (input, context, product, identitySchema, label) => {
  const { policy } = context;
  const members = requireArray(input, label);
  if (members.length !== policy.pairArchitectureOrder.length) throw new Error(`${label} is not one exact pair`);
  return members.map((inputMember, index) => {
    const member = schema(inputMember, "pairMember", policy, `${label}[${index}]`);
    const architecture = policy.pairArchitectureOrder[index];
    if (member.architecture !== architecture) throw new Error(`${label} architecture order changed`);
    validateArtifactIdentity(
      member.artifactIdentity,
      context,
      identitySchema,
      product,
      architecture,
      `${label}[${index}].artifactIdentity`,
    );
    return member;
  });
};

const validatePairDigest = (value, members, context, label) => {
  canonicalDigest(value, context.contract, label);
  if (value !== sha256Digest(canonicalBytes(members))) throw new Error(`${label} does not bind the exact pair members`);
};

const validatePairedAppManifest = (input, context, rule, label) => {
  const { policy } = context;
  const value = schema(input, "pairedAppManifest", policy, label);
  if (value.provider !== rule.provider || value.version !== policy.providerVersions[rule.provider]) {
    throw new Error(`${label} provider or version changed`);
  }
  const members = validatePairMembers(value.members, context, "app", "treeArtifactIdentity", `${label}.members`);
  validatePairDigest(value.pairDigest, members, context, `${label}.pairDigest`);
  validateOperationFacts(value.operationFacts, context, rule, `${label}.operationFacts`);
  return value;
};

const validatePairIdentity = (input, context, rule, label) => {
  const { policy } = context;
  const value = schema(input, "pairIdentity", policy, label);
  if (value.product !== rule.product || value.provider !== rule.provider) {
    throw new Error(`${label} product or provider changed`);
  }
  const members = validatePairMembers(
    value.members,
    context,
    rule.product,
    rule.artifactIdentitySchema,
    `${label}.members`,
  );
  validatePairDigest(value.pairDigest, members, context, `${label}.pairDigest`);
  return value;
};

const validateCertificateFacts = (input, context, rule, observedAt, label) => {
  const { policy } = context;
  const value = schema(input, "certificateFacts", policy, label);
  if (value.class !== policy.certificatePolicy.classByProduct[rule.product]) {
    throw new Error(`${label} certificate class changed`);
  }
  if (typeof value.teamId !== "string" || !/^[A-Z0-9]{10}$/u.test(value.teamId)) {
    throw new Error(`${label}.teamId is not one canonical Team ID`);
  }
  if (typeof value.sha1 !== "string" || !/^[0-9a-f]{40}$/u.test(value.sha1)) {
    throw new Error(`${label}.sha1 is not one lowercase certificate fingerprint`);
  }
  const notBefore = canonicalTimestamp(value.notBefore, `${label}.notBefore`);
  const notAfter = canonicalTimestamp(value.notAfter, `${label}.notAfter`);
  if (notBefore > observedAt || notAfter < observedAt || notAfter <= notBefore) {
    throw new Error(`${label} validity does not cover the receipt observation`);
  }
  return value;
};

const validateRunnerIdentity = (input, context, rule, label) => {
  const { policy } = context;
  const value = schema(input, "runnerIdentity", policy, label);
  for (const field of policy.receiptSchemas.runnerIdentity) nonEmptyText(value[field], `${label}.${field}`);
  if (rule.architecture !== null) {
    if (value.platform !== "macos" || value.architecture !== rule.architecture) {
      throw new Error(`${label} is not the receipt coordinate's macOS architecture`);
    }
  }
  return value;
};

const validateExecutableIdentity = (input, context, rule, provider, label) => {
  const { contract, policy } = context;
  const value = schema(input, "executableIdentity", policy, label);
  if (
    value.provider !== provider
    || value.version !== policy.providerVersions[provider]
    || value.architecture !== rule.architecture
    || value.target !== rule.architecture
    || value.nativeFormat !== "mach-o"
  ) throw new Error(`${label} provider, version, architecture, target, or format changed`);
  canonicalNonNegativeDecimal(value.bytes, `${label}.bytes`);
  if (value.bytes === "0") throw new Error(`${label} executable must be non-empty`);
  canonicalDigest(value.digest, contract, `${label}.digest`);
  return value;
};

const getPath = (value, path) => path.split(".").reduce((current, field) => current?.[field], value);

const validateExactOperationCoverage = (receipt, context, rule) => {
  const paths = context.policy.receiptSchemaRules.operationFactPaths[rule.category];
  if (!Array.isArray(paths)) throw new Error(`${rule.category} has no generated operation-fact paths`);
  const facts = paths.flatMap((path) =>
    validateOperationFacts(getPath(receipt, path), context, rule, `${receipt.coordinate}.${path}`)
  );
  const ids = facts.map(({ operationId }) => operationId);
  if (!sameArray(ids, rule.operationIds)) {
    throw new Error(`${receipt.coordinate} does not account for its exact ordered operation IDs`);
  }
  return facts;
};

const validateNReceipt = (value, context, rule) => {
  const { contract, policy } = context;
  if (value.architecture !== rule.architecture) throw new Error(`${value.coordinate} architecture changed`);
  const nativeTools = requireArray(value.nativeToolObservations, `${value.coordinate}.nativeToolObservations`);
  if (nativeTools.length !== 2) throw new Error(`${value.coordinate} must observe exactly Bun and Deno`);
  for (const [index, provider] of ["bun", "deno"].entries()) {
    const observation = validateToolObservation(
      nativeTools[index],
      context,
      `${value.coordinate}.nativeToolObservations[${index}]`,
    );
    if (observation.name !== provider || observation.version !== policy.providerVersions[provider]) {
      throw new Error(`${value.coordinate} native provider order or version changed`);
    }
  }
  const bun = validateExecutableIdentity(value.bunExecutableIdentity, context, rule, "bun", `${value.coordinate}.bun`);
  const deno = validateExecutableIdentity(value.denoExecutableIdentity, context, rule, "deno", `${value.coordinate}.deno`);
  canonicalDigest(value.evidenceDigest, contract, `${value.coordinate}.evidenceDigest`);
  const facts = validateExactOperationCoverage(value, context, rule);
  for (const [index, executable] of [bun, deno].entries()) {
    if (
      !sameArray(facts[index].outputDigests, [executable.digest])
      || !sameCanonical(facts[index].toolObservations, [nativeTools[index]])
    ) {
      throw new Error(`${value.coordinate} native operation does not bind its exact tool and executable output`);
    }
  }
};

const validateSignedAppReceipt = (value, context, rule, observedAt) => {
  const { contract, policy } = context;
  if (value.architecture !== rule.architecture) throw new Error(`${value.coordinate} architecture changed`);
  const paired = validatePairedAppManifest(
    value.pairedAppManifest,
    context,
    rule,
    `${value.coordinate}.pairedAppManifest`,
  );
  const artifact = validateArtifactIdentity(
    value.artifactIdentity,
    context,
    rule.artifactIdentitySchema,
    rule.product,
    rule.architecture,
    `${value.coordinate}.artifactIdentity`,
  );
  const certificate = validateCertificateFacts(
    value.certificateFacts,
    context,
    rule,
    observedAt,
    `${value.coordinate}.certificateFacts`,
  );
  if (value.hardenedRuntime !== true || value.secureTimestamp !== true) {
    throw new Error(`${value.coordinate} is not hardened and securely timestamped`);
  }
  const verifier = schema(value.verifierFacts, "verifierFacts", policy, `${value.coordinate}.verifierFacts`);
  canonicalDigest(verifier.artifactDigest, contract, `${value.coordinate}.verifierFacts.artifactDigest`);
  if (
    verifier.artifactDigest !== artifactIdentityDigest(artifact)
    || verifier.certificateSha1 !== certificate.sha1
  ) throw new Error(`${value.coordinate} verifier does not bind the signed artifact and certificate`);
  validateOperationFacts(verifier.operationFacts, context, rule, `${value.coordinate}.verifierFacts.operationFacts`);
  const expectedVerifierTools = expectedAppleOperationTools(
    context,
    rule,
    rule.operationIds[1],
    `${value.coordinate}.verifierFacts`,
  );
  if (expectedVerifierTools === undefined) throw new Error(`${value.coordinate} has no signing tool lineage`);
  const tools = validateExactAppleToolArray(
    verifier.toolObservations,
    context,
    expectedVerifierTools,
    `${value.coordinate}.verifierFacts.toolObservations`,
  );
  const [build, sign] = validateExactOperationCoverage(value, context, rule);
  const memberDigests = paired.members.map(({ artifactIdentity }) => artifactIdentityDigest(artifactIdentity));
  const source = paired.members.find(({ architecture }) => architecture === rule.architecture);
  if (
    !sameArray(build.outputDigests, [paired.pairDigest, ...memberDigests])
    || !sameArray(sign.inputDigests, [artifactIdentityDigest(source.artifactIdentity)])
    || !sameArray(sign.outputDigests, [artifactIdentityDigest(artifact)])
    || !sameCanonical(sign.toolObservations, tools)
  ) throw new Error(`${value.coordinate} build/sign operations do not bind the exact pair and signed artifact`);
};

const validateJournalReference = (input, context, label) => {
  const { contract, policy } = context;
  const value = schema(input, "journalReference", policy, label);
  if (
    value.protocol !== policy.notaryJournal.protocol
    || value.submissionCodec !== policy.notaryJournal.submissionCodec
  ) throw new Error(`${label} journal or submission codec protocol changed`);
  nonEmptyText(value.journalId, `${label}.journalId`);
  submissionId(value.submissionId, `${label}.submissionId`);
  for (
    const field of [
      "intentRecordDigest",
      "intentRereadRecordDigest",
      "submissionRecordDigest",
      "submissionRereadRecordDigest",
      "submissionBytesDigest",
    ]
  ) {
    canonicalDigest(value[field], contract, `${label}.${field}`);
  }
  for (const field of ["intentSequence", "submissionSequence"]) {
    canonicalNonNegativeDecimal(value[field], `${label}.${field}`);
    if (value[field] === "0") throw new Error(`${label}.${field} must be positive`);
  }
  for (const field of ["intentTransaction", "submissionTransaction"]) {
    transactionId(value[field], `${label}.${field}`);
  }
  if (value.intentTransaction === value.submissionTransaction) {
    throw new Error(`${label} intent and submission transactions must be distinct`);
  }
  if (
    value.intentRereadRecordDigest !== value.intentRecordDigest
    || value.submissionRereadRecordDigest !== value.submissionRecordDigest
  ) throw new Error(`${label} does not bind exact acknowledged journal re-reads`);
  if (BigInt(value.submissionSequence) <= BigInt(value.intentSequence)) {
    throw new Error(`${label} submission sequence does not follow the intent sequence`);
  }
  return value;
};

const submissionId = (value, label) => {
  if (typeof value !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(value)) {
    throw new Error(`${label} must be one lowercase UUID`);
  }
  return value;
};

const transactionId = (value, label) => {
  if (typeof value !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(value)) {
    throw new Error(`${label} must be one canonical lowercase UUID`);
  }
  return value;
};

const validateAcceptedInfo = (input, context, rule, label) => {
  const { contract, policy } = context;
  const value = schema(input, "acceptedInfo", policy, label);
  submissionId(value.submissionId, `${label}.submissionId`);
  if (value.providerStatus !== policy.receiptSchemaRules.providerStatus) {
    throw new Error(`${label} is not an accepted Notary observation`);
  }
  canonicalDigest(value.observationDigest, contract, `${label}.observationDigest`);
  const expected = expectedAppleOperationTools(context, rule, "PROD-APPLE-009", label);
  if (expected === undefined || expected.length !== 1) throw new Error(`${label} has no exact info tool lineage`);
  validateAppleToolObservation(value.toolObservation, context, expected[0], `${label}.toolObservation`);
  return value;
};

const validateAcceptedLog = (input, context, rule, label) => {
  const { contract, policy } = context;
  const value = schema(input, "acceptedLog", policy, label);
  submissionId(value.submissionId, `${label}.submissionId`);
  if (value.providerStatus !== policy.receiptSchemaRules.providerStatus) {
    throw new Error(`${label} is not an accepted Notary log`);
  }
  canonicalDigest(value.logDigest, contract, `${label}.logDigest`);
  canonicalNonNegativeDecimal(value.issueCount, `${label}.issueCount`);
  const expected = expectedAppleOperationTools(context, rule, "PROD-APPLE-010", label);
  if (expected === undefined || expected.length !== 1) throw new Error(`${label} has no exact log tool lineage`);
  validateAppleToolObservation(value.toolObservation, context, expected[0], `${label}.toolObservation`);
  return value;
};

const validateStapleTicket = (input, context, rule, accepted, label) => {
  const { contract, policy } = context;
  const value = schema(input, "stapleTicket", policy, label);
  submissionId(value.submissionId, `${label}.submissionId`);
  if (value.submissionId !== accepted.submissionId) throw new Error(`${label} changed submission identity`);
  const submittedKind = rule.product === "app" ? "zip" : rule.product;
  const targetIdentityKind = rule.product === "app" ? "tree-manifest" : "file-bytes";
  if (
    value.submittedKind !== submittedKind
    || value.targetKind !== rule.product
    || value.targetIdentityKind !== targetIdentityKind
    || value.targetArchitecture !== rule.architecture
  ) throw new Error(`${label} product, transport, target kind, or architecture changed`);
  for (const field of ["submittedBytes", "targetBytes"]) {
    canonicalNonNegativeDecimal(value[field], `${label}.${field}`);
    if (value[field] === "0") throw new Error(`${label}.${field} must be nonzero`);
  }
  for (const field of ["submittedDigest", "targetDigest", "ticketDigest"]) {
    canonicalDigest(value[field], contract, `${label}.${field}`);
  }
  return value;
};

const validateAssessment = (input, context, rule, label) => {
  const { contract, policy } = context;
  const value = schema(input, "assessment", policy, label);
  if (value.product !== rule.product || value.architecture !== rule.architecture || value.accepted !== true) {
    throw new Error(`${label} product, architecture, or acceptance changed`);
  }
  canonicalDigest(value.evidenceDigest, contract, `${label}.evidenceDigest`);
  const expected = expectedAppleOperationTools(context, rule, "PROD-APPLE-013", label);
  if (expected === undefined) throw new Error(`${label} has no exact assessment tool lineage`);
  validateExactAppleToolArray(value.toolObservations, context, expected, `${label}.toolObservations`);
  return value;
};

const validateNotarizedReceipt = (value, context, rule, observedAt) => {
  const { policy } = context;
  if (value.signedAppDependency !== rule.fieldValues.signedAppDependency) {
    throw new Error(`${value.coordinate} signed App dependency changed`);
  }
  const artifact = validateArtifactIdentity(
    value.artifactIdentity,
    context,
    rule.artifactIdentitySchema,
    rule.product,
    rule.architecture,
    `${value.coordinate}.artifactIdentity`,
  );
  const pair = validatePairIdentity(value.pairIdentity, context, rule, `${value.coordinate}.pairIdentity`);
  const finalMember = pair.members.find(({ architecture }) => architecture === rule.architecture);
  if (!sameCanonical(artifact, finalMember.artifactIdentity)) {
    throw new Error(`${value.coordinate} final artifact does not equal its exact pair member`);
  }
  validateCertificateFacts(value.certificateFacts, context, rule, observedAt, `${value.coordinate}.certificateFacts`);
  const journal = validateJournalReference(value.journalReference, context, `${value.coordinate}.journalReference`);
  const info = validateAcceptedInfo(value.acceptedInfo, context, rule, `${value.coordinate}.acceptedInfo`);
  const log = validateAcceptedLog(value.acceptedLog, context, rule, `${value.coordinate}.acceptedLog`);
  if (journal.submissionId !== info.submissionId || info.submissionId !== log.submissionId) {
    throw new Error(`${value.coordinate} journal, info, and log submissions differ`);
  }
  const ticket = validateStapleTicket(
    value.stapleTicket,
    context,
    rule,
    info,
    `${value.coordinate}.stapleTicket`,
  );
  const assessment = validateAssessment(value.assessment, context, rule, `${value.coordinate}.assessment`);
  if (policy.receiptSchemaRules.notarizedToolObservations !== "ordered-operationFact-array") {
    throw new Error("generated notarized operation facts policy changed");
  }
  const facts = validateExactOperationCoverage(value, context, rule);
  const submit = facts.find(({ operation }) => operation === (rule.product === "app" ? "submitApp" : "submit"));
  const staple = facts.find(({ operation }) =>
    operation === (rule.product === "app" ? "stapleApp" : "stapleFile")
  );
  const infoOperation = facts.find(({ operation }) => operation === "info");
  const logOperation = facts.find(({ operation }) => operation === "log");
  const assessOperation = facts.find(({ operation }) => operation === "assess");
  const sign = facts.find(({ operation }) =>
    operation === (rule.product === "app"
      ? "signApp"
      : rule.product === "dmg"
      ? "signDiskImage"
      : "signInstallerPackage")
  );
  const builder = rule.product === "app"
    ? undefined
    : facts.find(({ operation }) => operation === (rule.product === "dmg" ? "createDiskImages" : "buildInstallerPackages"));
  const architectureIndex = policy.pairArchitectureOrder.indexOf(rule.architecture);
  if (
    submit === undefined
    || staple === undefined
    || infoOperation === undefined
    || logOperation === undefined
    || assessOperation === undefined
    || sign === undefined
    || !sameArray(submit.inputDigests, [ticket.submittedDigest])
    || !sameArray(submit.outputDigests, [journal.submissionBytesDigest])
    || !sameArray(staple.inputDigests, [ticket.targetDigest])
    || !sameArray(staple.outputDigests, [artifactIdentityDigest(artifact)])
    || !sameArray(infoOperation.inputDigests, [journal.submissionBytesDigest])
    || !sameArray(infoOperation.outputDigests, [info.observationDigest])
    || !sameCanonical(infoOperation.toolObservations, [info.toolObservation])
    || !sameArray(logOperation.inputDigests, [journal.submissionBytesDigest])
    || !sameArray(logOperation.outputDigests, [log.logDigest])
    || !sameCanonical(logOperation.toolObservations, [log.toolObservation])
    || !sameArray(assessOperation.inputDigests, [artifactIdentityDigest(artifact)])
    || !sameArray(assessOperation.outputDigests, [assessment.evidenceDigest])
    || !sameCanonical(assessOperation.toolObservations, assessment.toolObservations)
    || !sameArray(sign.outputDigests, [ticket.targetDigest])
    || (rule.product !== "app"
      && (builder === undefined
        || builder.outputDigests.length !== policy.pairArchitectureOrder.length
        || new Set(builder.outputDigests).size !== builder.outputDigests.length
        || !sameArray(sign.inputDigests, [builder.outputDigests[architectureIndex]])))
    || (rule.product !== "app"
      && (ticket.submittedBytes !== ticket.targetBytes || ticket.submittedDigest !== ticket.targetDigest))
  ) throw new Error(`${value.coordinate} submit, journal, staple target, or final output lineage changed`);
};

const validateCleanHostReceipt = (value, context, rule) => {
  const { contract, policy } = context;
  if (value.producerDependency !== rule.fieldValues.producerDependency) {
    throw new Error(`${value.coordinate} producer dependency changed`);
  }
  if (
    value.runnerIdentity.platform !== rule.fieldValues.runnerPlatform
    || value.runnerIdentity.runnerEnvironment !== rule.fieldValues.runnerEnvironment
  ) throw new Error(`${value.coordinate} clean-host runner platform or environment changed`);
  const transport = schema(
    value.acquisitionTransportIdentity,
    "acquisitionTransportIdentity",
    policy,
    `${value.coordinate}.acquisitionTransportIdentity`,
  );
  if (transport.kind !== rule.fieldValues.acquisitionTransportKind) {
    throw new Error(`${value.coordinate} acquisition transport kind changed`);
  }
  canonicalNonNegativeDecimal(transport.bytes, `${value.coordinate}.acquisitionTransportIdentity.bytes`);
  if (transport.bytes === "0") throw new Error(`${value.coordinate} acquisition transport is empty`);
  canonicalDigest(transport.digest, contract, `${value.coordinate}.acquisitionTransportIdentity.digest`);
  canonicalDigest(
    transport.extractedProductDigest,
    contract,
    `${value.coordinate}.acquisitionTransportIdentity.extractedProductDigest`,
  );
  const extracted = validateArtifactIdentity(
    value.extractedProductIdentity,
    context,
    rule.artifactIdentitySchema,
    rule.product,
    rule.architecture,
    `${value.coordinate}.extractedProductIdentity`,
  );
  if (transport.extractedProductDigest !== artifactIdentityDigest(extracted)) {
    throw new Error(`${value.coordinate} acquisition transport does not bind the extracted product`);
  }
  const quarantine = schema(
    value.quarantineEvidence,
    "quarantineEvidence",
    policy,
    `${value.coordinate}.quarantineEvidence`,
  );
  if (
    quarantine.applied !== rule.fieldValues.quarantinePolicy.applied
    || quarantine.propagated !== rule.fieldValues.quarantinePolicy.propagated
  ) {
    throw new Error(`${value.coordinate} quarantine was not applied and propagated`);
  }
  canonicalDigest(quarantine.attributeDigest, contract, `${value.coordinate}.quarantineEvidence.attributeDigest`);
  const host = schema(value.hostIdentity, "hostIdentity", policy, `${value.coordinate}.hostIdentity`);
  for (const field of ["image", "imageVersion"]) nonEmptyText(host[field], `${value.coordinate}.hostIdentity.${field}`);
  if (
    host.architecture !== rule.architecture
    || host.image !== value.runnerIdentity.image
    || host.imageVersion !== value.runnerIdentity.imageVersion
    || host.architecture !== value.runnerIdentity.architecture
    || host.fresh !== true
  ) {
    throw new Error(`${value.coordinate} clean host identity, architecture, or freshness changed`);
  }
  canonicalNonNegativeDecimal(host.uid, `${value.coordinate}.hostIdentity.uid`);
  if (host.uid === "0" || rule.fieldValues.uidFormat !== "canonical-positive-decimal-string") {
    throw new Error(`${value.coordinate} clean host must use a canonical positive normal-user UID`);
  }
  scalarArray(host.forbiddenStateAbsent, `${value.coordinate}.hostIdentity.forbiddenStateAbsent`);
  if (!sameArray(host.forbiddenStateAbsent, policy.cleanHostForbiddenStateIds)) {
    throw new Error(`${value.coordinate} clean host did not prove the exact forbidden-state absence`);
  }
  const userFlow = schema(value.userFlowEvidence, "userFlowEvidence", policy, `${value.coordinate}.userFlowEvidence`);
  if (userFlow.flow !== rule.fieldValues.userFlow) throw new Error(`${value.coordinate} user flow changed`);
  scalarArray(userFlow.orderedSteps, `${value.coordinate}.userFlowEvidence.orderedSteps`);
  if (!sameArray(userFlow.orderedSteps, rule.fieldValues.userFlowSteps)) {
    throw new Error(`${value.coordinate} normal-user flow steps changed`);
  }
  canonicalDigest(userFlow.evidenceDigest, contract, `${value.coordinate}.userFlowEvidence.evidenceDigest`);
  const sentinel = schema(
    value.sentinelOrInstallEvidence,
    "sentinelOrInstallEvidence",
    policy,
    `${value.coordinate}.sentinelOrInstallEvidence`,
  );
  if (sentinel.kind !== rule.fieldValues.sentinelOrInstallKind) {
    throw new Error(`${value.coordinate} sentinel or install evidence kind changed`);
  }
  canonicalDigest(sentinel.evidenceDigest, contract, `${value.coordinate}.sentinelOrInstallEvidence.evidenceDigest`);
  const cleanup = schema(value.cleanupEvidence, "cleanupEvidence", policy, `${value.coordinate}.cleanupEvidence`);
  scalarArray(cleanup.orderedSteps, `${value.coordinate}.cleanupEvidence.orderedSteps`);
  if (
    !sameArray(cleanup.orderedSteps, rule.fieldValues.cleanupSteps)
    || cleanup.complete !== rule.fieldValues.cleanupComplete
  ) throw new Error(`${value.coordinate} clean-host cleanup order or completion changed`);
  canonicalDigest(cleanup.evidenceDigest, contract, `${value.coordinate}.cleanupEvidence.evidenceDigest`);
};

const validateVerdictReceipt = (value, rule) => {
  for (const field of ["namedClaims", "orderedDependencies", "subordinateEvidence"]) {
    if (!sameArray(value[field], rule.fieldValues[field])) {
      throw new Error(`${value.coordinate}.${field} changed from the generated verdict policy`);
    }
  }
  if (!sameArray(value.dependencies, value.orderedDependencies)) {
    throw new Error(`${value.coordinate} common and verdict dependency order differ`);
  }
};

export const validateAppleReceipt = ({
  contract,
  receipt,
  expectedSourceSha,
  expectedCandidateCoordinate,
  expectedWorkflowCoordinate,
}) => {
  const { policy, release } = appleCertificationPolicy(contract);
  const rule = policy.coordinateRules.find(({ coordinate }) => coordinate === receipt?.coordinate);
  if (rule === undefined) throw new Error("Apple receipt coordinate is not admitted by the generated policy");
  exactKeys(rule, policy.coordinateRuleFields, `${rule.coordinate} generated coordinate rule`);
  const category = policy.categories.find(({ id }) => id === rule.category);
  if (category === undefined) throw new Error(`${rule.coordinate} has no generated receipt category`);
  const value = exactKeys(
    receipt,
    [...policy.commonReceiptFields, ...category.requiredFields],
    `${rule.coordinate} receipt`,
  );
  if (value.protocol !== policy.protocols.receipt || value.verdict !== policy.encoding.terminalVerdict) {
    throw new Error(`${rule.coordinate} protocol or terminal verdict changed`);
  }
  fullSourceSha(value.sourceSha, `${rule.coordinate}.sourceSha`);
  if (value.sourceSha !== expectedSourceSha) throw new Error(`${rule.coordinate} source SHA changed`);
  const candidate = artifactCoordinate(contract, value.candidateCoordinate, `${rule.coordinate}.candidateCoordinate`);
  const workflow = artifactCoordinate(contract, value.workflowCoordinate, `${rule.coordinate}.workflowCoordinate`);
  if (candidate.workflow !== release.candidate.workflow) {
    throw new Error(`${rule.coordinate} candidate workflow identity changed`);
  }
  if (workflow.workflow !== policy.workflow || workflow.runAttempt !== `${policy.artifact.attempt}`) {
    throw new Error(`${rule.coordinate} Apple workflow identity or attempt changed`);
  }
  for (const [name, coordinate] of [["candidate", candidate], ["workflow", workflow]]) {
    if (coordinate.sourceSha !== value.sourceSha) throw new Error(`${rule.coordinate} ${name} source SHA changed`);
  }
  if (!sameCanonical(candidate, expectedCandidateCoordinate)) {
    throw new Error(`${rule.coordinate} candidate coordinate changed`);
  }
  if (!sameCanonical(workflow, expectedWorkflowCoordinate)) {
    throw new Error(`${rule.coordinate} workflow coordinate changed`);
  }
  for (const field of ["producerDigest", "verifierDigest", "evidenceDigest"]) {
    canonicalDigest(value[field], contract, `${rule.coordinate}.${field}`);
  }
  if (value.producerDigest === value.verifierDigest) {
    throw new Error(`${rule.coordinate} producer and verifier digests must be distinct`);
  }
  const observedAt = canonicalTimestamp(value.observedAt, `${rule.coordinate}.observedAt`);
  validateRunnerIdentity(value.runnerIdentity, { contract, policy }, rule, `${rule.coordinate}.runnerIdentity`);
  scalarArray(value.dependencies, `${rule.coordinate}.dependencies`, { allowEmpty: true });
  if (!sameArray(value.dependencies, rule.dependencies)) throw new Error(`${rule.coordinate} dependencies changed`);

  const context = { contract, policy };
  if (rule.category === "N-native") validateNReceipt(value, context, rule);
  else if (rule.category === "P-signed-app") validateSignedAppReceipt(value, context, rule, observedAt);
  else if (rule.category === "P-notarized-product") validateNotarizedReceipt(value, context, rule, observedAt);
  else if (rule.category === "G-clean-host") validateCleanHostReceipt(value, context, rule);
  else if (rule.category === "A-verdict") validateVerdictReceipt(value, rule);
  else throw new Error(`${rule.coordinate} has an unsupported generated receipt category`);
  return value;
};

const receiptMap = (receipts) => new Map(receipts.map((receipt) => [receipt.coordinate, receipt]));

const signedPairGroups = (rules) => {
  const keys = new Map();
  for (const rule of rules.filter(({ category }) => category === "P-signed-app")) {
    const key = `${rule.provider}:${rule.product}`;
    keys.set(key, [...(keys.get(key) ?? []), rule.coordinate]);
  }
  return keys;
};

const notarizedPairGroups = (rules) => {
  const keys = new Map();
  for (const rule of rules.filter(({ category }) => category === "P-notarized-product")) {
    const key = `${rule.provider}:${rule.product}`;
    keys.set(key, [...(keys.get(key) ?? []), rule.coordinate]);
  }
  return keys;
};

export const validateAppleReceipts = ({
  contract,
  receipts,
  expectedSourceSha,
  expectedCandidateCoordinate,
  expectedWorkflowCoordinate,
}) => {
  const { policy } = appleCertificationPolicy(contract);
  if (!Array.isArray(receipts) || receipts.length !== policy.coordinates.length) {
    throw new Error("Apple aggregate must contain exactly 28 receipts");
  }
  const observed = receipts.map((receipt) => receipt?.coordinate);
  if (!sameArray(observed, policy.coordinates) || new Set(observed).size !== observed.length) {
    throw new Error("Apple receipts are missing, additional, duplicate, or out of policy order");
  }
  const validated = receipts.map((receipt) =>
    validateAppleReceipt({
      contract,
      receipt,
      expectedSourceSha,
      expectedCandidateCoordinate,
      expectedWorkflowCoordinate,
    })
  );
  const byCoordinate = receiptMap(validated);

  const producerDigests = new Set(validated.map(({ producerDigest }) => producerDigest));
  const verifierDigests = new Set(validated.map(({ verifierDigest }) => verifierDigest));
  if (
    producerDigests.size !== 1
    || verifierDigests.size !== 1
    || [...producerDigests][0] === [...verifierDigests][0]
  ) throw new Error("Apple receipts do not share one exact, distinct producer and verifier byte identity");

  for (const coordinates of signedPairGroups(policy.coordinateRules).values()) {
    const first = byCoordinate.get(coordinates[0]).pairedAppManifest;
    for (const coordinate of coordinates.slice(1)) {
      if (!sameCanonical(first, byCoordinate.get(coordinate).pairedAppManifest)) {
        throw new Error(`${coordinate} does not share its provider's exact paired App manifest`);
      }
    }
    const build = first.operationFacts.find(({ operation }) => operation === "buildAppBundles");
    const expectedInputs = policy.pairArchitectureOrder.map((architecture) => {
      const nativeRule = policy.coordinateRules.find((rule) =>
        rule.category === "N-native" && rule.architecture === architecture
      );
      const native = byCoordinate.get(nativeRule?.coordinate);
      return artifactIdentityDigest(
        first.provider === "bun" ? native.bunExecutableIdentity : native.denoExecutableIdentity,
      );
    });
    if (build === undefined || !sameArray(build.inputDigests, expectedInputs)) {
      throw new Error(`${coordinates[0]} paired App builder does not consume the exact two native executables`);
    }
  }
  for (const coordinates of notarizedPairGroups(policy.coordinateRules).values()) {
    const firstReceipt = byCoordinate.get(coordinates[0]);
    const first = firstReceipt.pairIdentity;
    for (const coordinate of coordinates.slice(1)) {
      if (!sameCanonical(first, byCoordinate.get(coordinate).pairIdentity)) {
        throw new Error(`${coordinate} does not share its product's exact pair identity`);
      }
    }
    if (first.product !== "app") {
      const builderName = first.product === "dmg" ? "createDiskImages" : "buildInstallerPackages";
      const builder = firstReceipt.toolObservations.find(({ operation }) => operation === builderName);
      const rule = policy.coordinateRules.find(({ coordinate }) => coordinate === coordinates[0]);
      const expectedInputs = rule.dependencies.map((coordinate) =>
        artifactIdentityDigest(byCoordinate.get(coordinate).artifactIdentity)
      );
      if (builder === undefined || !sameArray(builder.inputDigests, expectedInputs)) {
        throw new Error(`${coordinates[0]} pair builder does not consume the exact signed App pair`);
      }
      for (const coordinate of coordinates.slice(1)) {
        const peer = byCoordinate.get(coordinate).toolObservations.find(({ operation }) => operation === builderName);
        if (!sameCanonical(builder, peer)) {
          throw new Error(`${coordinate} does not share one exact pair-only ${builderName} operation`);
        }
      }
    }
  }
  for (
    const rule of policy.coordinateRules.filter(({ category, product }) =>
      category === "P-notarized-product" && product === "app"
    )
  ) {
    const notarized = byCoordinate.get(rule.coordinate);
    const signed = byCoordinate.get(rule.fieldValues.signedAppDependency);
    const notarizedSign = notarized.toolObservations.find(({ operation }) => operation === "signApp");
    const signedSign = signed.verifierFacts.operationFacts.find(({ operation }) => operation === "signApp");
    if (
      notarized.stapleTicket.targetBytes !== signed.artifactIdentity.totalBytes
      || notarized.stapleTicket.targetDigest !== artifactIdentityDigest(signed.artifactIdentity)
      || !sameCanonical(notarizedSign, signedSign)
    ) throw new Error(`${rule.coordinate} private ZIP does not project to its exact signed App target`);
  }
  for (const rule of policy.coordinateRules.filter(({ category }) => category === "G-clean-host")) {
    const clean = byCoordinate.get(rule.coordinate);
    const producer = byCoordinate.get(rule.fieldValues.producerDependency);
    if (!sameCanonical(clean.extractedProductIdentity, producer.artifactIdentity)) {
      throw new Error(`${rule.coordinate} extracted product differs from its exact P producer`);
    }
  }

  const distribution = validated.filter(({ coordinate }) => coordinate.startsWith("P-"));
  const applicationCertificates = distribution
    .filter(({ coordinate }) => !coordinate.includes("-pkg|"))
    .map(({ certificateFacts }) => certificateFacts);
  const installerCertificates = distribution
    .filter(({ coordinate }) => coordinate.includes("-pkg|"))
    .map(({ certificateFacts }) => certificateFacts);
  if (
    applicationCertificates.some((facts) => !sameCanonical(facts, applicationCertificates[0]))
    || installerCertificates.some((facts) => !sameCanonical(facts, installerCertificates[0]))
    || applicationCertificates[0].teamId !== installerCertificates[0].teamId
    || applicationCertificates[0].sha1 === installerCertificates[0].sha1
  ) throw new Error("Apple Application and Installer certificate lineages are not exact and distinct");

  const producerIds = contract.producerCapabilityRegister.capabilities
    .filter(({ family, visibility }) => family === "apple" && visibility === "public")
    .map(({ id }) => id);
  const covered = new Set(policy.coordinateRules.flatMap(({ operationIds }) => operationIds));
  if (producerIds.length !== 13 || producerIds.some((id) => !covered.has(id))) {
    throw new Error("Apple receipt policy does not account for every producer operation ID");
  }
  return validated;
};

export const receiptEvidenceDigest = (receipt) => receipt.evidenceDigest;

export const receiptArtifactDigest = (receipt) => {
  if (!isRecord(receipt.artifactIdentity)) throw new Error(`${receipt.coordinate} has no artifact identity`);
  return artifactIdentityDigest(receipt.artifactIdentity);
};
