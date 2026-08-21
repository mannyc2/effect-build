import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const profilePath = "research/post-0.3/implementation/profile.json";
const shaPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const allowedClassifications = new Set(["established", "sequenced"]);

const sorted = (values) => [...values].sort();

const assertNonEmptyString = (value, message) => {
  assert.equal(typeof value, "string", message);
  assert.ok(value.length > 0, message);
};

const assertUniqueStrings = (values, message) => {
  assert.ok(Array.isArray(values) && values.length > 0, message);
  for (const value of values) assertNonEmptyString(value, message);
  assert.equal(new Set(values).size, values.length, message);
};

const assertExplicitRepositoryPath = (value, message) => {
  assertNonEmptyString(value, message);
  assert.equal(value.startsWith("/"), false, message);
  assert.equal(value.includes(".."), false, message);
  assert.equal(/[?*[\]{}]/.test(value), false, message);
};

export const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

export const validateProfileDocuments = ({ anchor, expected, profile }) => {
  assert.equal(
    profile.schema,
    "effect-build/implementation-certification-profile@1",
    "invalid Plan 039 profile schema",
  );
  assert.equal(profile.profileId, "effect-build/plan039-implementation@1", "unexpected Plan 039 profile id");
  assert.equal(profile.plan, "039", "unexpected implementation plan");
  assert.equal(profile.phase, "workflow-handoff", "unexpected Plan 039 phase");
  assert.equal(profile.receiptDirectoryEnvironment, "PLAN039_RECEIPTS_DIR", "receipt directory is not disjoint");
  assert.equal(profile.certificateFile, "plan039-certification.json", "unexpected Plan 039 certificate name");

  for (const path of [profile.trustAnchor, profile.expectedClaims]) {
    assertExplicitRepositoryPath(path, "profile document paths must be explicit repository paths");
  }
  assert.equal(
    profile.trustAnchor,
    "research/post-0.3/implementation/freeze-trust-anchor.json",
    "unexpected trust-anchor path",
  );
  assert.equal(
    profile.expectedClaims,
    "research/post-0.3/implementation/expected-claims.json",
    "unexpected expected-claim path",
  );

  assert.ok(Array.isArray(profile.producers) && profile.producers.length === 1, "profile must declare one producer");
  const producer = profile.producers[0];
  assert.equal(producer.lane, "implementation", "unexpected Plan 039 producer lane");
  assert.equal(
    producer.script,
    "research/post-0.3/implementation/certify-current-head.mjs",
    "unexpected Plan 039 producer",
  );
  assertUniqueStrings(producer.receipts, "Plan 039 producer receipts must be explicit and unique");
  assertUniqueStrings(profile.currentReceiptIds, "current receipt ids must be explicit and unique");
  assert.deepEqual(sorted(producer.receipts), sorted(profile.currentReceiptIds), "producer and current receipts drifted");
  assertUniqueStrings(profile.historicalProfileIds, "historical profile ids must be explicit and unique");
  assertUniqueStrings(profile.forbiddenCurrentReceiptIds, "forbidden current receipt ids must be explicit and unique");
  assert.equal(
    profile.historicalProfileIds.includes(profile.profileId),
    false,
    "current and historical profile identities overlap",
  );
  for (const id of profile.forbiddenCurrentReceiptIds) {
    assert.equal(profile.currentReceiptIds.includes(id), false, `forbidden current receipt is declared: ${id}`);
  }
  assertUniqueStrings(profile.forbiddenInvocations, "forbidden invocations must be explicit and unique");
  for (const path of profile.forbiddenInvocations) {
    assertExplicitRepositoryPath(path, "forbidden invocations must be explicit repository paths");
  }
  assertUniqueStrings(profile.handoffAllowedPaths, "handoff paths must be explicit and unique");
  for (const path of profile.handoffAllowedPaths) {
    assertExplicitRepositoryPath(path, "handoff paths must be explicit repository paths");
  }

  assert.equal(profile.productionBaseline.releaseSha, anchor.releaseSha, "production release anchor drifted");
  assert.equal(profile.productionBaseline.freezeSha, anchor.sourceSha, "production freeze anchor drifted");
  assertUniqueStrings(profile.productionBaseline.paths, "production baseline paths must be explicit and unique");
  for (const path of profile.productionBaseline.paths) {
    assertExplicitRepositoryPath(path, "production paths must be explicit repository paths");
  }

  assert.equal(anchor.schema, "effect-build/historical-freeze-trust-anchor@1", "invalid freeze anchor schema");
  assert.equal(anchor.profileId, "post-0.3-surface-freeze-v1", "unexpected historical profile id");
  assert.match(anchor.sourceSha, shaPattern, "invalid freeze source SHA");
  assert.match(anchor.baseSha, shaPattern, "invalid freeze base SHA");
  assert.match(anchor.releaseSha, shaPattern, "invalid freeze release SHA");
  assert.equal(profile.historicalProfileIds.includes(anchor.profileId), true, "freeze profile is not declared historical");
  assert.equal(anchor.profileId === profile.profileId, false, "freeze and implementation profile ids mix");
  assert.equal(anchor.workflow.repository, "mannyc2/effect-build", "unexpected freeze repository");
  assert.match(anchor.workflow.runId, /^[1-9][0-9]*$/, "invalid freeze run id");
  assert.match(anchor.workflow.runAttempt, /^[1-9][0-9]*$/, "invalid freeze run attempt");
  assert.equal(anchor.workflow.eventName, "push", "freeze trust must use the push certification");
  assert.equal(anchor.workflow.conclusion, "success", "freeze run was not successful");
  assert.match(anchor.aggregateArtifact.id, /^[1-9][0-9]*$/, "invalid aggregate artifact id");
  assert.match(anchor.aggregateArtifact.digest, digestPattern, "invalid aggregate artifact digest");
  assert.ok(Number.isSafeInteger(anchor.aggregateArtifact.sizeInBytes) && anchor.aggregateArtifact.sizeInBytes > 0);
  assert.equal(anchor.certification.file, "certification.json", "unexpected historical certification filename");
  assert.equal(anchor.certification.schema, "effect-build/architecture-certification@3");
  assert.match(anchor.certification.digest, digestPattern, "invalid historical certification digest");
  assert.equal(anchor.certification.claims, 44, "historical certification claim count drifted");
  assert.equal(anchor.certification.result, "certified", "historical certification was not successful");
  assert.ok(Array.isArray(anchor.receipts) && anchor.receipts.length === 20, "freeze anchor must contain 20 receipts");
  const receiptIds = anchor.receipts.map((receipt) => receipt.id);
  assert.deepEqual(receiptIds, sorted(receiptIds), "freeze receipts must be explicitly ordered by id");
  assert.equal(new Set(receiptIds).size, receiptIds.length, "freeze receipt ids are duplicated");
  for (const receipt of anchor.receipts) {
    assert.equal(receipt.file, `${receipt.id}.json`, `freeze receipt filename drifted: ${receipt.id}`);
    assert.match(receipt.digest, digestPattern, `invalid freeze receipt digest: ${receipt.id}`);
  }
  assert.equal(receiptIds.includes("surface-freeze"), true, "historical freeze receipt is missing");

  assert.equal(expected.schema, "effect-build/expected-implementation-claims@1", "invalid expected-claim schema");
  assert.equal(expected.profileId, profile.profileId, "expected claims name another profile");
  assert.equal(expected.receiptId, profile.currentReceiptIds[0], "expected claims name another receipt");
  assert.ok(Array.isArray(expected.claims) && expected.claims.length === 4, "Plan 039 handoff must have four claims");
  const claimIds = expected.claims.map((claim) => claim.id);
  assert.equal(new Set(claimIds).size, claimIds.length, "expected claim ids are duplicated");
  for (const claim of expected.claims) {
    assertNonEmptyString(claim.id, "expected claim id is missing");
    assert.ok(allowedClassifications.has(claim.classification), `invalid classification: ${claim.id}`);
    assertNonEmptyString(claim.conclusion, `expected conclusion is missing: ${claim.id}`);
    assertUniqueStrings(claim.assertions, `expected assertions are missing or duplicated: ${claim.id}`);
  }

  return { anchor, expected, profile };
};

export const loadProfileDocuments = async (repository) => {
  const profile = await readJson(resolve(repository, profilePath));
  const anchor = await readJson(resolve(repository, profile.trustAnchor));
  const expected = await readJson(resolve(repository, profile.expectedClaims));
  return validateProfileDocuments({ anchor, expected, profile });
};

export const validateHistoricalApi = ({ anchor, artifact, run }) => {
  assert.equal(String(run.id), anchor.workflow.runId, "freeze run id drifted");
  assert.equal(String(run.run_attempt), anchor.workflow.runAttempt, "freeze run attempt drifted");
  assert.equal(run.name, anchor.workflow.name, "freeze workflow name drifted");
  assert.equal(run.path, anchor.workflow.path, "freeze workflow path drifted");
  assert.equal(run.event, anchor.workflow.eventName, "freeze workflow event drifted");
  assert.equal(run.status, "completed", "freeze workflow is no longer completed");
  assert.equal(run.conclusion, anchor.workflow.conclusion, "freeze workflow conclusion drifted");
  assert.equal(run.head_sha, anchor.sourceSha, "freeze workflow source drifted");
  assert.equal(run.repository?.full_name, anchor.workflow.repository, "freeze workflow repository drifted");

  assert.equal(String(artifact.id), anchor.aggregateArtifact.id, "aggregate artifact id drifted");
  assert.equal(artifact.name, anchor.aggregateArtifact.name, "aggregate artifact name drifted");
  assert.equal(artifact.size_in_bytes, anchor.aggregateArtifact.sizeInBytes, "aggregate artifact size drifted");
  assert.equal(artifact.digest, anchor.aggregateArtifact.digest, "aggregate artifact digest drifted");
  assert.equal(artifact.expired, false, "aggregate artifact has expired");
  assert.equal(String(artifact.workflow_run?.id), anchor.workflow.runId, "aggregate artifact names another run");
  assert.equal(artifact.workflow_run?.head_sha, anchor.sourceSha, "aggregate artifact names another source");
  return { artifact, run };
};

export const validateCurrentRemoteEvidence = ({ eventName, eventSourceSha, observedSha, repository, sourceSha }) => {
  assert.equal(eventName === "push" || eventName === "pull_request", true, "unsupported certification event");
  assert.equal(repository, "mannyc2/effect-build", "current certification names another repository");
  assert.equal(eventSourceSha, sourceSha, "workflow event source does not equal SOURCE_SHA");
  assert.equal(observedSha, sourceSha, "fresh remote head does not equal SOURCE_SHA");
  return { eventName, eventSourceSha, observedSha, repository };
};

export const validateHistoricalArchive = ({
  anchor,
  archiveBytes,
  certificateBytes,
  entries,
  receiptBytes,
}) => {
  assert.equal(archiveBytes.byteLength, anchor.aggregateArtifact.sizeInBytes, "aggregate artifact byte size changed");
  assert.equal(sha256(archiveBytes), anchor.aggregateArtifact.digest, "aggregate artifact bytes failed authentication");
  const expectedEntries = sorted([anchor.certification.file, ...anchor.receipts.map((receipt) => receipt.file)]);
  assert.deepEqual(sorted(entries), expectedEntries, "aggregate artifact entry set drifted or mixed profiles");
  assert.equal(new Set(entries).size, entries.length, "aggregate artifact contains duplicate entries");
  assert.equal(sha256(certificateBytes), anchor.certification.digest, "historical certification bytes changed");

  const certificate = JSON.parse(Buffer.from(certificateBytes).toString("utf8"));
  assert.equal(certificate.schema, anchor.certification.schema, "historical certification schema drifted");
  assert.equal(certificate.sourceSha, anchor.sourceSha, "historical certification source drifted");
  assert.equal(certificate.baseSha, anchor.baseSha, "historical certification base drifted");
  assert.equal(certificate.releaseSha, anchor.releaseSha, "historical certification release drifted");
  assert.deepEqual(certificate.workflow, {
    repository: anchor.workflow.repository,
    workflow: anchor.workflow.name,
    runId: anchor.workflow.runId,
    runAttempt: anchor.workflow.runAttempt,
    eventName: anchor.workflow.eventName,
  }, "historical certification workflow identity drifted");
  assert.deepEqual(certificate.requiredJobs, anchor.certification.requiredJobs, "historical required jobs drifted");
  assert.deepEqual(certificate.artifacts, anchor.certification.artifacts, "historical lane artifacts drifted");
  assert.deepEqual(
    certificate.expectedDocuments,
    anchor.certification.expectedDocuments,
    "historical expected-document set drifted",
  );
  assert.equal(certificate.repositoryScope?.result, anchor.certification.repositoryScope.result);
  assert.equal(
    certificate.repositoryScope?.changedPathDigest,
    anchor.certification.repositoryScope.changedPathDigest,
    "historical repository-scope digest drifted",
  );
  assert.deepEqual(certificate.remoteHead, anchor.certification.remoteHead, "historical remote-head evidence drifted");
  assert.deepEqual(certificate.receipts, anchor.receipts, "historical certification receipt set drifted");
  assert.equal(certificate.claims, anchor.certification.claims, "historical claim count drifted");
  assert.equal(certificate.result, anchor.certification.result, "historical certification result drifted");

  assert.equal(receiptBytes.size, anchor.receipts.length, "historical receipt byte set is incomplete");
  for (const expectedReceipt of anchor.receipts) {
    const bytes = receiptBytes.get(expectedReceipt.file);
    assert.ok(bytes, `historical receipt bytes are missing: ${expectedReceipt.file}`);
    assert.equal(sha256(bytes), expectedReceipt.digest, `historical receipt digest changed: ${expectedReceipt.id}`);
    const receipt = JSON.parse(Buffer.from(bytes).toString("utf8"));
    assert.equal(receipt.schema, "effect-build/architecture-receipt@2", `${expectedReceipt.id}: schema drifted`);
    assert.equal(receipt.id, expectedReceipt.id, `${expectedReceipt.id}: receipt id drifted`);
    assert.equal(receipt.sourceSha, anchor.sourceSha, `${expectedReceipt.id}: source SHA drifted`);
    assert.equal(receipt.status, "reproduced", `${expectedReceipt.id}: status drifted`);
  }

  return {
    profileId: anchor.profileId,
    sourceSha: anchor.sourceSha,
    workflow: anchor.workflow,
    aggregateArtifact: anchor.aggregateArtifact,
    certification: {
      file: anchor.certification.file,
      schema: anchor.certification.schema,
      digest: anchor.certification.digest,
      claims: anchor.certification.claims,
      result: anchor.certification.result,
    },
    receipts: anchor.receipts,
  };
};

const allowedHandoffPath = (path, allowedPaths) =>
  allowedPaths.some((allowed) => allowed.endsWith("/") ? path.startsWith(allowed) : path === allowed);

export const validateCurrentHandoffState = ({
  anchor,
  changedPaths,
  freezeIsAncestor,
  head,
  planSource,
  productionFreezeDiff,
  productionReleaseDiff,
  profile,
  releaseIsAncestor,
  sourceSha,
  workflowSource,
}) => {
  assert.match(sourceSha, shaPattern, "invalid current source SHA");
  assert.equal(head, sourceSha, "checkout does not equal SOURCE_SHA");
  assert.equal(freezeIsAncestor, true, "authenticated freeze is not an ancestor of the current head");
  assert.equal(releaseIsAncestor, true, "v0.3 release is not an ancestor of the current head");
  assert.ok(Array.isArray(changedPaths) && changedPaths.length > 0, "handoff has no post-freeze change");
  assert.equal(new Set(changedPaths).size, changedPaths.length, "post-freeze path list contains duplicates");
  for (const path of changedPaths) {
    assert.equal(
      allowedHandoffPath(path, profile.handoffAllowedPaths),
      true,
      `post-freeze handoff contains a disallowed path: ${path}`,
    );
  }
  assert.deepEqual(productionReleaseDiff, [], "freeze production paths differ from the v0.3 release");
  assert.deepEqual(productionFreezeDiff, [], "handoff changed production paths before certification");
  assert.match(planSource, /^- Status: IN PROGRESS$/m, "Plan 039 is not IN PROGRESS");
  assert.equal((planSource.match(/^- Status: IN PROGRESS$/gm) ?? []).length, 1, "Plan 039 status is ambiguous");
  for (const forbidden of profile.forbiddenInvocations) {
    assert.equal(workflowSource.includes(forbidden), false, `active workflow invokes historical freeze code: ${forbidden}`);
  }
  for (const forbidden of [
    "surface-freeze",
    "RESEARCH_RECEIPTS_DIR",
    "run-receipt-producers.mjs",
    "validate-receipts.mjs",
  ]) assert.equal(workflowSource.includes(forbidden), false, `active workflow mixes the freeze profile: ${forbidden}`);
  assert.equal(workflowSource.includes(profile.profileId), true, "active workflow does not bind the Plan 039 profile id");
  assert.equal(
    workflowSource.includes(profile.receiptDirectoryEnvironment),
    true,
    "active workflow does not bind the Plan 039 receipt directory",
  );
  assert.equal(profile.currentReceiptIds.includes("surface-freeze"), false, "surface-freeze became a current receipt");
  assert.equal(profile.profileId === anchor.profileId, false, "current and historical certificate profiles mix");

  return {
    changedPaths: sorted(changedPaths),
    planStatus: "IN PROGRESS",
    productionBaseline: {
      releaseSha: profile.productionBaseline.releaseSha,
      freezeSha: profile.productionBaseline.freezeSha,
      paths: profile.productionBaseline.paths,
      releaseToFreezeChangedPaths: productionReleaseDiff,
      freezeToCurrentChangedPaths: productionFreezeDiff,
    },
  };
};

export const expectedReceiptClaims = (expected) => expected.claims.map((claim) => ({
  id: claim.id,
  classification: claim.classification,
  conclusion: claim.conclusion,
  assertions: claim.assertions.map((name) => ({ name, passed: true })),
}));

export const validateCurrentReceipt = ({ expected, profile, receipt, sourceSha }) => {
  assert.equal(receipt.schema, "effect-build/implementation-receipt@1", "invalid implementation receipt schema");
  assert.equal(receipt.profileId, profile.profileId, "current receipt names another profile");
  assert.equal(receipt.id, expected.receiptId, "current receipt id drifted");
  assert.equal(receipt.sourceSha, sourceSha, "current receipt names another source");
  assert.equal(receipt.status, "reproduced", "current receipt is not reproduced");
  assert.deepEqual(receipt.claims, expectedReceiptClaims(expected), "current receipt claims drifted");
  assert.equal(receipt.evidence?.historicalFreeze?.profileId, profile.historicalProfileIds[0]);
  assert.equal(receipt.evidence?.historicalFreeze?.receiptCount, 20, "historical receipt count is missing");
  assert.match(receipt.evidence?.historicalFreeze?.receiptSetDigest ?? "", digestPattern);
  assert.equal(
    receipt.evidence?.historicalFreeze?.receipts,
    undefined,
    "historical receipt records entered the current receipt",
  );
  assert.equal(receipt.evidence?.profileSeparation?.currentProfileId, profile.profileId);
  assert.equal(receipt.evidence?.profileSeparation?.currentReceiptDirectoryEnvironment, "PLAN039_RECEIPTS_DIR");
  assert.deepEqual(receipt.evidence?.profileSeparation?.currentReceiptIds, profile.currentReceiptIds);
  assert.equal(
    profile.forbiddenCurrentReceiptIds.includes(receipt.id),
    false,
    "current receipt uses a freeze-only receipt id",
  );
  return receipt;
};

export const validateImplementationCertificate = ({ certificate, currentReceiptDigest, profile, sourceSha }) => {
  assert.equal(certificate.schema, "effect-build/implementation-certification@1");
  assert.equal(certificate.profileId, profile.profileId);
  assert.equal(certificate.plan, profile.plan);
  assert.equal(certificate.phase, profile.phase);
  assert.equal(certificate.sourceSha, sourceSha);
  assert.equal(certificate.historicalInputs?.freeze?.profileId, profile.historicalProfileIds[0]);
  assert.deepEqual(certificate.currentReceipts, [{
    id: profile.currentReceiptIds[0],
    file: `${profile.currentReceiptIds[0]}.json`,
    digest: currentReceiptDigest,
  }]);
  assert.equal(
    certificate.currentReceipts.some((receipt) => profile.forbiddenCurrentReceiptIds.includes(receipt.id)),
    false,
    "implementation certificate contains a freeze-only receipt",
  );
  assert.equal(certificate.result, "certified");
  return certificate;
};
