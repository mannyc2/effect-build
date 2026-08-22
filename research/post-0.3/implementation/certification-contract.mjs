import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";

const profilePath = "research/post-0.3/implementation/profile.json";
const shaPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^sha256:[0-9a-f]{64}$/;

const exact = {
  release: "f06f96ca88b6278e5f23a898d758b99fa9322108",
  freeze: "a3017657e0851530892a9f3d2d55ac5736769881",
  handoff: "7de4ffe68931f721317f6be92aac1e01dae6e21e",
  plan039: "e12e930de5622be3f23814f3235293c93fcfd8bf",
  plan040: "3ced06d29fe8644eae5465fed4878a6faea322f3",
};

const exactDocumentDigests = {
  profile: "sha256:99733b3205065bf0ea31676e092db47841a6698ba7aafb6e463d9cdf97c9e80a",
  expected: "sha256:0c6e5ebdc51400aa33a0afc94f5cd0399fd20d24d15f8bacabb14a4cf41c6a00",
  freezeAnchor: "sha256:bddbed308ae05697663b10a63234f52ee4e5b1baca919463da8edbf4aec16888",
  handoffAnchor: "sha256:601dc271d3deb50a6f0aeb69bc15e776ff9d8b1e05ccd9625bd3fd3108c0ab57",
  plan039Anchor: "sha256:bb954a00a206189b38b7e2b78fbe5178f6850a5f2191aa46387f39649b64265b",
  plan040Anchor: "sha256:8974166230c7878419496b6c4b7c9a62aa1e2878ef699e32dd92a336062251ff",
  migrationPlan: "sha256:6827f8f5c9198a5d7d9a175a3cd48b56b8f20e661a11c40ca9b3c5eaa4b5659c",
};

const exactImplementationWorkflowDigest =
  "sha256:fb7a8ec475a2a9bad2c6c0854fb534850c514718142a92014e4a02a4d31677cc";

export const requiredImplementationCommands = [
  "bun install --frozen-lockfile",
  "node --test research/post-0.3/implementation/certification-contract.test.mjs",
  "bun run verify",
  "bun test research/post-0.3/r3-provider-compatibility.test.ts research/post-0.3/r4-author-laws.test.mjs",
  "node --test research/post-0.3/r7-matrix-laws.test.mjs",
  "node research/post-0.3/implementation/staged-external-author-adapter.mjs",
  "node research/post-0.3/implementation/staged-esbuild-adapter.mjs",
  "bun run test:integration:v04-bun",
  "node scripts/verify-v04-bun-target-support.mjs",
  "node research/post-0.3/implementation/staged-bun-adapter.mjs",
  "node research/post-0.3/implementation/certify-current-head.mjs",
];

export const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const sorted = (values) => [...values].sort();
const assertDigest = (value, message) => assert.match(value, digestPattern, message);
const assertSha = (value, message) => assert.match(value, shaPattern, message);
const unique = (values, message) => {
  assert.ok(Array.isArray(values) && values.length > 0, message);
  assert.equal(new Set(values).size, values.length, message);
  for (const value of values) assert.equal(typeof value === "string" && value.length > 0, true, message);
};

export const expectedReceiptClaims = (expected) => expected.claims.map((claim) => ({
  id: claim.id,
  classification: claim.classification,
  conclusion: claim.conclusion,
  assertions: claim.assertions.map((name) => ({ name, passed: true })),
}));

const validateHistoricalAnchors = ({ freezeAnchor, handoffAnchor, plan039Anchor }) => {
  assert.equal(freezeAnchor.sourceSha, exact.freeze);
  assert.equal(freezeAnchor.releaseSha, exact.release);
  assert.equal(freezeAnchor.workflow.conclusion, "success");
  assertDigest(freezeAnchor.aggregateArtifact.digest, "invalid freeze artifact digest");
  assert.equal(handoffAnchor.sourceSha, exact.handoff);
  assert.equal(handoffAnchor.freezeInput.sourceSha, exact.freeze);
  assert.equal(handoffAnchor.workflow.conclusion, "success");
  assert.equal(plan039Anchor.sourceSha, exact.plan039);
  assert.equal(plan039Anchor.releaseSha, exact.release);
  assert.equal(plan039Anchor.freezeSha, exact.freeze);
  assert.equal(plan039Anchor.handoffSha, exact.handoff);
  assert.equal(plan039Anchor.workflow.conclusion, "success");
  assertDigest(plan039Anchor.aggregateArtifact.digest, "invalid Plan 039 artifact digest");
  assertDigest(plan039Anchor.certification.digest, "invalid Plan 039 certificate digest");
  assertDigest(plan039Anchor.receipt.digest, "invalid Plan 039 receipt digest");
};

export const validatePlan040Anchor = ({ plan039Anchor, plan040Anchor }) => {
  assert.equal(plan040Anchor.schema, "effect-build/plan040-implementation-trust-anchor@1");
  assert.equal(plan040Anchor.profileId, "effect-build/plan040-implementation@1");
  assert.equal(plan040Anchor.sourceSha, exact.plan040);
  assert.deepEqual(
    {
      releaseSha: plan040Anchor.releaseSha,
      freezeSha: plan040Anchor.freezeSha,
      handoffSha: plan040Anchor.handoffSha,
      plan039Sha: plan040Anchor.plan039Sha,
    },
    { releaseSha: exact.release, freezeSha: exact.freeze, handoffSha: exact.handoff, plan039Sha: exact.plan039 },
  );
  assert.deepEqual(plan040Anchor.workflow, {
    repository: "mannyc2/effect-build",
    name: "plan-040-implementation-certification",
    path: ".github/workflows/architecture-research.yml",
    runId: "32585389513",
    runAttempt: "1",
    eventName: "push",
    conclusion: "success",
    url: "https://github.com/mannyc2/effect-build/actions/runs/32585389513",
  });
  assert.deepEqual(plan040Anchor.aggregateArtifact, {
    id: "9478924759",
    name: `plan040-implementation-certification-${exact.plan040}`,
    sizeInBytes: 4620,
    digest: "sha256:474cf45b62c3447e48a247940973f87bedab53c3a013d897ea069200dcb68ebc",
    url: "https://github.com/mannyc2/effect-build/actions/runs/32585389513/artifacts/9478924759",
  });
  assert.deepEqual(plan040Anchor.certification, {
    file: "plan040-certification.json",
    schema: "effect-build/implementation-certification@1",
    digest: "sha256:e661ebe80b6c1d7cb739c85c319fb33c6942f1ea410239a8e459d61a2c423068",
    phase: "implementation",
    claims: 4,
    result: "certified",
  });
  assert.deepEqual(plan040Anchor.receipt, {
    id: "plan040-implementation",
    file: "plan040-implementation.json",
    digest: "sha256:6a893378814a6061a862fb8bffcdf20bf43d76c046bf53e8ac8efcc323a54f25",
  });
  assert.deepEqual(plan040Anchor.plan039Input, {
    profileId: plan039Anchor.profileId,
    sourceSha: plan039Anchor.sourceSha,
    aggregateArtifactId: plan039Anchor.aggregateArtifact.id,
    aggregateArtifactDigest: plan039Anchor.aggregateArtifact.digest,
    certificationDigest: plan039Anchor.certification.digest,
    receiptDigest: plan039Anchor.receipt.digest,
  });
  return plan040Anchor;
};

export const validateProfileDocuments = (documents) => {
  const { expected, freezeAnchor, handoffAnchor, migrationPlan, plan039Anchor, plan040Anchor, profile } = documents;
  validateHistoricalAnchors({ freezeAnchor, handoffAnchor, plan039Anchor });
  validatePlan040Anchor({ plan039Anchor, plan040Anchor });
  assert.equal(profile.schema, "effect-build/implementation-certification-profile@2");
  assert.equal(profile.profileId, "effect-build/plan041-implementation@1");
  assert.equal(profile.plan, "041");
  assert.equal(profile.phase, "implementation");
  assert.equal(profile.receiptDirectoryEnvironment, "PLAN041_RECEIPTS_DIR");
  assert.equal(profile.certificateFile, "plan041-certification.json");
  assert.equal(profile.plan040TrustAnchor, "research/post-0.3/implementation/plan040-trust-anchor.json");
  assert.deepEqual(profile.productionBaseline, {
    releaseSha: exact.release,
    freezeSha: exact.freeze,
    handoffSha: exact.handoff,
    plan039Sha: exact.plan039,
    plan040Sha: exact.plan040,
  });
  unique(profile.implementationAllowedPaths, "implementation allowlist is invalid");
  unique(profile.bunImplementationFiles, "Bun implementation file set is invalid");
  unique(profile.esbuildImplementationFiles, "Esbuild implementation file set is invalid");
  unique(profile.coreStagedFiles, "core staged file set is invalid");
  unique(profile.immutablePublicPaths, "immutable public path set is invalid");
  assert.deepEqual(profile.currentReceiptIds, ["plan041-implementation"]);
  assert.equal(profile.forbiddenCurrentReceiptIds.includes("plan040-implementation"), true);
  assert.equal(profile.producers.length, 1);
  assert.deepEqual(profile.producers[0].receipts, profile.currentReceiptIds);
  assert.equal(expected.schema, "effect-build/expected-implementation-claims@1");
  assert.equal(expected.profileId, profile.profileId);
  assert.equal(expected.receiptId, profile.currentReceiptIds[0]);
  assert.equal(expected.claims.length, 4);
  for (const claim of expected.claims) {
    assert.ok(["established", "sequenced"].includes(claim.classification));
    unique(claim.assertions, `claim ${claim.id} has invalid assertions`);
  }
  assert.equal(migrationPlan.schema, "effect-build/plan039-core-migration@1");
  return documents;
};

export const loadProfileDocuments = async (repository) => {
  const authenticatedJson = async (path, digest, label) => {
    const bytes = await readFile(resolve(repository, path));
    assert.equal(sha256(bytes), digest, `${label} bytes drifted`);
    return JSON.parse(bytes.toString("utf8"));
  };
  const profile = await authenticatedJson(profilePath, exactDocumentDigests.profile, "implementation profile");
  const documents = {
    profile,
    freezeAnchor: await authenticatedJson(
      profile.trustAnchor,
      exactDocumentDigests.freezeAnchor,
      "freeze trust anchor",
    ),
    handoffAnchor: await authenticatedJson(
      profile.handoffTrustAnchor,
      exactDocumentDigests.handoffAnchor,
      "handoff trust anchor",
    ),
    plan039Anchor: await authenticatedJson(
      profile.plan039TrustAnchor,
      exactDocumentDigests.plan039Anchor,
      "Plan 039 trust anchor",
    ),
    plan040Anchor: await authenticatedJson(
      profile.plan040TrustAnchor,
      exactDocumentDigests.plan040Anchor,
      "Plan 040 trust anchor",
    ),
    expected: await authenticatedJson(
      profile.expectedClaims,
      exactDocumentDigests.expected,
      "expected claims",
    ),
    migrationPlan: await authenticatedJson(
      profile.migrationPlan,
      exactDocumentDigests.migrationPlan,
      "core migration plan",
    ),
  };
  return validateProfileDocuments(documents);
};

export const validateWorkspaceManifest = ({ currentManifest, handoffManifest, profile }) => {
  const expected = structuredClone(handoffManifest);
  for (const [name, append] of Object.entries(profile.workspaceManifest.scriptAppends)) {
    assert.equal(typeof expected.scripts[name], "string", `handoff script missing: ${name}`);
    expected.scripts[name] += append;
  }
  for (const [name, value] of Object.entries(profile.workspaceManifest.scriptAdds)) {
    assert.equal(expected.scripts[name], undefined, `new script already existed at handoff: ${name}`);
    expected.scripts[name] = value;
  }
  assert.deepEqual(currentManifest, expected, "workspace manifest drifted outside exact Plan 041 registrations");
  return { handoffSha: profile.productionBaseline.handoffSha, ...profile.workspaceManifest };
};

export const validateActiveInstructions = ({ currentInstructions, handoffInstructions }) => {
  assert.equal(handoffInstructions.includes("Plan 039 is ready to begin"), true);
  assert.equal(currentInstructions.includes("Plans 039, 040, and 041 are complete"), true);
  assert.equal(currentInstructions.includes("Plan 042 is ready to begin"), true);
  assert.equal(currentInstructions.includes("publication"), true);
  return {
    handoffSha: exact.handoff,
    path: "AGENTS.md",
    completedPlans: ["039", "040", "041"],
    nextPlan: "042",
    publicationAuthority: "NONE",
  };
};

const pathAllowed = (path, allowed) => allowed.some((entry) => entry.endsWith("/") ? path.startsWith(entry) : path === entry);

export const validateCurrentImplementationState = (input) => {
  const {
    changedPaths,
    coreStagedDiff,
    esbuildStagedDiff,
    head,
    immutablePublicDiff,
    implementationAddedOrModifiedPaths,
    planIndexSource,
    planSource,
    profile,
    sourceSha,
    workflowSource,
  } = input;
  assertSha(sourceSha, "invalid current source SHA");
  assert.equal(head, sourceSha, "checkout differs from source SHA");
  assert.deepEqual(input.ancestry, {
    releaseIsFreezeAncestor: true,
    freezeIsHandoffAncestor: true,
    handoffIsPlan039Ancestor: true,
    plan039IsPlan040Ancestor: true,
    plan040IsCurrentAncestor: true,
  }, "implementation ancestry is not linear");
  assert.deepEqual(coreStagedDiff, [], "Plan 039 core changed during Plan 041");
  assert.deepEqual(esbuildStagedDiff, [], "Plan 040 Esbuild changed during Plan 041");
  assert.deepEqual(immutablePublicDiff, [], "released 0.3 public path changed during Plan 041");
  assert.ok(Array.isArray(changedPaths) && changedPaths.length > 0, "implementation has no post-handoff change");
  assert.equal(new Set(changedPaths).size, changedPaths.length, "post-handoff path list contains duplicates");
  assert.deepEqual(
    sorted(implementationAddedOrModifiedPaths),
    sorted(profile.bunImplementationFiles),
    "exactly the five Bun implementation files must be added after Plan 040",
  );
  for (const path of changedPaths) assert.equal(pathAllowed(path, profile.implementationAllowedPaths), true, `path outside implementation scope: ${path}`);
  assert.deepEqual(planSource.match(/^- Status:.*$/gm) ?? [], ["- Status: DONE"], "Plan 041 status is ambiguous");
  assert.deepEqual(
    planIndexSource.match(/^\| 041 \|.*$/gm) ?? [],
    ["| 041 | Implement the frozen Bun executable lane | P1 | L | 039 | DONE |"],
    "Plan 041 index status drifted",
  );
  assert.deepEqual(
    planIndexSource.match(/^\| 042 \|.*$/gm) ?? [],
    ["| 042 | Implement the frozen Deno executable lane | P1 | L | 039 | TODO |"],
    "Plan 042 index status drifted",
  );
  assert.equal(planIndexSource.includes("Plan 042 is the next"), true, "Plan 042 is not the documented next plan");
  const workflowDigest = sha256(Buffer.from(workflowSource));
  assert.equal(workflowDigest, exactImplementationWorkflowDigest, "active implementation workflow bytes drifted");
  for (const forbidden of profile.forbiddenInvocations) {
    assert.equal(workflowSource.includes(forbidden), false, `active workflow invokes historical code: ${forbidden}`);
  }
  for (const forbidden of [
    "surface-freeze",
    "plan039-phase-handoff",
    "RESEARCH_RECEIPTS_DIR",
    "run-receipt-producers.mjs",
    "validate-receipts.mjs",
    "PLAN040_RECEIPTS_DIR",
  ]) assert.equal(workflowSource.includes(forbidden), false, `active workflow mixes historical authority: ${forbidden}`);
  const workflow = parseYaml(workflowSource);
  assert.deepEqual(Object.keys(workflow.on ?? {}).sort(), ["pull_request", "push"]);
  assert.deepEqual(workflow.permissions, { actions: "read", contents: "read" });
  assert.deepEqual(workflow.env, {
    SOURCE_SHA: "${{ github.event.pull_request.head.sha || github.sha }}",
    CERTIFICATION_PROFILE: profile.profileId,
  });
  assert.equal(workflow.name, "plan-041-implementation-certification");
  assert.deepEqual(Object.keys(workflow.jobs), ["plan041-implementation"]);
  const job = workflow.jobs["plan041-implementation"];
  assert.deepEqual(Object.keys(job).sort(), ["runs-on", "steps"], "implementation job can be skipped or altered");
  assert.equal(job["runs-on"], "ubuntu-24.04");
  assert.ok(Array.isArray(job.steps));
  const gateIndexes = requiredImplementationCommands.map((command) => {
    const matches = job.steps
      .map((step, index) => ({ index, step }))
      .filter(({ step }) => step?.run === command);
    assert.equal(matches.length, 1, `required workflow gate must appear exactly once: ${command}`);
    const [{ index, step }] = matches;
    for (const bypass of ["if", "continue-on-error", "shell", "working-directory"]) {
      assert.equal(Object.hasOwn(step, bypass), false, `required workflow gate has a bypass: ${command}`);
    }
    const expectedEnvironment = command === "bun install --frozen-lockfile"
      ? { BUN_INSTALL_CACHE_DIR: "${{ runner.temp }}/bun-install-cache" }
      : command === "node research/post-0.3/implementation/certify-current-head.mjs"
      ? {
        GITHUB_TOKEN: "${{ github.token }}",
        PLAN041_RECEIPTS_DIR: "${{ runner.temp }}/effect-build-plan041-implementation",
      }
      : undefined;
    assert.deepEqual(step.env, expectedEnvironment, `required workflow gate environment drifted: ${command}`);
    return index;
  });
  assert.deepEqual(gateIndexes, [...gateIndexes].sort((left, right) => left - right), "required gates are out of order");
  return {
    ancestry: { ...profile.productionBaseline, currentSha: sourceSha },
    changedPaths: sorted(changedPaths),
    coreStagedDiff,
    esbuildStagedDiff,
    implementationFiles: sorted(profile.bunImplementationFiles),
    immutablePublicDiff,
    planStatus: "DONE",
    requiredCommands: requiredImplementationCommands,
    workflowDigest,
  };
};

export const validateCurrentRemoteEvidence = (evidence) => {
  assert.equal(evidence.eventSourceSha, evidence.sourceSha);
  assert.equal(evidence.observedSha, evidence.sourceSha);
  assert.equal(evidence.repository, "mannyc2/effect-build");
  assert.ok(evidence.eventName === "push" || evidence.eventName === "pull_request");
  return {
    eventName: evidence.eventName,
    eventSourceSha: evidence.eventSourceSha,
    observedRef: evidence.observedRef,
    observedSha: evidence.observedSha,
    repository: evidence.repository,
  };
};

export const validatePlan040Api = ({ artifact, plan040Anchor, run }) => {
  assert.equal(String(run.id), plan040Anchor.workflow.runId);
  assert.equal(String(run.run_attempt), plan040Anchor.workflow.runAttempt);
  assert.equal(run.name, plan040Anchor.workflow.name);
  assert.equal(run.path, plan040Anchor.workflow.path);
  assert.equal(run.event, "push");
  assert.equal(run.status, "completed");
  assert.equal(run.conclusion, "success");
  assert.equal(run.head_sha, plan040Anchor.sourceSha);
  assert.equal(run.repository?.full_name, plan040Anchor.workflow.repository);
  assert.equal(String(artifact.id), plan040Anchor.aggregateArtifact.id);
  assert.equal(artifact.name, plan040Anchor.aggregateArtifact.name);
  assert.equal(artifact.size_in_bytes, plan040Anchor.aggregateArtifact.sizeInBytes);
  assert.equal(artifact.digest, plan040Anchor.aggregateArtifact.digest);
  assert.equal(artifact.expired, false);
  assert.equal(String(artifact.workflow_run.id), plan040Anchor.workflow.runId);
  assert.equal(artifact.workflow_run.head_sha, plan040Anchor.sourceSha);
};

export const validatePlan040Archive = ({ archiveBytes, certificateBytes, entries, plan040Anchor, receiptBytes }) => {
  assert.equal(archiveBytes.byteLength, plan040Anchor.aggregateArtifact.sizeInBytes);
  assert.equal(sha256(archiveBytes), plan040Anchor.aggregateArtifact.digest);
  assert.deepEqual(sorted(entries), sorted([plan040Anchor.certification.file, plan040Anchor.receipt.file]));
  assert.equal(sha256(certificateBytes), plan040Anchor.certification.digest);
  assert.equal(sha256(receiptBytes), plan040Anchor.receipt.digest);
  const certificate = JSON.parse(certificateBytes);
  const receipt = JSON.parse(receiptBytes);
  assert.equal(certificate.profileId, plan040Anchor.profileId);
  assert.equal(certificate.sourceSha, plan040Anchor.sourceSha);
  assert.equal(certificate.result, "certified");
  assert.equal(receipt.profileId, plan040Anchor.profileId);
  assert.equal(receipt.id, plan040Anchor.receipt.id);
  assert.equal(receipt.sourceSha, plan040Anchor.sourceSha);
  assert.equal(receipt.status, "reproduced");
  return { certificate, receipt, sourceSha: plan040Anchor.sourceSha };
};

export const historicalAuthoritySummary = ({ freezeAnchor, handoffAnchor, plan039Anchor, plan040Anchor }) => ({
  freeze: { profileId: freezeAnchor.profileId, sourceSha: freezeAnchor.sourceSha, aggregateArtifact: freezeAnchor.aggregateArtifact, certification: freezeAnchor.certification },
  handoff: { profileId: handoffAnchor.profileId, sourceSha: handoffAnchor.sourceSha, workflow: handoffAnchor.workflow, aggregateArtifact: handoffAnchor.aggregateArtifact, certification: handoffAnchor.certification, receipt: handoffAnchor.receipt },
  plan039: { profileId: plan039Anchor.profileId, sourceSha: plan039Anchor.sourceSha, workflow: plan039Anchor.workflow, aggregateArtifact: plan039Anchor.aggregateArtifact, certification: plan039Anchor.certification, receipt: plan039Anchor.receipt },
  plan040: { profileId: plan040Anchor.profileId, sourceSha: plan040Anchor.sourceSha, workflow: plan040Anchor.workflow, aggregateArtifact: plan040Anchor.aggregateArtifact, certification: plan040Anchor.certification, receipt: plan040Anchor.receipt },
});

export const validateCurrentReceipt = ({
  expected,
  freezeAnchor,
  handoffAnchor,
  plan039Anchor,
  plan040Anchor,
  profile,
  receipt,
  sourceSha,
}) => {
  assert.equal(receipt.schema, "effect-build/implementation-receipt@1");
  assert.equal(receipt.profileId, profile.profileId);
  assert.equal(receipt.id, expected.receiptId);
  assert.equal(receipt.sourceSha, sourceSha);
  assert.equal(receipt.status, "reproduced");
  assert.deepEqual(receipt.claims, expectedReceiptClaims(expected));
  assert.deepEqual(
    receipt.evidence?.historicalAuthority,
    historicalAuthoritySummary({ freezeAnchor, handoffAnchor, plan039Anchor, plan040Anchor }),
    "current receipt historical authority drifted",
  );
  assert.deepEqual(receipt.evidence?.plan040Artifact, { sourceSha: plan040Anchor.sourceSha, transport: "github-api" });
  assert.equal(receipt.evidence?.currentHead?.observedSha, sourceSha);
  assert.equal(receipt.evidence?.currentHead?.repository, plan040Anchor.workflow.repository);
  assert.equal(receipt.evidence?.repositoryScope?.planStatus, "DONE");
  assert.deepEqual(receipt.evidence?.repositoryScope?.implementationFiles, sorted(profile.bunImplementationFiles));
  assert.deepEqual(receipt.evidence?.repositoryScope?.coreStagedDiff, []);
  assert.deepEqual(receipt.evidence?.repositoryScope?.esbuildStagedDiff, []);
  assert.deepEqual(receipt.evidence?.repositoryScope?.immutablePublicDiff, []);
  assert.deepEqual(receipt.evidence?.repositoryScope?.requiredCommands, requiredImplementationCommands);
  assert.equal(receipt.evidence?.repositoryScope?.workflowDigest, exactImplementationWorkflowDigest);
  assert.deepEqual(receipt.evidence?.repositoryScope?.activeInstructions, {
    handoffSha: exact.handoff,
    path: "AGENTS.md",
    completedPlans: ["039", "040", "041"],
    nextPlan: "042",
    publicationAuthority: "NONE",
  });
  assert.deepEqual(receipt.evidence?.repositoryScope?.workspaceManifest, {
    handoffSha: profile.productionBaseline.handoffSha,
    ...profile.workspaceManifest,
  });
  assert.deepEqual(receipt.evidence?.profileSeparation, {
    historicalProfileIds: profile.historicalProfileIds,
    currentProfileId: profile.profileId,
    historicalArtifactsAreInputsOnly: true,
    currentReceiptDirectoryEnvironment: profile.receiptDirectoryEnvironment,
    currentReceiptIds: profile.currentReceiptIds,
    currentCertificateFile: profile.certificateFile,
  });
  assert.equal(profile.forbiddenCurrentReceiptIds.includes(receipt.id), false);
  return receipt;
};

export const validateImplementationCertificate = ({
  certificate,
  currentReceiptDigest,
  expected,
  freezeAnchor,
  handoffAnchor,
  plan039Anchor,
  plan040Anchor,
  profile,
  sourceSha,
}) => {
  assert.equal(certificate.schema, "effect-build/implementation-certification@1");
  assert.equal(certificate.profileId, profile.profileId);
  assert.equal(certificate.plan, "041");
  assert.equal(certificate.phase, "implementation");
  assert.equal(certificate.sourceSha, sourceSha);
  assert.deepEqual(certificate.workflow?.repository, plan040Anchor.workflow.repository);
  assert.equal(certificate.workflow?.workflow, "plan-041-implementation-certification");
  assert.match(certificate.workflow?.runId, /^[1-9][0-9]*$/);
  assert.match(certificate.workflow?.runAttempt, /^[1-9][0-9]*$/);
  assert.equal(certificate.workflow?.eventName === "push" || certificate.workflow?.eventName === "pull_request", true);
  assert.deepEqual(
    certificate.historicalInputs,
    historicalAuthoritySummary({ freezeAnchor, handoffAnchor, plan039Anchor, plan040Anchor }),
  );
  assert.deepEqual(certificate.currentReceipts, [{
    id: expected.receiptId,
    file: `${expected.receiptId}.json`,
    digest: currentReceiptDigest,
  }]);
  assert.equal(certificate.currentReceipts.some((receipt) => profile.forbiddenCurrentReceiptIds.includes(receipt.id)), false);
  assert.equal(certificate.claims, expected.claims.length);
  assert.equal(certificate.result, "certified");
  return certificate;
};

export const assertValidSourceSha = (value) => assertSha(value, "invalid source SHA");
